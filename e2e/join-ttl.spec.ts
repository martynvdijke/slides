import { test, expect } from '@playwright/test'
import { activateQuestion, createEvent, createQuestion, enterAudience, login } from './helpers'

/**
 * Join TTL: an attendee's join session is a server-side 4-hour TTL (JOIN_TTL
 * overrides it) separate from the year-long participant cookie. When the join
 * session is gone the audience app must stop accepting writes, explain the
 * expiry and let the attendee rejoin without losing their identity or answers.
 *
 * The server-side TTL arithmetic is covered by join_ttl_test.go; this spec
 * exercises the browser contract around it.
 */
test.describe('join session expiry', () => {
  test('expired join session offers rejoin and keeps identity plus answers', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Join TTL ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Which runtime?',
      options: ['Node', 'Deno'],
    })
    await activateQuestion(request, ev.id, q.id)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/e/${ev.code}`)
    await enterAudience(page, 'Grace')
    await expect(page.locator('#live-card .prompt')).toContainText('Which runtime?', { timeout: 15000 })
    await page.locator('#live-card .option-btn', { hasText: 'Node' }).click()
    await expect(page.locator('#live-card .thanks')).toContainText('Node', { timeout: 10000 })

    // The state exposes a live join session with a positive remaining time.
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/events/${ev.code}/state`)
          if (!res.ok()) return null
          const body = await res.json()
          return body.me?.name ?? null
        },
        { timeout: 10000 },
      )
      .toBe('Grace')
    const state = await (await page.request.get(`/api/events/${ev.code}/state`)).json()
    expect(state.join_session, 'state carries the join session').toBeTruthy()
    expect(state.join_session.remaining_s).toBeGreaterThan(0)
    expect(state.join_session.remaining_s).toBeLessThanOrEqual(4 * 60 * 60)

    // Drop only the join cookie: the participant cookie (identity) stays. This
    // is the observable shape of an expired/reaped join session.
    await ctx.clearCookies({ name: 'meetup_join' })
    await page.reload()
    await expect(page.locator('#session-sheet')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#session-title')).toContainText('session has ended')

    // Writes and state reads are refused with join_expired until rejoin.
    const expired = await page.request.get(`/api/events/${ev.code}/state`)
    expect(expired.status()).toBe(401)
    expect((await expired.json()).code).toBe('join_expired')

    await page.locator('#session-rejoin').click()
    await expect(page.locator('#session-sheet')).toBeHidden({ timeout: 15000 })
    await expect(page.locator('#toast-root')).toContainText(/Rejoined/i, { timeout: 10000 })

    // Same participant: name and the earlier answer come back.
    await expect(page.locator('#identity-display-name')).toHaveText('Grace', { timeout: 10000 })
    await expect(page.locator('#live-card .thanks')).toContainText('Node', { timeout: 15000 })
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/events/${ev.code}/state`)
          return res.status()
        },
        { timeout: 10000 },
      )
      .toBe(200)
    const rejoinState = await (await page.request.get(`/api/events/${ev.code}/state`)).json()
    expect(rejoinState.join_session?.remaining_s).toBeGreaterThan(0)

    await ctx.close()
  })

  test('expired session rejects answers until the attendee rejoins', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Join Write ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Which runtime?',
      options: ['Node', 'Deno'],
    })
    await activateQuestion(request, ev.id, q.id)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/e/${ev.code}`)
    await enterAudience(page, 'Late Sam')
    await expect(page.locator('#live-card .prompt')).toContainText('Which runtime?', { timeout: 15000 })

    await ctx.clearCookies({ name: 'meetup_join' })
    await page.reload()
    await expect(page.locator('#session-sheet')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#session-rejoin')).toBeVisible()
    await expect(page.locator('#session-spectate')).toBeVisible()

    // Writes are refused while the join session is gone.
    const denied = await page.request.post(`/api/events/${ev.code}/answers`, {
      data: { question_id: q.id, value: 'Node' },
    })
    expect(denied.status()).toBe(401)
    expect((await denied.json()).code).toBe('join_expired')

    // Rejoining restores write access for the same participant.
    await page.locator('#session-rejoin').click()
    await expect(page.locator('#session-sheet')).toBeHidden({ timeout: 15000 })
    await expect(page.locator('#live-card .prompt')).toContainText('Which runtime?', { timeout: 15000 })
    await page.locator('#live-card .option-btn', { hasText: 'Deno' }).click()
    await expect(page.locator('#live-card .thanks')).toContainText('Deno', { timeout: 10000 })

    await ctx.close()
  })
})
