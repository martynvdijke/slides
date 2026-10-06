import { test, expect, type Page } from '@playwright/test'
import { ADMIN, activateQuestion, createEvent, createQuestion, login } from './helpers'

const MAIL_URL = process.env.E2E_MAIL_URL || 'http://127.0.0.1:4174'

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
 * Post-event recap: the public results page is gated by the publish switch,
 * and an attendee opt-in receives a plain-text recap email.
 */
test.describe('post-event recap', () => {
  test('results page stays hidden until published', async ({ browser, request, page }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Recap Page ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Best cloud?',
      options: ['AWS', 'GCP'],
      correct_index: 1,
      show_results: false,
    })
    await activateQuestion(request, ev.id, q.id)

    // One audience answer so the page has something to render.
    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await expect(aud.locator('#live-card .prompt')).toContainText('Best cloud?', { timeout: 15000 })
    await aud.locator('#live-card .option-btn', { hasText: 'GCP' }).click()
    await expect(aud.locator('#live-card .thanks')).toBeVisible({ timeout: 10000 })

    // Not published yet: the page shows the friendly message.
    await page.goto(`/results/${ev.code}`)
    await expect(page.locator('#results-error')).toContainText('not published yet', { timeout: 10000 })

    // Publish from the event editor.
    await signInAdmin(page)
    await selectEvent(page, ev.name)
    await page.locator('[data-view="settings"]').click()
    await page.locator('#es-publish').check()
    await page.locator('#form-event-settings').getByRole('button', { name: 'Save event' }).click()
    await expect(page.locator('#toast-root')).toContainText('Event saved', { timeout: 10000 })

    // The results page renders the aggregates with noindex.
    await page.goto(`/results/${ev.code}`)
    await expect(page.locator('#results-name')).toContainText(ev.name, { timeout: 10000 })
    await expect(page.locator('#results-stats')).toBeVisible()
    await expect(page.locator('#results-questions')).toContainText('Best cloud?')
    await expect(page.locator('#results-questions')).toContainText('GCP')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)

    await audCtx.close()
  })

  test('attendee opt-in receives the recap email', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Recap Mail ${Date.now()}`)
    const q = await createQuestion(request, ev.id, { kind: 'open', prompt: 'Say hi', show_results: true })
    await activateQuestion(request, ev.id, q.id)

    const cleared = await request.get(`${MAIL_URL}/__e2e/mail/clear`)
    expect(cleared.ok()).toBeTruthy()

    // The attendee answers and opts in to the recap.
    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await expect(aud.locator('#live-card .prompt')).toContainText('Say hi', { timeout: 15000 })
    await aud.locator('#live-card textarea').fill('hello recap')
    await aud.locator('#live-card button', { hasText: 'Submit' }).click()
    await expect(aud.locator('#live-card .thanks')).toBeVisible({ timeout: 10000 })

    await aud.fill('#recap-email', 'attendee@example.com')
    await aud.locator('#recap-form button[type="submit"]').click()
    await expect(aud.locator('#recap-status')).toContainText('attendee@example.com', { timeout: 10000 })

    // The host previews and sends the recap.
    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="settings"]').click()

    await admin.locator('#btn-recap-preview').click()
    await expect(admin.locator('#rc-preview')).toContainText('Participation', { timeout: 10000 })
    await expect(admin.locator('#rc-preview')).toContainText('Say hi')
    await expect(admin.locator('#rc-preview-meta')).toContainText(/Recipients: .*attendee@example\.com/)

    admin.on('dialog', (dialog) => dialog.accept())
    await admin.locator('#btn-recap-send').click()
    await expect(admin.locator('#rc-send-status')).toContainText('Sent 1', { timeout: 15000 })

    // The fake SMTP inbox holds exactly one message for the subscriber.
    const mail = await request.get(`${MAIL_URL}/__e2e/mail`)
    expect(mail.ok()).toBeTruthy()
    const messages = (await mail.json()) as Array<{ recipients: string[]; raw: string }>
    expect(messages.length).toBe(1)
    expect(messages[0].recipients).toContain('attendee@example.com')
    expect(messages[0].raw).toContain('Say hi')
    expect(messages[0].raw).toContain(`/results/${ev.code}`)

    await audCtx.close()
    await adminCtx.close()
  })
})
