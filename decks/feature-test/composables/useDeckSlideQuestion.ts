import { computed } from 'vue'
import { useLiveRoom } from './useLiveRoom'

/**
 * useDeckSlideQuestion — thin wrapper around useLiveRoom for interactive slides.
 *
 * Share one live store (no second socket) and expose `{active, results, status,
 * remainingSec}` plus helpers. Activation is server-side (OnSlideChange) — this
 * composable never auto-activates from onMounted (that would fire for every
 * viewer/audience phone). Components only *read* StateDTO.active_question.
 *
 * The presenter already broadcasts `{type:"slide", index,total,title,id}` via
 * PresenterPanel/sendSlide; the backend maps `id` → `external_id`
 * (`{deck_slug}:{slide_id}`) and auto-activates the draft question when the
 * slide says `activate: auto` (default).
 */

export type InteractiveKind = 'poll' | 'multi' | 'ranking' | 'yesno' | 'rating' | 'nps' | 'open' | 'wordcloud' | 'qa' | 'grid2x2'

export interface DeckSlideFrontmatter {
  layout?: string
  interactive?: boolean
  id?: string
  prompt?: string
  options?: string[]
  kind?: string
  points?: number
  correct?: number | null
  timeLimit?: number
  duration?: number
  media?: string
  activate?: 'auto' | 'manual'
  showResults?: boolean
  axes?: { x?: { label?: string; low?: string; high?: string }; y?: { label?: string; low?: string; high?: string } }
}

export function useDeckSlideQuestion(opts: { event?: string; room?: string; base?: string } = {}) {
  const live = useLiveRoom(opts)
  const { active, remainingSec, currentSlide, connected, configured, sessionExpired, rejoinUrl } = live

  const status = computed(() => (active.value as any)?.status ?? null)
  const results = computed(() => active.value?.results ?? [])
  const total = computed(() => active.value?.total ?? 0)

  const isLive = computed(() => status.value === 'live')
  const isLocked = computed(() => status.value === 'locked')
  const isRevealed = computed(() => status.value === 'revealed' || !!(active.value as any)?.show_results)
  const votingOpen = computed(() => isLive.value || isLocked.value)
  const resultsVisible = computed(() => isRevealed.value)

  // For global-top indicator: is the current slide interactive?
  // We keep it simple — presence of active question implies interactive context.
  // Layout-level `interactive:true` is authoritative; this is just the live bit.
  const hasActive = computed(() => !!active.value)

  return {
    // re-export live primitives
    ...live,
    // slide-scoped conveniences
    active,
    results,
    total,
    status,
    remainingSec,
    currentSlide,
    connected,
    configured,
    sessionExpired,
    rejoinUrl,
    isLive,
    isLocked,
    isRevealed,
    votingOpen,
    resultsVisible,
    hasActive,
  }
}

/** Infer kind from layout name when `kind` frontmatter is absent. */
export function inferKind(layout?: string, explicit?: string): string {
  if (explicit) return explicit
  const map: Record<string, string> = {
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
  return map[layout ?? ''] ?? 'poll'
}
