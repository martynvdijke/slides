<script setup lang="ts">
import { computed } from 'vue'
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

const { active, connected, configured, mediaUrl, answerResult } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const isImage = computed(() => (active.value?.media_type || '').startsWith('image/'))
const isVideo = computed(() => (active.value?.media_type || '').startsWith('video/'))
const showBars = computed(() => props.showResults && !!active.value?.show_results)

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
  <div class="live-q">
    <div v-if="!configured" class="live-q-waiting">
      Set a room code to show live questions.
    </div>

    <div v-else-if="!active" class="live-q-waiting">
      <template v-if="connected">Waiting for a live question…</template>
      <template v-else>Waiting for a live question…<span class="live-q-offline"> (offline)</span></template>
    </div>

    <template v-else>
      <div class="live-q-prompt">{{ active.prompt }}</div>

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

      <div v-if="showBars" class="live-q-bars">
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
      <div v-else-if="showResults" class="live-q-hidden">Results hidden</div>
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
.live-q-waiting {
  font-size: 14px;
  color: #94a3b8;
  font-style: italic;
}
.live-q-offline {
  color: #f59e0b;
  font-style: normal;
}
.live-q-prompt {
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
  line-height: 1.35;
  margin-bottom: 12px;
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
