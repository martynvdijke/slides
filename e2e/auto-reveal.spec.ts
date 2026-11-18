import { test, expect } from '@playwright/test'
import { activateQuestion, createEvent, login } from './helpers'

/**
 * Regression: a timed question with auto_reveal must stay on screen after its
 * duration expires. The reaper used to close it, so the audience state lost its
 * active question instead of showing the revealed results.
 *
 * duration_sec has a 5s floor (validateDurationSec), so the shortest realistic
 * deadline is used and the reaper poll is kept to a single tight wait.
 */
test.describe('auto reveal expiry', () => {
  test('expired auto_reveal question is revealed, not closed', async ({ request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Auto Reveal ${Date.now()}`)

    const created = await request.post(`/api/admin/events/${ev.id}/questions`, {
      data: {
        kind: 'poll',
        mode: 'live',
        prompt: 'Auto reveal me',
        options: ['Yes', 'No'],
        correct_index: 0,
        show_results: false,
        duration_sec: 5,
        auto_close: true,
        auto_reveal: true,
      },
    })
    expect(created.ok(), 'create question should succeed').toBeTruthy()
    const q = (await created.json()) as { id: number }
    await activateQuestion(request, ev.id, q.id)

    // Before expiry: live, results hidden.
    const live = await (await request.get(`/api/events/${ev.code}/state`)).json()
    expect(live.active_question?.id).toBe(q.id)
    expect(live.active_question?.status).toBe('live')
    expect(live.active_question?.show_results).toBe(false)

    // After expiry the reaper must transition to revealed, not remove it.
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/events/${ev.code}/state`)
          const body = await res.json()
          return body.active_question?.status ?? 'none'
        },
        { timeout: 20_000, intervals: [500] },
      )
      .toBe('revealed')

    const revealed = await (await request.get(`/api/events/${ev.code}/state`)).json()
    expect(revealed.active_question?.id, 'question stays active').toBe(q.id)
    expect(revealed.active_question?.show_results).toBe(true)
    expect(revealed.active_question?.correct_index).toBe(0)
    expect(Array.isArray(revealed.active_question?.results)).toBeTruthy()
  })
})
