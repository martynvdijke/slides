import { test, expect, type Page } from '@playwright/test'
import { ADMIN, createEvent, login } from './helpers'

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
 * Presentations: upload through the admin panel, list it, download the stored
 * bytes back unchanged, and delete it. Also pins that a presentation can only be
 * deleted through the event that owns it.
 */
test.describe('presentations', () => {
  test('upload, download round-trip and delete', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Slides ${Date.now()}`)
    const deck = Buffer.from('%PDF-1.4\n% e2e presentation round-trip\n%%EOF\n')

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    admin.on('dialog', (dialog) => dialog.accept())
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="slides"]').click()

    await admin.fill('#up-title', 'E2E Deck')
    await admin.fill('#up-speaker', 'Ada')
    await admin.setInputFiles('#up-file', { name: 'e2e-deck.pdf', mimeType: 'application/pdf', buffer: deck })
    await admin.locator('#form-upload button[type="submit"]').click()
    await expect(admin.locator('#toast-root')).toContainText('Uploaded', { timeout: 15000 })

    // The list shows the original upload name, not the stored UUID file name.
    await expect(admin.locator('#slides-list')).toContainText('E2E Deck', { timeout: 10000 })
    await expect(admin.locator('#slides-list')).toContainText('e2e-deck.pdf')

    type Presentation = { id: number; filename: string; url: string; size: number }
    let list: Presentation[] = []
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/admin/events/${ev.id}/presentations`)
          if (!res.ok()) return null
          list = (await res.json()) as Presentation[]
          return list.map((p) => [p.filename, p.size])
        },
        { timeout: 10000 },
      )
      .toEqual([['e2e-deck.pdf', deck.length]])

    // The public list (what the audience sees) reports the same name.
    const publicList = (await (await request.get(`/api/events/${ev.code}/presentations`)).json()) as Presentation[]
    expect(publicList.map((p) => p.filename)).toEqual(['e2e-deck.pdf'])

    // Download round-trips the bytes and names the file after the upload.
    const download = await request.get(list[0].url)
    expect(download.ok()).toBeTruthy()
    expect(Buffer.from(await download.body()).equals(deck)).toBeTruthy()
    expect(download.headers()['content-disposition']).toContain('e2e-deck.pdf')

    // A presentation from another event cannot be deleted through this event's URL.
    const evB = await createEvent(request, `E2E Slides Other ${Date.now()}`)
    const bUpload = await request.post(`/api/admin/events/${evB.id}/presentations`, {
      multipart: {
        title: 'Other deck',
        file: { name: 'other.pdf', mimeType: 'application/pdf', buffer: deck },
      },
    })
    expect(bUpload.ok()).toBeTruthy()
    const bDeck = (await bUpload.json()) as Presentation
    const cross = await request.delete(`/api/admin/events/${ev.id}/presentations/${bDeck.id}`)
    expect(cross.status()).toBe(400)
    const bList = (await (await request.get(`/api/admin/events/${evB.id}/presentations`)).json()) as Presentation[]
    expect(bList.map((p) => p.filename)).toEqual(['other.pdf'])

    // Delete through the owning event's panel.
    const row = admin.locator('#slides-list > div', { hasText: 'E2E Deck' })
    await row.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(admin.locator('#slides-list')).toContainText('No presentations yet.', { timeout: 10000 })
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/admin/events/${ev.id}/presentations`)
          if (!res.ok()) return null
          return ((await res.json()) as Presentation[]).length
        },
        { timeout: 10000 },
      )
      .toBe(0)
    const gone = await request.get(list[0].url)
    expect(gone.status()).toBe(404)

    // Clean up the second event's deck too.
    await request.delete(`/api/admin/events/${evB.id}/presentations/${bDeck.id}`)
    await adminCtx.close()
  })
})
