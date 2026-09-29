import { test, expect } from '@playwright/test'
import { createEvent, login } from './helpers'

/**
 * The all-in-one server also hosts the built Slidev decks. Verify the deck
 * loads, the room-code/join API works, and the QR endpoint serves a PNG.
 */
test.describe('slides deck', () => {
  test('serves the built meetup deck', async ({ page }) => {
    const errors: string[] = []
    // Headless Chromium denies the Screen Wake Lock API that Slidev requests;
    // that is a browser policy quirk, not an app error.
    const ignored = [/Wake Lock permission request denied/i]
    page.on('pageerror', (e) => {
      if (!ignored.some((re) => re.test(e.message))) errors.push(e.message)
    })

    await page.goto('/meetup/')
    await expect(page).toHaveTitle(/meetup/i)

    // Slidev mounts every slide (inactive ones are hidden), so the live
    // components are best asserted as present in the DOM. With no room code
    // baked in they render the "not configured" setup hint.
    const live = page.locator('.live-join')
    await expect(live.first()).toBeAttached()
    await expect(page.getByText(/not configured/i).first()).toBeAttached()

    expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
  })

  test('QR endpoint and room resolution work', async ({ request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E QR ${Date.now()}`)

    const qr = await request.get(`/api/events/${ev.code}/qr.png`)
    expect(qr.ok()).toBeTruthy()
    expect(qr.headers()['content-type']).toContain('image/png')

    const resolved = await request.get(`/api/join/${ev.room_code.toLowerCase()}`)
    expect(resolved.ok()).toBeTruthy()
    const body = await resolved.json()
    expect(body.code).toBe(ev.code)
    expect(body.room_code).toBe(ev.room_code)
  })
})
