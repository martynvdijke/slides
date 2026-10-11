import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('deck-authored questions seeded from markdown', () => {
  test('feature-test deck questions are seeded and visible via admin API', async ({ request }) => {
    await login(request)

    // Find the feature-test event seeded at startup.
    const eventsRes = await request.get('/api/admin/events')
    expect(eventsRes.ok(), 'GET /api/admin/events should succeed').toBeTruthy()
    const events = (await eventsRes.json()) as Array<{ id: number; code: string }>
    const ev = events.find((e) => e.code === 'feature-test')
    expect(ev, 'event with code "feature-test" must exist (SEED_FEATURE_TEST / SEED_DECK_QUESTIONS)').toBeTruthy()

    // List questions for that event via admin endpoint (draft questions only appear here).
    const qRes = await request.get(`/api/admin/events/${ev!.id}/questions`)
    expect(qRes.ok(), `GET /api/admin/events/${ev!.id}/questions should succeed`).toBeTruthy()
    const questions = (await qRes.json()) as Array<{
      prompt: string
      kind: string
      options: string[]
      correct_index?: number | null
    }>

    type Expected = {
      prompt: string
      kind: string
      options: string[]
      correct_index?: number
    }

    const expected: Expected[] = [
      {
        prompt: 'Which part of the stack do you want to dig into next?',
        kind: 'poll',
        options: ['Kubernetes', 'GitOps and CI/CD', 'Platform engineering', 'AI and GPUs'],
      },
      {
        prompt: 'Which of these are Kubernetes control-plane components?',
        kind: 'multi',
        options: ['kube-apiserver', 'etcd', 'kubelet', 'containerd'],
        correct_index: 0,
      },
      {
        prompt: 'Rank these platform capabilities by importance to you.',
        kind: 'ranking',
        options: ['Developer experience', 'Reliability', 'Cost efficiency'],
      },
      {
        prompt: 'Are you running Kubernetes in production today?',
        kind: 'yesno',
        options: [],
      },
      {
        prompt: "How useful was tonight's session?",
        kind: 'rating',
        options: [],
      },
      {
        prompt: 'How likely are you to recommend this meetup?',
        kind: 'nps',
        options: [],
      },
      {
        prompt: 'What topic should we cover next?',
        kind: 'open',
        options: [],
      },
      {
        prompt: 'Describe today in one word.',
        kind: 'wordcloud',
        options: [],
      },
    ]

    for (const exp of expected) {
      const matches = questions.filter((q) => q.prompt === exp.prompt)
      expect(
        matches.length,
        `prompt "${exp.prompt}" should appear exactly once (no duplicates / idempotent seeding), found ${matches.length}`,
      ).toBe(1)

      const q = matches[0]
      expect(q.kind, `kind for prompt "${exp.prompt}"`).toBe(exp.kind)

      // Options: poll/multi have explicit options; rating has none.
      if (exp.options.length > 0) {
        expect(q.options, `options for prompt "${exp.prompt}"`).toEqual(exp.options)
      } else {
        // Rating questions have no options — accept empty array.
        expect(q.options ?? [], `options for rating prompt "${exp.prompt}" should be empty`).toEqual([])
      }

      if (exp.correct_index !== undefined) {
        expect(q.correct_index, `correct_index for prompt "${exp.prompt}"`).toBe(exp.correct_index)
      }
    }
  })
})
