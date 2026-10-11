<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

/**
 * PresenterPanel — author and drive live questions from inside the slides.
 *
 * Not shown to the audience: press the hotkey (default "p") to toggle it, or
 * embed `<PresenterPanel :open="true" />` on a dedicated presenter slide.
 *
 * Same-origin (the all-in-one Go container) it uses the admin session cookie.
 * On GitHub Pages, point `base` at the hosted backend; sign in once — the
 * backend must allowlist the Pages origin via CORS_ORIGINS.
 */
const props = withDefaults(defineProps<{
  event?: string
  room?: string
  base?: string
  open?: boolean
  hotkey?: string
  fab?: boolean
}>(), {
  event: '',
  room: '',
  base: '',
  open: false,
  hotkey: 'p',
  fab: false,
})

const { event: liveEvent, active, configured, leaderboard, roomCode, code, staticMode, sendSlide } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

function env(key: string): string {
  try {
    return (import.meta as any).env?.[key] || ''
  } catch {
    return ''
  }
}

const baseUrl = computed(() => props.base || env('VITE_LIVE_BASE_URL'))

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers)
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const r = await fetch(trimSlash(baseUrl.value) + path, { credentials: 'include', ...init, headers })
  const text = await r.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!r.ok) throw new Error((data && (data.error || data.message)) || 'HTTP ' + r.status)
  return data
}

// ── panel visibility ──
const open = ref(props.open)
watch(() => props.open, (v) => { open.value = v })

// ── countdown clock ──
const nowMs = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

function onKeydown(e: KeyboardEvent) {
  if (!props.hotkey) return
  const target = e.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
  if (e.key.toLowerCase() === props.hotkey.toLowerCase() && !e.metaKey && !e.ctrlKey && !e.altKey) {
    open.value = !open.value
  }
}
onMounted(() => {
  if (staticMode.value) return
  window.addEventListener('keydown', onKeydown)
  clockTimer = setInterval(() => { nowMs.value = Date.now() }, 250)
  void checkAuth()
  startSlideWatcher()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stopSlideWatcher()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (clockTimer) clearInterval(clockTimer)
  clockTimer = null
})

// ── auth ──
const checkingAuth = ref(true)
const authed = ref(false)
const username = ref('')
const password = ref('')

async function checkAuth() {
  checkingAuth.value = true
  try {
    const me = await api('/api/auth/me')
    authed.value = !!(me && (me.user || me.username || me.authenticated || me.id))
  } catch {
    authed.value = false
  } finally {
    checkingAuth.value = false
    if (authed.value) void fetchQueue()
  }
}

async function login() {
  busy.value = true
  error.value = ''
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    authed.value = true
    password.value = ''
    void fetchQueue()
  } catch (e: any) {
    error.value = e?.message || 'Sign in failed'
  } finally {
    busy.value = false
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
  authed.value = false
}

// ── compose ──
const optionKinds = ['poll', 'multi', 'ranking']
const kinds = [
  { value: 'poll', label: 'Poll (pick one)' },
  { value: 'multi', label: 'Multi-select' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'yesno', label: 'Yes / No' },
  { value: 'rating', label: 'Rating' },
  { value: 'nps', label: 'NPS (0–10)' },
  { value: 'open', label: 'Open text' },
  { value: 'wordcloud', label: 'Word cloud' },
]

const kind = ref('poll')
const prompt = ref('')
const optionsText = ref('')
const showResults = ref(true)
const isFeedback = ref(false)
const timeLimitS = ref<number | ''>('')
const mediaUrlVal = ref('')
const mediaTypeVal = ref('')
const mediaFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')
const message = ref('')

// duration + auto-reveal
const durationSec = ref(0)
const autoReveal = ref(false)
const durationOptions = [
  { value: 0, label: 'Untimed' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '60s' },
  { value: 90, label: '90s' },
  { value: 120, label: '120s' },
  { value: 180, label: '180s' },
]

// ── scoring (poll / yesno) ──
const correctIndex = ref<number | null>(null)
const pointsBase = ref(100)
const scoringBusy = ref(false)
const isScorableActive = computed(() => active.value && (active.value.kind === 'poll' || active.value.kind === 'yesno'))
const activeOptions = computed(() => active.value?.options ?? [])
watch(active, (a) => {
  if (!a) { correctIndex.value = null; return }
  if (a.correct_index !== undefined && a.correct_index !== null) correctIndex.value = a.correct_index as number
  else correctIndex.value = null
  if (typeof a.points_base === 'number') pointsBase.value = a.points_base
})
async function saveScoring() {
  const id = active.value?.id
  if (!id || !eventId.value) return
  scoringBusy.value = true
  error.value = ''
  try {
    await api('/api/admin/events/' + eventId.value + '/questions/' + id, {
      method: 'PATCH',
      body: JSON.stringify({
        correct_index: correctIndex.value,
        points_base: pointsBase.value,
      }),
    })
    message.value = 'Scoring updated.'
  } catch (e: any) {
    error.value = e?.message || 'Failed to save scoring'
  } finally {
    scoringBusy.value = false
  }
}

const needsOptions = computed(() => optionKinds.includes(kind.value))
const parsedOptions = computed(() =>
  needsOptions.value
    ? optionsText.value.split(',').map(s => s.trim()).filter(Boolean)
    : [],
)
const eventId = computed(() => liveEvent.value?.id || 0)
const previewSrc = computed(() => {
  if (mediaFile.value && mediaTypeVal.value === 'image') return URL.createObjectURL(mediaFile.value)
  if (!mediaUrlVal.value) return ''
  if (/^https?:\/\//.test(mediaUrlVal.value)) return mediaUrlVal.value
  return trimSlash(baseUrl.value) + (mediaUrlVal.value.startsWith('/') ? mediaUrlVal.value : '/' + mediaUrlVal.value)
})

// ── countdown ──
const activeDeadline = computed<number | null>(() => {
  const a = active.value
  if (!a) return null
  if (typeof a.deadline_at === 'number' && a.deadline_at > 0) return a.deadline_at
  if (typeof a.time_limit_s === 'number' && a.time_limit_s > 0 && typeof a.activated_at === 'number' && a.activated_at > 0) {
    return a.activated_at + a.time_limit_s * 1000
  }
  return null
})
const activeRemaining = computed<number | null>(() => {
  const d = activeDeadline.value
  if (d === null) return null
  return Math.max(0, Math.ceil((d - nowMs.value) / 1000))
})

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] || null
  mediaFile.value = f
  if (f) mediaTypeVal.value = f.type.startsWith('video/') ? 'video' : 'image'
}

function clearMedia() {
  mediaFile.value = null
  mediaUrlVal.value = ''
  mediaTypeVal.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

async function upload(): Promise<{ url: string; media_type: string }> {
  const f = mediaFile.value
  if (!f) return { url: mediaUrlVal.value, media_type: mediaTypeVal.value }
  const fd = new FormData()
  fd.append('file', f)
  const r = await fetch(
    trimSlash(baseUrl.value) + '/api/admin/events/' + eventId.value + '/questions/media',
    { method: 'POST', credentials: 'include', body: fd },
  )
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && (j.error || j.message)) || 'Upload failed')
  return { url: j.url, media_type: j.media_type }
}

async function submit(activate: boolean) {
  error.value = ''
  message.value = ''
  if (!eventId.value) { error.value = 'No event resolved yet — set a room or event code.'; return }
  if (!prompt.value.trim()) { error.value = 'Write a prompt first.'; return }
  if (needsOptions.value && parsedOptions.value.length < 2) { error.value = 'Add at least two options (comma-separated).'; return }
  busy.value = true
  try {
    let media = { url: mediaUrlVal.value, media_type: mediaTypeVal.value }
    if (mediaFile.value) {
      media = await upload()
      mediaUrlVal.value = media.url
      mediaTypeVal.value = media.media_type
    }
    const q = await api('/api/admin/events/' + eventId.value + '/questions', {
      method: 'POST',
      body: JSON.stringify({
        kind: kind.value,
        mode: 'live',
        prompt: prompt.value.trim(),
        options: parsedOptions.value,
        is_feedback: isFeedback.value,
        show_results: showResults.value,
        time_limit_s: typeof timeLimitS.value === 'number' && timeLimitS.value > 0 ? Math.floor(timeLimitS.value) : 0,
        media_url: media.url,
        media_type: media.media_type,
        duration_sec: durationSec.value,
        auto_close: durationSec.value > 0 ? 1 : 0,
        auto_reveal: autoReveal.value ? 1 : 0,
      }),
    })
    if (activate && q && q.id) {
      const body: any = {}
      if (durationSec.value > 0) body.duration_sec = durationSec.value
      await api('/api/admin/events/' + eventId.value + '/questions/' + q.id + '/activate', { method: 'POST', body: Object.keys(body).length ? JSON.stringify(body) : undefined })
      message.value = 'Question is live.'
    } else {
      message.value = 'Question created (draft).'
    }
    void fetchQueue()
    prompt.value = ''
    optionsText.value = ''
    timeLimitS.value = ''
    clearMedia()
  } catch (e: any) {
    error.value = e?.message || 'Failed to create question'
  } finally {
    busy.value = false
  }
}

async function closeActive() {
  const id = active.value?.id
  if (!id || !eventId.value) return
  error.value = ''
  busy.value = true
  try {
    await api('/api/admin/events/' + eventId.value + '/questions/' + id + '/close', { method: 'POST' })
    message.value = 'Question closed.'
    void fetchQueue()
  } catch (e: any) {
    error.value = e?.message || 'Failed to close question'
  } finally {
    busy.value = false
  }
}

// ── queue ──
const queueLength = ref(0)
const nextBusy = ref(false)

async function fetchQueue() {
  if (!authed.value || !eventId.value) { queueLength.value = 0; return }
  try {
    const data = await api('/api/admin/events/' + eventId.value + '/questions')
    const list = Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : [])
    // count drafts
    const drafts = list.filter((q: any) => q.status === 'draft' || q.status === undefined)
    queueLength.value = drafts.length
  } catch {
    // degrade silently
  }
}

watch([eventId, authed], () => { void fetchQueue() })

async function nextQuestion() {
  if (!eventId.value || nextBusy.value) return
  nextBusy.value = true
  error.value = ''
  try {
    await api('/api/admin/events/' + eventId.value + '/questions/next', { method: 'POST', body: JSON.stringify({}) })
    message.value = 'Next question is live.'
    void fetchQueue()
  } catch (e: any) {
    error.value = e?.message || 'Failed to advance queue'
  } finally {
    nextBusy.value = false
  }
}

// ── slide sync ──
let slidePoll: ReturnType<typeof setInterval> | null = null
let lastSlideIndex = -1
let slidevNav: any = null

function getSlideSnapshot(): { index: number; total: number; title: string } | null {
  try {
    const g: any = typeof window !== 'undefined' ? (window as any) : (globalThis as any)
    const nav = slidevNav ?? g.$slidev?.nav ?? g.__slidev_nav__ ?? null
    if (nav && typeof nav.currentPage === 'number') {
      const total = nav.total ?? nav.slides?.length ?? (nav.slides?.value?.length) ?? 0
      const title = nav.currentSlideRoute?.meta?.slide?.title ?? nav.currentSlide?.title ?? nav.currentSlideRoute?.value?.meta?.slide?.title ?? ''
      return { index: nav.currentPage, total: total || 1, title: String(title || '') }
    }
    if (typeof location !== 'undefined') {
      const hash = location.hash || ''
      const m = hash.match(/#\/?(\d+)/)
      if (m) {
        const idx = parseInt(m[1], 10)
        if (!isNaN(idx)) return { index: idx, total: 1, title: '' }
      }
      // try path like /5
      const path = location.pathname || ''
      const pm = path.match(/\/(\d+)(?:\/|$)/)
      if (pm) {
        const idx = parseInt(pm[1], 10)
        if (!isNaN(idx) && idx > 0 && idx < 500) return { index: idx, total: 1, title: document.title || '' }
      }
    }
  } catch {}
  return null
}

function maybeSendSlide() {
  if (!authed.value || staticMode.value || !configured.value) return
  const snap = getSlideSnapshot()
  if (!snap) return
  if (snap.index === lastSlideIndex) return
  lastSlideIndex = snap.index
  // sendSlide is already throttled ~200ms internally
  try { sendSlide(snap.index, snap.total, snap.title) } catch {}
}

function startSlideWatcher() {
  if (staticMode.value) return
  // try to capture slidev nav early
  try {
    const g: any = typeof window !== 'undefined' ? (window as any) : (globalThis as any)
    slidevNav = g.$slidev?.nav ?? null
    if (!slidevNav) {
      import('@slidev/client' as any).then((m: any) => {
        try {
          const n = m.useNav?.()
          if (n) slidevNav = n
          else if (m.nav) slidevNav = m.nav
        } catch {}
      }).catch(() => {})
    }
    // watch slidev nav currentPage reactively if available
    if (slidevNav) {
      watch(() => slidevNav.currentPage, () => { maybeSendSlide() })
    }
  } catch {}
  // polling fallback + hash change listener
  try { window.addEventListener('hashchange', maybeSendSlide) } catch {}
  slidePoll = setInterval(maybeSendSlide, 800)
}

function stopSlideWatcher() {
  if (slidePoll) clearInterval(slidePoll)
  slidePoll = null
  try { window.removeEventListener('hashchange', maybeSendSlide) } catch {}
}

watch(authed, (v) => { if (v) maybeSendSlide() })
watch(open, (v) => { if (v && authed.value) maybeSendSlide() })

async function revealActive() {
  const id = active.value?.id
  if (!id || !eventId.value) return
  error.value = ''
  busy.value = true
  try {
    await api('/api/admin/events/' + eventId.value + '/questions/' + id + '/reveal', { method: 'POST' })
    message.value = 'Correct answer revealed.'
  } catch (e: any) {
    error.value = e?.message || 'Failed to reveal question'
  } finally {
    busy.value = false
  }
}

async function togglePodium() {
  if (!eventId.value) return
  const show = !liveEvent.value?.show_podium
  error.value = ''
  busy.value = true
  try {
    await api('/api/admin/events/' + eventId.value + '/podium', {
      method: 'POST',
      body: JSON.stringify({ show }),
    })
    message.value = show ? 'Podium shown.' : 'Podium hidden.'
  } catch (e: any) {
    error.value = e?.message || 'Failed to update podium'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="!staticMode && open" class="pp-overlay" role="dialog" aria-label="Presenter panel">
    <div class="pp-panel">
      <div class="pp-head">
        <div class="pp-title">Presenter panel</div>
        <div class="pp-head-right">
          <span class="pp-status" :class="{ ok: configured }">
            {{ configured ? (roomCode ? 'room ' + roomCode : 'event ' + code) : 'no room set' }}
          </span>
          <button class="pp-x" type="button" @click="open = false" aria-label="Close">×</button>
        </div>
      </div>

      <div v-if="checkingAuth" class="pp-note">Checking sign-in…</div>

      <div v-else-if="!authed" class="pp-auth">
        <div class="pp-note">Sign in to the admin backend to ask questions.</div>
        <input v-model="username" class="pp-input" placeholder="Username" autocomplete="username" />
        <input v-model="password" class="pp-input" type="password" placeholder="Password" autocomplete="current-password" @keyup.enter="login" />
        <button class="pp-btn primary" type="button" :disabled="busy" @click="login">Sign in</button>
        <div class="pp-hint">The deck must be served by the backend, or the backend must allowlist this origin in <code>CORS_ORIGINS</code>.</div>
      </div>

      <template v-else>
        <div class="pp-row">
          <select v-model="kind" class="pp-input">
            <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
          <label class="pp-check"><input v-model="showResults" type="checkbox" /> show results</label>
          <label class="pp-check"><input v-model="isFeedback" type="checkbox" /> feedback</label>
        </div>

        <div class="pp-row">
          <label class="pp-score-label" style="min-width:70px">Timer</label>
          <select v-model.number="durationSec" class="pp-input pp-input-sm" style="max-width:130px">
            <option v-for="o in durationOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <label class="pp-check"><input v-model="autoReveal" type="checkbox" /> auto-reveal</label>
        </div>

        <textarea v-model="prompt" class="pp-input pp-textarea" rows="2" placeholder="Ask the room…" />

        <input v-if="needsOptions" v-model="optionsText" class="pp-input" placeholder="Options, comma-separated" />

        <div class="pp-row">
          <label class="pp-check" for="pp-timelimit">Time limit (s, 0 = untimed)</label>
          <input id="pp-timelimit" v-model.number="timeLimitS" type="number" min="0" max="3600" step="5" class="pp-input pp-input-sm pp-time" placeholder="0" />
        </div>

        <div class="pp-media">
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm" @change="onFile" />
          <input v-model="mediaUrlVal" class="pp-input" placeholder="…or paste an image/video URL" />
          <button v-if="mediaFile || mediaUrlVal" class="pp-btn ghost" type="button" @click="clearMedia">clear media</button>
        </div>
        <img v-if="previewSrc && mediaTypeVal === 'image'" :src="previewSrc" class="pp-preview" alt="media preview" />
        <video v-else-if="previewSrc && mediaTypeVal === 'video'" :src="previewSrc" class="pp-preview" controls muted />

        <div class="pp-actions">
          <button class="pp-btn primary" type="button" :disabled="busy" @click="submit(true)">Ask now</button>
          <button class="pp-btn" type="button" :disabled="busy" @click="submit(false)">Save draft</button>
          <button v-if="active && (active.status === 'live' || active.status === 'locked')" class="pp-btn" type="button" :disabled="busy" @click="revealActive">Reveal</button>
          <button v-if="active" class="pp-btn danger" type="button" :disabled="busy" @click="closeActive">Close current</button>
          <button class="pp-btn next-btn" type="button" :disabled="nextBusy || !queueLength" :title="queueLength ? queueLength + ' in queue' : 'Queue empty'" @click="nextQuestion">
            Next <span v-if="queueLength" class="pp-badge">{{ queueLength }}</span>
          </button>
          <button class="pp-btn" type="button" :disabled="busy || !eventId" @click="togglePodium">{{ liveEvent?.show_podium ? 'Hide podium' : 'Show podium' }}</button>
        </div>
        <div v-if="!queueLength" class="pp-hint">Queue empty — save a draft first.</div>
        <div class="pp-active" v-if="active">
          <span class="pp-live-dot" :class="{ locked: active.status !== 'live' }"></span> {{ active.status }}: {{ active.prompt }} · {{ active.total }} {{ active.total === 1 ? 'answer' : 'answers' }}
          <span v-if="activeRemaining !== null && active.status === 'live'" class="pp-countdown">⏱ {{ activeRemaining }}s</span>
          <span v-else-if="active.status === 'locked'" class="pp-countdown">⏱ locked</span>
        </div>

        <div v-if="isScorableActive" class="pp-score">
          <div class="pp-score-title">Quiz scoring</div>
          <div class="pp-score-row">
            <label class="pp-score-label">Correct answer</label>
            <select v-model="correctIndex" class="pp-input pp-input-sm">
              <option :value="null">— none —</option>
              <option v-if="active?.kind === 'yesno'" :value="0">Yes</option>
              <option v-if="active?.kind === 'yesno'" :value="1">No</option>
              <template v-if="active?.kind === 'poll'">
                <option v-for="(o, i) in activeOptions" :key="i" :value="i">{{ o }}</option>
              </template>
            </select>
          </div>
          <div class="pp-score-row">
            <label class="pp-score-label">Points</label>
            <input v-model.number="pointsBase" type="number" min="10" max="1000" step="10" class="pp-input pp-input-sm pp-score-points" />
            <button class="pp-btn" type="button" :disabled="scoringBusy" @click="saveScoring">Save</button>
          </div>
          <div class="pp-hint">Speed bonus: faster correct answers earn more (up to base points).</div>
        </div>

        <div v-if="leaderboard && leaderboard.length" class="pp-lb">
          <div class="pp-lb-title">Leaderboard</div>
          <ol class="pp-lb-list">
            <li v-for="e in leaderboard.slice(0, 5)" :key="e.rank" class="pp-lb-row">
              <span class="pp-lb-rank">{{ e.rank }}</span>
              <span class="pp-lb-avatar" :style="{ background: e.color }">{{ e.emoji }}</span>
              <span class="pp-lb-name">{{ e.name }}</span>
              <span class="pp-lb-pts">{{ e.points }}</span>
            </li>
          </ol>
        </div>
        <div v-else-if="leaderboard" class="pp-lb-empty">No scores yet.</div>

        <div v-if="message" class="pp-msg">{{ message }}</div>
        <div v-if="error" class="pp-err">{{ error }}</div>
        <button class="pp-btn ghost pp-signout" type="button" @click="logout">Sign out</button>
      </template>
    </div>
  </div>

  <button v-if="!staticMode && !open && fab" class="pp-fab" type="button" @click="open = true" title="Presenter panel">▶</button>
</template>

<style scoped>
.pp-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  padding: 16px;
}
.pp-panel {
  width: min(440px, 100%);
  overflow-y: auto;
  background: #0b1220;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  padding: 16px;
  color: #e2e8f0;
  font-size: 13px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pp-title { font-weight: 800; font-size: 15px; }
.pp-head-right { display: flex; align-items: center; gap: 8px; }
.pp-status {
  font-size: 11px;
  color: #f59e0b;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
.pp-status.ok { color: #38bdf8; }
.pp-x {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.pp-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 9px;
  padding: 8px 10px;
  color: #e2e8f0;
  font: inherit;
}
.pp-textarea { resize: vertical; }
.pp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pp-check { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #cbd5e1; }
.pp-media { display: flex; flex-direction: column; gap: 8px; }
.pp-media input[type='file'] { font-size: 12px; color: #94a3b8; }
.pp-preview { max-height: 150px; max-width: 100%; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); }
.pp-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pp-btn {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border-radius: 9px;
  padding: 7px 12px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.pp-btn.primary { background: #326ce5; border-color: #326ce5; color: #fff; }
.pp-btn.danger { background: rgba(239, 68, 68, 0.18); border-color: rgba(239, 68, 68, 0.5); }
.pp-btn.ghost { background: transparent; }
.pp-btn:disabled { opacity: 0.55; cursor: default; }
.pp-note, .pp-hint { color: #94a3b8; font-size: 12px; }
.pp-hint code, .pp-active { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.pp-auth { display: flex; flex-direction: column; gap: 8px; }
.pp-active { font-size: 12px; color: #93c5fd; }
.pp-live-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #ef4444;
  margin-right: 6px;
}
.pp-live-dot.locked { background: #f59e0b; }
.pp-countdown { font-family: 'JetBrains Mono', ui-monospace, monospace; color: #fbbf24; margin-left: 6px; }
.pp-time { max-width: 90px; }
.pp-msg { color: #4ade80; font-size: 12px; }
.pp-err { color: #fca5a5; font-size: 12px; }
.pp-signout { align-self: flex-start; }
.pp-fab {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 2147482000;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(15, 23, 42, 0.55);
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.25;
}
.pp-score { border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; background: rgba(255,255,255,0.04); display: flex; flex-direction: column; gap: 8px; }
.pp-score-title, .pp-lb-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; font-weight: 700; }
.pp-score-row { display: flex; align-items: center; gap: 8px; }
.pp-score-label { font-size: 12px; color: #cbd5e1; min-width: 110px; }
.pp-input-sm { padding: 6px 8px; font-size: 13px; }
.pp-score-points { max-width: 90px; }
.pp-lb { border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; background: rgba(255,255,255,0.03); }
.pp-lb-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.pp-lb-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.pp-lb-rank { font-family: 'JetBrains Mono', monospace; color: #94a3b8; min-width: 16px; text-align: right; }
.pp-lb-avatar { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; border: 1px solid rgba(255,255,255,0.18); }
.pp-lb-name { flex: 1; color: #e2e8f0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-lb-pts { font-family: 'JetBrains Mono', monospace; color: #38bdf8; font-weight: 700; }
.pp-lb-empty { font-size: 12px; color: #64748b; font-style: italic; }
.pp-fab:hover { opacity: 1; }
.next-btn { position: relative; }
.pp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #38bdf8;
  color: #0b1220;
  font-size: 11px;
  font-weight: 800;
  margin-left: 6px;
}
</style>
