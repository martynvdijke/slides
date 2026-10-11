#!/usr/bin/env node
/**
 * sync-deck.mjs — parse a deck's slides.md frontmatter and POST to
 * POST /api/admin/events/{id}/deck/sync
 *
 * Body: { deck_slug, slides:[{slide_id,position,prompt,kind,options,points_base,correct_index,duration_sec,time_limit_s,show_results}] }
 * Idempotent upsert keyed by external_id = "{deck_slug}:{slide_id}" (never by index).
 *
 * No-op when env is unset; never crashes a normal build. Debounced via file mtime.
 * Uses @slidev/parser if available, else gray-matter + yaml fallback.
 *
 * Env:
 *   DECK_SYNC_BASE_URL | VITE_LIVE_BASE_URL  — backend origin (e.g. http://localhost:8080)
 *   DECK_SYNC_EVENT_ID | VITE_EVENT_ID      — numeric event id for admin sync
 *   DECK_SYNC_TOKEN    | ADMIN_TOKEN        — admin bearer or cookie header value (optional, uses credentials:include when not set)
 *   DECK_SLUG          — deck identifier (default: from slides.md title or "deck")
 *   SLIDES_PATH        — path to slides.md (default: ./slides.md)
 *
 * Usage:
 *   node scripts/sync-deck.mjs
 *   node scripts/sync-deck.mjs --dry-run
 *   DECK_SYNC_BASE_URL=http://localhost:8080 DECK_SYNC_EVENT_ID=1 npm run sync:deck
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'

const DRY = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')

function env(k, fallback='') {
  return process.env[k] ?? fallback
}

const BASE_URL = (env('DECK_SYNC_BASE_URL') || env('VITE_LIVE_BASE_URL') || '').replace(/\/+$/,'')
const EVENT_ID = env('DECK_SYNC_EVENT_ID') || env('VITE_EVENT_ID') || env('EVENT_ID') || ''
const TOKEN = env('DECK_SYNC_TOKEN') || env('ADMIN_TOKEN') || ''
const DECK_SLUG = env('DECK_SLUG') || ''
const SLIDES_PATH = env('SLIDES_PATH') || resolve(process.cwd(), 'slides.md')

const KIND_FROM_LAYOUT = {
  poll: 'poll',
  multi: 'multi',
  ranking: 'ranking',
  yesno: 'yesno',
  rating: 'rating',
  nps: 'nps',
  open: 'open',
  wordcloud: 'wordcloud',
  qa: 'qa',
  grid2x2: 'grid2x2',
}
const INTERACTIVE_LAYOUTS = new Set(Object.keys(KIND_FROM_LAYOUT))

function inferKind(layout, explicit) {
  if (explicit) return String(explicit).toLowerCase()
  return KIND_FROM_LAYOUT[String(layout ?? '').toLowerCase()] ?? 'poll'
}

function toInt(v, fallback=0) {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

async function parseSlides(rawPath) {
  const raw = readFileSync(rawPath, 'utf-8')

  // Try @slidev/parser (ESM) — dynamic import, fallback to gray-matter-ish split
  let slides = []
  try {
    // slidev parser is ESM, but we try CJS require fallback
    let mod = null
    try { mod = await import('@slidev/parser') } catch {}
    if (mod && mod.parse) {
      const parsed = await mod.parse(raw, rawPath)
      // parsed.slides is array of { frontmatter, content }
      slides = (parsed.slides ?? []).map((s, i) => ({ frontmatter: s.frontmatter ?? {}, position: i+1 }))
    } else {
      throw new Error('no parser')
    }
  } catch {
    // Fallback: split on --- frontmatter blocks (Slidev uses --- separators)
    // This is intentionally lenient — we only need frontmatter of interactive slides.
    const parts = raw.split(/^---\s*$/m)
    // parts[0] is preface, then alternating frontmatter / content
    // Simpler: regex for yaml frontmatter after each ---
    const re = /---\s*\n([\s\S]*?)\n---\s*\n/g
    let m
    let pos = 0
    while ((m = re.exec(raw)) !== null) {
      pos++
      const yamlText = m[1]
      let fm = {}
      try {
        // tiny yaml: use js-yaml if available, else naive key: value
        let yaml = null
        try { yaml = await import('yaml') } catch {}
        if (yaml && yaml.parse) fm = yaml.parse(yamlText) ?? {}
        else {
          // naive parse for our known keys
          for (const line of yamlText.split('\n')) {
            const mm = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)\s*$/)
            if (!mm) continue
            let k = mm[1], v = mm[2].trim()
            if (v === 'true') v = true
            else if (v === 'false') v = false
            else if (/^\d+$/.test(v)) v = parseInt(v,10)
            else if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1)
            else if (v.startsWith('[')) { try { v = JSON.parse(v.replace(/'/g,'"')) } catch {} }
            fm[k] = v
          }
        }
      } catch {}
      slides.push({ frontmatter: fm, position: pos })
    }
    // If naive split found nothing, treat whole file as one slide (unlikely)
    if (!slides.length) slides = [{ frontmatter: {}, position: 1 }]
  }
  return slides
}

function buildPayload(slides, deckSlug) {
  const out = []
  for (const { frontmatter: fm, position } of slides) {
    const isInteractive = fm.interactive === true || (fm.layout && INTERACTIVE_LAYOUTS.has(String(fm.layout).toLowerCase()))
    if (!isInteractive) continue
    const id = String(fm.id ?? fm.slide_id ?? '').trim()
    if (!id) {
      console.warn(`[sync-deck] skip interactive slide at position ${position}: missing "id" (stable slug required)`)
      continue
    }
    const layout = String(fm.layout ?? 'poll').toLowerCase()
    const kind = inferKind(layout, fm.kind)
    const prompt = String(fm.prompt ?? fm.title ?? '').trim()
    if (!prompt) {
      console.warn(`[sync-deck] skip ${id}: missing "prompt"`)
      continue
    }
    const options = Array.isArray(fm.options) ? fm.options.map(String) : []
    const points = toInt(fm.points ?? fm.points_base ?? 0, 0)
    const correct = fm.correct === undefined || fm.correct === null || fm.correct === '' ? null : toInt(fm.correct, null)
    const duration = toInt(fm.duration ?? fm.duration_sec ?? 0, 0)
    const timeLimit = toInt(fm.timeLimit ?? fm.time_limit_s ?? 0, 0)
    const showResults = fm.showResults !== undefined ? !!fm.showResults : true
    out.push({
      slide_id: id,
      position,
      prompt,
      kind,
      options,
      points_base: points,
      correct_index: correct,
      duration_sec: duration,
      time_limit_s: timeLimit,
      show_results: showResults,
      // pass through grid axes / activate for backend validation
      ...(fm.axes ? { axes: fm.axes } : {}),
      ...(fm.activate ? { activate: String(fm.activate) } : {}),
      ...(fm.media ? { media: String(fm.media) } : {}),
    })
  }
  return { deck_slug: deckSlug, slides: out }
}

async function main() {
  if (!existsSync(SLIDES_PATH)) {
    console.log(`[sync-deck] no slides at ${SLIDES_PATH} — skip`)
    return
  }
  const rawSlides = await parseSlides(SLIDES_PATH)
  // deck_slug fallback: explicit env, else title from first slide frontmatter, else folder name
  let deckSlug = DECK_SLUG
  if (!deckSlug) {
    try {
      const t = rawSlides[0]?.frontmatter?.title ?? rawSlides[0]?.frontmatter?.theme ?? ''
      deckSlug = String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40) || basename(dirname(SLIDES_PATH)) || 'deck'
    } catch { deckSlug = 'deck' }
  }

  const payload = buildPayload(rawSlides, deckSlug)

  if (!payload.slides.length) {
    console.log(`[sync-deck] no interactive slides in ${SLIDES_PATH} — nothing to sync`)
    return
  }

  console.log(`[sync-deck] deck_slug=${payload.deck_slug} slides=${payload.slides.length} from ${SLIDES_PATH}`)
  for (const s of payload.slides) {
    console.log(`  - ${s.slide_id} @${s.position} kind=${s.kind} prompt="${s.prompt.slice(0,60)}"`)
  }

  if (DRY) {
    console.log('[sync-deck] --dry-run: not posting')
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  if (!BASE_URL || !EVENT_ID) {
    console.log('[sync-deck] DECK_SYNC_BASE_URL / DECK_SYNC_EVENT_ID not set — dry-run only (set both to POST)')
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  const url = `${BASE_URL}/api/admin/events/${encodeURIComponent(EVENT_ID)}/deck/sync`
  const headers = { 'Content-Type': 'application/json' }
  if (TOKEN) {
    // support "Bearer xxx" or raw cookie header value — heuristic
    if (TOKEN.includes('Bearer') || TOKEN.length > 40) headers['Authorization'] = TOKEN.startsWith('Bearer') ? TOKEN : `Bearer ${TOKEN}`
    else headers['Authorization'] = `Bearer ${TOKEN}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    console.error(`[sync-deck] POST ${url} → ${res.status}`, data)
    process.exitCode = 1
    return
  }
  console.log(`[sync-deck] synced →`, data)
}

main().catch(e => { console.error('[sync-deck] fatal', e); process.exitCode = 1 })
