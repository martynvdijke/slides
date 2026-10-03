import { test, expect } from '@playwright/test'
import { activateQuestion, createEvent, createQuestion, login } from './helpers'

test.describe('reactions', () => {
  test('audience can send a reaction and sees float animation', async ({ page, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E React ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'React test?',
      options: ['Yes', 'No'],
    })
    await activateQuestion(request, ev.id, q.id)

    await page.goto(`/e/${ev.code}`)
    await expect(page.locator('#live-card .prompt')).toContainText('React test?', { timeout: 15000 })

    // Reaction bar should be visible with buttons
    const bar = page.locator('#reaction-bar')
    await expect(bar).toBeVisible()
    const btns = page.locator('#reaction-btns .r-btn')
    await expect(btns.first()).toBeVisible()
    const count = await btns.count()
    expect(count).toBeGreaterThan(0)

    // Click a reaction — should show float emoji without error
    await btns.first().click()
    // Float animation container gets a .float-emoji child
    const float = page.locator('#reaction-float .float-emoji')
    await expect(float.first()).toBeVisible({ timeout: 3000 })

    // Button gets pressed class briefly
    // Re-click to ensure throttle doesn't break (80ms throttle)
    await page.waitForTimeout(200)
    await btns.nth(1).click()
    await expect(page.locator('#reaction-float .float-emoji').first()).toBeVisible({ timeout: 3000 })

    // No console errors from the reaction path (collect page errors)
    // The reaction also sends via WS; counts may update. Just ensure bar still visible.
    await expect(bar).toBeVisible()
  })
})
