import { test, expect } from '@playwright/test'

/**
 * Static export mode is build-time gated by VITE_STATIC_EXPORT and only affects
 * the Slidev decks, not the Go SPA pages. The default e2e server builds decks
 * WITHOUT the flag, so asserting "components render nothing" is not reliable here.
 *
 * This spec instead asserts the invariant that IS reachable in the default build:
 * the built deck still serves and in-slide live components behave normally (show
 * the "not configured" hint when no backend is configured). It also verifies
 * that both the entry page and the deck return 200.
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

  test('deck live components show not-configured hint in default build', async ({ page }) => {
    const errors: string[] = []
    const ignored = [/Wake Lock permission request denied/i]
    page.on('pageerror', (e) => {
      if (!ignored.some((re) => re.test(e.message))) errors.push(e.message)
    })
    await page.goto('/meetup/')
    await expect(page).toHaveTitle(/meetup/i)
    // In the default build, live components are present and show "not configured"
    await expect(page.locator('.live-join').first()).toBeAttached()
    await expect(page.getByText(/not configured/i).first()).toBeAttached()
    expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
  })
})
