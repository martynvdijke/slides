<script setup lang="ts">
import { computed } from 'vue'
import LiveQuestion from '../components/LiveQuestion.vue'
import { useDeckSlideQuestion } from '../composables/useDeckSlideQuestion'

const props = defineProps<{
  prompt?: string
  options?: string[]
  id?: string
  media?: string
  showResults?: boolean
  points?: number
  correct?: number
  timeLimit?: number
  duration?: number
}>()

// Frontmatter fallback — props are the Slidev-provided values; active.prompt is authoritative.
let fm: any = {}
try {
  if (typeof window !== 'undefined') {
    const g: any = (window as any).__slidev__ ?? {}
    fm = g?.activeFrontmatter ?? {}
  }
} catch {}

const { active, sessionExpired, configured } = useDeckSlideQuestion()
const displayPrompt = computed(() => active.value?.prompt ?? props.prompt ?? fm.prompt ?? 'Poll')
const hasActive = computed(() => !!active.value)
</script>

<template>
  <div class="slidev-layout poll interactive-slide">
    <div class="interactive-frame">
      <div class="interactive-head">
        <span class="interactive-kicker">Live poll</span>
        <span v-if="sessionExpired" class="interactive-pill expired">Session ended — rejoin on your phone</span>
        <span v-else-if="!configured" class="interactive-pill">No room set</span>
        <span v-else-if="hasActive" class="interactive-pill live">Voting open</span>
        <span v-else class="interactive-pill">Waiting — {{ displayPrompt }}</span>
      </div>
      <h2 class="interactive-prompt">{{ displayPrompt }}</h2>
      <div class="interactive-body">
        <LiveQuestion :show-results="props.showResults ?? true" />
      </div>
      <div v-if="!hasActive && props.options?.length" class="interactive-preview">
        <span v-for="o in props.options" :key="o" class="interactive-chip">{{ o }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interactive-slide { display:flex; align-items:center; justify-content:center; padding: 32px 36px; }
.interactive-frame { width:min(860px,100%); background: var(--surface-1,#181b23); border:1px solid var(--border,#23252f); border-radius:14px; padding:28px 30px; box-shadow:var(--shadow-sm,0 1px 2px rgba(0,0,0,.42)); }
.interactive-kicker { font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color: var(--muted,#9AA0B8); font-weight:800; }
.interactive-head { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
.interactive-pill { font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; padding:3px 8px; border-radius:999px; border:1px solid var(--border,rgba(255,255,255,0.12)); background:rgba(255,255,255,0.06); color:var(--muted,#9AA0B8); }
.interactive-pill.live { color:#86efac; border-color:rgba(34,197,94,0.35); background:rgba(34,197,94,0.12); }
.interactive-pill.expired { color:#fbbf24; border-color:rgba(251,191,36,0.35); background:rgba(251,191,36,0.12); }
.interactive-prompt { font-family:var(--font-display,"Space Grotesk",Inter,sans-serif); font-size: clamp(22px,3.2vw,32px); font-weight:800; letter-spacing:-0.03em; line-height:1.15; color:var(--text,#F2F3F8); margin:0 0 18px; }
.interactive-body :deep(.live-q) { max-width:none; background: transparent; border:none; padding:0; box-shadow:none; backdrop-filter:none; }
.interactive-preview { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
.interactive-chip { font-size:13px; font-weight:600; padding:8px 12px; border-radius:999px; border:1px solid var(--border,rgba(255,255,255,0.12)); background:var(--surface-2,#1e212b); color:var(--text,#eceef2); }
</style>
