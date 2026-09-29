// start-server.mjs — build and run the slides Go server for Playwright e2e tests.
//
// Used as the Playwright `webServer` command. It builds the Go binary into a
// temp dir, points the server at a throwaway SQLite database + media dir, and
// serves the already-built decks from ./dist (building them first if missing).
// Playwright waits for /api/setup/status to answer, then runs the suite.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const serverDir = join(repo, 'server')
const distDir = join(repo, 'dist')
const port = process.env.E2E_PORT || process.env.PORT || '4173'

if (!existsSync(join(distDir, 'index.html'))) {
  console.log('[e2e] dist/ is empty — building decks first…')
  const build = spawnSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const tmp = mkdtempSync(join(tmpdir(), 'slides-e2e-'))
const mediaDir = join(tmp, 'media')
mkdirSync(mediaDir, { recursive: true })

const bin = join(tmp, process.platform === 'win32' ? 'slides.exe' : 'slides')
console.log('[e2e] building Go server…')
const build = spawnSync('go', ['build', '-o', bin, '.'], { cwd: serverDir, stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status ?? 1)

console.log(`[e2e] starting server on http://127.0.0.1:${port} (db ${tmp})`)
const child = spawn(bin, [], {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: join(tmp, 'slides.db'),
    MEDIA_DIR: mediaDir,
    DECKS_DIR: distDir,
    PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
  },
})

function shutdown(signal) {
  try {
    child.kill(signal)
  } catch {}
}
process.on('SIGTERM', () => {
  shutdown('SIGTERM')
  process.exit(0)
})
process.on('SIGINT', () => {
  shutdown('SIGINT')
  process.exit(0)
})
child.on('exit', (code) => process.exit(code ?? 0))
