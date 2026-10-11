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

  test('renders every quiz question kind with pre-filled options', async ({ page }) => {
    const errors: string[] = []
    const ignored = [/Wake Lock permission request denied/i]
    page.on('pageerror', (e) => {
      if (!ignored.some((re) => re.test(e.message))) errors.push(e.message)
    })

    await page.goto('/test/')
    await expect(page).toHaveTitle(/quiz test deck/i)

    // q-poll
    await expect(page.getByTestId('q-poll')).toBeAttached()
    await expect(page.getByTestId('q-poll').locator('.q-prompt')).toContainText('Single choice — pick one option')
    await expect(page.getByTestId('q-poll-option')).toHaveCount(3)
    await expect(page.getByTestId('q-poll-option')).toHaveText(['a', 'b', 'c'])

    // q-multi
    await expect(page.getByTestId('q-multi')).toBeAttached()
    await expect(page.getByTestId('q-multi').locator('.q-prompt')).toContainText('Multi-select — pick all that apply')
    await expect(page.getByTestId('q-multi-option')).toHaveCount(3)
    await expect(page.getByTestId('q-multi-option')).toHaveText(['a', 'b', 'c'])

    // q-ranking
    await expect(page.getByTestId('q-ranking')).toBeAttached()
    await expect(page.getByTestId('q-ranking').locator('.q-prompt')).toContainText('Ranking — order these options')
    await expect(page.getByTestId('q-ranking-option')).toHaveCount(3)
    await expect(page.getByTestId('q-ranking-option')).toHaveText(['a', 'b', 'c'])

    // q-yesno
    await expect(page.getByTestId('q-yesno')).toBeAttached()
    await expect(page.getByTestId('q-yesno').locator('.q-prompt')).toContainText('Yes / No — is it ready?')
    await expect(page.getByTestId('q-yesno-option')).toHaveCount(2)
    await expect(page.getByTestId('q-yesno-option')).toHaveText(['Yes', 'No'])

    // q-rating
    await expect(page.getByTestId('q-rating')).toBeAttached()
    await expect(page.getByTestId('q-rating').locator('.q-prompt')).toContainText('Liking scale — how much did you like it?')
    await expect(page.getByTestId('q-rating-option')).toHaveCount(5)
    await expect(page.getByTestId('q-rating-option')).toHaveText(['1', '2', '3', '4', '5'])

    // q-nps
    await expect(page.getByTestId('q-nps')).toBeAttached()
    await expect(page.getByTestId('q-nps').locator('.q-prompt')).toContainText('NPS — how likely are you to recommend it?')
    await expect(page.getByTestId('q-nps-option')).toHaveCount(11)
    await expect(page.getByTestId('q-nps-option')).toHaveText(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])

    // q-open
    await expect(page.getByTestId('q-open')).toBeAttached()
    await expect(page.getByTestId('q-open').locator('.q-prompt')).toContainText('Open text — what did you think?')
    await expect(page.getByTestId('q-open-input')).toBeAttached()
    await expect(page.getByTestId('q-open-input')).toHaveJSProperty('tagName', 'TEXTAREA')

    // q-wordcloud
    await expect(page.getByTestId('q-wordcloud')).toBeAttached()
    await expect(page.getByTestId('q-wordcloud').locator('.q-prompt')).toContainText('Word cloud — one word')
    await expect(page.getByTestId('q-wordcloud-input')).toBeAttached()

    expect(errors).toEqual([])
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

  test('advances when tapping the slide content', async ({ page }) => {
    // Regression: Slidev's built-in handler only navigates when the
    // pointerdown target is the empty #slide-container. Tapping/clicking the
    // slide content must also advance (global-top.vue pointer handler fills
    // that gap so the deck is usable on touch devices).
    await page.goto('/feature-test/')
    await expect(page).toHaveURL(/#\/1\b/)
    await page.locator('#slide-content h1').first().click()
    await expect(page).toHaveURL(/#\/2\b/)
  })
})
