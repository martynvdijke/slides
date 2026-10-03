import { test, expect } from '@playwright/test'
import { activateQuestion, createEvent, createQuestion, login } from './helpers'

test.describe('leaderboard', () => {
  test('correct answer shows quiz feedback and leaderboard', async ({ page, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E LB ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Capital of France?',
      options: ['Paris', 'London', 'Berlin'],
      correct_index: 0,
      points_base: 100,
    })
    await activateQuestion(request, ev.id, q.id)

    // Set identity before joining so leaderboard shows our name
    await page.goto(`/e/${ev.code}`)
    // Wait for live card to show the question
    await expect(page.locator('#live-card .prompt')).toContainText('Capital of France?', { timeout: 15000 })

    // Set identity name
    const nameInput = page.locator('#identity-name')
    await nameInput.fill('TestPlayer')
    await page.locator('#identity-save').click()
    await expect(page.locator('#toast-root')).toContainText(/profile saved/i, { timeout: 5000 })

    // Answer the correct option (Paris)
    await page.locator('#live-card .option-btn', { hasText: 'Paris' }).click()

    // Thanks message
    await expect(page.locator('#live-card .thanks')).toContainText('Paris', { timeout: 10000 })
    // Quiz feedback: either banner or toast shows correct + points; banner auto-hides after ~3s so accept either
    const banner = page.locator('#quiz-banner')
    const toast = page.locator('#toast-root')
    // Wait for at least one signal that scoring happened (toast "Correct!" or banner or pill)
    await expect(async () => {
      const bannerVisible = await banner.isVisible().catch(() => false)
      const toastText = await toast.textContent().catch(() => '')
      const cardText = await page.locator('#live-card').textContent().catch(() => '')
      const hasSignal =
        (bannerVisible && /correct/i.test((await banner.textContent()) || '')) ||
        /correct/i.test(toastText || '') ||
        /correct/i.test(cardText || '')
      expect(hasSignal).toBeTruthy()
    }).toPass({ timeout: 10000 })

    // Points indicator on the live card (my_correct pill) — eventually shows via WS state refresh
    await expect(page.locator('#live-card')).toContainText(/correct/i, { timeout: 10000 })

    // Leaderboard tab should list the participant — poll via WS state + tab switch
    await page.locator('#tab-leaderboard').click()
    await expect(page.locator('#panel-leaderboard')).toBeVisible()
    // The leaderboard card renders after WS pushes state; poll a bit
    const lbCard = page.locator('#leaderboard-card')
    // It may take a second for WS state to update after answer
    await expect(lbCard).toContainText(/TestPlayer|Anonymous/i, { timeout: 15000 })
    // Points should be shown
    await expect(lbCard).toContainText(/pts/i)

    // Also verify via API that the leaderboard has the entry
    // Wait a moment for server to compute
    await page.waitForTimeout(1500)
    const lbRes = await request.get(`/api/events/${ev.code}/leaderboard`)
    expect(lbRes.ok()).toBeTruthy()
    const lbBody = await lbRes.json()
    const entries = lbBody.entries ?? lbBody.leaderboard ?? []
    expect(entries.length).toBeGreaterThan(0)
    // Find our player (name may be TestPlayer or Anonymous depending on timing of identity propagation)
    const hasPoints = entries.some((e: { points: number }) => e.points > 0)
    expect(hasPoints).toBeTruthy()

    // Admin leaderboard panel also lists the entry
    const adminLb = await request.get(`/api/admin/events/${ev.id}/leaderboard`)
    expect(adminLb.ok()).toBeTruthy()
    const adminBody = await adminLb.json()
    const adminEntries = adminBody.entries ?? adminBody.leaderboard ?? []
    expect(adminEntries.length).toBeGreaterThan(0)
  })
})
