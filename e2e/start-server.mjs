// start-server.mjs — build and run the slides Go server for Playwright e2e tests.
//
// Used as the Playwright `webServer` command. It builds the Go binary into a
// temp dir, points the server at a throwaway SQLite database + media dir, and
// serves the already-built decks from ./dist (building them first if missing).
// Playwright waits for /api/setup/status to answer, then runs the suite.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const serverDir = join(repo, 'server')
const distDir = join(repo, 'dist')
const port = process.env.E2E_PORT || process.env.PORT || '4173'
const mailPort = process.env.E2E_MAIL_PORT || String(Number(port) + 1)

if (!existsSync(join(distDir, 'index.html'))) {
  console.log('[e2e] dist/ is empty — building decks first…')
  const build = spawnSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const tmp = mkdtempSync(join(tmpdir(), 'slides-e2e-'))
const mediaDir = join(tmp, 'media')
mkdirSync(mediaDir, { recursive: true })

// Fake SMTP server so recap emails are actually delivered somewhere. Received
// messages are exposed over HTTP on mailPort for assertions.
const receivedMail = []
const smtp = net.createServer((socket) => {
  let buffer = ''
  let inData = false
  let data = ''
  let recipients = []
  socket.write('220 e2e smtp\r\n')
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let idx
    while ((idx = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (inData) {
        if (line === '.') {
          inData = false
          receivedMail.push({ recipients: recipients.slice(), raw: data })
          recipients = []
          data = ''
          socket.write('250 OK queued\r\n')
        } else {
          data += line + '\n'
        }
        continue
      }
      const cmd = line.split(' ')[0].toUpperCase()
      if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250-e2e\r\n250 OK\r\n')
      else if (cmd === 'MAIL') socket.write('250 OK\r\n')
      else if (cmd === 'RCPT') {
        const m = line.match(/<([^>]*)>/)
        if (m) recipients.push(m[1])
        socket.write('250 OK\r\n')
      } else if (cmd === 'DATA') {
        inData = true
        socket.write('354 go ahead\r\n')
      } else if (cmd === 'QUIT') {
        socket.write('221 bye\r\n')
        socket.end()
      } else {
        socket.write('250 OK\r\n')
      }
    }
  })
  socket.on('error', () => {})
})
const mailHTTP = http.createServer((req, res) => {
  if (req.url === '/__e2e/mail') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(receivedMail))
    return
  }
  if (req.url === '/__e2e/mail/clear') {
    receivedMail.length = 0
    res.end('ok')
    return
  }
  res.statusCode = 404
  res.end('not found')
})
const smtpReady = new Promise((resolveReady) => {
  smtp.listen(0, '127.0.0.1', () => {
    mailHTTP.listen(Number(mailPort), '127.0.0.1', () => resolveReady(smtp.address().port))
  })
})
const smtpPort = await smtpReady
console.log(`[e2e] fake SMTP on 127.0.0.1:${smtpPort}, mail inbox on http://127.0.0.1:${mailPort}/__e2e/mail`)

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
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtpPort),
    SMTP_FROM: 'recap@e2e.test',
    SMTP_TLS: 'none',
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
