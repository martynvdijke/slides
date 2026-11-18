import { test, expect } from '@playwright/test'
import { activateQuestion, createEvent, createQuestion, enterAudience, login } from './helpers'

const POINTS_BASE = 1000

/**
 * Speed decay: an answer's points are scaled by how long after activation it
 * arrived, down to a 10% floor over a fixed 30 s window. Two participants give
 * the same correct answer, the second strictly later; the later one must earn
 * strictly fewer points and rank below the first.
 *
 * The wait between the answers is driven by the question's own activation clock
 * (polled, never slept on) rather than the wall clock of the test process, so
 * the assertion holds regardless of how fast the page renders.
 */
test.describe('scoring speed decay', () => {
  test('a correct answer submitted later earns strictly fewer points', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Decay ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Fastest finger?',
      options: ['Paris', 'Lyon'],
      correct_index: 0,
      points_base: POINTS_BASE,
      show_results: true,
    })

    // Load the audience app first so the early answer happens promptly once the
    // decay clock starts at activation.
    const earlyCtx = await browser.newContext()
    const early = await earlyCtx.newPage()
    await early.goto(`/e/${ev.code}`)
    await enterAudience(early, 'Speedy')

    await activateQuestion(request, ev.id, q.id)
    await expect(early.locator('#live-card .prompt')).toContainText('Fastest finger?', { timeout: 15000 })
    await early.locator('#live-card .option-btn', { hasText: 'Paris' }).click()
    await expect(early.locator('#live-card .thanks')).toBeVisible({ timeout: 10000 })

    // The app's own state is the source of truth for the awarded score.
    const stateA = await (await earlyCtx.request.get(`/api/events/${ev.code}/state`)).json()
    const activatedAt = stateA.active_question.activated_at as number
    expect(activatedAt, 'activated_at is exposed while the question is live').toBeGreaterThan(0)
    const pointsA = stateA.active_question.my_points as number
    expect(stateA.active_question.my_correct).toBe(true)
    expect(pointsA).toBeGreaterThan(0)
    expect(pointsA).toBeLessThanOrEqual(POINTS_BASE)
    const elapsedA = Date.now() - activatedAt

    // Hold the second answer until the decay clock has moved far enough that
    // integer rounding cannot produce a tie (1.5 s of a 30 s window).
    await expect
      .poll(() => Date.now() - activatedAt, { timeout: 20000, intervals: [100, 250, 500] })
      .toBeGreaterThanOrEqual(elapsedA + 1500)

    const lateCtx = await browser.newContext()
    const late = await lateCtx.newPage()
    await late.goto(`/e/${ev.code}`)
    await enterAudience(late, 'Steady')
    await expect(late.locator('#live-card .prompt')).toContainText('Fastest finger?', { timeout: 15000 })
    const lateRes = await lateCtx.request.post(`/api/events/${ev.code}/answers`, {
      data: { question_id: q.id, value: 'Paris', client_uuid: `decay-late-${Date.now()}` },
    })
    expect(lateRes.ok(), 'late answer accepted').toBeTruthy()
    const lateBody = await lateRes.json()
    expect(lateBody.is_correct).toBe(true)
    const pointsB = lateBody.points_awarded as number

    // Decay invariants: strictly less than the early answer, never below the
    // 10% floor, and the response's running total is this participant's own.
    expect(pointsB).toBeLessThan(pointsA)
    expect(pointsB).toBeGreaterThanOrEqual(Math.round(POINTS_BASE * 0.1))
    expect(pointsA - pointsB).toBeGreaterThanOrEqual(10)
    expect(lateBody.total_points).toBe(pointsB)

    const stateB = await (await lateCtx.request.get(`/api/events/${ev.code}/state`)).json()
    expect(stateB.active_question.my_points).toBe(pointsB)
    expect(stateB.active_question.my_correct).toBe(true)

    // The leaderboard reflects the same order: the faster correct answer wins.
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/events/${ev.code}/leaderboard`)
          if (!res.ok()) return null
          const body = await res.json()
          const entries = (body.entries ?? []) as Array<{ points: number }>
          return entries.map((e) => e.points)
        },
        { timeout: 10000 },
      )
      .toEqual([pointsA, pointsB])

    await earlyCtx.close()
    await lateCtx.close()
  })
})
