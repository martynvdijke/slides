import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let yaml
try {
  const mod = await import('js-yaml')
  yaml = mod.default ?? mod
} catch (e) {
  console.error('Failed to resolve js-yaml. Ensure `npm ci` has been run and @slidev/cli is installed. Error:', e?.message ?? e)
  process.exit(1)
}

const VALID_KINDS = new Set(['poll', 'multi', 'ranking', 'yesno', 'rating', 'nps', 'open', 'wordcloud'])
const NEEDS_OPTIONS = new Set(['poll', 'multi', 'ranking'])
const LIVE_QUESTION_RE = /<!--\s*live-question\s*\r?\n([\s\S]*?)-->/g

export const CANONICAL_FEATURES = ['live', 'qa', 'slides', 'feedback', 'leaderboard']
const KNOWN_FEATURES = new Set(CANONICAL_FEATURES)

export function parseFeaturesValue(raw) {
  let tokens = []
  if (Array.isArray(raw)) {
    tokens = raw.map(v => String(v).trim()).filter(Boolean)
  } else if (typeof raw === 'string') {
    let s = raw.trim()
    if (s === '') return []
    if (s.startsWith('[') && s.endsWith(']')) {
      s = s.slice(1, -1).trim()
      if (s === '') return []
    }
    // split by comma and/or whitespace
    tokens = s.split(',').flatMap(part => part.trim().split(/\s+/)).filter(Boolean)
    tokens = tokens.map(t => t.replace(/^["']|["']$/g, '').trim()).filter(Boolean)
  } else if (raw == null) {
    return []
  } else {
    tokens = String(raw).split(/[\s,]+/).filter(Boolean)
  }
  const normalized = tokens.map(t => String(t).trim().toLowerCase()).filter(Boolean)
  const unknown = normalized.filter(t => !KNOWN_FEATURES.has(t))
  if (unknown.length) console.warn(`Unknown features ignored: ${unknown.join(', ')}`)
  const known = normalized.filter(t => KNOWN_FEATURES.has(t))
  const set = new Set(known)
  return CANONICAL_FEATURES.filter(f => set.has(f))
}

function isExplicitEmptyFeatures(raw) {
  if (Array.isArray(raw)) return raw.length === 0
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s === '') return true
    if (s.startsWith('[') && s.endsWith(']') && s.slice(1, -1).trim() === '') return true
  }
  return false
}

export function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const out = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Handle YAML block list for features:  features:\n  - live\n  - qa
    if (value === '' && key === 'features') {
      const items = []
      let j = i + 1
      while (j < lines.length) {
        const nl = lines[j]
        const trimmed = nl.trim()
        if (trimmed.startsWith('- ')) {
          let item = trimmed.slice(2).trim()
          if (
            (item.startsWith('"') && item.endsWith('"')) ||
            (item.startsWith("'") && item.endsWith("'"))
          ) {
            item = item.slice(1, -1)
          }
          // strip trailing bracket/comma noise
          item = item.replace(/[,]/g, '').trim()
          if (item) items.push(item)
          j++
        } else if (trimmed === '') {
          j++
        } else {
          break
        }
      }
      if (items.length > 0) {
        out[key] = items
        i = j - 1
        continue
      }
      // empty block list -> explicit empty
      if (j > i + 1) {
        // we consumed at least one blank or dash check but found no items
        // treat as explicit empty only if next non-empty line was not a key
        // Actually if value === '' and no dash items found, keep as ''
        // so isExplicitEmptyFeatures will detect it as explicit empty
      }
    }
    out[key] = value
  }
  return out
}

function slugify(prompt) {
  let slug = String(prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-')
  slug = slug.slice(0, 60).replace(/-+$/g, '')
  return slug
}

/**
 * Extract questions from markdown string.
 * Duplicate id handling: suffix `-2`, `-3`, ... to make unique; warn on duplicates.
 */
export function extractQuestions(markdown) {
  const questions = []
  const seen = new Map() // id -> count
  let index = 0 // 1-based overall block index

  for (const match of markdown.matchAll(LIVE_QUESTION_RE)) {
    index++
    const body = match[1]
    let data
    try {
      data = yaml.load(body) ?? {}
    } catch (e) {
      console.warn(`Skipping live-question block #${index}: YAML parse error: ${e.message}`)
      continue
    }
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      console.warn(`Skipping live-question block #${index}: YAML did not produce an object`)
      continue
    }

    // prompt required
    const prompt = data.prompt != null ? String(data.prompt).trim() : ''
    if (!prompt) {
      console.warn(`Skipping live-question block #${index}: missing or empty prompt`)
      continue
    }

    // kind
    let kind = data.kind != null ? String(data.kind).trim().toLowerCase() : 'poll'
    if (!VALID_KINDS.has(kind)) {
      console.warn(`live-question block #${index}: unknown kind "${kind}", defaulting to "poll"`)
      kind = 'poll'
    }

    // options
    let options = []
    if (Array.isArray(data.options)) {
      options = data.options.map(o => String(o))
    } else if (data.options != null) {
      // if options is not array but present, treat as invalid
      options = []
    }

    if (NEEDS_OPTIONS.has(kind)) {
      if (options.length < 2) {
        console.warn(`Skipping live-question block #${index} (kind=${kind}): options required (>=2)`)
        continue
      }
    } else {
      // ignored/empty otherwise — always empty array
      options = []
    }

    // correct -> correct_index
    let correct_index = null
    if (data.correct !== undefined && data.correct !== null && String(data.correct).trim() !== '') {
      if (typeof data.correct === 'number' && Number.isInteger(data.correct)) {
        correct_index = data.correct
      } else if (typeof data.correct === 'string' && /^-?\d+$/.test(data.correct.trim())) {
        correct_index = parseInt(data.correct.trim(), 10)
      } else if (typeof data.correct === 'number') {
        // non-integer number -> treat as integer truncation? Warn and keep int
        correct_index = Math.trunc(data.correct)
      } else {
        // string match against options
        const needle = String(data.correct).trim().toLowerCase()
        const idx = options.findIndex(o => o.trim().toLowerCase() === needle)
        if (idx >= 0) {
          correct_index = idx
        } else {
          console.warn(`live-question block #${index}: correct value "${data.correct}" did not match any option, leaving null`)
          correct_index = null
        }
      }
    }

    // id
    let id
    if (data.id != null && String(data.id).trim() !== '') {
      id = String(data.id).trim()
    } else {
      const slug = slugify(prompt)
      id = slug || `q${index}`
    }

    // deduplicate: suffix -2, -3 ...
    if (seen.has(id)) {
      const base = id
      let suffix = 2
      // Find next available suffix
      while (seen.has(`${base}-${suffix}`)) suffix++
      const newId = `${base}-${suffix}`
      console.warn(`Duplicate id "${base}" at block #${index}, renaming to "${newId}"`)
      seen.set(base, (seen.get(base) ?? 1) + 1)
      seen.set(newId, 1)
      id = newId
    } else {
      seen.set(id, 1)
    }

    const q = {
      id,
      kind,
      mode: data.mode != null ? String(data.mode) : 'live',
      prompt,
      options,
      correct_index,
      points_base: data.points != null ? Number(data.points) : 100,
      show_results: data.show_results != null ? Boolean(data.show_results) : true,
      time_limit_s: data.time_limit_s != null ? Number(data.time_limit_s) : 0,
      duration_sec: data.duration_sec != null ? Number(data.duration_sec) : 0,
      media_url: data.media_url != null ? String(data.media_url) : '',
      media_type: data.media_type != null ? String(data.media_type) : '',
    }

    // Normalize NaN fallbacks
    if (Number.isNaN(q.points_base)) q.points_base = 100
    if (Number.isNaN(q.time_limit_s)) q.time_limit_s = 0
    if (Number.isNaN(q.duration_sec)) q.duration_sec = 0

    questions.push(q)
  }

  return questions
}

export function main() {
  const dist = 'dist'
  if (!existsSync(dist)) {
    console.warn('No dist/ found. Skipping question extraction (run `npm run build --workspaces` first).')
    return
  }

  // Discover built decks: dist/<deck>/index.html exists — mirror build-index.mjs
  const builtDecks = readdirSync(dist, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(dist, d.name, 'index.html')))
    .map(d => d.name)

  if (builtDecks.length === 0) {
    console.warn('No built decks found in dist/ (no dist/<deck>/index.html). No manifests written.')
    return
  }

  for (const deck of builtDecks) {
    const slidesPath = join('decks', deck, 'slides.md')
    let markdown = ''
    let frontmatter = {}
    if (existsSync(slidesPath)) {
      markdown = readFileSync(slidesPath, 'utf8')
      frontmatter = parseFrontmatter(markdown)
    } else {
      console.warn(`Deck "${deck}" has no slides.md at ${slidesPath}; writing empty manifest`)
    }

    const questions = markdown ? extractQuestions(markdown) : []
    const event_name = frontmatter.title || deck
    const manifest = {
      deck,
      event_code: deck,
      event_name,
      questions,
    }
    if (Object.prototype.hasOwnProperty.call(frontmatter, 'features')) {
      const raw = frontmatter.features
      const parsed = parseFeaturesValue(raw)
      if (parsed.length > 0 || isExplicitEmptyFeatures(raw)) {
        manifest.features = parsed
      } else if (parsed.length === 0) {
        // filtered to empty due to unknown names only -> do not emit per spec
        // (never emit empty unless explicitly empty)
      }
    }

    const outPath = join(dist, deck, 'questions.json')
    mkdirSync(join(dist, deck), { recursive: true })
    writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`Deck "${deck}": ${questions.length} question(s) -> ${outPath}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
