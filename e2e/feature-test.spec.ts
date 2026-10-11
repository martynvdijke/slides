import { test, expect } from '@playwright/test'
import { ADMIN, activateQuestion, createEvent, createQuestion, login, uploadTinyPng } from './helpers'

test.describe('feature-test deck', () => {
  function attachFilters(page: any) {
    page.on('pageerror', (err: Error) => {
      if (/Wake Lock/.test(err.message)) return
      if (/Popper/.test(err.message)) return
    })
    page.on('console', (msg: any) => {
      const t = msg.text()
      if (/Failed to patch FloatingVue.*Popper/.test(t)) return
    })
  }

  async function gotoSlide(page: any, code: string, n: number) {
    await page.goto(`/feature-test/?event=${code}#/${n}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
  }

  test('in-slide wiring: join QR and live question waiting/active', async ({ page, request, browser }) => {
    await login(request)
    const ev = await createEvent(request, `E2E FT wiring ${Date.now()}`)
    attachFilters(page)

    await gotoSlide(page, ev.code, 2)
    await expect(page.locator('.live-join').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.live-join-qr img[alt="Scan to join"]').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.live-join-room').first()).toHaveText(ev.room_code, { timeout: 15000 })
    await expect(page.locator('.live-join-url').first()).toBeVisible()
    await expect(page.locator('.live-join-hint').first()).toBeVisible()

    const livePage = await browser.newPage()
    attachFilters(livePage)
    await gotoSlide(livePage, ev.code, 3)
    await expect(livePage.locator('.live-q').first()).toBeVisible({ timeout: 15000 })
    await expect(livePage.locator('.live-q-waiting').first()).toContainText('Waiting for a live question', { timeout: 15000 })

    const q = await createQuestion(request, ev.id, { kind: 'poll', prompt: 'FT wiring prompt?', options: ['A', 'B'] })
    await activateQuestion(request, ev.id, q.id)
    await expect(livePage.locator('.live-q-prompt').first()).toContainText('FT wiring prompt?', { timeout: 15000 })
    await expect(livePage.locator('.live-q-total').first()).toContainText(/vote/i, { timeout: 15000 })
    // bars should match option count (poll 2 options)
    await expect(livePage.locator('.live-q-bars').first().locator('.live-q-row')).toHaveCount(2, { timeout: 15000 })

    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    attachFilters(aud)
    await aud.goto(`/e/${ev.code}`)
    await expect(aud.locator('#live-card .prompt')).toContainText('FT wiring prompt?', { timeout: 15000 })
    const proj = await (await browser.newContext()).newPage()
    attachFilters(proj)
    await proj.goto(`/live/${ev.code}`)
    await expect(proj.locator('#prompt-area h2.live-prompt')).toContainText('FT wiring prompt?', { timeout: 15000 })

    await audCtx.close()
    await proj.context().close()
    await livePage.close()
  })

  test('all 8 question kinds: prompt visible and answer+results', async ({ browser, request }) => {
    test.setTimeout(120000)
    await login(request)
    const ev = await createEvent(request, `E2E FT kinds ${Date.now()}`)

    const deckCtx = await browser.newContext()
    const deck = await deckCtx.newPage()
    attachFilters(deck)
    await gotoSlide(deck, ev.code, 3)
    await expect(deck.locator('.live-q').first()).toBeVisible({ timeout: 15000 })

    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    attachFilters(aud)
    const projCtx = await browser.newContext()
    const proj = await projCtx.newPage()
    attachFilters(proj)
    await aud.goto(`/e/${ev.code}`)
    await proj.goto(`/live/${ev.code}`)

    const kinds: Array<{
      kind: string
      prompt: string
      options?: string[]
      answer: (page: any) => Promise<void>
      deckRows?: number
    }> = [
      {
        kind: 'poll',
        prompt: 'Poll FT?',
        options: ['PollA', 'PollB'],
        deckRows: 2,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('Poll FT?', { timeout: 15000 })
          await p.locator('#live-card button.option-btn', { hasText: 'PollA' }).click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
      {
        kind: 'multi',
        prompt: 'Multi FT?',
        options: ['M1', 'M2', 'M3'],
        deckRows: 3,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('Multi FT?', { timeout: 15000 })
          await p.locator('#live-card label.option-btn', { hasText: 'M1' }).locator('input[type=checkbox]').check()
          await p.locator('#live-card label.option-btn', { hasText: 'M2' }).locator('input[type=checkbox]').check()
          await p.locator('#live-card button.btn-primary').click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
      {
        kind: 'ranking',
        prompt: 'Ranking FT?',
        options: ['R1', 'R2', 'R3'],
        deckRows: 3,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('Ranking FT?', { timeout: 15000 })
          await p.getByRole('button', { name: 'Submit ranking' }).click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
      {
        kind: 'yesno',
        prompt: 'YesNo FT?',
        deckRows: 2,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('YesNo FT?', { timeout: 15000 })
          await p.locator('#live-card button.option-btn', { hasText: 'yes' }).first().click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
      {
        kind: 'rating',
        prompt: 'Rating FT?',
        deckRows: undefined,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('Rating FT?', { timeout: 15000 })
          await p.locator('.stars button.star[aria-label="Rate 3 of 5"]').click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
      {
        kind: 'nps',
        prompt: 'NPS FT?',
        deckRows: 11,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('NPS FT?', { timeout: 15000 })
          await p.locator('#live-card button.option-btn', { hasText: '8' }).click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
      {
        kind: 'open',
        prompt: 'Open FT?',
        deckRows: 1,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('Open FT?', { timeout: 15000 })
          await p.locator('#live-card textarea.textarea[placeholder="Type your answer…"]').fill('my open answer')
          await p.locator('#live-card button.btn-primary').click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
      {
        kind: 'wordcloud',
        prompt: 'Wordcloud FT?',
        deckRows: 1,
        answer: async (p) => {
          await expect(p.locator('#live-card .prompt')).toContainText('Wordcloud FT?', { timeout: 15000 })
          await p.locator('#live-card textarea[placeholder="One or two words…"]').fill('hello')
          await p.getByRole('button', { name: 'Send' }).click()
          await expect(p.locator('#live-card .thanks')).toContainText('Thanks', { timeout: 10000 })
        },
      },
    ]

    for (const k of kinds) {
      const q = await createQuestion(request, ev.id, {
        kind: k.kind,
        prompt: k.prompt,
        options: k.options,
        show_results: true,
      })
      await activateQuestion(request, ev.id, q.id)

      await expect(aud.locator('#live-card .prompt')).toContainText(k.prompt, { timeout: 15000 })
      await expect(proj.locator('#prompt-area h2.live-prompt')).toContainText(k.prompt, { timeout: 15000 })
      await expect(deck.locator('.live-q-prompt').first()).toContainText(k.prompt, { timeout: 15000 })

      await k.answer(aud)

      if (k.kind === 'wordcloud') {
        await expect(aud.locator('.cloud .cloud-item').first()).toBeVisible({ timeout: 10000 })
        // deck for wordcloud also shows bars (1 row) via LiveQuestion
        await expect(deck.locator('.live-q-bars').first().locator('.live-q-row')).toHaveCount(1, { timeout: 15000 })
        await expect(deck.locator('.live-q-total').first()).toContainText(/vote/i, { timeout: 15000 })
        // nonzero total
        await expect(deck.locator('.live-q-total').first()).toContainText(/1 (vote|ballot)/i, { timeout: 15000 })
      } else if (k.kind === 'nps') {
        await expect(aud.locator('#live-card .results .result-row').first()).toBeVisible({ timeout: 10000 })
        await expect(aud.locator('.pill').filter({ hasText: 'NPS' }).first()).toBeVisible({ timeout: 10000 })
        await expect(deck.locator('.live-q-bars').first().locator('.live-q-row')).toHaveCount(11, { timeout: 15000 })
        await expect(deck.locator('.live-q-total').first()).toContainText(/NPS/, { timeout: 15000 })
        await expect(deck.locator('.live-q-total').first()).toContainText(/1 (vote|ballot)/i, { timeout: 15000 })
      } else {
        await expect(aud.locator('#live-card .results .result-row').first()).toBeVisible({ timeout: 10000 })
        if (k.deckRows !== undefined) {
          await expect(deck.locator('.live-q-bars').first().locator('.live-q-row')).toHaveCount(k.deckRows, { timeout: 15000 })
        }
        await expect(deck.locator('.live-q-total').first()).toContainText(/1 (vote|ballot)/i, { timeout: 15000 })
      }
    }

    await deckCtx.close()
    await audCtx.close()
    await projCtx.close()
  })

  test('media: image and video render in audience, projector and deck', async ({ browser, request }) => {
    await login(request)
    const ev = await createEvent(request, `E2E FT media ${Date.now()}`)

    const deckCtx = await browser.newContext()
    const deck = await deckCtx.newPage()
    attachFilters(deck)
    await gotoSlide(deck, ev.code, 3)
    await expect(deck.locator('.live-q').first()).toBeVisible({ timeout: 15000 })

    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    attachFilters(aud)
    const projCtx = await browser.newContext()
    const proj = await projCtx.newPage()
    attachFilters(proj)
    await aud.goto(`/e/${ev.code}`)
    await proj.goto(`/live/${ev.code}`)

    const media = await uploadTinyPng(request, ev.id)
    const qImg = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Media image FT?',
      options: ['A', 'B'],
      media_url: media.url,
      media_type: media.media_type,
    })
    await activateQuestion(request, ev.id, qImg.id)
    await expect(deck.locator('.live-q-prompt').first()).toContainText('Media image FT?', { timeout: 15000 })
    await expect(aud.locator('#live-card .prompt')).toContainText('Media image FT?', { timeout: 15000 })
    await expect(aud.locator('#live-card .q-media img')).toBeVisible({ timeout: 10000 })
    await expect(proj.locator('#prompt-area img')).toBeVisible({ timeout: 10000 })
    await expect(deck.locator('img.live-q-media').first()).toBeVisible({ timeout: 15000 })

    const qVid = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Media video FT?',
      options: ['A', 'B'],
      media_url: '/media/clip.mp4',
      media_type: 'video',
    })
    await activateQuestion(request, ev.id, qVid.id)
    await expect(aud.locator('#live-card .prompt')).toContainText('Media video FT?', { timeout: 15000 })
    await expect(aud.locator('#live-card .q-media video')).toBeVisible({ timeout: 10000 })
    await expect(proj.locator('#prompt-area video')).toBeVisible({ timeout: 10000 })
    await expect(deck.locator('video.live-q-media').first()).toBeVisible({ timeout: 15000 })

    await deckCtx.close()
    await audCtx.close()
    await projCtx.close()
  })

  test('components: podium, leaderboard, reactions, QA, live-qr', async ({ browser, request }) => {
    test.setTimeout(120000)
    await login(request)
    const ev = await createEvent(request, `E2E FT comps ${Date.now()}`)

    const deckCtx = await browser.newContext()
    const deck = await deckCtx.newPage()
    attachFilters(deck)

    const qScore = await createQuestion(request, ev.id, {
      kind: 'poll',
      prompt: 'Leaderboard seed?',
      options: ['A', 'B'],
      correct_index: 0,
      points_base: 100,
    })
    await activateQuestion(request, ev.id, qScore.id)
    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    attachFilters(aud)
    await aud.goto(`/e/${ev.code}`)
    await expect(aud.locator('#live-card .prompt')).toContainText('Leaderboard seed?', { timeout: 15000 })
    await aud.locator('#live-card button.option-btn', { hasText: 'A' }).click()
    await expect(aud.locator('#live-card .thanks')).toBeVisible({ timeout: 10000 })
    await request.post(`/api/admin/events/${ev.id}/questions/${qScore.id}/reveal`)
    const podiumRes = await request.post(`/api/admin/events/${ev.id}/podium`, { data: { show: true } })
    expect(podiumRes.ok()).toBeTruthy()
    await expect.poll(async () => { const r = await request.get(`/api/events/${ev.code}/state`); const j = await r.json(); return j.event?.show_podium }, { timeout: 10000 }).toBeTruthy()

    // Use fresh pages per component slide to avoid hash reload flakiness
    {
      const lbCtx = await browser.newContext(); const p = await lbCtx.newPage(); attachFilters(p); await gotoSlide(p, ev.code, 7); await expect(p.locator('.lb')).toBeVisible({ timeout: 15000 }); await expect(p.locator('.lb-title')).toBeVisible(); await lbCtx.close()
    }
    {
      const podiumCtx = await browser.newContext(); const p = await podiumCtx.newPage(); attachFilters(p); await gotoSlide(p, ev.code, 6); await p.waitForTimeout(2000);
 await expect(p.locator('.podium').first()).toBeVisible({ timeout: 20000 }); await expect(p.locator('.podium-title')).toContainText('Podium'); await podiumCtx.close()
    }
    {
      const reactCtx = await browser.newContext(); const p = await reactCtx.newPage(); attachFilters(p); await gotoSlide(p, ev.code, 8); await expect(p.locator('.live-reactions')).toBeVisible({ timeout: 15000 }); await reactCtx.close()
    }

    const bar = aud.locator('#reaction-bar')
    await expect(bar).toBeVisible({ timeout: 10000 })
    const rBtn = aud.locator('#reaction-btns .r-btn').first()
    await expect(rBtn).toBeVisible({ timeout: 5000 })
    await rBtn.click()
    await aud.waitForTimeout(500)

    // Post a Q&A item via public API and approve it before checking slide 5
    const qaPost = await request.post(`/api/events/${ev.code}/qa`, { data: { body: 'FT component QA?', author: 'tester' } })
    expect(qaPost.ok()).toBeTruthy()
    const qaList = await request.get(`/api/admin/events/${ev.id}/qa`)
    expect(qaList.ok()).toBeTruthy()
    const items = await qaList.json()
    for (const it of Array.isArray(items) ? items : []) {
      await request.patch(`/api/admin/events/${ev.id}/qa/${it.id}`, { data: { status: 'approved' } })
    }
    {
      const p = await deck.context().newPage(); attachFilters(p); await gotoSlide(p, ev.code, 5); await expect(p.locator('.live-qa')).toBeVisible({ timeout: 15000 }); await expect(p.locator('.live-qa-title')).toBeVisible(); await expect(p.locator('.live-qa-item').first()).toBeVisible({ timeout: 15000 }); await expect(p.locator('.live-qa-item').first()).toContainText('FT component QA?'); await p.close()
    }

    {
      const p = await deck.context().newPage(); attachFilters(p); await gotoSlide(p, ev.code, 4); await expect(p.locator('.liveqr-wrap')).toBeVisible({ timeout: 15000 }); await expect(p.locator('.liveqr-wrap .live-join-qr img[alt="Scan to join"]')).toBeVisible({ timeout: 15000 }); await p.close()
    }

    await deckCtx.close()
    await audCtx.close()
  })

  test('presenter panel: fab hotkey, sign in, Ask now', async ({ browser, request }) => {
    test.setTimeout(120000)
    await login(request)
    const ev = await createEvent(request, `E2E FT presenter ${Date.now()}`)

    const deckCtx = await browser.newContext()
    const deck = await deckCtx.newPage()
    attachFilters(deck)
    await gotoSlide(deck, ev.code, 10)
    await expect(deck.locator('.pp-fab')).toBeVisible({ timeout: 15000 })

    // Open via fab
    await deck.locator('.pp-fab').click()
    await expect(deck.locator('.pp-overlay[role="dialog"] .pp-panel')).toBeVisible({ timeout: 15000 })

    // Close via hotkey/p and reopen via hotkey
    await deck.keyboard.press('p')
    await expect(deck.locator('.pp-overlay')).toBeHidden({ timeout: 5000 })
    await deck.keyboard.press('p')
    await expect(deck.locator('.pp-overlay[role="dialog"] .pp-panel')).toBeVisible({ timeout: 15000 })

    const authForm = deck.locator('.pp-auth')
    if (await authForm.isVisible()) {
      await deck.locator('.pp-auth input[placeholder="Username"]').fill(ADMIN.username)
      await deck.locator('.pp-auth input[placeholder="Password"]').fill(ADMIN.password)
      await deck.locator('.pp-auth .pp-btn.primary', { hasText: 'Sign in' }).click()
      await expect(deck.locator('textarea.pp-textarea')).toBeVisible({ timeout: 15000 })
    }

    await expect(deck.locator('textarea.pp-textarea')).toBeVisible({ timeout: 10000 })
    const uniquePrompt = `Presenter FT ${Date.now()}`
    await deck.locator('textarea.pp-textarea').fill(uniquePrompt)
    const optsInput = deck.locator('input[placeholder="Options, comma-separated"]')
    await expect(optsInput).toBeVisible({ timeout: 5000 })
    await optsInput.fill('YesOpt, NoOpt')
    await deck.locator('.pp-actions .pp-btn.primary', { hasText: 'Ask now' }).click()
    await expect(deck.locator('.pp-msg, .pp-active').first()).toContainText(/live|Question is live/i, { timeout: 15000 })

    const audCtx = await browser.newContext()
    const aud = await audCtx.newPage()
    attachFilters(aud)
    await aud.goto(`/e/${ev.code}`)
    await expect(aud.locator('#live-card .prompt')).toContainText(uniquePrompt, { timeout: 15000 })
    // Also verify in-slide prompt reflects it (still on slide 10? need to go to slide 3)
    const checkDeck = await browser.newPage()
    attachFilters(checkDeck)
    await gotoSlide(checkDeck, ev.code, 3)
    await expect(checkDeck.locator('.live-q-prompt').first()).toContainText(uniquePrompt, { timeout: 15000 })
    await checkDeck.close()

    await deckCtx.close()
    await audCtx.close()
  })
})
