/**
 * deck-sync.ts — optional Vite dev plugin that watches slides.md and debounces
 * a POST to /api/admin/events/{id}/deck/sync. No-op when env is unset; never
 * crashes a normal build.
 *
 * Usage in vite.config.ts / slidev.config.ts:
 *   import deckSync from './plugins/deck-sync'
 *   export default { vitePlugins: [ deckSync() ] }
 */

export type DeckSyncOptions = {
  slidesPath?: string
  baseUrl?: string
  eventId?: string | number
  deckSlug?: string
  debounceMs?: number
}

function env(k: string, fallback = ''): string {
  try {
    const v = (globalThis as any).process?.env?.[k]
    return v ?? fallback
  } catch { return fallback }
}

export default function deckSync(opts: DeckSyncOptions = {}) {
  const slidesPath = opts.slidesPath ?? env('SLIDES_PATH') ?? 'slides.md'
  const baseUrl = (opts.baseUrl ?? env('DECK_SYNC_BASE_URL') ?? env('VITE_LIVE_BASE_URL') ?? '').replace(/\/+$/,'')
  const eventId = String(opts.eventId ?? env('DECK_SYNC_EVENT_ID') ?? env('VITE_EVENT_ID') ?? env('EVENT_ID') ?? '')
  const debounceMs = opts.debounceMs ?? 900

  let timer: ReturnType<typeof setTimeout> | null = null
  let lastRun = 0

  async function trigger() {
    if (!baseUrl || !eventId) return
    // throttle: at most once per debounceMs
    const now = Date.now()
    if (now - lastRun < debounceMs) return
    lastRun = now
    try {
      const { spawn } = await import('node:child_process')
      // fire-and-forget the node script; inherit env
      const child = spawn(process.execPath, ['templates/deck/scripts/sync-deck.mjs'], {
        env: { ...process.env, SLIDES_PATH: slidesPath, DECK_SYNC_BASE_URL: baseUrl, DECK_SYNC_EVENT_ID: eventId, DECK_SLUG: opts.deckSlug ?? '' },
        stdio: 'inherit',
      })
      child.on('error', () => {})
    } catch {}
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void trigger() }, debounceMs)
  }

  return {
    name: 'deck-sync',
    configureServer(server: any) {
      if (!baseUrl || !eventId) {
        // no-op when not configured
        return
      }
      try {
        server.watcher?.add?.(slidesPath)
        server.watcher?.on?.('change', (p: string) => {
          if (String(p).endsWith('slides.md')) schedule()
        })
      } catch {}
      // also sync once on dev start
      setTimeout(() => void trigger(), 1200)
    },
    // buildStart: optionally sync on `slidev build` (best-effort)
    async buildStart() {
      if (!baseUrl || !eventId) return
      // do not block build on sync failure
      try { await trigger() } catch {}
    },
  }
}
