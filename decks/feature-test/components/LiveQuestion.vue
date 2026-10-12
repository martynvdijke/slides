<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

const props = withDefaults(defineProps<{
  event?: string
  room?: string
  base?: string
  showResults?: boolean
}>(), {
  event: '',
  room: '',
  base: '',
  showResults: true,
})

const { active, connected, configured, staticMode, mediaUrl, answerResult, remainingSec, deadlineAt, sessionExpired, rejoinUrl } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const nowMs = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { clockTimer = setInterval(() => { nowMs.value = Date.now() }, 250) })
onUnmounted(() => { if (clockTimer) clearInterval(clockTimer); clockTimer = null })

const isImage = computed(() => (active.value?.media_type || '').startsWith('image'))
const isVideo = computed(() => (active.value?.media_type || '').startsWith('video'))
const revealVisible = computed(() => {
  const a = active.value
  if (!a) return false
  if (a.status === 'locked') return false
  return a.status === 'revealed' || !!a.show_results
})
const isLocked = computed(() => {
  const a = active.value
  if (!a) return false
  if (a.status === 'locked') return true
  return a.status === 'live' && deadlineAt.value !== null && nowMs.value >= deadlineAt.value
})
const remaining = computed<number | null>(() => {
  const d = deadlineAt.value
  if (d === null || active.value?.status !== 'live') return null
  return Math.max(0, Math.ceil((d - nowMs.value) / 1000))
})
const showBars = computed(() => props.showResults && revealVisible.value)

const correctIndex = computed(() => {
  const v = (active.value as any)?.correct_index
  return typeof v === 'number' ? v : null
})
const correctLabel = computed(() => {
  if (correctIndex.value === null || !active.value?.options) return ''
  return active.value.options[correctIndex.value] ?? ''
})
const isCorrect = computed(() => {
  if ((active.value as any)?.my_correct !== undefined) return (active.value as any).my_correct
  return answerResult.value?.is_correct ?? null
})
const myPoints = computed(() => (active.value as any)?.my_points ?? answerResult.value?.points_awarded ?? null)

const hasCountdown = computed(() => remainingSec.value !== null && remainingSec.value !== undefined)
const expired = computed(() => hasCountdown.value && remainingSec.value === 0)
const countdownLabel = computed(() => {
  if (remainingSec.value === null || remainingSec.value === undefined) return ''
  const s = Math.max(0, remainingSec.value)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`
})

const maxCount = computed(() => {
  const results = active.value?.results || []
  if (!results.length) return 1
  return Math.max(1, ...results.map(r => r.count))
})

function barWidth(count: number): string {
  return ((count / maxCount.value) * 100).toFixed(1) + '%'
}

function isRanking(kind?: string): boolean {
  return kind === 'ranking'
}
function isCorrectRow(label: string, idx: number): boolean {
  if (correctIndex.value === null || !showBars.value) return false
  if (active.value?.kind === 'yesno') {
    return label.toLowerCase() === (correctLabel.value || '').toLowerCase()
  }
  return idx === correctIndex.value
}
</script>

<template>
  <div
    v-if="!staticMode || configured"
    class="live-q"
    :class="{ expired }"
    :aria-busy="!connected && !!active ? 'true' : 'false'"
  >
    <div v-if="sessionExpired" class="live-q-expired-card" role="status" aria-live="polite">
      <div class="live-q-expired-badge">Session ended</div>
      <div class="live-q-expired-title">Audience session ended — rejoin from your phone</div>
      <div class="live-q-expired-hint">
        The 4-hour join window has closed. Scan the QR or open
        <span class="live-q-expired-url">{{ rejoinUrl || 'the rejoin link' }}</span>
        to continue.
      </div>
    </div>

    <div v-else-if="!configured" class="live-q-waiting">
      Set a room code to show live questions.
    </div>

    <div v-else-if="!active" class="live-q-waiting">
      <template v-if="connected">Waiting for a live question…</template>
      <template v-else>Waiting for a live question…<span class="live-q-offline"> (offline)</span></template>
    </div>

    <template v-else>
      <div class="live-q-top">
        <div class="live-q-prompt">{{ active.prompt }}</div>
        <span v-if="hasCountdown" class="live-q-timer" :class="{ 'is-expired': expired }">{{ expired ? '0s' : countdownLabel }}</span>
        <span v-else-if="remaining !== null" class="live-q-timer">{{ remaining }}s</span>
        <span v-else-if="active.status === 'locked'" class="live-q-timer locked">locked</span>
      </div>

      <img
        v-if="isImage"
        class="live-q-media"
        :src="mediaUrl(active.media_url)"
        :alt="active.prompt"
        loading="lazy"
      />
      <video
        v-else-if="isVideo"
        class="live-q-media"
        :src="mediaUrl(active.media_url)"
        controls
        playsinline
      ></video>

      <div v-if="expired" class="live-q-expired-note">Time is up — answers closing</div>

      <div v-if="showBars" class="live-q-bars" :class="{ dimmed: expired }">
        <div v-for="(r, idx) in active.results" :key="r.label" class="live-q-row" :class="{ correct: isCorrectRow(r.label, idx) }">
          <div class="live-q-label">
            {{ r.label }}
            <span v-if="isCorrectRow(r.label, idx)" class="live-q-correct">correct</span>
            <span v-if="isRanking(active.kind) && r.avg_rank" class="live-q-avg">avg {{ r.avg_rank.toFixed(1) }}</span>
          </div>
          <div class="live-q-track">
            <div class="live-q-fill" :class="{ 'live-q-fill-correct': isCorrectRow(r.label, idx) }" :style="{ width: barWidth(r.count) }"></div>
          </div>
          <div class="live-q-count">{{ r.count }}</div>
        </div>
        <div class="live-q-total">
          {{ active.total }} {{ isRanking(active.kind) ? (active.total === 1 ? 'ballot' : 'ballots') : (active.total === 1 ? 'vote' : 'votes') }}
          <template v-if="active.nps !== undefined && active.nps !== null"> · NPS {{ active.nps }}</template>
        </div>
        <div v-if="correctIndex !== null" class="live-q-quiz-note">
          Correct: <strong>{{ correctLabel }}</strong>
          <template v-if="isCorrect !== null">
            · <span :class="isCorrect ? 'live-q-good' : 'live-q-bad'">{{ isCorrect ? 'You got it' : 'Not this time' }}</span>
            <template v-if="myPoints !== null"> · +{{ myPoints }} pts</template>
          </template>
        </div>
      </div>
      <div v-else-if="isLocked" class="live-q-locked">Time is up — answers are locked. Waiting for the reveal.</div>
      <div v-else-if="showResults" class="live-q-hidden" :class="{ dimmed: expired }">Results hidden</div>
    </template>
  </div>
</template>

<style scoped>
.live-q {
  min-width: 280px;
  max-width: 480px;
  text-align: left;
  background: var(--surface-1, #181b23);
  border: 1px solid var(--border, #23252f);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.42));
}
.live-q.expired { opacity: 0.85; }
.live-q-waiting {
  font-size: 13px;
  color: var(--muted, #9aa0b8);
}
.live-q-offline {
  color: var(--warn, #e6a817);
}
.live-q-top { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.live-q-prompt {
  font-family: var(--font-display, "Space Grotesk", sans-serif);
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #eceef2);
  line-height: 1.35;
  margin-bottom: 12px;
  flex: 1;
  letter-spacing: -0.02em;
}
.live-q-timer {
  flex-shrink: 0;
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 12px;
  font-weight: 700;
  color: var(--accent, #4f7cff);
  background: var(--accent-soft, rgba(79,124,255,.11));
  border: 1px solid rgba(79,124,255,.22);
  border-radius: 999px;
  padding: 4px 10px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.live-q-timer.is-expired {
  color: var(--danger, #ef4444);
  background: rgba(239,68,68,.1);
  border-color: rgba(239,68,68,.22);
}
.live-q-timer.locked { color: var(--warn, #e6a817); background: rgba(230,168,23,.12); border-color: rgba(230,168,23,.28); }
.live-q-expired-note {
  font-size: 11px;
  letter-spacing: 0.04em;
  font-weight: 600;
  color: var(--danger, #ef4444);
  background: rgba(239,68,68,.08);
  border: 1px solid rgba(239,68,68,.18);
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 10px;
}
.live-q-locked {
  font-size: 13px;
  color: var(--warn, #e6a817);
  background: rgba(230,168,23,.08);
  border: 1px solid rgba(230,168,23,.22);
  border-radius: 10px;
  padding: 9px 12px;
}
.live-q-media {
  max-width: 100%;
  max-height: 240px;
  border-radius: 10px;
  border: 1px solid var(--border, #23252f);
  display: block;
  margin-bottom: 14px;
  background: #000;
}
.live-q-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.live-q-bars.dimmed, .live-q-hidden.dimmed { opacity: 0.55; pointer-events: none; }
.live-q-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 8px;
  align-items: center;
}
.live-q-row.correct .live-q-label { color: var(--success, #19b27a); }
.live-q-label {
  font-size: 13px;
  color: var(--text, #eceef2);
  grid-column: 1;
  font-weight: 500;
}
.live-q-correct {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--success, #19b27a);
  background: rgba(25,178,122,.12);
  border: 1px solid rgba(25,178,122,.22);
  border-radius: 999px;
  padding: 1px 6px;
}
.live-q-avg {
  font-size: 11px;
  color: var(--muted, #9aa0b8);
  margin-left: 6px;
}
.live-q-count {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 12px;
  color: var(--muted, #9aa0b8);
  font-variant-numeric: tabular-nums;
  min-width: 22px;
  text-align: right;
  grid-column: 2;
  grid-row: 1;
}
.live-q-track {
  grid-column: 1 / -1;
  height: 8px;
  background: var(--surface-2, #1e212b);
  border: 1px solid var(--border, #23252f);
  border-radius: 999px;
  overflow: hidden;
}
.live-q-fill {
  height: 100%;
  background: var(--accent, #4f7cff);
  border-radius: 999px;
  transition: width 0.4s var(--ease, ease);
}
.live-q-fill-correct { background: var(--success, #19b27a); }
.live-q-total {
  margin-top: 10px;
  font-size: 11px;
  color: var(--muted, #9aa0b8);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.live-q-quiz-note {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted, #9aa0b8);
  background: var(--surface-2, #1e212b);
  border: 1px solid var(--border, #23252f);
  border-radius: 8px;
  padding: 7px 10px;
}
.live-q-good { color: var(--success, #19b27a); font-weight: 700; }
.live-q-bad { color: var(--danger, #ef4444); font-weight: 700; }
.live-q-hidden {
  font-size: 13px;
  color: var(--muted, #9aa0b8);
}
.live-q-expired-card {
  border: 1px solid rgba(230,168,23,.28);
  background: var(--surface-2, #1e212b);
  border-radius: 10px;
  padding: 12px 14px;
  display: grid;
  gap: 6px;
}
.live-q-expired-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--warn, #e6a817);
  background: rgba(230,168,23,.12);
  border: 1px solid rgba(230,168,23,.28);
  border-radius: 999px;
  padding: 2px 8px;
  width: fit-content;
}
.live-q-expired-title {
  font-family: var(--font-display, "Space Grotesk", sans-serif);
  font-size: 13px;
  font-weight: 700;
  color: var(--text, #eceef2);
  line-height: 1.35;
}
.live-q-expired-hint {
  font-size: 11.5px;
  color: var(--muted, #9aa0b8);
  line-height: 1.5;
}
.live-q-expired-url {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  color: var(--accent, #4f7cff);
  word-break: break-all;
}
@media (prefers-reduced-motion: reduce) {
  .live-q-fill { transition: none; }
}
</style>
