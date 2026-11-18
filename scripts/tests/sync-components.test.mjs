import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  CANONICAL_DIR,
  ROOT,
  SHARED_FILES,
  TARGET_DIRS,
  collectDrift,
  missingCanonical,
} from '../sync-live-components.mjs'

const HINT = 'Run `npm run sync:components` to re-sync them from the canonical template.'

function driftMessage(drift) {
  const lines = drift.map(d => `  - ${d.target}/${d.file} (${d.reason})`).join('\n')
  return `Live deck copies have drifted from ${CANONICAL_DIR}:\n${lines}\n${HINT}`
}

function writeFile(root, file, body) {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

// Temp repo-shaped tree: the canonical deck plus an in-sync copy in every deck.
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'sync-components-'))
  for (const file of SHARED_FILES) {
    const body = `<!-- ${file} -->\n`
    writeFile(root, join(CANONICAL_DIR, file), body)
    for (const target of TARGET_DIRS) writeFile(root, join(target, file), body)
  }
  return root
}

describe('sync-live-components', () => {
  it('keeps every deck copy byte-identical to templates/deck', () => {
    const missing = missingCanonical(ROOT)
    if (missing.length) {
      assert.fail(`Canonical source missing from ${CANONICAL_DIR}:\n${missing.map(f => `  - ${f}`).join('\n')}`)
    }
    const drift = collectDrift(ROOT)
    if (drift.length) assert.fail(driftMessage(drift))
  })

  it('reports nothing for an in-sync fixture tree', (t) => {
    const root = makeFixture()
    t.after(() => rmSync(root, { recursive: true, force: true }))
    assert.deepEqual(collectDrift(root), [])
  })

  it('reports every diverging deck copy with its path', (t) => {
    const root = makeFixture()
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const file = 'components/LiveQuestion.vue'
    writeFile(root, join(TARGET_DIRS[0], file), '<!-- edited copy -->\n')
    writeFile(root, join(TARGET_DIRS[1], file), '<!-- other edit -->\n')

    const drift = collectDrift(root)
    assert.equal(drift.length, 2)
    assert.deepEqual(
      drift.map(d => `${d.target}/${d.file}:${d.reason}`).sort(),
      [
        `${TARGET_DIRS[0]}/${file}:differs`,
        `${TARGET_DIRS[1]}/${file}:differs`,
      ].sort(),
    )
    const message = driftMessage(drift)
    assert.ok(message.includes(`${TARGET_DIRS[0]}/${file}`))
    assert.ok(message.includes('npm run sync:components'))
  })

  it('reports a missing deck copy as drift', (t) => {
    const root = makeFixture()
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const file = 'composables/useLiveRoom.ts'
    unlinkSync(join(root, TARGET_DIRS[0], file))

    assert.deepEqual(collectDrift(root), [
      { target: TARGET_DIRS[0], file, reason: 'missing' },
    ])
  })
})
