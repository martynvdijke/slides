import { test, expect, type Page } from '@playwright/test'
import { ADMIN, createEvent, login } from './helpers'

const MAIL_URL = process.env.E2E_MAIL_URL || 'http://127.0.0.1:4174'

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
 * Admin settings: event settings (toggle + text) and branding persist across a
 * reload, and the SMTP surface saves plus actually delivers a test email to the
 * fake SMTP inbox the e2e server runs alongside the app.
 */
test.describe('admin settings', () => {
  test('event and branding settings persist across reload', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E Settings ${Date.now()}`)
    const description = `Settings description ${Date.now()}`
    const brand = await (await request.get('/api/admin/settings/branding')).json()

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="settings"]').click()

    // Toggle a setting and edit two text/number fields, then save.
    await admin.fill('#es-desc', description)
    await admin.fill('#es-slowmode', '7')
    await admin.locator('#es-feedback').check()
    await admin.locator('#form-event-settings').getByRole('button', { name: 'Save event' }).click()
    await expect(admin.locator('#toast-root')).toContainText('Event saved', { timeout: 10000 })

    // The public event payload (what the audience app reads) reflects it.
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/events/${ev.code}`)
          if (!res.ok()) return null
          const body = await res.json()
          return {
            description: body.description,
            feedback_open: body.feedback_open,
            qa_slow_mode_s: body.qa_slow_mode_s,
          }
        },
        { timeout: 10000 },
      )
      .toEqual({ description, feedback_open: true, qa_slow_mode_s: 7 })

    // Branding is a separate global setting.
    await admin.fill('#br-brand', `E2E Brand ${Date.now()}`)
    const savedBrand = (await admin.inputValue('#br-brand')).trim()
    await admin.locator('#form-branding').getByRole('button', { name: 'Save branding' }).click()
    await expect(admin.locator('#toast-root')).toContainText('Branding saved', { timeout: 10000 })

    try {
      await expect
        .poll(
          async () => {
            const res = await request.get('/api/admin/settings/branding')
            if (!res.ok()) return null
            return (await res.json()).brand
          },
          { timeout: 10000 },
        )
        .toBe(savedBrand)
      await expect
        .poll(async () => (await (await request.get(`/api/events/${ev.code}`)).json()).brand, { timeout: 10000 })
        .toBe(savedBrand)

      // Reload the panel: the event settings form is refilled for the selected
      // event and branding loads on boot, so both must survive a fresh page.
      await admin.reload()
      await signInAdmin(admin)
      await selectEvent(admin, ev.name)
      await admin.locator('[data-view="settings"]').click()
      await expect(admin.locator('#es-desc')).toHaveValue(description)
      await expect(admin.locator('#es-slowmode')).toHaveValue('7')
      await expect(admin.locator('#es-feedback')).toBeChecked()
      await expect(admin.locator('#br-brand')).toHaveValue(savedBrand)
    } finally {
      // Branding is global; leave the instance as we found it.
      await request.put('/api/admin/settings/branding', { data: { brand: brand.brand ?? '' } })
      await adminCtx.close()
    }
  })

  test('SMTP settings save and the test email reaches the inbox', async ({ browser, request }) => {
    await login(request)
    // The settings nav is enabled once an event is selected; the SMTP form
    // itself is global.
    const ev = await createEvent(request, `E2E Mail Settings ${Date.now()}`)
    const before = await (await request.get('/api/admin/settings/email')).json()

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await signInAdmin(admin)
    await selectEvent(admin, ev.name)
    await admin.locator('[data-view="settings"]').click()
    await expect(admin.locator('#email-status')).toContainText('Configured', { timeout: 10000 })

    try {
      // Save a stored host the environment does not provide. SMTP_* env vars
      // still win at delivery time, so this only proves the write path.
      await admin.fill('#em-host', 'mail.settings-e2e.invalid')
      await admin.locator('#form-email').getByRole('button', { name: 'Save email settings' }).click()
      await expect(admin.locator('#toast-root')).toContainText('Email settings saved', { timeout: 10000 })

      await expect
        .poll(
          async () => {
            const res = await request.get('/api/admin/settings/email')
            if (!res.ok()) return null
            const body = await res.json()
            return { storedHost: body.stored.host, effectiveHost: body.effective.host }
          },
          { timeout: 10000 },
        )
        .toEqual({ storedHost: 'mail.settings-e2e.invalid', effectiveHost: before.effective.host })

      // "Send test email" has no recipient field; the server falls back to the
      // configured sender, which the e2e server points at its fake SMTP.
      const cleared = await request.get(`${MAIL_URL}/__e2e/mail/clear`)
      expect(cleared.ok()).toBeTruthy()
      await admin.locator('#btn-test-email').click()
      await expect(admin.locator('#email-status')).toContainText('Test sent', { timeout: 15000 })

      await expect
        .poll(
          async () => {
            const res = await request.get(`${MAIL_URL}/__e2e/mail`)
            if (!res.ok()) return null
            const messages = (await res.json()) as Array<{ recipients: string[]; raw: string }>
            const match = messages.find((m) => m.raw.includes('Test email from Slides'))
            return match ? match.recipients : null
          },
          { timeout: 15000 },
        )
        .toContain('recap@e2e.test')
    } finally {
      // Restore the stored values so later specs inherit the original config.
      await request.put('/api/admin/settings/email', {
        data: {
          host: before.stored.host,
          port: before.stored.port,
          user: before.stored.user,
          from: before.stored.from,
          tls: before.stored.tls,
        },
      })
      await adminCtx.close()
    }
  })
})
