import { test, expect } from '@playwright/test'

/**
 * The feature-test deck bakes VITE_EVENT_CODE=feature-test at build time, and
 * the e2e server seeds a matching "feature-test" event (SEED_FEATURE_TEST=1).
 * Loaded with no query params, the in-slide live components must therefore be
 * CONFIGURED (real join card + QR), not the developer "not configured" hint.
 */
test.describe('feature-test deck seeded defaults', () => {
  test('connects to the seeded event with no query params', async ({ page, request }) => {
    const errors: string[] = []
    const ignored = [/Wake Lock permission request denied/i]
    page.on('pageerror', (e) => {
      if (!ignored.some((re) => re.test(e.message))) errors.push(e.message)
    })

    await page.goto('/feature-test/')
    await expect(page).toHaveTitle(/feature.?test/i)

    // Configured: a real QR join card, and NOT the setup hint.
    const join = page.locator('.live-join').first()
    await expect(join).toBeAttached()
    await expect(join.locator('.live-join-qr img')).toBeAttached()
    await expect(join.locator('.live-join-setup')).toHaveCount(0)
    await expect(page.getByText(/not configured/i)).toHaveCount(0)

    // The displayed room code resolves back to the feature-test event via the API.
    const room = (await join.locator('.live-join-room').first().textContent())?.trim() ?? ''
    expect(room).toMatch(/^[A-Z0-9]{5}$/)
    const resolved = await request.get(`/api/join/${room}`)
    expect(resolved.ok()).toBeTruthy()
    expect((await resolved.json()).code).toBe('feature-test')

    expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
  })
})
