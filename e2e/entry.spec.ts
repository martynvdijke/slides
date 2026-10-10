import { test, expect } from '@playwright/test'
import { ADMIN } from './helpers'

test.describe('entry page', () => {
  test('serves host and participant choices', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#entry-title')).toContainText(/host or join/i)
    // Host card links to /admin
    await expect(page.locator('#host-cta')).toBeVisible()
    await expect(page.locator('#host-cta')).toHaveAttribute('href', '/admin')
    // Participant card
    await expect(page.getByRole('heading', { name: 'Participant' })).toBeVisible()
    await expect(page.locator('#entry-join-form')).toBeVisible()
    await expect(page.locator('#entry-room-code')).toBeVisible()
    // Browse decks link
    await expect(page.getByRole('link', { name: /browse decks/i }).first()).toBeVisible()
  })

  test('room code input navigates to /join?room=CODE', async ({ page, request }) => {
    // Create an event to get a real room code, but the entry form just navigates
    // to /join?room=CODE and join.js then resolves it. We test the navigation
    // without needing a valid code.
    await page.goto('/')
    const input = page.locator('#entry-room-code')
    await input.fill('abc12')
    // The input auto-uppercases
    await expect(input).toHaveValue('ABC12')
    await page.locator('#entry-join-btn').click()
    // entry.html does location.href = '/join?room='+code
    await expect(page).toHaveURL(/\/join\?room=ABC12/)
    // join.html should have prefilled the input and be trying to resolve
    await expect(page.locator('#room-code')).toHaveValue('ABC12')
  })

  test('too-short code does not navigate', async ({ page }) => {
    await page.goto('/')
    const input = page.locator('#entry-room-code')
    await input.fill('AB')
    await page.locator('#entry-join-btn').click()
    // Should stay on entry page (no navigation)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#entry-join-form')).toBeVisible()
  })

  test('signed-in users see the continue banner without being redirected', async ({ page, request }) => {
    // request and page do NOT share storageState by default, so we log in via UI.
    // Ensure admin exists via API first, then do UI login.
    const status = await (await request.get('/api/setup/status')).json()
    if (status.needs_setup) {
      const created = await request.post('/api/setup', { data: ADMIN })
      expect(created.ok()).toBeTruthy()
    }
    // Ensure login via request still works (but page needs its own cookie)
    await page.goto('/admin')
    // Handle either setup or login form
    if (await page.locator('#form-setup').isVisible()) {
      await page.fill('#setup-user', ADMIN.username)
      await page.fill('#setup-pass', ADMIN.password)
      await page.locator('#form-setup button[type="submit"]').click()
    }
    if (await page.locator('#form-login').isVisible()) {
      await page.fill('#login-user', ADMIN.username)
      await page.fill('#login-pass', ADMIN.password)
      await page.locator('#form-login button.btn-primary[type="submit"]').click()
    }
    await expect(page.locator('#events-list')).toBeVisible({ timeout: 15000 })

    // Now visit the entry page — the continue banner appears, but there is NO
    // forced redirect, so signed-in users can still reach the slide decks.
    await page.goto('/')
    await expect(page.locator('#continue-banner')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#continue-name')).not.toBeEmpty()
    // Give the old ~900ms auto-redirect timer time to fire, then assert we stayed put.
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/$/)
    // Continuing to the dashboard is an explicit choice, not a forced jump.
    await expect(page.locator('#continue-link')).toHaveAttribute('href', '/admin')
    // And the slide decks remain reachable from the entry page.
    await expect(page.getByRole('link', { name: /browse decks/i }).first()).toHaveAttribute('href', '/index.html')
  })

  test('deck index still reachable at /index.html', async ({ page, request }) => {
    const res = await request.get('/index.html')
    expect(res.ok()).toBeTruthy()
    await page.goto('/index.html')
    // The index lists decks — at least the meetup deck link should be present
    await expect(page.locator('body')).toContainText(/meetup/i)
  })
})
