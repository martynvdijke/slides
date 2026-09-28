<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(defineProps<{
  event: string
  base?: string
  results?: boolean
}>(), {
  base: 'http://localhost:6280',
  results: true,
})

interface Result { label: string; count: number }
interface ActiveQ {
  prompt: string
  kind: string
  options: string[]
  results: Result[]
  total: number
  show_results: boolean
}

const active = ref<ActiveQ | null>(null)

const qrSrc = computed(() => `${props.base}/api/events/${props.event}/qr.png`)
const joinUrl = computed(() => `${props.base}/e/${props.event}`)
const streamUrl = computed(() => `${props.base}/api/events/${props.event}/stream`)
const stateUrl = computed(() => `${props.base}/api/events/${props.event}/state`)

let es: EventSource | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function applyState(data: any) {
  active.value = data?.active_question ?? null
}

async function poll() {
  try {
    const r = await fetch(stateUrl.value, { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json()
    applyState(j)
  } catch {}
}

function startPolling() {
  stopPolling()
  poll()
  pollTimer = setInterval(poll, 3000)
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function startSSE() {
  if (typeof EventSource === 'undefined') {
    startPolling()
    return
  }
  try {
    es = new EventSource(streamUrl.value)
    es.addEventListener('state', (e: MessageEvent) => {
      try { applyState(JSON.parse(e.data)) } catch {}
    })
    // also handle plain message without event name
    es.onmessage = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data)
        if (d.active_question !== undefined || d.event !== undefined) applyState(d)
      } catch {}
    }
    es.onerror = () => {
      try { es?.close() } catch {}
      es = null
      startPolling()
    }
  } catch {
    startPolling()
  }
}

function stopSSE() {
  if (es) { try { es.close() } catch {} ; es = null }
}

onMounted(startSSE)
onUnmounted(() => { stopSSE(); stopPolling() })
watch(() => props.event, () => { stopSSE(); stopPolling(); active.value = null; startSSE() })

const maxCount = computed(() => {
  if (!active.value?.results?.length) return 1
  return Math.max(1, ...active.value.results.map(r => r.count))
})
</script>

<template>
  <div class="liveqr">
    <div class="liveqr-card">
      <div class="liveqr-qr">
        <img :src="qrSrc" alt="Join QR code" width="240" height="240" loading="lazy" />
      </div>
      <div class="liveqr-meta">
        <div class="liveqr-url">{{ joinUrl }}</div>
        <div class="liveqr-hint">Scan to join</div>
      </div>
    </div>

    <div v-if="results" class="liveqr-results">
      <template v-if="!active">
        <div class="liveqr-waiting">Waiting for a live question…</div>
      </template>
      <template v-else-if="!active.show_results">
        <div class="liveqr-prompt">{{ active.prompt }}</div>
        <div class="liveqr-waiting">Results hidden</div>
      </template>
      <template v-else>
        <div class="liveqr-prompt">{{ active.prompt }}</div>
        <div class="liveqr-bars">
          <div v-for="r in active.results" :key="r.label" class="liveqr-row">
            <div class="liveqr-label">{{ r.label }}</div>
            <div class="liveqr-track">
              <div class="liveqr-fill" :style="{ width: (r.count / maxCount * 100).toFixed(1) + '%' }"></div>
            </div>
            <div class="liveqr-count">{{ r.count }}</div>
          </div>
        </div>
        <div class="liveqr-total">{{ active.total }} vote{{ active.total === 1 ? '' : 's' }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.liveqr {
  display: flex;
  gap: 22px;
  align-items: flex-start;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 860px;
  margin: 0 auto;
  text-align: left;
}
.liveqr-card {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.12);
  border-top: 3px solid #326CE5;
  border-radius: 16px;
  padding: 18px 20px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8px 28px rgba(0,0,0,0.35);
  min-width: 260px;
}
.liveqr-qr {
  background: #fff;
  border-radius: 10px;
  padding: 8px;
  line-height: 0;
}
.liveqr-qr img {
  width: 240px;
  height: 240px;
  object-fit: contain;
  display: block;
}
.liveqr-meta { margin-top: 10px; text-align: center; }
.liveqr-url {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  color: #cbd5e1;
  word-break: break-all;
}
.liveqr-hint {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-top: 4px;
  font-weight: 700;
}
.liveqr-results {
  flex: 1;
  min-width: 280px;
  max-width: 420px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 16px 18px;
  backdrop-filter: blur(6px);
}
.liveqr-prompt {
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
  line-height: 1.35;
  margin-bottom: 12px;
}
.liveqr-waiting {
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
}
.liveqr-bars { display: flex; flex-direction: column; gap: 8px; }
.liveqr-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 8px;
  align-items: center;
}
.liveqr-label {
  font-size: 13px;
  color: #e2e8f0;
  grid-column: 1;
}
.liveqr-count {
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  min-width: 22px;
  text-align: right;
  grid-column: 2;
  grid-row: 1;
}
.liveqr-track {
  grid-column: 1 / -1;
  height: 8px;
  background: rgba(255,255,255,0.1);
  border-radius: 999px;
  overflow: hidden;
}
.liveqr-fill {
  height: 100%;
  background: linear-gradient(90deg, #326CE5, #38bdf8);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.liveqr-total {
  margin-top: 10px;
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
</style>
