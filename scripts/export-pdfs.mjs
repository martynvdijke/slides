// Exports each built deck to dist/<deck>/slides.pdf via the local Slidev CLI.
// Usage: node scripts/export-pdfs.mjs [deck ...]  (no args = all discovered decks)
import { existsSync, readdirSync } from 'node:fs'
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

const slidevBin = join(repoRoot, 'node_modules', '.bin', 'slidev')
let failed = 0

for (const deck of decks) {
  const input = join('decks', deck, 'slides.md')
  const output = join('dist', deck, 'slides.pdf')
  console.log(`[export-pdfs] ${deck}: ${input} → ${output}`)
  const result = spawnSync(slidevBin, ['export', input, '--format', 'pdf', '--output', output, '--timeout', '120000'], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`[export-pdfs] ${deck}: export failed (exit ${result.status})`)
    failed++
  } else {
    console.log(`[export-pdfs] ${deck}: done → ${output}`)
  }
}

if (failed > 0) {
  console.error(`[export-pdfs] ${failed} deck(s) failed`)
  process.exit(1)
}
console.log(`[export-pdfs] all ${decks.length} deck(s) exported`)
