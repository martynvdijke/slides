import { test, expect } from '@playwright/test'
import { activateQuestion, createEvent, createQuestion, enterAudience, login } from './helpers'

/**
 * grid2x2 end-to-end: the composer created the question, the audience gets a
 * 2×2 quadrant picker (answers are points {x,y} in 0..1, y=1 at the top), the
 * state aggregates those points, and the projector tallies them per quadrant.
 *
 * Quadrant option order is declaration order: top-left, top-right,
 * bottom-left, bottom-right.
 */

type GridResult = { label: string; count: number; x?: number; y?: number; [k: string]: unknown }

function quadrantCounts(results: GridResult[]): number[] {
  const counts = [0, 0, 0, 0]
  for (const r of results) {
    if (typeof r.x !== 'number' || typeof r.y !== 'number') continue
    counts[(r.y >= 0.5 ? 0 : 2) + (r.x >= 0.5 ? 1 : 0)] += r.count
  }
  return counts
}

test.describe('grid2x2 question', () => {
  test('audience quadrants aggregate and the projector renders grid results', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Grid ${Date.now()}`)

    // Creation must accept grid2x2 (it is a first-class kind) and its options
    // are the four quadrant labels.
    const q = await createQuestion(request, ev.id, {
      kind: 'grid2x2',
      prompt: 'Where do you sit?',
      options: ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'],
      show_results: true,
    })
    await activateQuestion(request, ev.id, q.id)

    const openAudience = async (name: string) => {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(`/e/${ev.code}`)
      await enterAudience(page, name)
      await expect(page.locator('#live-card .prompt')).toContainText('Where do you sit?', { timeout: 15000 })
      await expect(page.locator('#live-card .grid2x2-cell')).toHaveCount(4)
      return page
    }

    // Two independent clients, each picking a different quadrant.
    const audA = await openAudience('Grid A')
    await audA.locator('#live-card .grid2x2-cell', { hasText: 'Top-right' }).click()
    await expect(audA.locator('#live-card .thanks')).toBeVisible({ timeout: 10000 })

    const audB = await openAudience('Grid B')
    await audB.locator('#live-card .grid2x2-cell', { hasText: 'Bottom-left' }).click()
    await expect(audB.locator('#live-card .thanks')).toBeVisible({ timeout: 10000 })

    // The server aggregates the two points; wait for both to land.
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/events/${ev.code}/state`)
          const body = await res.json()
          return body.active_question?.total ?? 0
        },
        { timeout: 15000, intervals: [250] },
      )
      .toBe(2)

    const state = await (await request.get(`/api/events/${ev.code}/state`)).json()
    const active = state.active_question
    expect(active.id).toBe(q.id)
    expect(Array.isArray(active.results)).toBeTruthy()
    const counts = quadrantCounts(active.results)
    expect(counts, 'per-quadrant counts').toEqual([0, 1, 1, 0])

    // The answering client sees the same quadrant tally.
    await expect(audA.locator('#live-card .grid-result')).toHaveCount(4)
    await expect(audA.locator('#live-card .grid-result', { hasText: 'Top-right' })).toContainText('1')

    // Projector view tallies per quadrant with the option labels.
    const projCtx = await browser.newContext()
    const proj = await projCtx.newPage()
    await proj.goto(`/live/${ev.code}`)
    await expect(proj.locator('#prompt-area')).toContainText('Where do you sit?', { timeout: 15000 })
    await expect(proj.locator('#grid2x2-results .grid2x2-result')).toHaveCount(4)
    await expect(proj.locator('#grid2x2-results .grid2x2-result', { hasText: 'Top-right' })).toContainText('1')
    await expect(proj.locator('#grid2x2-results .grid2x2-result', { hasText: 'Bottom-left' })).toContainText('1')
    await expect(proj.locator('#grid2x2-results .grid2x2-result', { hasText: 'Top-left' })).toContainText('0')
  })
})
