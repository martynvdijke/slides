import { expect, type APIRequestContext } from '@playwright/test'

export const ADMIN = { username: 'admin', password: 'password123' }

export interface E2EEvent {
  id: number
  code: string
  room_code: string
  name: string
}

/** Ensure an admin account exists (idempotent across specs sharing one DB). */
export async function ensureAdmin(request: APIRequestContext): Promise<void> {
  const status = await request.get('/api/setup/status')
  expect(status.ok()).toBeTruthy()
  const body = await status.json()
  if (body.needs_setup) {
    const created = await request.post('/api/setup', { data: ADMIN })
    expect(created.ok(), 'setup should succeed').toBeTruthy()
  }
}

/** Sign in and return the (cookie-backed) request context. */
export async function login(request: APIRequestContext): Promise<void> {
  await ensureAdmin(request)
  const res = await request.post('/api/auth/login', { data: ADMIN })
  expect(res.ok(), 'login should succeed').toBeTruthy()
}

export async function createEvent(request: APIRequestContext, name: string): Promise<E2EEvent> {
  const res = await request.post('/api/admin/events', { data: { name } })
  expect(res.ok(), 'create event should succeed').toBeTruthy()
  const ev = (await res.json()) as E2EEvent
  expect(ev.room_code, 'created event has a room code').toMatch(/^[A-Z0-9]{5}$/)
  return ev
}

export interface QuestionInput {
  kind?: string
  prompt: string
  options?: string[]
  media_url?: string
  media_type?: string
  show_results?: boolean
  correct_index?: number | null
  points_base?: number
}

export async function createQuestion(
  request: APIRequestContext,
  eventId: number,
  input: QuestionInput,
): Promise<{ id: number }> {
  const data: Record<string, unknown> = {
    kind: input.kind ?? 'poll',
    mode: 'live',
    prompt: input.prompt,
    options: input.options ?? [],
    show_results: input.show_results ?? true,
    media_url: input.media_url ?? '',
    media_type: input.media_type ?? '',
  }
  if (input.correct_index !== undefined) data.correct_index = input.correct_index
  if (input.points_base !== undefined) data.points_base = input.points_base
  const res = await request.post(`/api/admin/events/${eventId}/questions`, { data })
  expect(res.ok(), 'create question should succeed').toBeTruthy()
  return (await res.json()) as { id: number }
}

export async function activateQuestion(
  request: APIRequestContext,
  eventId: number,
  questionId: number,
): Promise<void> {
  const res = await request.post(`/api/admin/events/${eventId}/questions/${questionId}/activate`)
  expect(res.ok(), 'activate question should succeed').toBeTruthy()
}

/** Upload a tiny PNG and return its public media path + type. */
export async function uploadTinyPng(
  request: APIRequestContext,
  eventId: number,
): Promise<{ url: string; media_type: string }> {
  // 1x1 transparent PNG.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )
  const res = await request.post(`/api/admin/events/${eventId}/questions/media`, {
    multipart: {
      file: { name: 'pixel.png', mimeType: 'image/png', buffer: png },
    },
  })
  expect(res.ok(), 'media upload should succeed').toBeTruthy()
  const body = (await res.json()) as { url: string; media_type: string }
  expect(body.url, 'media url returned').toBeTruthy()
  expect(body.media_type).toBe('image')
  return body
}
