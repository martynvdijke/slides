<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

/**
 * Join card: QR code, the short room code and the join URL.
 * Works offline — it always renders, and only the live questions need the
 * server to be reachable.
 *
 * Set the room with the `room` prop (short code), the `event` prop (full
 * event code), or VITE_ROOM_CODE / VITE_EVENT_CODE at build time.
 */
const props = withDefaults(defineProps<{
  event?: string
  room?: string
  base?: string
  size?: number
  hint?: boolean
}>(), {
  event: '',
  room: '',
  base: '',
  size: 240,
  hint: true,
})

const { qrSrc, joinUrl, joinPageUrl, roomCode, configured, staticMode, sessionExpired, rejoinUrl } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const displayRoom = computed(() => props.room || roomCode.value)
const shortUrl = computed(() => joinUrl.value.replace(/^https?:\/\//, ''))
const shortJoinPage = computed(() => joinPageUrl.value.replace(/^https?:\/\//, ''))

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function copyLink() {
  const url = joinUrl.value
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // fallback — select-and-copy
    try {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {}
  }
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 1600)
}
</script>

<template>
  <div v-if="!staticMode || configured" class="live-join">
    <template v-if="!configured">
      <div class="live-join-setup">
        <div class="live-join-setup-title">Live questions not configured</div>
        <div class="live-join-setup-hint">
          Pass <code>room="AB2C3"</code> / <code>event="my-event-code"</code> to this component,
          or set <code>VITE_ROOM_CODE</code> / <code>VITE_EVENT_CODE</code> when building the deck.
        </div>
      </div>
    </template>

    <template v-else>
      <div v-if="sessionExpired" class="live-join-expired" role="status" aria-live="polite">
        <span class="live-join-expired-badge">Session ended</span>
        <span class="live-join-expired-text">Rejoin at <strong>{{ rejoinUrl || shortUrl }}</strong> — scan the QR again on your phone.</span>
      </div>
      <div class="live-join-qr">
        <img :src="qrSrc" alt="Scan to join" :width="size" :height="size" loading="lazy" />
      </div>
      <div class="live-join-meta">
        <div v-if="displayRoom" class="live-join-room-label">Room code</div>
        <div v-if="displayRoom" class="live-join-room">{{ displayRoom }}</div>
        <div class="live-join-url-row">
          <span class="live-join-url">{{ shortUrl }}</span>
          <button
            class="live-join-copy"
            type="button"
            :aria-label="copied ? 'Copied' : 'Copy join link'"
            :aria-live="copied ? 'polite' : undefined"
            @click="copyLink"
          >
            {{ copied ? 'Copied ✓' : 'Copy' }}
          </button>
        </div>
        <div v-if="hint" class="live-join-hint">
          Scan, or visit <span class="live-join-join">{{ shortJoinPage }}</span> and enter the code
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.live-join {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  text-align: left;
  background: var(--surface, #0f172a);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-top: 3px solid var(--accent, var(--k8s-blue, #7C6BFF));
  border-radius: var(--radius-card, 16px);
  padding: 18px 22px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  max-width: 720px;
}
.live-join-qr {
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  line-height: 0;
}
.live-join-qr img {
  display: block;
  object-fit: contain;
}
.live-join-meta {
  min-width: 200px;
}
.live-join-room-label {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted, #94a3b8);
  font-weight: 700;
}
.live-join-room {
  font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
  font-size: 2.6rem;
  font-weight: 800;
  letter-spacing: 0.28em;
  color: var(--text, #F2F3F8);
  line-height: 1.1;
  margin: 2px 0 10px;
}
.live-join-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.live-join-url {
  font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
  font-size: 12px;
  color: var(--muted, #cbd5e1);
  word-break: break-all;
}
.live-join-copy {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text, #F2F3F8);
  background: rgba(255,255,255,0.08);
  border: 1px solid var(--border, rgba(255,255,255,0.14));
  border-radius: 999px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.12s;
  white-space: nowrap;
}
.live-join-copy:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.20); }
.live-join-copy:active { transform: scale(0.96); }
.live-join-copy:focus-visible { outline: 2px solid var(--accent, #7C6BFF); outline-offset: 2px; }
.live-join-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted, #94a3b8);
  max-width: 280px;
}
.live-join-join {
  font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
  color: #93c5fd;
}
.live-join-setup {
  padding: 6px 2px;
}
.live-join-setup-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text, #F2F3F8);
  margin-bottom: 6px;
}
.live-join-setup-hint {
  font-size: 12.5px;
  color: var(--muted, #94a3b8);
  max-width: 420px;
  line-height: 1.5;
}
.live-join-setup-hint code {
  font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
  color: #93c5fd;
}
.live-join-expired {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted, #9AA0B8);
  background: linear-gradient(135deg, rgba(124,107,255,0.12), rgba(236,72,153,0.06));
  border: 1px solid rgba(251,191,36,0.22);
  border-radius: 10px;
  padding: 8px 11px;
  margin-bottom: 2px;
  width: 100%;
}
.live-join-expired-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fbbf24;
  background: rgba(251,191,36,0.14);
  border: 1px solid rgba(251,191,36,0.28);
  border-radius: 999px;
  padding: 2px 7px;
}
.live-join-expired-text { flex: 1; min-width: 180px; }
</style>
