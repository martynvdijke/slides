import { test, expect, type Page } from '@playwright/test'
import { ADMIN, activateQuestion, createEvent, createQuestion, login } from './helpers'

async function signInAdmin(page: Page): Promise<void> {
  await page.goto('/admin')
  if (await page.locator('#form-setup').isVisible()) {
    await page.fill('#setup-user', ADMIN.username)
    await page.fill('#setup-pass', ADMIN.password)
    await page.locator('#form-setup button[type="submit"]').click()
  }
  if (await page.locator('#form-login').isVisible()) {
    await page.fill('#login-user', ADMIN.username)
    await page.fill('#login-pass', ADMIN.password)
    await page.locator('#form-login').getByRole('button', { name: 'Sign in' }).click()
  }
  await expect(page.locator('#events-list')).toBeVisible()
}

async function selectEvent(page: Page, name: string): Promise<void> {
  await page.locator('.event-card', { hasText: name }).getByRole('button', { name: /Manage|Selected/ }).click()
}

/**
 * Audience moderation: a filtered answer is withheld from live results until
 * the host approves it, and Q&A slow mode blocks rapid resubmission with a
 * visible countdown.
 */
test.describe('audience moderation', () => {
  test('flagged answer stays out of results until approved', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Moderation ${Date.now()}`)
    const q = await createQuestion(request, ev.id, { kind: 'open', prompt: 'Say something', show_results: true })
    await activateQuestion(request, ev.id, q.id)

    // Enable the content filter in flag mode through the admin API.
    const put = await request.put('/api/admin/settings/filter', {
      data: { enabled: true, words: 'badword', action: 'flag' },
    })
    expect(put.ok(), 'filter settings should save').toBeTruthy()

    // One clean answer lands in the results.
    const cleanCtx = await browser.newContext()
    const clean = await cleanCtx.newPage()
    await clean.goto(`/e/${ev.code}`)
    await expect(clean.locator('#live-card .prompt')).toContainText('Say something', { timeout: 15000 })
    await clean.locator('#live-card textarea').fill('hello world')
    await clean.locator('#live-card button', { hasText: 'Submit' }).click()
    await expect(clean.locator('#live-card .thanks')).toContainText('hello world', { timeout: 10000 })

    // A filtered answer is accepted but kept under review.
    const flagCtx = await browser.newContext()
    const flagged = await flagCtx.newPage()
    await flagged.goto(`/e/${ev.code}`)
    await expect(flagged.locator('#live-card .prompt')).toContainText('Say something', { timeout: 15000 })
    await flagged.locator('#live-card textarea').fill('this is badword')
    await flagged.locator('#live-card button', { hasText: 'Submit' }).click()
    await expect(flagged.locator('#toast-root')).toContainText(/under review/i, { timeout: 10000 })

    // The projector shows the clean answer only.
    const projCtx = await browser.newContext()
    const proj = await projCtx.newPage()
    await proj.goto(`/live/${ev.code}`)
    await expect(proj.locator('#results-area')).toContainText('hello world', { timeout: 15000 })
    await expect(proj.locator('#results-area')).not.toContainText('badword')

    // The host approves it from the moderation queue.
    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="qa"]').click()
    const modCard = admin.locator('#moderation-list .qa-item', { hasText: 'this is badword' })
    await expect(modCard).toBeVisible({ timeout: 10000 })
    await expect(modCard).toContainText('flagged')
    await modCard.getByRole('button', { name: 'Approve' }).click()
    await expect(admin.locator('#moderation-list')).toContainText('No answers in this state.', { timeout: 10000 })

    // The approved answer returns to the admin results and the projector.
    await admin.locator('[data-view="results"]').click()
    const resCard = admin.locator('#results-list .card-pad', { hasText: 'Say something' })
    await expect(resCard).toContainText('badword', { timeout: 10000 })
    await expect(proj.locator('#results-area')).toContainText('badword', { timeout: 15000 })

    await cleanCtx.close()
    await flagCtx.close()
    await projCtx.close()
    await adminCtx.close()
  })

  test('slow mode blocks rapid questions with a countdown', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Slow Mode ${Date.now()}`)

    // The host enables slow mode from the event editor.
    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="settings"]').click()
    await admin.locator('#es-slowmode').fill('60')
    await admin.locator('#form-event-settings').getByRole('button', { name: 'Save event' }).click()

    const state = await request.get(`/api/events/${ev.code}/state`)
    expect(state.ok()).toBeTruthy()
    expect((await state.json()).event.qa_slow_mode_s).toBe(60)

    // The audience asks once, then hits the per-participant interval.
    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await aud.locator('#tab-qa').click()
    await expect(aud.locator('#qa-form')).toBeVisible({ timeout: 15000 })
    await aud.fill('#qa-body', 'first question')
    await aud.fill('#qa-author', 'Ana')
    await aud.locator('#qa-form button[type="submit"]').click()
    await expect(aud.locator('#toast-root')).toContainText(/awaiting approval/i, { timeout: 10000 })

    await aud.fill('#qa-body', 'second question')
    await aud.locator('#qa-form button[type="submit"]').click()
    await expect(aud.locator('#toast-root')).toContainText(/slow mode/i, { timeout: 10000 })
    const submit = aud.locator('#qa-form button[type="submit"]')
    await expect(submit).toBeDisabled()
    await expect(submit).toContainText(/Wait \d+s/)

    await adminCtx.close()
    await audCtx.close()
  })
})
