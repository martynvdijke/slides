import { test, expect, type Page } from '@playwright/test'
import { activateQuestion, createEvent, enterAudience, login } from './helpers'

/**
 * Admin support for grid2x2: the composer offers the kind with its quadrant
 * label editor, and the results panel buckets answers into four quadrants
 * instead of listing raw coordinates. Bucketing matches the audience/projector:
 * y=1 is the top row, option order is TL, TR, BL, BR.
 */

async function signInAdmin(page: Page): Promise<void> {
  await page.goto('/admin')
  if (await page.locator('#form-setup').isVisible()) {
    await page.fill('#setup-user', 'admin')
    await page.fill('#setup-pass', 'password123')
    await page.locator('#form-setup button[type="submit"]').click()
  }
  if (await page.locator('#form-login').isVisible()) {
    await page.fill('#login-user', 'admin')
    await page.fill('#login-pass', 'password123')
    await page.locator('#form-login').getByRole('button', { name: 'Sign in' }).click()
  }
  await expect(page.locator('#events-list')).toBeVisible()
}

async function selectEvent(page: Page, name: string): Promise<void> {
  await page.locator('.event-card', { hasText: name }).getByRole('button', { name: /Manage|Selected/ }).click()
}

test.describe('admin grid2x2', () => {
  test('composer offers grid2x2 and results bucket answers per quadrant', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Admin Grid ${Date.now()}`)
    const prompt = 'Where in the room are you?'

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="questions"]').click()

    // The kind is offered and selects the options editor with four labels.
    const kindOption = admin.locator('#aq-kind option[value="grid2x2"]')
    await expect(kindOption).toHaveCount(1)
    await admin.selectOption('#aq-kind', 'grid2x2')
    await expect(admin.locator('#aq-options-wrap')).toBeVisible()
    await expect(admin.locator('#aq-options-wrap label')).toContainText(/quadrant/i)

    await admin.fill('#aq-prompt', prompt)
    await admin.fill('#aq-options', 'Top-left, Top-right, Bottom-left, Bottom-right')
    await admin.locator('#form-add-question button[type="submit"]').click()
    await expect(admin.locator('#toast-root')).toContainText(/question added/i, { timeout: 10000 })
    const questionRow = admin.locator('#questions-list .q-row', { hasText: prompt })
    await expect(questionRow).toBeVisible({ timeout: 10000 })
    await expect(questionRow).toContainText('grid2x2')

    // Answer it once as an attendee (bottom-left quadrant).
    const grid = await request.get(`/api/admin/events/${ev.id}/questions`)
    const created = ((await grid.json()) as { id: number; prompt: string; kind: string }[]).find(
      (q) => q.prompt === prompt,
    )
    expect(created, 'composer should have created the question').toBeTruthy()
    await activateQuestion(request, ev.id, created!.id)

    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    await aud.goto(`/e/${ev.code}`)
    await enterAudience(aud, 'Grid Dana')
    await expect(aud.locator('#live-card .prompt')).toContainText(prompt, { timeout: 15000 })
    await aud.locator('#live-card .grid2x2-cell', { hasText: 'Bottom-left' }).click()
    await expect(aud.locator('#live-card .thanks')).toBeVisible({ timeout: 10000 })

    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/events/${ev.code}/state`)
          return (await res.json()).active_question?.total ?? 0
        },
        { timeout: 15000, intervals: [250] },
      )
      .toBe(1)

    // Results panel shows four labelled quadrant cells with the tally.
    await admin.locator('[data-view="results"]').click()
    const card = admin.locator('#results-list .card-pad', { hasText: prompt })
    await expect(card).toBeVisible({ timeout: 10000 })
    await expect(card.locator('.grid-result')).toHaveCount(4)
    await expect(card.locator('.grid-result', { hasText: 'Bottom-left' })).toContainText('1')
    await expect(card.locator('.grid-result', { hasText: 'Top-right' })).toContainText('0')
    // Raw coordinate rows must not appear alongside the quadrant tally.
    await expect(card).not.toContainText('0.25, 0.25')

    await adminCtx.close()
    await audCtx.close()
  })
})
