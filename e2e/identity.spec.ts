import { test, expect } from '@playwright/test'
import { activateQuestion, createEvent, createQuestion, enterAudience, login } from './helpers'

/**
 * Participant identity editing: the profile sheet renames a joined attendee.
 * The new name is persisted server-side (state.me.name and the public roster)
 * and survives a reload without dropping the answer already submitted.
 */
test.describe('audience identity editing', () => {
  test('renames a joined participant and keeps their answer', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Identity ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Pick a cloud',
      options: ['AWS', 'GCP'],
    })
    await activateQuestion(request, ev.id, q.id)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/e/${ev.code}`)
    await enterAudience(page, 'Alice')
    await expect(page.locator('#live-card .prompt')).toContainText('Pick a cloud', { timeout: 15000 })
    await page.locator('#live-card .option-btn', { hasText: 'AWS' }).click()
    await expect(page.locator('#live-card .thanks')).toContainText('AWS', { timeout: 10000 })
    await expect(page.locator('#identity-display-name')).toHaveText('Alice')

    // Rename through the profile sheet.
    await page.locator('#identity-open').click()
    await expect(page.locator('#identity-sheet')).toBeVisible({ timeout: 5000 })
    await page.locator('#sheet-name').fill('Alicia')
    await page.locator('#sheet-save').click()
    await expect(page.locator('#identity-sheet')).toBeHidden({ timeout: 5000 })
    await expect(page.locator('#identity-display-name')).toHaveText('Alicia')

    // The server stored the new name for this participant.
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
      .toBe('Alicia')

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/events/${ev.code}/participants`)
          if (!res.ok()) return false
          const body = await res.json()
          return (body.participants ?? []).some((p: { name: string }) => p.name === 'Alicia')
        },
        { timeout: 10000 },
      )
      .toBe(true)

    // Reload proves the rename is persisted and the answer still belongs to us.
    await page.reload()
    await expect(page.locator('#join-gate')).toBeHidden()
    await expect(page.locator('#identity-display-name')).toHaveText('Alicia', { timeout: 15000 })
    await expect(page.locator('#live-card .thanks')).toContainText('AWS', { timeout: 15000 })

    await ctx.close()
  })

  test('anonymous attendee can set a display name later', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Identity Anon ${Date.now()}`)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/e/${ev.code}`)
    await enterAudience(page, '')
    await expect(page.locator('#identity-display-name')).toHaveText('Anonymous')

    await page.locator('#identity-open').click()
    await expect(page.locator('#identity-sheet')).toBeVisible({ timeout: 5000 })
    await page.locator('#sheet-name').fill('Later Name')
    await page.locator('#sheet-save').click()
    await expect(page.locator('#identity-display-name')).toHaveText('Later Name')

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
      .toBe('Later Name')

    await ctx.close()
  })
})
