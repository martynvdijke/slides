<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLiveRoom } from './composables/useLiveRoom'

/**
 * Global top — persists across slides. Shows a compact join hint (QR + code)
 * and, on interactive slides, a live voting indicator.
 * Also handles Umami analytics (best-effort).
 */
const { configured, code, roomCode, active, sessionExpired, rejoinUrl } = useLiveRoom({})

// voting indicator derived from active question
const votingState = computed(() => {
  const a = active.value as any
  if (!a) return null
  if (a.status === 'live') return 'Voting open'
  if (a.status === 'locked') return 'Voting closed'
  if (a.status === 'revealed' || a.show_results) return 'Results visible'
  return 'Results hidden'
})
const showVoting = computed(() => !!active.value && !!aIsInteractive.value)

// Detect interactive slide via frontmatter — SSR-safe, best-effort
const aIsInteractive = ref(false)
const fm = ref<any>(null)
function refreshFm() {
  if (typeof window === 'undefined') return
  try {
    const g: any = (window as any).$slidev?.nav ?? (window as any).__slidev_nav__ ?? null
    const cur = g?.currentSlideRoute?.meta?.slide?.frontmatter ?? g?.currentSlide?.frontmatter ?? null
    fm.value = cur
    aIsInteractive.value = !!(cur && (cur.interactive === true || cur.layout && ['poll','multi','ranking','yesno','rating','nps','open','wordcloud','qa','grid2x2'].includes(String(cur.layout))))
  } catch {
    aIsInteractive.value = false
  }
}
onMounted(() => {
  refreshFm()
  try {
    window.addEventListener('hashchange', refreshFm)
    const iv = setInterval(refreshFm, 800)
    // cleanup via onMounted return? use window unload guard
    if (typeof document !== 'undefined') {
      const obs = new MutationObserver(refreshFm)
      obs.observe(document.documentElement, { subtree: false, childList: false })
    }
  } catch {}

  // Umami (preserved)
  if (typeof document === 'undefined') return
  if (document.querySelector('script[data-umami]')) return
  const env = (import.meta as any).env || {}
  function inject(url?: string, id?: string) {
    if (!url || !id) return
    if (document.querySelector('script[data-umami]')) return
    const s = document.createElement('script')
    s.defer = true
    s.src = url
    s.setAttribute('data-website-id', id)
    s.setAttribute('data-umami', '1')
    document.head.appendChild(s)
  }
  if (env.VITE_UMAMI_SCRIPT_URL && env.VITE_UMAMI_WEBSITE_ID) {
    inject(env.VITE_UMAMI_SCRIPT_URL, env.VITE_UMAMI_WEBSITE_ID)
    return
  }
  const base = String(env.VITE_LIVE_BASE_URL || '').replace(/\/+$/, '')
  if (!base) return
  fetch(base + '/api/settings/analytics', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.tracking_enabled) inject(j.umami_script_url, j.umami_website_id)
    })
    .catch(() => {})
})
</script>

<template>
  <div class="deck-global-top" aria-hidden="false">
    <!-- join hint — only when configured and not on print -->
    <div v-if="configured && !sessionExpired" class="deck-join-hint">
      <span class="deck-join-pill">
        <span class="deck-join-dot" :class="{ live: !!active }"></span>
        <template v-if="roomCode">Room {{ roomCode }}</template>
        <template v-else-if="code">Event {{ code.slice(0,8) }}</template>
        <template v-else>Live</template>
      </span>
      <span v-if="votingState && showVoting" class="deck-voting-pill" :class="{ open: votingState === 'Voting open', locked: votingState === 'Voting closed' }">
        {{ votingState }}
      </span>
    </div>
    <div v-else-if="sessionExpired" class="deck-join-hint deck-join-expired">
      <span class="deck-join-pill" style="color:#fbbf24;border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.12)">Session ended</span>
      <span class="deck-voting-pill">Rejoin at {{ rejoinUrl }}</span>
    </div>
  </div>
</template>

<style scoped>
.deck-global-top {
  position: fixed;
  top: 8px;
  right: 12px;
  z-index: 100;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.deck-join-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface, rgba(15,23,42,0.92));
  border: 1px solid var(--border, rgba(255,255,255,0.14));
  border-radius: 999px;
  padding: 6px 10px 6px 8px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  font-size: 11px;
  pointer-events: auto;
}
.deck-join-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text, #F2F3F8);
  font-size: 11px;
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: 999px;
  padding: 3px 8px;
  background: rgba(255,255,255,0.06);
}
.deck-join-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #64748b;
}
.deck-join-dot.live { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.6); }
.deck-voting-pill {
  font-family: var(--font-display, "Space Grotesk", Inter, sans-serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted, #9AA0B8);
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 999px;
  padding: 3px 7px;
}
.deck-voting-pill.open { color: #86efac; border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.12); }
.deck-voting-pill.locked { color: #fbbf24; border-color: rgba(251,191,36,0.35); background: rgba(251,191,36,0.12); }
.deck-join-expired { background: linear-gradient(135deg, rgba(124,107,255,0.14), rgba(236,72,153,0.08)); border-color: rgba(251,191,36,0.25); }
@media print { .deck-global-top { display: none; } }
</style>
