import { test, expect, type Page } from '@playwright/test'
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

async function selectEvent(page: Page, name: string): Promise<void> {
  await page.locator('.event-card', { hasText: name }).getByRole('button', { name: /Manage|Selected/ }).click()
}

async function questionPrompts(page: Page): Promise<string[]> {
  const rows = page.locator('#questions-list .q-row')
  const count = await rows.count()
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push((await rows.nth(i).locator('div').first().innerText()).split('\n')[0].trim())
  }
  return out
}

/**
 * Admin question queue: ↑/↓ reordering changes the queue and the next
 * activation picks the new head; deleting a question removes it for good and a
 * deleted live question disappears from the audience.
 */
test.describe('admin question queue', () => {
  test('reordering the queue changes what "activate next" picks', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Reorder ${Date.now()}`)
    await createQuestion(request, ev.id, { prompt: 'Queue A', options: ['A1', 'A2'] })
    await createQuestion(request, ev.id, { prompt: 'Queue B', options: ['B1', 'B2'] })
    await createQuestion(request, ev.id, { prompt: 'Queue C', options: ['C1', 'C2'] })

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="questions"]').click()
    await expect(admin.locator('#questions-list .q-row', { hasText: 'Queue A' })).toBeVisible({ timeout: 10000 })
    expect(await questionPrompts(admin)).toEqual(['Queue A', 'Queue B', 'Queue C'])

    // Move A below B with the row's ↓ control, then re-read from the API.
    await admin
      .locator('#questions-list .q-row', { hasText: 'Queue A' })
      .getByRole('button', { name: 'Move down' })
      .click()
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/admin/events/${ev.id}/questions`)
          if (!res.ok()) return null
          const list = (await res.json()) as Array<{ prompt: string }>
          return list.map((q) => q.prompt)
        },
        { timeout: 10000 },
      )
      .toEqual(['Queue B', 'Queue A', 'Queue C'])

    // The UI shows the new order too.
    await expect
      .poll(async () => questionPrompts(admin), { timeout: 10000 })
      .toEqual(['Queue B', 'Queue A', 'Queue C'])

    // "Activate next" follows the queue order, and the audience agrees.
    await admin.locator('#btn-next-question').click()
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/events/${ev.code}/state`)
          if (!res.ok()) return null
          const body = await res.json()
          return body.active_question?.prompt ?? null
        },
        { timeout: 10000 },
      )
      .toBe('Queue B')

    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await enterAudience(aud, 'Reorder Fan')
    await expect(aud.locator('#live-card .prompt')).toContainText('Queue B', { timeout: 15000 })

    await adminCtx.close()
    await audCtx.close()
  })

  test('deleting a question removes it and it cannot be answered', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Delete ${Date.now()}`)
    const keep = await createQuestion(request, ev.id, { prompt: 'Keep me', options: ['K1', 'K2'] })
    const gone = await createQuestion(request, ev.id, { prompt: 'Delete me', options: ['D1', 'D2'] })

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    admin.on('dialog', (d) => d.accept())
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="questions"]').click()
    const row = admin.locator('#questions-list .q-row', { hasText: 'Delete me' })
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(admin.locator('#questions-list')).not.toContainText('Delete me', { timeout: 10000 })
    await expect(admin.locator('#questions-list')).toContainText('Keep me')

    // Gone from the admin list and unanswerable.
    const list = (await (await request.get(`/api/admin/events/${ev.id}/questions`)).json()) as Array<{
      prompt: string
    }>
    expect(list.map((q) => q.prompt)).toEqual(['Keep me'])
    const answerGone = await request.post(`/api/events/${ev.code}/answers`, {
      data: { question_id: gone.id, value: 'D1' },
    })
    expect(answerGone.status()).toBe(404)

    // Deleting the live question clears the audience card.
    await activateQuestion(request, ev.id, keep.id)
    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await enterAudience(aud, 'Delete Fan')
    await expect(aud.locator('#live-card .prompt')).toContainText('Keep me', { timeout: 15000 })

    await admin.locator('#questions-list .q-row', { hasText: 'Keep me' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(admin.locator('#questions-list')).not.toContainText('Keep me', { timeout: 10000 })
    await expect(aud.locator('#live-card')).toContainText('Waiting for the host', { timeout: 15000 })
    const state = await (await request.get(`/api/events/${ev.code}/state`)).json()
    expect(state.active_question ?? null).toBeNull()

    await adminCtx.close()
    await audCtx.close()
  })
})
