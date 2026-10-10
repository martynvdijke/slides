#!/usr/bin/env node
// load.mjs — dependency-free load test for the Go slides server.
// Simulates N concurrent WS clients answering a live poll.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const serverDir = join(repo, 'server');
const distDir = join(repo, 'dist');

// Config
const N = Number(process.env.LOAD_USERS || 50);
const port = process.env.LOAD_PORT || '4180';
const baseUrl = process.env.LOAD_BASE_URL || `http://127.0.0.1:${port}`;
const wsBase = baseUrl.replace(/^http/, 'ws');

// Regression thresholds for CI gating (0 = disabled).
const maxP95Ms = Number(process.env.LOAD_MAX_P95_MS || 0);
const maxMs = Number(process.env.LOAD_MAX_MS || 0);
const minThroughput = Number(process.env.LOAD_MIN_THROUGHPUT || 0);

// Child server management
let child = null;
let tmpRoot = null;

function cleanup() {
  if (child) {
    try { child.kill('SIGTERM'); } catch {}
    child = null;
  }
}
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });
process.on('exit', cleanup);

async function bootServerIfNeeded() {
  if (process.env.LOAD_BASE_URL) {
    console.log(`[load] using external server ${baseUrl}`);
    return;
  }
  tmpRoot = mkdtempSync(join(tmpdir(), 'slides-load-'));
  const mediaDir = join(tmpRoot, 'media');
  mkdirSync(mediaDir, { recursive: true });
  const bin = join(tmpRoot, process.platform === 'win32' ? 'slides.exe' : 'slides');
  console.log('[load] building Go server...');
  const build = spawnSync('go', ['build', '-o', bin, '.'], { cwd: serverDir, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('[load] go build failed');
    process.exit(1);
  }
  console.log(`[load] starting server on ${baseUrl} (tmp ${tmpRoot})`);
  child = spawn(bin, [], {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: join(tmpRoot, 'slides.db'),
      MEDIA_DIR: mediaDir,
      DECKS_DIR: distDir,
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    },
  });
  child.on('exit', (code, sig) => {
    // if server dies unexpectedly before test finishes
    if (code !== null && code !== 0) {
      console.error(`[load] server exited with ${code} sig=${sig}`);
    }
  });

  // poll GET /api/setup/status until 200
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/setup/status`);
      if (r.status === 200) {
        console.log('[load] server ready');
        return;
      }
    } catch {}
    await new Promise(res => setTimeout(res, 300));
  }
  console.error('[load] server did not become ready in 60s');
  cleanup();
  process.exit(1);
}

// Cookie jar for admin session (meetup_session)
let cookie = '';
function storeCookies(res) {
  const cookies = res.headers.getSetCookie();
  for (const c of cookies) {
    // c is like "meetup_session=xyz; Path=/; ..."
    const part = c.split(';')[0];
    if (part.startsWith('meetup_session=')) {
      cookie = part;
    }
  }
}
function cookieHeader() {
  return cookie ? { Cookie: cookie } : {};
}

async function apiFetch(path, opts = {}) {
  const headers = { ...opts.headers, ...cookieHeader() };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, { ...opts, headers });
  storeCookies(res);
  return res;
}

async function runScenario() {
  // 1. setup / login
  let r = await apiFetch('/api/setup/status');
  let j = await r.json();
  if (j.needs_setup) {
    console.log('[load] first run — creating admin account');
    r = await apiFetch('/api/setup', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'password123' }) });
    if (!r.ok) { console.error('[load] POST /api/setup failed', r.status, await r.text()); process.exit(1); }
    // store cookies already done
  } else {
    console.log('[load] logging in');
    r = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'password123' }) });
    if (!r.ok) { console.error('[load] POST /api/auth/login failed', r.status, await r.text()); process.exit(1); }
  }

  // 2. create event
  const evName = `Load test ${Date.now()}`;
  r = await apiFetch('/api/admin/events', { method: 'POST', body: JSON.stringify({ name: evName }) });
  if (!r.ok) { console.error('[load] create event failed', r.status, await r.text()); process.exit(1); }
  const ev = await r.json();
  const eventId = ev.id;
  const eventCode = ev.code;
  console.log(`[load] event ${eventId} code=${eventCode} room=${ev.room_code}`);

  // 3. create poll question
  r = await apiFetch(`/api/admin/events/${eventId}/questions`, {
    method: 'POST',
    body: JSON.stringify({ kind: 'poll', mode: 'live', prompt: 'Load test poll', options: ['A', 'B', 'C'], show_results: true, media_url: '', media_type: '' }),
  });
  if (!r.ok) { console.error('[load] create question failed', r.status, await r.text()); process.exit(1); }
  const q = await r.json();
  const qid = q.id;
  console.log(`[load] question ${qid}`);

  // 4. activate
  r = await apiFetch(`/api/admin/events/${eventId}/questions/${qid}/activate`, { method: 'POST', body: JSON.stringify({}) });
  if (!r.ok) { console.error('[load] activate failed', r.status, await r.text()); process.exit(1); }
  console.log('[load] question activated');

  // 5. WS clients
  const overallStart = Date.now();
  const latencies = [];
  let successes = 0;
  let failures = 0;
  const errors = [];

  function runClient(idx) {
    return new Promise((resolve) => {
      const url = `${wsBase}/ws/events/${encodeURIComponent(eventCode)}`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { failures++; errors.push(`client ${idx} ws ctor: ${e.message}`); resolve(); return; }
      let sentAt = 0;
      let answered = false;
      const timeout = setTimeout(() => {
        if (!answered) {
          failures++;
          errors.push(`client ${idx} timeout`);
          try { ws.close(); } catch {}
          resolve();
        }
      }, 15000);

      ws.addEventListener('open', () => { /* wait for state */ });
      ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'ping') {
          // reply pong-ish: server expects {"type":"ping"} -> pong; but spec says answer ping. We just respond with ping.
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
          return;
        }
        if (msg.type === 'state' && sentAt === 0) {
          // joined — send answer
          sentAt = Date.now();
          try { ws.send(JSON.stringify({ type: 'answer', question_id: qid, value: 'A' })); } catch (e) {
            clearTimeout(timeout);
            failures++; errors.push(`client ${idx} send: ${e.message}`); try{ws.close();}catch{}; resolve();
          }
          return;
        }
        if (msg.type === 'result' && msg.for === 'answer') {
          if (answered) return;
          answered = true;
          clearTimeout(timeout);
          if (msg.ok) {
            successes++;
            latencies.push(Date.now() - sentAt);
          } else {
            failures++;
            errors.push(`client ${idx} result not ok`);
          }
          try { ws.close(); } catch {}
          resolve();
          return;
        }
        if (msg.type === 'error' && msg.for === 'answer') {
          if (answered) return;
          answered = true;
          clearTimeout(timeout);
          failures++;
          errors.push(`client ${idx} error: ${msg.error}`);
          try { ws.close(); } catch {}
          resolve();
          return;
        }
        // ignore other messages (state broadcasts etc)
      });
      ws.addEventListener('error', (e) => {
        if (!answered) {
          answered = true;
          clearTimeout(timeout);
          failures++;
          errors.push(`client ${idx} ws error`);
          resolve();
        }
      });
      ws.addEventListener('close', () => {
        if (!answered) {
          answered = true;
          clearTimeout(timeout);
          failures++;
          errors.push(`client ${idx} closed before result`);
          resolve();
        }
      });
    });
  }

  console.log(`[load] opening ${N} WebSocket clients...`);
  const wallStart = Date.now();
  const promises = Array.from({ length: N }, (_, i) => runClient(i));
  await Promise.all(promises);
  const wallMs = Date.now() - wallStart;

  // 6. verify persisted count — AdminListAnswers with question_id filter, no status filter (all)
  r = await apiFetch(`/api/admin/events/${eventId}/answers?question_id=${qid}`);
  if (!r.ok) { console.error('[load] list answers failed', r.status, await r.text()); process.exit(1); }
  const answers = await r.json();
  const persisted = Array.isArray(answers) ? answers.length : 0;
  console.log(`[load] persisted answers: ${persisted}`);

  // Also print errors if any
  if (errors.length) {
    console.log('[load] errors (first 10):');
    for (const e of errors.slice(0, 10)) console.log('  ' + e);
  }

  // Report
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const min = sorted.length ? sorted[0] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  const avg = sorted.length ? Math.round(sum / sorted.length) : 0;
  const totalWallSec = wallMs / 1000;
  const throughput = totalWallSec ? (successes / totalWallSec).toFixed(2) : '0';

  console.log('');
  console.log('=== Load test summary ===');
  console.log(`Configured users : ${N}`);
  console.log(`Joined/answered  : ${successes}/${N} succeeded, ${failures} failed`);
  console.log(`Persisted count  : ${persisted} (expected ${N})`);
  console.log(`Latency ms       : min ${min} | p50 ${p50} | p95 ${p95} | max ${max} | avg ${avg}`);
  console.log(`Wall time        : ${wallMs} ms`);
  console.log(`Throughput       : ${throughput} answers/sec`);
  console.log(`Overall duration : ${Date.now() - overallStart} ms`);
  if (maxP95Ms || maxMs || minThroughput) {
    console.log(`Thresholds       : p95<=${maxP95Ms || '-'}ms | max<=${maxMs || '-'}ms | throughput>=${minThroughput || '-'}/s`);
  }
  console.log('==========================');

  const violations = [];
  if (successes !== N) violations.push(`successes ${successes} != ${N}`);
  if (persisted !== N) violations.push(`persisted ${persisted} != ${N}`);
  if (failures !== 0) violations.push(`failures ${failures}`);
  if (maxP95Ms && p95 > maxP95Ms) violations.push(`p95 ${p95}ms > ${maxP95Ms}ms`);
  if (maxMs && max > maxMs) violations.push(`max ${max}ms > ${maxMs}ms`);
  if (minThroughput && Number(throughput) < minThroughput) violations.push(`throughput ${throughput}/s < ${minThroughput}/s`);
  const ok = violations.length === 0;
  if (!ok) {
    console.error('[load] FAILED');
    for (const v of violations) console.error(`  ${v}`);
  } else {
    console.log('[load] PASSED');
  }

  // cleanup ws already closed; kill server handled by outer
  cleanup();
  // remove tmp dir
  if (tmpRoot) { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {} }
  process.exit(ok ? 0 : 1);
}

await bootServerIfNeeded();
await runScenario();
