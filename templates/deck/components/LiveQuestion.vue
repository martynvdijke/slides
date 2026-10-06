<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

/**
 * The active live question: prompt text, optional rich media (image/video),
 * and (optionally) live results. Read-only — the audience answers on their
 * phones via the join QR. When scored and results are visible, highlights
 * the correct option and the viewer's own result.
 */
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

const { active, connected, configured, staticMode, mediaUrl, answerResult, remainingSec, deadlineAt } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const nowMs = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { clockTimer = setInterval(() => { nowMs.value = Date.now() }, 250) })
onUnmounted(() => { if (clockTimer) clearInterval(clockTimer); clockTimer = null })

const isImage = computed(() => (active.value?.media_type || '').startsWith('image/'))
const isVideo = computed(() => (active.value?.media_type || '').startsWith('video/'))
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
const countdownPct = computed(() => {
  const total = (active.value as any)?.duration_sec
  if (!total || remainingSec.value === null || remainingSec.value === undefined) return 0
  return Math.max(0, Math.min(100, (remainingSec.value / total) * 100))
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
  <div v-if="!staticMode || configured" class="live-q" :class="{ expired }">
    <div v-if="!configured" class="live-q-waiting">
      Set a room code to show live questions.
    </div>

    <div v-else-if="!active" class="live-q-waiting">
      <template v-if="connected">Waiting for a live question…</template>
      <template v-else>Waiting for a live question…<span class="live-q-offline"> (offline)</span></template>
    </div>

    <template v-else>
      <div class="live-q-top">
        <div class="live-q-prompt">{{ active.prompt }}</div>
        <div v-if="hasCountdown" class="live-q-countdown" :class="{ 'is-expired': expired }" :title="expired ? 'Time is up' : 'Time remaining'">
          <div class="live-q-ring" :style="{ '--pct': countdownPct + '%' } as any">
            <span class="live-q-timer">{{ expired ? '0s' : countdownLabel }}</span>
          </div>
        </div>
        <span v-else-if="remaining !== null" class="live-q-timer">⏱ {{ remaining }}s</span>
        <span v-else-if="active.status === 'locked'" class="live-q-timer locked">⏱ locked</span>
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

      <div v-if="expired" class="live-q-expired-note">Time's up — answers closing…</div>

      <div v-if="showBars" class="live-q-bars" :class="{ dimmed: expired }">
        <div v-for="(r, idx) in active.results" :key="r.label" class="live-q-row" :class="{ correct: isCorrectRow(r.label, idx) }">
          <div class="live-q-label">
            {{ r.label }}
            <span v-if="isCorrectRow(r.label, idx)" class="live-q-correct">✓ correct</span>
            <span v-if="isRanking(active.kind) && r.avg_rank" class="live-q-avg">avg rank {{ r.avg_rank.toFixed(1) }}</span>
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
      <div v-else-if="isLocked" class="live-q-locked">Time's up — answers are locked. Waiting for the reveal…</div>
      <div v-else-if="showResults" class="live-q-hidden" :class="{ dimmed: expired }">Results hidden</div>
    </template>
  </div>
</template>

<style scoped>
.live-q {
  min-width: 280px;
  max-width: 480px;
  text-align: left;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 16px 18px;
}
.live-q.expired { opacity: 0.85; }
.live-q-waiting {
  font-size: 14px;
  color: #94a3b8;
  font-style: italic;
}
.live-q-offline {
  color: #f59e0b;
  font-style: normal;
}
.live-q-top { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.live-q-prompt {
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
  line-height: 1.35;
  margin-bottom: 12px;
  flex: 1;
}
.live-q-countdown { flex-shrink: 0; }
.live-q-ring {
  width: 52px; height: 52px;
  border-radius: 50%;
  display: grid; place-items: center;
  background: conic-gradient(#38bdf8 var(--pct, 0%), rgba(255,255,255,0.12) 0);
  padding: 3px;
}
.live-q-ring::before {
  content: '';
  width: 100%; height: 100%;
  border-radius: 50%;
  background: #0f172a;
  grid-area: 1 / 1;
}
.live-q-timer {
  grid-area: 1 / 1;
  z-index: 1;
  font-size: 12px;
  font-weight: 800;
  color: #e0f2fe;
  font-variant-numeric: tabular-nums;
}
.live-q-countdown.is-expired .live-q-ring { background: conic-gradient(#ef4444 100%, rgba(255,255,255,0.12) 0); }
.live-q-countdown.is-expired .live-q-timer { color: #fecaca; }
.live-q-expired-note {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 700;
  color: #fca5a5;
  background: rgba(239,68,68,0.12);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 10px;
}
.live-q-head { display: flex; align-items: flex-start; gap: 10px; }
.live-q-head .live-q-prompt { flex: 1; }
.live-q-timer {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 999px;
  padding: 2px 10px;
  white-space: nowrap;
}
.live-q-timer.locked { color: #f59e0b; }
.live-q-locked {
  font-size: 13px;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 10px;
  padding: 9px 12px;
}
.live-q-media {
  max-width: 100%;
  max-height: 240px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: block;
  margin-bottom: 14px;
  background: #000;
}
.live-q-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.live-q-bars.dimmed, .live-q-hidden.dimmed { opacity: 0.55; filter: grayscale(0.2); pointer-events: none; }
.live-q-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 8px;
  align-items: center;
}
.live-q-row.correct .live-q-label { color: #86efac; }
.live-q-label {
  font-size: 13px;
  color: #e2e8f0;
  grid-column: 1;
}
.live-q-correct {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #4ade80;
  background: rgba(74,222,128,0.15);
  border: 1px solid rgba(74,222,128,0.35);
  border-radius: 6px;
  padding: 1px 6px;
}
.live-q-avg {
  font-size: 11px;
  color: #94a3b8;
  margin-left: 6px;
}
.live-q-count {
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  min-width: 22px;
  text-align: right;
  grid-column: 2;
  grid-row: 1;
}
.live-q-track {
  grid-column: 1 / -1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
}
.live-q-fill {
  height: 100%;
  background: linear-gradient(90deg, #326ce5, #38bdf8);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.live-q-fill-correct { background: linear-gradient(90deg, #16a34a, #4ade80); }
.live-q-total {
  margin-top: 10px;
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
.live-q-quiz-note {
  margin-top: 8px;
  font-size: 12px;
  color: #cbd5e1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 7px 10px;
}
.live-q-good { color: #4ade80; font-weight: 700; }
.live-q-bad { color: #fca5a5; font-weight: 700; }
.live-q-hidden {
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
}
</style>
