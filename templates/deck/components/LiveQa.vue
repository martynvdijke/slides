<script setup lang="ts">
import { computed } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

/**
 * Read-only board of the most upvoted approved audience questions.
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

const { qa, connected, configured } = useLiveRoom({
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
    <div v-if="!configured" class="live-qa-empty">Set a room code to show audience questions.</div>
    <div v-else-if="!top.length" class="live-qa-empty">
      <template v-if="connected">No questions yet — ask one from your phone.</template>
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
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 16px 18px;
}
.live-qa-title {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
  font-weight: 700;
  margin-bottom: 10px;
}
.live-qa-empty {
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
}
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 9px 12px;
}
.live-qa-votes {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #38bdf8;
  min-width: 22px;
  text-align: right;
}
.live-qa-body {
  font-size: 14px;
  color: #e2e8f0;
  line-height: 1.35;
  flex: 1;
}
.live-qa-author {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}
</style>
