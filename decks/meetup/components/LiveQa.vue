<script setup lang="ts">
import { computed } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

/**
 * Read-only board of the most upvoted approved audience questions.
 * Projector/beam view — no composer, no voting.
 */
const props = withDefaults(defineProps<{
  event?: string
  room?: string
  base?: string
  limit?: number
  title?: string
}>(), {
  event: '',
  room: '',
  base: '',
  limit: 5,
  title: 'Top questions',
})

const { qa, connected, configured, sessionExpired, rejoinUrl } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const top = computed(() =>
  (qa.value || [])
    .slice()
    .sort((a, b) => (b.votes || 0) - (a.votes || 0))
    .slice(0, props.limit),
)
</script>

<template>
  <div class="live-qa">
    <div class="live-qa-title">{{ title }}</div>
    <div v-if="sessionExpired" class="live-qa-expired" role="status" aria-live="polite">
      <span class="live-qa-expired-badge">Session ended</span>
      <span class="live-qa-expired-text">Rejoin to ask — open {{ rejoinUrl || 'the rejoin link' }} on your phone.</span>
    </div>
    <div v-else-if="!configured" class="live-qa-empty">Set a room code to show audience questions.</div>
    <div v-else-if="!top.length" class="live-qa-empty">
      <template v-if="connected">No questions yet — scan to ask.</template>
      <template v-else>No questions yet.</template>
    </div>
    <ol v-else class="live-qa-list">
      <li v-for="q in top" :key="q.id" class="live-qa-item">
        <span class="live-qa-votes">{{ q.votes }}</span>
        <span class="live-qa-body">{{ q.body }}</span>
        <span v-if="q.author" class="live-qa-author">— {{ q.author }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.live-qa {
  text-align: left;
  min-width: 280px;
  max-width: 620px;
  background: var(--surface, rgba(255,255,255,0.06));
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  border-radius: var(--radius-card, 16px);
  padding: 16px 18px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
}
.live-qa-title {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted, #9AA0B8);
  font-weight: 700;
  margin-bottom: 10px;
}
.live-qa-empty {
  font-size: 13px;
  color: var(--muted, #9AA0B8);
  font-style: italic;
}
.live-qa-expired {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted, #9AA0B8);
  background: linear-gradient(135deg, rgba(124,107,255,0.12), rgba(236,72,153,0.06));
  border: 1px solid rgba(251,191,36,0.22);
  border-radius: 10px;
  padding: 8px 10px;
}
.live-qa-expired-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fbbf24;
  background: rgba(251,191,36,0.14);
  border: 1px solid rgba(251,191,36,0.28);
  border-radius: 999px;
  padding: 2px 7px;
}
.live-qa-expired-text { flex: 1; min-width: 160px; }
.live-qa-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  counter-reset: qa;
}
.live-qa-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border, rgba(255,255,255,0.10));
  border-radius: 10px;
  padding: 9px 12px;
}
.live-qa-votes {
  font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent, #7C6BFF);
  min-width: 22px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.live-qa-body {
  font-size: 14px;
  color: var(--text, #e2e8f0);
  line-height: 1.35;
  flex: 1;
}
.live-qa-author {
  font-size: 11px;
  color: var(--muted, #94a3b8);
  white-space: nowrap;
}
</style>
