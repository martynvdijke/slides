<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

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
            {{ copied ? 'Copied' : 'Copy' }}
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
  gap: 22px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  text-align: left;
  background: var(--surface-1, #181b23);
  border: 1px solid var(--border, #23252f);
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.42));
  max-width: 720px;
}
.live-join-qr {
  background: #fff;
  border-radius: 10px;
  padding: 10px;
  line-height: 0;
  border: 1px solid #e2e8f0;
}
.live-join-qr img {
  display: block;
  object-fit: contain;
}
.live-join-meta {
  min-width: 220px;
  flex: 1;
}
.live-join-room-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted, #9aa0b8);
  font-weight: 700;
}
.live-join-room {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 2.75rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: var(--text, #eceef2);
  line-height: 1.1;
  margin: 2px 0 10px;
  font-variant-numeric: tabular-nums;
}
.live-join-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.live-join-url {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 12px;
  color: var(--muted, #9aa0b8);
  word-break: break-all;
}
.live-join-copy {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text, #eceef2);
  background: var(--surface-2, #1e212b);
  border: 1px solid var(--border, #23252f);
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  transition: background .15s var(--ease, ease), border-color .15s var(--ease, ease);
  white-space: nowrap;
}
.live-join-copy:hover { background: var(--surface-3, #272b36); border-color: var(--border-2, #2c2f3a); }
.live-join-copy:active { transform: scale(.97); }
.live-join-copy:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-ring, rgba(79,124,255,.34)); }
.live-join-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted, #9aa0b8);
  max-width: 300px;
  line-height: 1.45;
}
.live-join-join {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  color: var(--accent, #4f7cff);
  font-weight: 600;
}
.live-join-setup {
  padding: 6px 2px;
}
.live-join-setup-title {
  font-family: var(--font-display, "Space Grotesk", sans-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--text, #eceef2);
  margin-bottom: 6px;
  letter-spacing: -0.02em;
}
.live-join-setup-hint {
  font-size: 12.5px;
  color: var(--muted, #9aa0b8);
  max-width: 420px;
  line-height: 1.5;
}
.live-join-setup-hint code {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  color: var(--accent, #4f7cff);
  font-size: 11.5px;
}
.live-join-expired {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted, #9aa0b8);
  background: var(--surface-2, #1e212b);
  border: 1px solid rgba(230,168,23,.28);
  border-radius: 10px;
  padding: 8px 11px;
  margin-bottom: 2px;
  width: 100%;
}
.live-join-expired-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--warn, #e6a817);
  background: rgba(230,168,23,.14);
  border: 1px solid rgba(230,168,23,.28);
  border-radius: 999px;
  padding: 2px 7px;
}
.live-join-expired-text { flex: 1; min-width: 180px; }
</style>
