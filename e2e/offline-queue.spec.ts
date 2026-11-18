import { test, expect, type WebSocketRoute } from '@playwright/test'
import { activateQuestion, createEvent, createQuestion, enterAudience, login } from './helpers'

/**
 * Offline answer replay. With the WebSocket unavailable and the answers API
 * blocked, an answer is queued in localStorage. Restoring connectivity replays
 * it with the stored client_uuid, so it lands exactly once; replaying the same
 * payload again (same uuid) is still a no-op.
 */

interface QueuedAnswer {
  type: string
  question_id: number
  value: string
  client_uuid: string
}

async function readQueue(page: import('@playwright/test').Page, key: string): Promise<QueuedAnswer[]> {
  return page.evaluate((k) => {
    try {
      const raw = localStorage.getItem(k)
      return raw ? (JSON.parse(raw) as QueuedAnswer[]) : []
    } catch {
      return []
    }
  }, key)
}

test.describe('offline queue', () => {
  test('an answer submitted offline replays exactly once when back online', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Offline ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Pick one offline',
      options: ['Alpha', 'Beta'],
      show_results: true,
    })
    await activateQuestion(request, ev.id, q.id)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    // Deterministic "offline": the answer POST never leaves the browser and the
    // live WebSocket is refused, so the app must fall back to its queue. Flipping
    // liveWs back to true lets the next reconnect be proxied to the real server.
    let liveWs = false
    const wsHandler = (ws: WebSocketRoute) => {
      if (!liveWs) {
        void ws.close()
        return
      }
      ws.connectToServer()
    }
    await page.routeWebSocket(/\/ws\/events\//, wsHandler)
    await page.route('**/api/events/*/answers', (route) => route.abort())

    await page.goto(`/e/${ev.code}`)
    await enterAudience(page, 'Offline Ana')
    await expect(page.locator('#live-card .prompt')).toContainText('Pick one offline', { timeout: 15000 })
    // The closed socket raises the reconnect banner: the page is not live.
    await expect(page.locator('#ws-banner')).toHaveClass(/show/, { timeout: 15000 })

    await page.locator('#live-card .option-btn', { hasText: 'Alpha' }).click()
    await expect(page.locator('#toast-root')).toContainText(/could not submit answer/i, { timeout: 10000 })

    const queueKey = `qt_queue_${ev.code}`
    await expect
      .poll(async () => (await readQueue(page, queueKey)).filter((it) => it.type === 'answer').length, {
        timeout: 10000,
      })
      .toBe(1)
    const queued = (await readQueue(page, queueKey)).find((it) => it.type === 'answer')
    expect(queued, 'answer should be queued with its idempotency key').toBeTruthy()
    expect(queued!.question_id).toBe(q.id)
    expect(queued!.value).toBe('Alpha')
    expect(queued!.client_uuid, 'client_uuid generated at submit time').toBeTruthy()

    // Restore connectivity and let the app reconnect and flush its queue.
    await page.unroute('**/api/events/*/answers')
    liveWs = true
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'))
    })

    const total = async (): Promise<number> => {
      const res = await request.get(`/api/events/${ev.code}/state`)
      const state = await res.json()
      return state.active_question?.total ?? 0
    }
    await expect.poll(total, { timeout: 20000, intervals: [250] }).toBe(1)
    await expect.poll(async () => (await readQueue(page, queueKey)).length, { timeout: 10000 }).toBe(0)

    // The tally includes exactly one Alpha answer.
    const state = await (await request.get(`/api/events/${ev.code}/state`)).json()
    const alpha = (state.active_question?.results ?? []).find(
      (r: { label: string }) => r.label === 'Alpha',
    )
    expect(alpha?.count, 'Alpha tally').toBe(1)

    // Replay the identical answer (same client_uuid) from the participant's own
    // session: it must be accepted without creating a second row.
    const replay = await page.evaluate(
      async (payload) => {
        const res = await fetch(`/api/events/${payload.code}/answers`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question_id: payload.question_id,
            value: payload.value,
            client_uuid: payload.client_uuid,
          }),
        })
        return { ok: res.ok, status: res.status }
      },
      { code: ev.code, question_id: queued!.question_id, value: queued!.value, client_uuid: queued!.client_uuid },
    )
    expect(replay.ok, `replay should succeed (status ${replay.status})`).toBeTruthy()
    await page.waitForTimeout(300)
    expect(await total(), 'replay must not double-count').toBe(1)

    await ctx.close()
  })
})
