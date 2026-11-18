import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { createEvent, enterAudience, login } from './helpers'

/**
 * Audience-side Q&A: a participant asks through the UI, the host approves the
 * question, the asker sees it in the list, and a second participant upvotes it.
 *
 * moderation.spec.ts already covers the host moderation queue and slow mode;
 * this spec fills the missing gap: the audience create + vote flow itself, and
 * that an answered question stays visible to attendees.
 */

interface QAItem {
  id: number
  body: string
  status: string
  votes: number
}

async function listQA(request: APIRequestContext, eventId: number): Promise<QAItem[]> {
  const res = await request.get(`/api/admin/events/${eventId}/qa`)
  expect(res.ok(), 'admin qa list should load').toBeTruthy()
  return (await res.json()) as QAItem[]
}

async function findQAByBody(
  request: APIRequestContext,
  eventId: number,
  body: string,
): Promise<QAItem | undefined> {
  return (await listQA(request, eventId)).find((q) => q.body === body)
}

async function setQAStatus(
  request: APIRequestContext,
  eventId: number,
  qaId: number,
  status: string,
): Promise<void> {
  const res = await request.patch(`/api/admin/events/${eventId}/qa/${qaId}`, { data: { status } })
  expect(res.ok(), `qa status -> ${status}`).toBeTruthy()
}

async function openQA(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/e/${code}`)
  await enterAudience(page, name)
  await page.locator('#tab-qa').click()
  await expect(page.locator('#qa-form')).toBeVisible({ timeout: 15000 })
}

test.describe('audience Q&A', () => {
  test('participant asks, host approves, asker sees it and another upvotes', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Q&A ${Date.now()}`)
    const body = `Will the recording be shared? ${Date.now()}`

    // The asker submits through the audience form; the question is moderated
    // in (pending), so the list still shows the optimistic "awaiting" card.
    const askerCtx = await browser.newContext()
    const asker = await askerCtx.newPage()
    await openQA(asker, ev.code, 'Asker')
    await asker.fill('#qa-body', body)
    await asker.locator('#qa-form button[type="submit"]').click()
    await expect(asker.locator('#toast-root')).toContainText(/awaiting approval/i, { timeout: 10000 })

    // The host sees it as pending and approves it.
    await expect
      .poll(async () => (await findQAByBody(request, ev.id, body))?.status, { timeout: 10000 })
      .toBe('pending')
    const pending = await findQAByBody(request, ev.id, body)
    expect(pending, 'question should be stored').toBeTruthy()
    await setQAStatus(request, ev.id, pending!.id, 'approved')

    // The asker's list now shows the approved question, not the pending card.
    const askerCard = asker.locator('#qa-list .qa-item', { hasText: body })
    await expect(askerCard).toBeVisible({ timeout: 15000 })
    await expect(askerCard).not.toContainText('Awaiting approval')

    // A second attendee upvotes it from the audience list.
    const voterCtx = await browser.newContext()
    const voter = await voterCtx.newPage()
    await openQA(voter, ev.code, 'Voter')
    const voterCard = voter.locator('#qa-list .qa-item', { hasText: body })
    await expect(voterCard).toBeVisible({ timeout: 15000 })
    await voterCard.locator('.vote-btn').click()
    await expect(voter.locator('#toast-root')).toContainText(/upvoted/i, { timeout: 10000 })
    await expect(voterCard.locator('.vote-btn')).toContainText('1')

    await expect
      .poll(async () => (await findQAByBody(request, ev.id, body))?.votes, { timeout: 10000 })
      .toBe(1)

    // Marking it answered must not remove it from the attendee's list, and the
    // answered state is visible on the card.
    await setQAStatus(request, ev.id, pending!.id, 'answered')
    await expect(askerCard).toBeVisible({ timeout: 15000 })
    await expect(askerCard).toContainText('Answered', { timeout: 15000 })
    await expect
      .poll(async () => (await findQAByBody(request, ev.id, body))?.status, { timeout: 10000 })
      .toBe('answered')

    await askerCtx.close()
    await voterCtx.close()
  })
})
