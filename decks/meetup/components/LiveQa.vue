<script setup lang="ts">
import { computed } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

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
  background: var(--surface-1, #181b23);
  border: 1px solid var(--border, #23252f);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.42));
}
.live-qa-title {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted, #9aa0b8);
  font-weight: 700;
  margin-bottom: 12px;
}
.live-qa-empty {
  font-size: 13px;
  color: var(--muted, #9aa0b8);
}
.live-qa-expired {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted, #9aa0b8);
  background: var(--surface-2, #1e212b);
  border: 1px solid rgba(230,168,23,.22);
  border-radius: 10px;
  padding: 8px 10px;
}
.live-qa-expired-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--warn, #e6a817);
  background: rgba(230,168,23,.12);
  border: 1px solid rgba(230,168,23,.28);
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
}
.live-qa-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  background: var(--surface-2, #1e212b);
  border: 1px solid var(--border, #23252f);
  border-radius: 10px;
  padding: 9px 12px;
}
.live-qa-votes {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent, #4f7cff);
  min-width: 22px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.live-qa-body {
  font-size: 13.5px;
  color: var(--text, #eceef2);
  line-height: 1.4;
  flex: 1;
}
.live-qa-author {
  font-size: 11px;
  color: var(--muted, #9aa0b8);
  white-space: nowrap;
}
</style>
