<script setup lang="ts">
import { computed } from 'vue'
import { useDeckSlideQuestion } from '../composables/useDeckSlideQuestion'

const props = defineProps<{
  prompt?: string
  id?: string
  axes?: { x?: { label?: string; low?: string; high?: string }; y?: { label?: string; low?: string; high?: string } }
  options?: string[]
}>()

const { active, sessionExpired, configured } = useDeckSlideQuestion()
const displayPrompt = computed(() => active.value?.prompt ?? props.prompt ?? 'Where do you sit?')

// grid2x2 options are the four quadrants in declaration order:
// top-left, top-right, bottom-left, bottom-right. Answers are points {x,y} in
// 0..1 with y=1 at the top, so each point is bucketed back to its quadrant.
const FALLBACK_LABELS = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right']

const options = computed(() => (active.value?.options?.length ? active.value.options : (props.options ?? [])))
const quadrantLabel = (i: number) => options.value[i] || FALLBACK_LABELS[i]

const counts = computed(() => {
  const out = [0, 0, 0, 0]
  for (const r of active.value?.results ?? []) {
    const x = (r as any).x
    const y = (r as any).y
    if (typeof x !== 'number' || typeof y !== 'number') continue
    out[(y >= 0.5 ? 0 : 2) + (x >= 0.5 ? 1 : 0)] += r.count
  }
  return out
})
const total = computed(() => active.value?.total ?? 0)
const hasResults = computed(() => counts.value.some(c => c > 0))
const maxCount = computed(() => Math.max(1, ...counts.value))
const pct = (i: number) => (active.value?.total ? Math.round((counts.value[i] / active.value.total) * 100) : 0)

// Axes from frontmatter
const xAxis = computed(() => props.axes?.x ?? { label: 'Impact', low: 'Low', high: 'High' })
const yAxis = computed(() => props.axes?.y ?? { label: 'Effort', low: 'Low', high: 'High' })
</script>

<template>
  <div class="slidev-layout grid2x2 interactive-slide">
    <div class="interactive-frame">
      <div class="interactive-head">
        <span class="interactive-kicker">2×2 · {{ xAxis.label }} × {{ yAxis.label }}</span>
        <span v-if="sessionExpired" class="interactive-pill expired">Session ended — rejoin on your phone</span>
        <span v-else-if="!configured" class="interactive-pill">No room set</span>
        <span v-else-if="active" class="interactive-pill live">{{ total }} {{ total===1?'vote':'votes' }}</span>
        <span v-else class="interactive-pill">Waiting</span>
      </div>
      <h2 class="interactive-prompt">{{ displayPrompt }}</h2>

      <div class="grid-wrap">
        <div class="grid-y-label">{{ yAxis.high }} →</div>
        <div class="grid">
          <div v-for="i in 4" :key="i" class="grid-cell" :class="{ filled: counts[i-1] > 0 }">
            <span class="grid-cell-label">{{ quadrantLabel(i-1) }}</span>
            <span class="grid-count">{{ counts[i-1] }}<template v-if="total"> · {{ pct(i-1) }}%</template></span>
            <div class="grid-track">
              <div class="grid-fill" :style="{ width: (counts[i-1] / maxCount) * 100 + '%' }"></div>
            </div>
          </div>
        </div>
        <div class="grid-x-label">← {{ xAxis.low }} &nbsp; {{ xAxis.label }} &nbsp; {{ xAxis.high }} →</div>
      </div>

      <div v-if="!hasResults" class="grid-hint">
        <template v-if="sessionExpired">Rejoin to place yourself in a quadrant.</template>
        <template v-else-if="!active">Responses fill the quadrants live as people answer on their phones.</template>
        <template v-else>Collecting — quadrants fill as votes come in.</template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interactive-slide { display:flex;align-items:center;justify-content:center;padding:32px 36px}
.interactive-frame{width:min(920px,100%);background:var(--surface-1,#181b23);border:1px solid var(--border,#23252f);border-radius:14px;padding:28px 30px;box-shadow:var(--shadow-sm,0 1px 2px rgba(0,0,0,.42))}
.interactive-kicker{font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:800}
.interactive-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.interactive-pill{font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,0.12));background:rgba(255,255,255,0.06);color:var(--muted,#9AA0B8)}
.interactive-pill.live{color:var(--muted,#9AA0B8);border-color:var(--border,rgba(255,255,255,0.12));background:rgba(255,255,255,0.06);font-family:var(--font-mono,"JetBrains Mono",monospace)}
.interactive-pill.expired{color:#fbbf24;border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.12)}
.interactive-prompt{font-family:var(--font-display,"Space Grotesk",Inter,sans-serif);font-size:clamp(20px,3vw,30px);font-weight:800;letter-spacing:-0.03em;line-height:1.15;color:var(--text,#F2F3F8);margin:0 0 16px}
.grid-wrap{display:grid;gap:6px}
.grid-y-label{font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid-cell{min-height:96px;border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:12px;background:rgba(255,255,255,0.04);padding:10px 12px;display:grid;gap:6px;align-content:start}
.grid-cell.filled{background:linear-gradient(135deg, rgba(124,107,255,0.10), rgba(34,211,238,0.06));border-color:rgba(124,107,255,0.18)}
.grid-cell-label{font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:700}
.grid-count{font-family:var(--font-mono,"JetBrains Mono",monospace);font-size:20px;font-weight:800;color:var(--text,#F2F3F8);font-variant-numeric:tabular-nums;line-height:1.1}
.grid-track{height:6px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;align-self:end}
.grid-fill{height:100%;border-radius:999px;background:var(--accent,#4f7cff);transition:width 0.4s var(--ease,ease)}
.grid-x-label{font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:700;text-align:center}
.grid-hint{font-size:11px;color:var(--muted,#9AA0B8);font-style:italic;margin-top:12px;text-align:center}
@media (prefers-reduced-motion: reduce) {
  .grid-fill { transition: none; }
}
</style>
