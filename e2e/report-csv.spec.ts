import { test, expect, type Browser, type Page } from '@playwright/test'
import { ADMIN, activateQuestion, createEvent, createQuestion, login } from './helpers'

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

/**
 * Reports: the CSV export (selected-event bar) and the printable HTML report
 * (results panel) both read the event's answers and Q&A, so drive an event with
 * both and assert the exported shape.
 */
test.describe('event report and CSV export', () => {
  test('CSV export and HTML report cover answers and Q&A', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Report ${Date.now()}`)
    const q = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Best pet?',
      options: ['cat', 'dog'],
      correct_index: 0,
      show_results: true,
    })
    await activateQuestion(request, ev.id, q.id)

    // Two participants, one answer each, through the public API.
    const answerAs = async (b: Browser, value: string) => {
      const ctx = await b.newContext()
      const joined = await ctx.request.post(`/api/events/${ev.code}/join`)
      expect(joined.ok()).toBeTruthy()
      const res = await ctx.request.post(`/api/events/${ev.code}/answers`, {
        data: { question_id: q.id, value },
      })
      expect(res.ok(), `answer ${value} accepted`).toBeTruthy()
      return ctx
    }
    const catCtx = await answerAs(browser, 'cat')
    const dogCtx = await answerAs(browser, 'dog')

    // Two Q&A entries; only one is approved, which the report should honour.
    const lunch = await catCtx.request.post(`/api/events/${ev.code}/qa`, {
      data: { body: 'Will there be lunch?', author: 'Curious Cat' },
    })
    expect(lunch.ok()).toBeTruthy()
    const lunchId = (await lunch.json()).id as number
    const parking = await dogCtx.request.post(`/api/events/${ev.code}/qa`, {
      data: { body: 'Is there parking?', author: 'Driver Dan' },
    })
    expect(parking.ok()).toBeTruthy()

    const approved = await request.patch(`/api/admin/events/${ev.id}/qa/${lunchId}`, { data: { status: 'approved' } })
    expect(approved.ok()).toBeTruthy()

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)

    // CSV export is triggered from the selected-event bar and downloads.
    const [download] = await Promise.all([admin.waitForEvent('download'), admin.locator('#btn-export').click()])
    expect(download.suggestedFilename()).toBe(`meetup-${ev.code}.csv`)
    const stream = await download.createReadStream()
    expect(stream, 'download stream').not.toBeNull()
    let csv = ''
    for await (const chunk of stream!) csv += chunk.toString()

    const rows = csv
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(','))
    expect(rows[0]).toEqual(['type', 'prompt', 'answer', 'author', 'votes', 'participant_id', 'created_at'])

    const answerRows = rows.filter((r) => r[0] === 'answer' && r[1] === 'Best pet?')
    expect(answerRows.map((r) => r[2]).sort()).toEqual(['cat', 'dog'])
    for (const row of answerRows) expect(row[4]).toBe('1')

    const qaRows = rows.filter((r) => r[0] === 'qa')
    expect(qaRows.map((r) => r[2]).sort()).toEqual(['Is there parking?', 'Will there be lunch?'])
    const lunchRow = qaRows.find((r) => r[2] === 'Will there be lunch?')
    expect(lunchRow?.[3]).toBe('Curious Cat')

    // The endpoint really is CSV, not a JSON/HTML fallback.
    const csvRes = await request.get(`/api/admin/events/${ev.id}/export.csv`)
    expect(csvRes.ok()).toBeTruthy()
    expect(csvRes.headers()['content-type']).toContain('text/csv')

    // The printable report opens in a new tab and includes the approved Q&A only.
    await admin.locator('[data-view="results"]').click()
    const [report] = await Promise.all([admin.waitForEvent('popup'), admin.locator('#btn-report').click()])
    await report.waitForLoadState()
    await expect(report.locator('h1')).toContainText(ev.name)
    await expect(report.locator('body')).toContainText('Questions (1)')
    await expect(report.locator('body')).toContainText('Best pet?')
    await expect(report.locator('body')).toContainText('cat')
    await expect(report.locator('body')).toContainText('dog')
    await expect(report.locator('body')).toContainText('Will there be lunch?')
    await expect(report.locator('body')).not.toContainText('Is there parking?')

    await report.close()
    await adminCtx.close()
    await catCtx.close()
    await dogCtx.close()
  })
})
