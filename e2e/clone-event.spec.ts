import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { ADMIN, activateQuestion, createEvent, createQuestion, enterAudience, login } from './helpers'

async function signInAdmin(page: Page): Promise<void> {
  await page.goto('/admin')
  if (await page.locator('#form-setup').isVisible()) {
    await page.fill('#setup-user', ADMIN.username)
    await page.fill('#setup-pass', ADMIN.password)
    await page.locator('#form-setup button[type="submit"]').click()
  }
  if (await page.locator('#form-login').isVisible()) {
    await page.fill('#login-user', ADMIN.username)
    await page.fill('#login-pass', ADMIN.password)
    await page.locator('#form-login').getByRole('button', { name: 'Sign in' }).click()
  }
  await expect(page.locator('#events-list')).toBeVisible()
}

interface AdminEvent {
  id: number
  code: string
  room_code: string
  name: string
  qa_slow_mode_s: number
  feature_live: boolean
  feature_qa: boolean
  feature_slides: boolean
  feature_feedback: boolean
  feature_leaderboard: boolean
}

interface AdminQuestion {
  id: number
  prompt: string
  status: string
  options: string[]
  correct_index?: number | null
  respondents: number
  results: Array<{ label: string; count: number }>
}

async function listEvents(request: APIRequestContext): Promise<AdminEvent[]> {
  const res = await request.get('/api/admin/events')
  expect(res.ok(), 'admin events list should load').toBeTruthy()
  return (await res.json()) as AdminEvent[]
}

async function listQuestions(request: APIRequestContext, eventId: number): Promise<AdminQuestion[]> {
  const res = await request.get(`/api/admin/events/${eventId}/questions`)
  expect(res.ok(), 'admin question list should load').toBeTruthy()
  return (await res.json()) as AdminQuestion[]
}

/**
 * Clone event: the copy gets its own code/room code, carries the source
 * questions and event settings, and runs independently of the source event.
 */
test.describe('clone event', () => {
  test('clone copies questions and settings with its own room code', async ({ browser, request }) => {
    await login(request)
    const source = await createEvent(request, `E2E Clone Source ${Date.now()}`)
    const settings = await request.patch(`/api/admin/events/${source.id}`, {
      data: { qa_slow_mode_s: 45, feature_slides: false, feature_feedback: false },
    })
    expect(settings.ok(), 'source event settings should save').toBeTruthy()

    await createQuestion(request, source.id, {
      kind: 'poll',
      prompt: 'Cloned poll',
      options: ['Yes', 'No'],
      correct_index: 0,
    })
    await createQuestion(request, source.id, { kind: 'open', prompt: 'Cloned prompt' })

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    const cloneName = `${source.name} copy`
    await admin.locator('.event-card', { hasText: source.name }).getByRole('button', { name: 'Clone' }).click()
    await expect(admin.locator('#dialog-clone')).toBeVisible({ timeout: 5000 })
    await admin.locator('#clone-name-input').fill(cloneName)
    await admin.locator('#btn-clone-confirm').click()
    await expect(admin.locator('#toast-root')).toContainText('Event cloned', { timeout: 15000 })

    const clone = await (async () => {
      await expect
        .poll(async () => (await listEvents(request)).some((e) => e.name === cloneName), { timeout: 10000 })
        .toBe(true)
      return (await listEvents(request)).find((e) => e.name === cloneName)!
    })()
    expect(clone).toBeTruthy()

    // Own identity, same name/copy.
    expect(clone.id).not.toBe(source.id)
    expect(clone.code).not.toBe(source.code)
    expect(clone.room_code).toMatch(/^[A-Z0-9]{5}$/)
    expect(clone.room_code).not.toBe(source.room_code)

    // Settings survive the clone.
    expect(clone.qa_slow_mode_s).toBe(45)
    expect(clone.feature_slides).toBe(false)
    expect(clone.feature_feedback).toBe(false)
    expect(clone.feature_live).toBe(true)
    expect(clone.feature_qa).toBe(true)

    // Questions are copied as fresh drafts, preserving their content.
    const copied = await listQuestions(request, clone.id)
    expect(copied.map((q) => q.prompt).sort()).toEqual(['Cloned poll', 'Cloned prompt'])
    expect(copied.every((q) => q.status === 'draft')).toBeTruthy()
    const pollCopy = copied.find((q) => q.prompt === 'Cloned poll')!
    expect(pollCopy.options).toEqual(['Yes', 'No'])

    // The source is untouched.
    const original = await listQuestions(request, source.id)
    expect(original.map((q) => q.prompt).sort()).toEqual(['Cloned poll', 'Cloned prompt'])
    const sourceEvent = (await listEvents(request)).find((e) => e.id === source.id)!
    expect(sourceEvent.room_code).toBe(source.room_code)

    await adminCtx.close()
  })

  test('cloned questions activate and collect answers independently', async ({ browser, request }) => {
    await login(request)
    const source = await createEvent(request, `E2E Clone Run ${Date.now()}`)
    const sourceQ = await createQuestion(request, source.id, {
      kind: 'poll',
      prompt: 'Runtime?',
      options: ['Node', 'Deno'],
    })

    const cloneRes = await request.post(`/api/admin/events/${source.id}/clone`, { data: {} })
    expect(cloneRes.ok(), 'clone should succeed').toBeTruthy()
    const clone = (await cloneRes.json()) as AdminEvent
    expect(clone.id).not.toBe(source.id)
    expect(clone.room_code).not.toBe(source.room_code)

    const cloneQs = await listQuestions(request, clone.id)
    expect(cloneQs).toHaveLength(1)
    const cloneQ = cloneQs[0]

    await activateQuestion(request, source.id, sourceQ.id)
    await activateQuestion(request, clone.id, cloneQ.id)

    const sourceCtx = await browser.newContext()
    const sourcePage = await sourceCtx.newPage()
    await sourcePage.goto(`/e/${source.code}`)
    await enterAudience(sourcePage, 'Source Fan')
    await expect(sourcePage.locator('#live-card .prompt')).toContainText('Runtime?', { timeout: 15000 })
    await sourcePage.locator('#live-card .option-btn', { hasText: 'Node' }).click()
    await expect(sourcePage.locator('#live-card .thanks')).toContainText('Node', { timeout: 10000 })

    const cloneCtx = await browser.newContext()
    const clonePage = await cloneCtx.newPage()
    await clonePage.goto(`/e/${clone.code}`)
    await enterAudience(clonePage, 'Clone Fan')
    await expect(clonePage.locator('#live-card .prompt')).toContainText('Runtime?', { timeout: 15000 })
    await clonePage.locator('#live-card .option-btn', { hasText: 'Deno' }).click()
    await expect(clonePage.locator('#live-card .thanks')).toContainText('Deno', { timeout: 10000 })

    // Each event counted exactly its own answer.
    const sourceAfter = (await listQuestions(request, source.id))[0]
    const cloneAfter = (await listQuestions(request, clone.id))[0]
    expect(sourceAfter.respondents).toBe(1)
    expect(cloneAfter.respondents).toBe(1)
    expect(sourceAfter.results.find((r) => r.label === 'Node')?.count).toBe(1)
    expect(cloneAfter.results.find((r) => r.label === 'Deno')?.count).toBe(1)

    const sourceState = await (await request.get(`/api/events/${source.code}/state`)).json()
    expect(sourceState.active_question?.prompt).toBe('Runtime?')
    expect(sourceState.active_question?.id).toBe(sourceQ.id)

    await sourceCtx.close()
    await cloneCtx.close()
  })
})
