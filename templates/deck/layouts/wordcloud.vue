<script setup lang="ts">
import { computed } from 'vue'
import { useDeckSlideQuestion } from '../composables/useDeckSlideQuestion'

const props = defineProps<{ prompt?: string; id?: string; showResults?: boolean }>()

const { active, sessionExpired, configured, remainingSec } = useDeckSlideQuestion()
const displayPrompt = computed(() => active.value?.prompt ?? props.prompt ?? 'One word — what comes to mind?')
const hasCountdown = computed(() => remainingSec.value !== null && remainingSec.value !== undefined)
const expired = computed(() => hasCountdown.value && remainingSec.value === 0)

// Wordcloud: port of audience app's cloud renderer — size by count
const cloudItems = computed(() => {
  const res = (active.value?.results ?? []).filter((r:any) => r.count > 0)
  if (!res.length) return []
  const max = Math.max(...res.map((r:any) => r.count), 1)
  return [...res].sort((a:any,b:any) => b.count - a.count).map((r:any, idx:number) => {
    const scale = 0.82 + (r.count / max) * 0.85
    const opacity = 0.85 + (r.count / max) * 0.15
    return { label: r.label, count: r.count, scale, opacity, idx, top: idx===0 }
  })
})

const showCloud = computed(() => !!active.value && (active.value.show_results || (active.value as any).status==='revealed'))
</script>

<template>
  <div class="slidev-layout wordcloud interactive-slide">
    <div class="interactive-frame">
      <div class="interactive-head">
        <span class="interactive-kicker">Word cloud</span>
        <span v-if="sessionExpired" class="interactive-pill expired">Session ended — rejoin on your phone</span>
        <span v-else-if="!configured" class="interactive-pill">No room set</span>
        <span v-else-if="expired" class="interactive-pill locked">Time's up</span>
        <span v-else-if="hasCountdown" class="interactive-pill live">⏱ {{ remainingSec }}s</span>
        <span v-else-if="active" class="interactive-pill live">Collecting</span>
        <span v-else class="interactive-pill">Waiting</span>
      </div>
      <h2 class="interactive-prompt">{{ displayPrompt }}</h2>

      <div v-if="sessionExpired" class="cloud-hint">Rejoin to contribute words.</div>
      <div v-else-if="!active" class="cloud-hint">Words will float in as the audience answers on their phones.</div>
      <div v-else-if="!showCloud" class="cloud-hint">Responses hidden until the host reveals — keep them coming!</div>
      <div v-else-if="!cloudItems.length" class="cloud-hint">No answers yet — be the first!</div>
      <div v-else class="cloud">
        <span
          v-for="item in cloudItems"
          :key="item.label"
          class="cloud-item"
          :class="{ top: item.top }"
          :style="{ fontSize: item.scale + 'rem', opacity: String(item.opacity), animationDelay: item.idx * 45 + 'ms' }"
        >{{ item.label }}</span>
      </div>

      <div v-if="active && showCloud" class="cloud-meta">{{ active.total }} {{ active.total===1?'response':'responses' }}</div>
      <!-- also render LiveQuestion for fallback bar view when not cloud -->
      <div v-if="active && !cloudItems.length" class="interactive-body" style="margin-top:12px">
        <!-- keep LiveQuestion hidden for wordcloud kind to avoid duplicate bars -->
      </div>
    </div>
  </div>
</template>

<style scoped>
.interactive-slide { display:flex;align-items:center;justify-content:center;padding:32px 36px}
.interactive-frame{width:min(920px,100%);background:rgba(15,23,42,0.92);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:var(--radius-card,16px);padding:28px 30px;backdrop-filter:blur(18px);box-shadow:0 12px 36px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.06)}
.interactive-kicker{font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:800}
.interactive-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.interactive-pill{font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,0.12));background:rgba(255,255,255,0.06);color:var(--muted,#9AA0B8)}
.interactive-pill.live{color:#86efac;border-color:rgba(34,197,94,0.35);background:rgba(34,197,94,0.12)}
.interactive-pill.locked{color:#fca5a5;border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.12)}
.interactive-pill.expired{color:#fbbf24;border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.12)}
.interactive-prompt{font-family:var(--font-display,"Space Grotesk",Inter,sans-serif);font-size:clamp(22px,3.2vw,32px);font-weight:800;letter-spacing:-0.03em;line-height:1.15;color:var(--text,#F2F3F8);margin:0 0 18px}
.cloud-hint{font-size:13px;color:var(--muted,#9AA0B8);font-style:italic}
.cloud{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;justify-content:center;margin-top:10px;min-height:120px}
.cloud-item{display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.10));color:var(--text,#F2F3F8);line-height:1;animation:pop 0.35s ease both}
.cloud-item.top{background:var(--grad,linear-gradient(135deg,#6366F1,#A855F7 45%,#EC4899 75%,#22D3EE));color:#fff;border-color:transparent;font-weight:800;box-shadow:0 6px 18px rgba(124,107,255,0.35)}
.cloud-meta{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:600;margin-top:12px;text-align:center}
@keyframes pop{from{opacity:0;transform:scale(0.9) translateY(4px)}to{opacity:1;transform:scale(1) translateY(0)}}
@media (prefers-reduced-motion:reduce){.cloud-item{animation:none}}
.interactive-prompt{max-width:100%}
</style>
