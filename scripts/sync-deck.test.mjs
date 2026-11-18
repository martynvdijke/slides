import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildPayload } from '../templates/deck/scripts/sync-deck.mjs'

function slide(frontmatter, position = 1) {
  return { frontmatter, position }
}

describe('sync-deck buildPayload media', () => {
  it('carries explicit media_url/media_type, trimmed', () => {
    const { slides } = buildPayload([
      slide({
        layout: 'poll',
        id: 'media-q',
        prompt: 'Pick one',
        options: ['A', 'B'],
        media_url: '  /media/shot.png  ',
        media_type: ' image/png ',
      }),
    ], 'deck')

    assert.equal(slides.length, 1)
    assert.equal(slides[0].media_url, '/media/shot.png')
    assert.equal(slides[0].media_type, 'image/png')
  })

  it('infers media_type from the URL when only media_url is set', () => {
    const { slides } = buildPayload([
      slide({ layout: 'poll', id: 'img', prompt: 'Image?', options: ['A', 'B'], media_url: '/x/clip.PNG?v=2' }),
      slide({ layout: 'poll', id: 'vid', prompt: 'Video?', options: ['A', 'B'], media_url: '/x/clip.mp4#t=0' }, 2),
      slide({ layout: 'poll', id: 'unknown', prompt: 'Other?', options: ['A', 'B'], media_url: '/x/file.bin' }, 3),
    ], 'deck')

    assert.deepEqual(slides.map(s => s.media_type), ['image', 'video', ''])
    assert.deepEqual(slides.map(s => s.media_url), ['/x/clip.PNG?v=2', '/x/clip.mp4#t=0', '/x/file.bin'])
  })

  it('treats the legacy `media` key as media_url', () => {
    const { slides } = buildPayload([
      slide({ layout: 'rating', id: 'legacy', prompt: 'Legacy?', media: ' /media/old.mp4 ' }),
    ], 'deck')

    assert.equal(slides[0].media_url, '/media/old.mp4')
    assert.equal(slides[0].media_type, 'video')
    assert.equal('media' in slides[0], false)
  })

  it('omits media keys when no media is declared', () => {
    const { slides } = buildPayload([
      slide({ layout: 'open', id: 'plain', prompt: 'Plain?' }),
    ], 'deck')

    assert.equal('media_url' in slides[0], false)
    assert.equal('media_type' in slides[0], false)
  })
})
