<script setup lang="ts">
import { computed } from 'vue'
import LiveQa from '../components/LiveQa.vue'
import { useDeckSlideQuestion } from '../composables/useDeckSlideQuestion'

const props = defineProps<{ title?: string; id?: string; limit?: number }>()
const { active, sessionExpired, configured } = useDeckSlideQuestion()
const { qa } = useDeckSlideQuestion() // qa is from live store
const topCount = computed(() => (qa.value ?? []).length)
</script>

<template>
  <div class="slidev-layout qa interactive-slide">
    <div class="interactive-frame qa-frame">
      <div class="interactive-head">
        <span class="interactive-kicker">Q&A · Live</span>
        <span v-if="sessionExpired" class="interactive-pill expired">Session ended — rejoin on your phone</span>
        <span v-else-if="!configured" class="interactive-pill">No room set</span>
        <span v-else class="interactive-pill live">Ask from your phone</span>
        <span v-if="!sessionExpired && topCount" class="qa-count">{{ topCount }} {{ topCount===1?'question':'questions' }}</span>
      </div>
      <div class="qa-body">
        <LiveQa :title="props.title ?? 'Top questions'" :limit="props.limit ?? 5" />
      </div>
      <div class="qa-hint">Scan the QR or open the room link — questions upvote live on this board.</div>
    </div>
  </div>
</template>

<style scoped>
.interactive-slide { display:flex;align-items:center;justify-content:center;padding:28px 32px}
.interactive-frame{width:min(920px,100%);background:var(--surface-1,#181b23);border:1px solid var(--border,#23252f);border-radius:14px;padding:24px 26px;box-shadow:var(--shadow-sm,0 1px 2px rgba(0,0,0,.42))}
.qa-frame{max-height:82vh;overflow:auto}
.interactive-kicker{font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted,#9AA0B8);font-weight:800}
.interactive-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.interactive-pill{font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,0.12));background:rgba(255,255,255,0.06);color:var(--muted,#9AA0B8)}
.interactive-pill.live{color:#86efac;border-color:rgba(34,197,94,0.35);background:rgba(34,197,94,0.12)}
.interactive-pill.expired{color:#fbbf24;border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.12)}
.qa-count{font-family:var(--font-mono,"JetBrains Mono",monospace);font-size:11px;color:var(--muted,#9AA0B8);font-weight:600;margin-left:auto}
.qa-body :deep(.live-qa){max-width:none;background:transparent;border:none;padding:0;box-shadow:none;backdrop-filter:none}
.qa-hint{font-size:11px;color:var(--muted,#9AA0B8);font-style:italic;margin-top:10px;text-align:center}
</style>
