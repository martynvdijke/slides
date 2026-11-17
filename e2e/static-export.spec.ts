import { test, expect } from '@playwright/test'

/**
 * Static export mode is build-time gated by VITE_STATIC_EXPORT and only affects
 * the Slidev decks, not the Go SPA pages. The default e2e server builds decks
 * WITHOUT the flag, so asserting "components render nothing" is not reliable here.
 *
 * This spec instead asserts the invariant that IS reachable in the default build:
 * the built deck still serves and in-slide live components render normally instead
 * of being hidden by the static-export gate. It also verifies that both the entry
 * page and the deck return 200.
 *
 * A true static-export assertion (build a deck with VITE_STATIC_EXPORT=1 and
 * assert components render empty) is covered by Go/build verification elsewhere
 * and is too slow to run inside the e2e suite — intentionally skipped here.
 */
test.describe('static export invariants (default build)', () => {
  test('entry and deck both return 200', async ({ request }) => {
    const entry = await request.get('/')
    expect(entry.ok()).toBeTruthy()
    const entryBody = await entry.text()
    expect(entryBody).toContain('Host or join')

    const deck = await request.get('/meetup/')
    expect(deck.ok()).toBeTruthy()
    const deckBody = await deck.text()
    // Deck HTML loads (Slidev shell)
    expect(deckBody.length).toBeGreaterThan(1000)
  })

  test('deck live components render in the default build', async ({ page }) => {
    const errors: string[] = []
    const ignored = [/Wake Lock permission request denied/i]
    page.on('pageerror', (e) => {
      if (!ignored.some((re) => re.test(e.message))) errors.push(e.message)
    })
    // The feature-test deck is the fixture that mounts the live components; the
    // meetup deck is plain content. Its build bakes VITE_EVENT_CODE, so the
    // default build must render the real join card rather than nothing at all.
    await page.goto('/feature-test/')
    await expect(page).toHaveTitle(/live feature test deck/i)
    await expect(page.locator('.live-join').first()).toBeAttached()
    await expect(page.locator('.live-join-qr img').first()).toBeAttached()
    expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
  })
})
