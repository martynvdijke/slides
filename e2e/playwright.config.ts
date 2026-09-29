import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || process.env.PORT || 4173)
const baseURL = `http://127.0.0.1:${PORT}`

/**
 * End-to-end tests for the all-in-one server: the Go binary serves the built
 * decks plus the admin/audience app, and we drive it with a real browser.
 *
 * `e2e/start-server.mjs` builds the Go binary and the decks (if needed) and
 * boots it against a throwaway SQLite database.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node e2e/start-server.mjs',
    cwd: '..',
    url: `${baseURL}/api/setup/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
