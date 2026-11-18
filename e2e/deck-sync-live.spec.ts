import { test, expect, type APIRequestContext } from '@playwright/test'
import { activateQuestion, createEvent, login } from './helpers'

/**
 * Deck sync while a question is live. Re-running the same sync payload (what
 * scripts/sync-deck.mjs does on every deploy, and the presenter panel does when
 * it grabs slide media) must update the question in place without demoting a
 * live question to draft and without dropping its media.
 */

interface AdminQuestion {
  id: number
  prompt: string
  status: string
  media_url: string
  media_type: string
  kind: string
}

async function adminQuestions(request: APIRequestContext, eventId: number): Promise<AdminQuestion[]> {
  const res = await request.get(`/api/admin/events/${eventId}/questions`)
  expect(res.ok(), 'admin question list should load').toBeTruthy()
  return (await res.json()) as AdminQuestion[]
}

function slide(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slide_id: 's-live-media',
    position: 4,
    prompt: 'Original prompt',
    kind: 'poll',
    options: ['Yes', 'No'],
    points_base: 100,
    show_results: true,
    activate: 'manual',
    media_url: '/media/deck-shot.png',
    media_type: 'image',
    ...overrides,
  }
}

async function syncDeck(
  request: APIRequestContext,
  eventId: number,
  slides: Record<string, unknown>[],
): Promise<void> {
  const res = await request.post(`/api/admin/events/${eventId}/deck/sync`, {
    data: { deck_slug: 'batch5-live', slides },
  })
  expect(res.ok(), 'deck sync should succeed').toBeTruthy()
}

test.describe('deck sync while live', () => {
  test('re-sync keeps the question live and its media intact', async ({ request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Deck Sync Live ${Date.now()}`)

    await syncDeck(request, ev.id, [slide()])
    let list = await adminQuestions(request, ev.id)
    expect(list).toHaveLength(1)
    const created = list[0]
    expect(created.prompt).toBe('Original prompt')
    expect(created.media_url).toBe('/media/deck-shot.png')
    expect(created.media_type).toBe('image')
    expect(created.status).toBe('draft')

    // The host puts it on screen.
    await activateQuestion(request, ev.id, created.id)
    list = await adminQuestions(request, ev.id)
    expect(list.find((q) => q.id === created.id)?.status).toBe('live')

    // A later sync (updated prompt, same slide identity and media) must not
    // create a second row, demote the live question, or lose its media.
    await syncDeck(request, ev.id, [
      slide({ prompt: 'Updated prompt', position: 5 }),
      {
        slide_id: 's-second',
        position: 6,
        prompt: 'Second slide',
        kind: 'open',
        options: [],
        show_results: true,
        activate: 'manual',
      },
    ])

    list = await adminQuestions(request, ev.id)
    expect(list, 're-sync updates, does not duplicate').toHaveLength(2)
    const resynced = list.find((q) => q.kind === 'poll')
    expect(resynced, 'poll question should survive the re-sync').toBeTruthy()
    expect(resynced!.id).toBe(created.id)
    expect(resynced!.prompt).toBe('Updated prompt')
    expect(resynced!.status, 'live status must survive a re-sync').toBe('live')
    expect(resynced!.media_url).toBe('/media/deck-shot.png')
    expect(resynced!.media_type).toBe('image')

    // Attendees still see the media alongside the live question.
    const state = await (await request.get(`/api/events/${ev.code}/state`)).json()
    expect(state.active_question?.id).toBe(created.id)
    expect(state.active_question?.status).toBe('live')
    expect(state.active_question?.media_url).toBe('/media/deck-shot.png')
    expect(state.active_question?.media_type).toBe('image')
  })
})
