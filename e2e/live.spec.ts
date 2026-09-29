import { test, expect } from '@playwright/test'
import {
  activateQuestion,
  createEvent,
  createQuestion,
  login,
  uploadTinyPng,
} from './helpers'

/**
 * Audience flow: join by short room code, answer a live poll, see results, and
 * a question with an attached image renders.
 */
test.describe('audience live flow', () => {
  test('join with a room code and answer a poll', async ({ page, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Live ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Which cloud?',
      options: ['AWS', 'GCP'],
    })
    await activateQuestion(request, ev.id, q.id)

    await page.goto('/join')
    // Lowercase on purpose: the room code resolves case-insensitively.
    await page.fill('#room-code', ev.room_code.toLowerCase())
    await page.locator('#join-form button[type="submit"]').click()

    await expect(page).toHaveURL(new RegExp(`/e/${ev.code}$`))
    await expect(page.locator('#live-card .prompt')).toContainText('Which cloud?')

    await page.locator('#live-card .option-btn', { hasText: 'AWS' }).click()
    await expect(page.locator('#live-card .thanks')).toContainText('AWS')
    await expect(page.locator('#live-card .results .result-row').first()).toBeVisible()
  })

  test('renders an image attached to a question', async ({ page, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Media ${Date.now()}`)
    const media = await uploadTinyPng(request, ev.id)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Pick one',
      options: ['A', 'B'],
      media_url: media.url,
      media_type: media.media_type,
    })
    await activateQuestion(request, ev.id, q.id)

    await page.goto(`/e/${ev.code}`)
    await expect(page.locator('#live-card .prompt')).toContainText('Pick one')
    await expect(page.locator('#live-card .q-media img')).toBeVisible()
  })
})
