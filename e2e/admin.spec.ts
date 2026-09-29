import { test, expect } from '@playwright/test'
import { ADMIN } from './helpers'

/**
 * Admin panel: first-run setup or sign-in, then create an event and check the
 * generated room code is surfaced.
 */
test.describe('admin panel', () => {
  test('setup or login, then create an event with a room code', async ({ page, request }) => {
    const status = await (await request.get('/api/setup/status')).json()
    const needsSetup = !!status.needs_setup

    await page.goto('/admin')

    if (needsSetup) {
      await expect(page.locator('#form-setup')).toBeVisible()
      await page.fill('#setup-user', ADMIN.username)
      await page.fill('#setup-pass', ADMIN.password)
      await page.locator('#form-setup button[type="submit"]').click()
      await expect(page.locator('#form-setup')).toBeHidden()
    }

    // A fresh setup usually signs you in, but fall back to the login form.
    if (await page.locator('#form-login').isVisible()) {
      await page.fill('#login-user', ADMIN.username)
      await page.fill('#login-pass', ADMIN.password)
      await page.locator('#form-login button[type="submit"]').click()
    }

    await expect(page.locator('#events-list')).toBeVisible()

    const name = `E2E Event ${Date.now()}`
    await page.click('#btn-new-event')
    await expect(page.locator('#create-event-wrap')).toBeVisible()
    await page.fill('#ce-name', name)
    await page.locator('#form-create-event button[type="submit"]').click()

    await expect(page.locator('#events-list').getByText(name)).toBeVisible()
    await expect(page.locator('#events-list')).toContainText(/room\s+[A-Z0-9]{5}/)
  })
})
