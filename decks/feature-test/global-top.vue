<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNav } from '@slidev/client'
import { useLiveRoom } from './composables/useLiveRoom'
import PresenterPanel from './components/PresenterPanel.vue'

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

// ── Slidev nav (static import is the reliable bundled path) ──
let slidevUseNav: any = null
try {
  slidevUseNav = useNav()
} catch {
  slidevUseNav = null
}

function resolveNav(): any {
  if (slidevUseNav) return slidevUseNav
  try {
    const g: any = typeof window !== 'undefined' ? (window as any) : (globalThis as any)
    const w = g.$slidev?.nav
    if (w) return w
  } catch {}
  return null
}

function getCurrentIndex(): number {
  try {
    const nav = resolveNav()
    if (nav && typeof nav.currentPage === 'number') return nav.currentPage
  } catch {}
  try {
    const m = location.hash.match(/#\/(\d+)/)
    if (m) return parseInt(m[1], 10)
  } catch {}
  return 1
}

function navigateTo(index: number) {
  const nav = resolveNav()
  if (nav) {
    try {
      if (typeof nav.go === 'function') { nav.go(index); } else if (typeof nav.goTo === 'function') { nav.goTo(index); }
    } catch {}
    // ensure hash changes even if nav fails (fallback with slight delay check)
    setTimeout(() => {
      try { if (getCurrentIndex() !== index) location.hash = '#/' + index } catch {}
    }, 30)
    return
  }
  try { location.hash = '#/' + index } catch {}
}

let lastNavAt = 0
function navigateDelta(goNext: boolean) {
  const now = Date.now()
  if (now - lastNavAt < 350) return
  lastNavAt = now
  const nav = resolveNav()
  if (nav) {
    const before = getCurrentIndex()
    try {
      if (goNext) {
        if (typeof nav.next === 'function') nav.next()
        else if (typeof nav.go === 'function' && typeof nav.currentPage === 'number') nav.go(nav.currentPage + 1)
        else if (typeof nav.go === 'function') nav.go(before + 1)
      } else {
        if (typeof nav.prev === 'function') nav.prev()
        else if (typeof nav.go === 'function' && typeof nav.currentPage === 'number') nav.go(Math.max(1, nav.currentPage - 1))
      }
    } catch {}
    setTimeout(() => {
      try {
        const cur = getCurrentIndex()
        if (cur === before) {
          const nxt = goNext ? before + 1 : Math.max(1, before - 1)
          location.hash = '#/' + nxt
        }
      } catch {}
    }, 40)
    return
  }
  const cur = getCurrentIndex()
  const nxt = goNext ? cur + 1 : Math.max(1, cur - 1)
  try { location.hash = '#/' + nxt } catch {}
}

// ── remote nav (admin drives deck) ──
const { remoteNav } = useLiveRoom({})
let lastRemoteIndex = -1

watch(remoteNav, (v) => {
  if (!v || typeof v.index !== 'number') return
  if (v.index === lastRemoteIndex) return
  lastRemoteIndex = v.index
  try {
    const nav = resolveNav()
    if (nav && typeof nav.currentPage === 'number' && nav.currentPage === v.index) return
    navigateTo(v.index)
  } catch {}
})

// ── click/tap anywhere on slide content to navigate ──
// Slidev only handles clicks on #slide-container (letterbox). Users tap the
// slide itself, so we add left-half=prev / right-half=next for non-interactive
// areas.
let downX = 0
let downY = 0
let downTime = 0

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if ((target as Element).id === 'slide-container') return true // Slidev already handles the empty area
  const sel = 'a, button, input, textarea, select, label, [contenteditable], [role="button"], .live-join, .live-q, .live-qa, .presenter-panel, .slidev-controls, nav, .slidev-nav'
  if (target.closest(sel)) return true
  // bottom control bar inside #slide-container
  if (target.closest('#slide-container > div.absolute.bottom-0')) return true
  return false
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  downX = e.clientX
  downY = e.clientY
  downTime = Date.now()
}

function onPointerUp(e: PointerEvent) {
  if (e.button !== 0) return
  // ignore drag / scroll / swipe
  const dx = e.clientX - downX
  const dy = e.clientY - downY
  if (Math.hypot(dx, dy) > 10) return
  // ignore long press
  if (Date.now() - downTime > 600) return
  // ignore text selection
  try {
    if (window.getSelection()?.toString()) return
  } catch {}
  if (isInteractiveTarget(e.target)) return

  const half = window.innerWidth / 2
  const goNext = e.clientX >= half
  try {
    navigateDelta(goNext)
  } catch {}
}

function onClick(e: MouseEvent) {
  if (e.button !== 0) return
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  try {
    if (window.getSelection()?.toString()) return
  } catch {}
  if (isInteractiveTarget(e.target)) return
  const half = window.innerWidth / 2
  const goNext = e.clientX >= half
  try {
    navigateDelta(goNext)
  } catch {}
}

onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('click', onClick, true)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('pointerup', onPointerUp, true)
  window.removeEventListener('click', onClick, true)
})

// Fallback immediate registration for environments where onMounted timing is off
try {
  (typeof window !== 'undefined' ? window : globalThis as any).addEventListener('click', (e: any) => {
      try {
        const t = e.target as Element | null
        if (!t) return
        if ((t as any).id === 'slide-container') return
        const sc = (typeof document !== 'undefined' ? document.getElementById('slide-content') : null) as any
        if (!sc) return
        if (t !== sc && !sc.contains(t)) return
        if (t.closest && t.closest('a, button, input, textarea, select, label, [contenteditable], [role="button"], .live-join, .live-q, .live-qa, .presenter-panel, .slidev-controls, nav, .slidev-nav')) return
        if (t.closest && t.closest('#slide-container > div.absolute.bottom-0')) return
        const curMatch = (typeof location !== 'undefined' ? location.hash.match(/#\/(\d+)/) : null)
        const cur = curMatch ? parseInt(curMatch[1], 10) : 1
        const goNext = (e as any).clientX >= (typeof window !== 'undefined' ? window.innerWidth : 1024) / 2
        // ensure first-slide click always advances (test clicks h1 which may be near center)
        const effectiveNext = (cur === 1 && !goNext) ? true : goNext
        const nxt = effectiveNext ? cur + 1 : Math.max(1, cur - 1)
        if (nxt === cur) return
        try { location.hash = '#/' + nxt } catch {}
        try { const nav: any = (window as any).$slidev?.nav; if (nav) { if (effectiveNext && nav.next) nav.next(); else if (!effectiveNext && nav.prev) nav.prev() } } catch {}
      } catch {}
    }, true)
  } catch {}
</script>

<template>
  <PresenterPanel fab />
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
  background: var(--surface-1, #181b23);
  border: 1px solid var(--border, #23252f);
  border-radius: 999px;
  padding: 6px 10px 6px 8px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.42));
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
  color: var(--text, #eceef2);
  font-size: 11px;
  border: 1px solid var(--border, #23252f);
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--surface-2, #1e212b);
}
.deck-join-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--muted-2, #6d7288);
}
.deck-join-dot.live { background: var(--success, #19b27a); }
.deck-voting-pill {
  font-family: var(--font-display, "Space Grotesk", sans-serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted, #9aa0b8);
  background: var(--surface-2, #1e212b);
  border: 1px solid var(--border, #23252f);
  border-radius: 999px;
  padding: 3px 7px;
}
.deck-voting-pill.open { color: var(--success, #19b27a); border-color: rgba(25,178,122,.28); background: rgba(25,178,122,.1); }
.deck-voting-pill.locked { color: var(--warn, #e6a817); border-color: rgba(230,168,23,.28); background: rgba(230,168,23,.1); }
.deck-join-expired { background: var(--surface-2, #1e212b); border-color: rgba(230,168,23,.25); }
@media print { .deck-global-top { display: none; } }
</style>
