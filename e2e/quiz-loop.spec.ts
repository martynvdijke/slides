import { test, expect } from '@playwright/test'
import { ADMIN, activateQuestion, createEvent, createQuestion, login } from './helpers'

/**
 * Quiz game loop: a timed question counts down, auto-locks, the host reveals
 * the answer from the admin panel, and the podium screen can be toggled on.
 * Covers the audience app, the projector, and the new admin controls.
 */
test.describe('quiz game loop', () => {
  test('timed question counts down, locks, reveals, and shows the podium', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Quiz ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Capital of France?',
      options: ['Paris', 'London'],
      correct_index: 0,
      points_base: 100,
      show_results: false,
      time_limit_s: 60,
    })
    await activateQuestion(request, ev.id, q.id)

    // Audience joins, sees the countdown, and answers while the timer runs.
    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await expect(aud.locator('#live-card .prompt')).toContainText('Capital of France?', { timeout: 15000 })
    await expect(aud.locator('#countdown-pill')).toBeVisible()
    await expect(aud.locator('#countdown-pill')).toContainText('⏱')
    await aud.locator('#live-card .option-btn', { hasText: 'Paris' }).click()
    await expect(aud.locator('#live-card .thanks')).toContainText('Paris', { timeout: 10000 })
    // Results stay hidden while the question is live.
    await expect(aud.locator('#live-card')).not.toContainText(/Paris\s*✓/)

    // Projector mirrors the countdown.
    const projCtx = await browser.newContext()
    const proj = await projCtx.newPage()
    await proj.goto(`/live/${ev.code}`)
    await expect(proj.locator('#prompt-area')).toContainText('Capital of France?', { timeout: 15000 })
    await expect(proj.locator('#countdown-pill')).toContainText('⏱')

    // Shorten the timer so the deadline is already in the past: the scheduled
    // auto-lock fires and both screens switch to the locked state.
    const patched = await request.patch(`/api/admin/events/${ev.id}/questions/${q.id}`, {
      data: { time_limit_s: 1 },
    })
    expect(patched.ok(), 'timer patch should succeed').toBeTruthy()

    await expect(proj.locator('#countdown-pill')).toContainText('Locked', { timeout: 15000 })
    await expect(proj.locator('#results-area')).toContainText(/answers locked/i)
    await expect(aud.locator('#live-card')).toContainText(/answers locked/i, { timeout: 15000 })
    // The correct answer must stay hidden while locked.
    await expect(proj.locator('#results-area')).not.toContainText('Paris')

    // Host signs into the admin panel, manages the event, and reveals.
    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await admin.goto('/admin')
    if (await admin.locator('#form-setup').isVisible()) {
      await admin.fill('#setup-user', ADMIN.username)
      await admin.fill('#setup-pass', ADMIN.password)
      await admin.locator('#form-setup button[type="submit"]').click()
    }
    if (await admin.locator('#form-login').isVisible()) {
      await admin.fill('#login-user', ADMIN.username)
      await admin.fill('#login-pass', ADMIN.password)
      await admin.locator('#form-login').getByRole('button', { name: 'Sign in' }).click()
    }
    await expect(admin.locator('#events-list')).toBeVisible()
    await admin.locator('.event-card', { hasText: ev.name }).getByRole('button', { name: /Manage|Selected/ }).click()

    const qRow = admin.locator('.q-row', { hasText: 'Capital of France?' })
    await expect(qRow).toBeVisible()
    await expect(qRow).toContainText('⏱ 1s')
    await expect(qRow).toContainText('locked')
    await qRow.getByRole('button', { name: 'Reveal' }).click()
    await expect(qRow).toContainText('revealed', { timeout: 10000 })

    // Reveal publishes the correct answer and the personal result.
    await expect(proj.locator('#results-area')).toContainText(/Correct answer: Paris/i, { timeout: 15000 })
    await expect(aud.locator('#live-card')).toContainText(/correct/i, { timeout: 15000 })

    // Podium toggle from the admin panel swaps both big screens.
    await admin.locator('#btn-podium').click()
    await expect(admin.locator('#btn-podium')).toHaveText('Hide podium')
    await expect(aud.locator('#live-card')).toContainText(/Leaderboard/i, { timeout: 15000 })
    await expect(aud.locator('#live-card')).toContainText(/pts/i)
    await expect(proj.locator('#prompt-area')).toContainText(/Leaderboard/i, { timeout: 15000 })

    // Hiding the podium returns the projector to the question screen.
    await admin.locator('#btn-podium').click()
    await expect(admin.locator('#btn-podium')).toHaveText('Show podium')
    await expect(proj.locator('#prompt-area')).toContainText('Capital of France?', { timeout: 15000 })

    await audCtx.close()
    await projCtx.close()
    await adminCtx.close()
  })

  test('untimed question keeps instant feedback and no countdown', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Quiz Untimed ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'What is 2+2?',
      options: ['3', '4'],
      correct_index: 1,
      points_base: 100,
    })
    await activateQuestion(request, ev.id, q.id)

    const ctx = await browser.newContext()
    const aud = await ctx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await expect(aud.locator('#live-card .prompt')).toContainText('What is 2+2?', { timeout: 15000 })
    // Untimed questions never show the countdown pill.
    await expect(aud.locator('#countdown-pill')).toBeHidden()

    await aud.locator('#live-card .option-btn', { hasText: '4' }).click()
    await expect(aud.locator('#live-card .thanks')).toContainText('4', { timeout: 10000 })
    // Legacy behavior: correctness is disclosed immediately (show_results=true).
    await expect(aud.locator('#live-card')).toContainText(/correct/i, { timeout: 15000 })
    await expect(aud.locator('#live-card')).toContainText(/4\s*✓/)

    await ctx.close()
  })
})
