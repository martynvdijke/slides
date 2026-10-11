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

// grid2x2: backend may not have a dedicated kind — degrade gracefully.
// If active.results exists, render a scatter by label count as a quadrant heatmap.
// Otherwise show the axes scaffold and hint.
const hasResults = computed(() => !!(active.value?.results?.length))
const total = computed(() => active.value?.total ?? 0)

// Axes from frontmatter
const xAxis = computed(() => props.axes?.x ?? { label: 'Impact', low: 'Low', high: 'High' })
const yAxis = computed(() => props.axes?.y ?? { label: 'Effort', low: 'Low', high: 'High' })

// If results carry quadrant labels (e.g. "High Impact / Low Effort"), bucket them.
// Fallback: treat any poll options as points spread across quadrants by hash.
const quadrants = computed(() => {
  const res = active.value?.results ?? []
  if (!res.length) return []
  // simple bucket: map each label to a quadrant index 0..3 via hash
  return res.map((r:any) => {
    const h = [...r.label].reduce((a,c)=>a+c.charCodeAt(0),0) % 4
    return { label: r.label, count: r.count, q: h }
  })
})

const maxCount = computed(() => Math.max(1, ...quadrants.value.map(q=>q.count)))
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
          <div class="grid-cell">
            <span class="grid-cell-label">High {{ yAxis.label }} · Low {{ xAxis.label }}</span>
            <div v-for="q in quadrants.filter(q=>q.q===2)" :key="q.label" class="grid-dot" :style="{ opacity: String(0.35 + (q.count/maxCount)*0.65) }">
              {{ q.label }} · {{ q.count }}
            </div>
          </div>
          <div class="grid-cell">
            <span class="grid-cell-label">High · High</span>
            <div v-for="q in quadrants.filter(q=>q.q===3)" :key="q.label" class="grid-dot top">
              {{ q.label }} · {{ q.count }}
            </div>
          </div>
          <div class="grid-cell">
            <span class="grid-cell-label">Low · Low</span>
            <div v-for="q in quadrants.filter(q=>q.q===0)" :key="q.label" class="grid-dot muted">
              {{ q.label }} · {{ q.count }}
            </div>
          </div>
          <div class="grid-cell">
            <span class="grid-cell-label">Low {{ yAxis.label }} · High {{ xAxis.label }}</span>
            <div v-for="q in quadrants.filter(q=>q.q===1)" :key="q.label" class="grid-dot">
              {{ q.label }} · {{ q.count }}
            </div>
          </div>
        </div>
        <div class="grid-x-label">← {{ xAxis.low }} &nbsp; {{ xAxis.label }} &nbsp; {{ xAxis.high }} →</div>
      </div>

      <div v-if="!hasResults" class="grid-hint">
        <template v-if="sessionExpired">Rejoin to place your dot on the board.</template>
        <template v-else-if="!active">Responses will scatter live as people answer on their phones.</template>
        <template v-else>Collecting — dots appear when votes come in. If your backend lacks <code>grid2x2</code>, this degrades to a quadrant tally.</template>
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
.interactive-pill.live{color:var(--muted,#9AA0B8);border-color:var(--border,rgba(255,255,255,0.12));background:rgba(255,255,255,0.06);font-family:var(--font-mono,"JetBrains Mono",monospace)}
.interactive-pill.expired{color:#fbbf24;border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.12)}
.interactive-prompt{font-family:var(--font-display,"Space Grotesk",Inter,sans-serif);font-size:clamp(20px,3vw,30px);font-weight:800;letter-spacing:-0.03em;line-height:1.15;color:var(--text,#F2F3F8);margin:0 0 16px}
.grid-wrap{display:grid;gap:6px}
.grid-y-label{font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid-cell{min-height:96px;border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:12px;background:rgba(255,255,255,0.04);padding:10px 12px}
.grid-cell:nth-child(2){background:linear-gradient(135deg, rgba(124,107,255,0.10), rgba(34,211,238,0.06));border-color:rgba(124,107,255,0.18)}
.grid-cell-label{font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:700}
.grid-dot{font-size:12px;font-weight:600;color:var(--text,#F2F3F8);margin-top:6px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.10));display:inline-block;margin-right:6px}
.grid-dot.top{background:var(--grad,linear-gradient(135deg,#6366F1,#A855F7 45%,#EC4899 75%,#22D3EE));color:#fff;border-color:transparent}
.grid-dot.muted{opacity:0.6}
.grid-x-label{font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:700;text-align:center}
.grid-hint{font-size:11px;color:var(--muted,#9AA0B8);font-style:italic;margin-top:12px;text-align:center}
.grid-hint code{font-family:var(--font-mono,"JetBrains Mono",monospace);color:#93c5fd}
</style>
