// Exports each built deck to dist/<deck>/slides.pdf via the local Slidev CLI.
// Usage: node scripts/export-pdfs.mjs [deck ...]  (no args = all discovered decks)
//
// Slides that embed an external site (frontmatter `layout: iframe` with `url:`)
// are replaced with a static "external link" card in the exported copy only.
// Slidev's exporter waits for every frame to finish loading, so a slow or
// unreachable third-party page hangs the whole export; the deck on disk (and the
// live/GitHub Pages build) is left untouched.
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(join(import.meta.dirname, '..'))
const filter = new Set(process.argv.slice(2))

const decksDir = join(repoRoot, 'decks')
let candidates = []
if (existsSync(decksDir)) {
  candidates = readdirSync(decksDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => existsSync(join(decksDir, name, 'slides.md')))
    .filter(name => existsSync(join(repoRoot, 'dist', name, 'index.html')))
}

let decks = candidates
if (filter.size > 0) {
  decks = decks.filter(name => filter.has(name))
  // Also warn about requested decks that weren't discovered (missing slides.md or not built)
  for (const name of [...filter]) {
    if (!candidates.includes(name)) {
      const hasSlides = existsSync(join(decksDir, name, 'slides.md'))
      const hasDist = existsSync(join(repoRoot, 'dist', name, 'index.html'))
      if (!hasSlides || !hasDist) {
        console.warn(`[export-pdfs] skipping "${name}": ${!hasSlides ? 'missing slides.md' : ''}${!hasSlides && !hasDist ? ', ' : ''}${!hasDist ? 'not built (dist/${name}/index.html missing — run npm run build first)' : ''}`)
      }
    }
  }
}

if (decks.length === 0) {
  if (candidates.length === 0) {
    console.log('[export-pdfs] no decks found (need decks/<name>/slides.md + dist/<name>/index.html); nothing to do.')
  } else if (filter.size > 0) {
    console.log(`[export-pdfs] no matching decks for filter: ${[...filter].join(', ')} (discovered: ${candidates.join(', ') || '(none)'})`)
  } else {
    console.log('[export-pdfs] no decks found; nothing to do.')
  }
  process.exit(0)
}

console.log(`[export-pdfs] exporting ${decks.length} deck(s): ${decks.join(', ')}`)

// A frontmatter-only slide: `---` / `layout: iframe` / `url: …` / `---`. The
// `(?!---)` guards keep the wildcards inside one frontmatter block, so the match
// can never span (and delete) the slides in between.
const IFRAME_SLIDE = /^---[ \t]*\n(?:(?!---)[^\n]*\n)*?[ \t]*layout:[ \t]*iframe[ \t]*\n(?:(?!---)[^\n]*\n)*?[ \t]*url:[ \t]*(\S+)[ \t]*\n(?:(?!---)[^\n]*\n)*?^---[ \t]*\n/gm

function fallbackSlide(url) {
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return [
    '---',
    'layout: center',
    'class: text-center',
    '---',
    '',
    '<div class="text-xs tracking-[0.25em] uppercase opacity-50">External link</div>',
    '',
    `<a href="${safe}" class="text-xl font-medium underline decoration-dotted">${safe}</a>`,
    '',
  ].join('\n')
}

const slidevBin = join(repoRoot, 'node_modules', '.bin', 'slidev')
let failed = 0

for (const deck of decks) {
  const entry = join('decks', deck, 'slides.md')
  const output = join('dist', deck, 'slides.pdf')

  let input = entry
  let tempFile
  const source = readFileSync(join(repoRoot, entry), 'utf8')
  const iframes = source.match(IFRAME_SLIDE) || []
  if (iframes.length > 0) {
    tempFile = join(repoRoot, 'decks', deck, '.pdf-export.md')
    writeFileSync(tempFile, source.replace(IFRAME_SLIDE, (_match, url) => fallbackSlide(url)))
    input = join('decks', deck, '.pdf-export.md')
    console.log(`[export-pdfs] ${deck}: neutralizing ${iframes.length} external iframe slide(s) for the PDF`)
  }

  console.log(`[export-pdfs] ${deck}: ${input} → ${output}`)
  let ok = false
  try {
    // One retry: Vite's dependency optimizer can invalidate modules mid-load on a
    // cold cache, which occasionally breaks the first export.
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      const result = spawnSync(slidevBin, ['export', input, '--format', 'pdf', '--output', output, '--timeout', '180000'], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
      })
      if (result.status === 0) {
        ok = true
      } else {
        console.error(`[export-pdfs] ${deck}: export failed (exit ${result.status})${attempt < 2 ? '; retrying once' : ''}`)
      }
    }
  } finally {
    if (tempFile) rmSync(tempFile, { force: true })
  }

  if (ok) {
    console.log(`[export-pdfs] ${deck}: done → ${output}`)
  } else {
    failed++
  }
}

if (failed > 0) {
  console.error(`[export-pdfs] ${failed} deck(s) failed`)
  process.exit(1)
}
console.log(`[export-pdfs] all ${decks.length} deck(s) exported`)
