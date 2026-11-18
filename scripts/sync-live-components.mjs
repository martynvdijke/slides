// Single-sources the shared live deck UI. Every shared component/composable
// lives once in templates/deck and is copied byte-for-byte into each real deck:
// Slidev bundles whatever sits in the deck directory, so the copies stay on
// disk and this script (plus scripts/tests/sync-components.test.mjs) keeps them
// honest. After editing a shared file run: npm run sync:components
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Paths below are repo-root relative, so the script behaves the same whether it
// is run from the root or imported by the test suite.
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Canonical source of truth for the live deck UI.
export const CANONICAL_DIR = 'templates/deck'

// Decks that carry a physical copy of every shared file.
export const TARGET_DIRS = ['decks/meetup', 'decks/feature-test']

// Files that are byte-identical in all three trees. Only add a file once every
// deck carries it; per-deck files (slides.md, layouts/, package.json, ...) are
// deliberately not part of the sync set.
export const SHARED_FILES = [
  'components/Leaderboard.vue',
  'components/LiveJoin.vue',
  'components/LiveQa.vue',
  'components/LiveQr.vue',
  'components/LiveQuestion.vue',
  'components/LiveReactions.vue',
  'components/Podium.vue',
  'components/PresenterPanel.vue',
  'composables/useDeckSlideQuestion.ts',
  'composables/useLiveRoom.ts',
  'styles/index.css',
]

// Shared files the canonical deck is missing. Never expected; the script exits
// non-zero on these rather than silently skipping them.
export function missingCanonical(root = ROOT) {
  return SHARED_FILES.filter(file => !existsSync(join(root, CANONICAL_DIR, file)))
}

// Deck copies that no longer match the canonical file.
// Each entry: { target, file, reason: 'differs' | 'missing' }.
export function collectDrift(root = ROOT) {
  const drift = []
  for (const target of TARGET_DIRS) {
    for (const file of SHARED_FILES) {
      const copyPath = join(root, target, file)
      if (!existsSync(copyPath)) {
        drift.push({ target, file, reason: 'missing' })
        continue
      }
      const canonical = readFileSync(join(root, CANONICAL_DIR, file))
      if (!canonical.equals(readFileSync(copyPath))) {
        drift.push({ target, file, reason: 'differs' })
      }
    }
  }
  return drift
}

// Copies every out-of-date shared file into every deck. Idempotent: identical
// copies are left untouched.
export function syncAll(root = ROOT) {
  const copied = []
  const skippedTargets = []
  let upToDate = 0
  for (const target of TARGET_DIRS) {
    if (!existsSync(join(root, target))) {
      skippedTargets.push(target)
      continue
    }
    for (const file of SHARED_FILES) {
      const src = join(root, CANONICAL_DIR, file)
      const dest = join(root, target, file)
      if (existsSync(dest) && readFileSync(src).equals(readFileSync(dest))) {
        upToDate++
        continue
      }
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      copied.push({ target, file })
    }
  }
  return { copied, skippedTargets, upToDate }
}

function main() {
  const missing = missingCanonical(ROOT)
  if (missing.length) {
    console.error(`Missing canonical source file(s) in ${CANONICAL_DIR}/:`)
    for (const file of missing) console.error(`  - ${CANONICAL_DIR}/${file}`)
    process.exit(1)
  }

  console.log(`Canonical: ${CANONICAL_DIR} (${SHARED_FILES.length} shared live files)`)
  const { copied, skippedTargets, upToDate } = syncAll(ROOT)
  for (const { target, file } of copied) console.log(`  synced ${target}/${file}`)
  for (const target of skippedTargets) console.warn(`  skipped ${target} (directory not found)`)
  if (copied.length) console.log(`Synced ${copied.length} file(s); ${upToDate} already up to date.`)
  else console.log(`All ${upToDate} deck copies already in sync.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
