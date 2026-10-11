<script setup lang="ts">
import { computed } from 'vue'
import LiveQuestion from '../components/LiveQuestion.vue'
import { useDeckSlideQuestion } from '../composables/useDeckSlideQuestion'
const props = defineProps<{ prompt?: string; id?: string; showResults?: boolean }>()
const { active, sessionExpired, configured } = useDeckSlideQuestion()
const displayPrompt = computed(() => active.value?.prompt ?? props.prompt ?? 'How likely are you to recommend?')
const hasActive = computed(() => !!active.value)
</script>
<template>
  <div class="slidev-layout nps interactive-slide">
    <div class="interactive-frame">
      <div class="interactive-head">
        <span class="interactive-kicker">NPS · 0–10</span>
        <span v-if="sessionExpired" class="interactive-pill expired">Session ended — rejoin on your phone</span>
        <span v-else-if="!configured" class="interactive-pill">No room set</span>
        <span v-else-if="hasActive" class="interactive-pill live">Voting open</span>
        <span v-else class="interactive-pill">Waiting</span>
      </div>
      <h2 class="interactive-prompt">{{ displayPrompt }}</h2>
      <div class="interactive-body"><LiveQuestion :show-results="props.showResults ?? true" /></div>
      <div v-if="!hasActive" class="interactive-preview">
        <span v-for="n in 11" :key="n" class="interactive-chip" :class="{ det: n-1<=6, prom: n-1>=9}">{{ n-1 }}</span>
      </div>
    </div>
  </div>
</template>
<style scoped>
.interactive-slide { display:flex;align-items:center;justify-content:center;padding:32px 36px}
.interactive-frame{width:min(860px,100%);background:rgba(15,23,42,0.92);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:var(--radius-card,16px);padding:28px 30px;backdrop-filter:blur(18px);box-shadow:0 12px 36px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.06)}
.interactive-kicker{font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:800}
.interactive-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.interactive-pill{font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,0.12));background:rgba(255,255,255,0.06);color:var(--muted,#9AA0B8)}
.interactive-pill.live{color:#86efac;border-color:rgba(34,197,94,0.35);background:rgba(34,197,94,0.12)}
.interactive-pill.expired{color:#fbbf24;border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.12)}
.interactive-prompt{font-family:var(--font-display,"Space Grotesk",Inter,sans-serif);font-size:clamp(22px,3.2vw,32px);font-weight:800;letter-spacing:-0.03em;line-height:1.15;color:var(--text,#F2F3F8);margin:0 0 18px}
.interactive-body :deep(.live-q){max-width:none;background:transparent;border:none;padding:0;box-shadow:none;backdrop-filter:none}
.interactive-preview{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.interactive-chip{font-size:12px;font-weight:700;padding:6px 8px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.12));background:rgba(255,255,255,0.06);color:var(--text,#F2F3F8);min-width:28px;text-align:center}
.interactive-chip.det{border-color:rgba(239,68,68,0.25)}
.interactive-chip.prom{border-color:rgba(34,197,94,0.35)}
</style>
