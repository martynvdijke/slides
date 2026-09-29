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

const { event: liveEvent, active, configured } = useLiveRoom({
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

function onKeydown(e: KeyboardEvent) {
  if (!props.hotkey) return
  const target = e.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
  if (e.key.toLowerCase() === props.hotkey.toLowerCase() && !e.metaKey && !e.ctrlKey && !e.altKey) {
    open.value = !open.value
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void checkAuth()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

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
const mediaUrlVal = ref('')
const mediaTypeVal = ref('')
const mediaFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')
const message = ref('')

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
        media_url: media.url,
        media_type: media.media_type,
      }),
    })
    if (activate && q && q.id) {
      await api('/api/admin/events/' + eventId.value + '/questions/' + q.id + '/activate', { method: 'POST' })
      message.value = 'Question is live.'
    } else {
      message.value = 'Question created (draft).'
    }
    prompt.value = ''
    optionsText.value = ''
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
  } catch (e: any) {
    error.value = e?.message || 'Failed to close question'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="pp-overlay" role="dialog" aria-label="Presenter panel">
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

        <textarea v-model="prompt" class="pp-input pp-textarea" rows="2" placeholder="Ask the room…" />

        <input v-if="needsOptions" v-model="optionsText" class="pp-input" placeholder="Options, comma-separated" />

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
          <button v-if="active" class="pp-btn danger" type="button" :disabled="busy" @click="closeActive">Close current</button>
        </div>
        <div class="pp-active" v-if="active">
          <span class="pp-live-dot"></span> live: {{ active.prompt }} · {{ active.total }} {{ active.total === 1 ? 'answer' : 'answers' }}
        </div>
        <div v-if="message" class="pp-msg">{{ message }}</div>
        <div v-if="error" class="pp-err">{{ error }}</div>
        <button class="pp-btn ghost pp-signout" type="button" @click="logout">Sign out</button>
      </template>
    </div>
  </div>

  <button v-if="!open && fab" class="pp-fab" type="button" @click="open = true" title="Presenter panel">▶</button>
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
.pp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
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
.pp-fab:hover { opacity: 1; }
</style>
