import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractQuestions, parseFrontmatter } from './extract-questions.mjs'

describe('extractQuestions', () => {
  it('parses a comment block with options + int correct + kinds', () => {
    const md = `
<!-- live-question
prompt: Which of these are Kubernetes control-plane components?
kind: multi
options:
  - kube-apiserver
  - etcd
  - kubelet
correct: 0
points: 100
time_limit_s: 30
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs.length, 1)
    assert.equal(qs[0].kind, 'multi')
    assert.equal(qs[0].prompt, 'Which of these are Kubernetes control-plane components?')
    assert.deepEqual(qs[0].options, ['kube-apiserver', 'etcd', 'kubelet'])
    assert.equal(qs[0].correct_index, 0)
    assert.equal(qs[0].points_base, 100)
    assert.equal(qs[0].time_limit_s, 30)
  })

  it('correct as option text maps to the right index (case-insensitive)', () => {
    const md = `
<!-- live-question
prompt: Pick one
kind: poll
options:
  - Alpha
  - Beta
  - Gamma
correct: beta
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs.length, 1)
    assert.equal(qs[0].correct_index, 1)

    const md2 = `
<!-- live-question
prompt: Pick one
kind: poll
options:
  - Alpha
  - Beta
correct: "  BETA "
-->
`
    const qs2 = extractQuestions(md2)
    assert.equal(qs2[0].correct_index, 1)
  })

  it('missing prompt is skipped', () => {
    const md = `
<!-- live-question
kind: poll
options:
  - A
  - B
-->
<!-- live-question
prompt: ""
kind: poll
options:
  - A
  - B
-->
<!-- live-question
prompt: Valid question
kind: poll
options:
  - A
  - B
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs.length, 1)
    assert.equal(qs[0].prompt, 'Valid question')
  })

  it('default id slugifies the prompt', () => {
    const md = `
<!-- live-question
prompt: Hello, World! This is a test.
kind: poll
options:
  - Y
  - N
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs.length, 1)
    assert.equal(qs[0].id, 'hello-world-this-is-a-test')

    // long prompt truncated to 60 chars
    const longPrompt = 'A'.repeat(100) + ' hello'
    const md2 = `<!-- live-question\nprompt: ${longPrompt}\nkind: poll\noptions:\n  - Y\n  - N\n-->`
    const qs2 = extractQuestions(md2)
    assert.ok(qs2[0].id.length <= 60)

    // non-alphanumeric only -> fallback to q<index>
    const md3 = `
<!-- live-question
prompt: "!!! ???"
kind: poll
options:
  - Y
  - N
-->
`
    const qs3 = extractQuestions(md3)
    assert.equal(qs3[0].id, 'q1')
  })

  it('duplicate ids are de-duplicated with suffix -2, -3', () => {
    const md = `
<!-- live-question
id: dup
prompt: First
kind: poll
options:
  - A
  - B
-->
<!-- live-question
id: dup
prompt: Second
kind: poll
options:
  - A
  - B
-->
<!-- live-question
id: dup
prompt: Third
kind: poll
options:
  - A
  - B
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs.length, 3)
    assert.equal(qs[0].id, 'dup')
    assert.equal(qs[1].id, 'dup-2')
    assert.equal(qs[2].id, 'dup-3')
  })

  it('warn+skip if options missing for poll/multi/ranking', () => {
    const md = `
<!-- live-question
prompt: Needs options
kind: poll
-->
<!-- live-question
prompt: Also needs options
kind: ranking
options:
  - Only one
-->
<!-- live-question
prompt: Open needs no options
kind: open
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs.length, 1)
    assert.equal(qs[0].kind, 'open')
  })

  it('options ignored for non-poll/multi/ranking kinds', () => {
    const md = `
<!-- live-question
prompt: Open question
kind: open
options:
  - A
  - B
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs.length, 1)
    assert.deepEqual(qs[0].options, [])
  })

  it('correct with no match leaves null', () => {
    const md = `
<!-- live-question
prompt: Q
kind: poll
options:
  - A
  - B
correct: Z
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs[0].correct_index, null)
  })

  it('defaults for missing fields', () => {
    const md = `
<!-- live-question
prompt: Defaults test
kind: poll
options:
  - A
  - B
-->
`
    const qs = extractQuestions(md)
    assert.equal(qs[0].points_base, 100)
    assert.equal(qs[0].mode, 'live')
    assert.equal(qs[0].show_results, true)
    assert.equal(qs[0].time_limit_s, 0)
    assert.equal(qs[0].duration_sec, 0)
    assert.equal(qs[0].media_url, '')
    assert.equal(qs[0].media_type, '')
  })
})

describe('parseFrontmatter', () => {
  it('reads title', () => {
    const md = `---\ntitle: "My Deck"\ndate: 2026-01-01\n---\n# Hello`
    const fm = parseFrontmatter(md)
    assert.equal(fm.title, 'My Deck')
  })
})
