<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useNav } from '@slidev/client'
import { useLiveRoom } from './composables/useLiveRoom'

/**
 * Umami analytics for decks.
 *
 * On GitHub Pages the script URL + website id are baked in at build time from
 * VITE_UMAMI_SCRIPT_URL / VITE_UMAMI_WEBSITE_ID. In the all-in-one container
 * they come from the admin-configured settings, so no rebuild is needed.
 */
onMounted(() => {
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
  fetch(base + '/api/settings/analytics', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.tracking_enabled) inject(j.umami_script_url, j.umami_website_id)
    })
    .catch(() => {
      /* analytics is best-effort */
    })
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
  <span style="display: none" aria-hidden="true" />
</template>
