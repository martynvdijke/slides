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
  limit: 10,
  title: 'Leaderboard',
})

const { leaderboard, connected, configured, staticMode } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const entries = computed(() => (leaderboard.value || []).slice(0, props.limit))
</script>

<template>
  <div v-if="!staticMode || configured" class="lb">
    <div class="lb-title">{{ title }}</div>
    <div v-if="!configured" class="lb-empty">Set a room code to show standings.</div>
    <div v-else-if="!entries.length" class="lb-empty">
      <template v-if="connected">No scores yet — answer a question to get on the board.</template>
      <template v-else>No scores yet.</template>
    </div>
    <TransitionGroup v-else name="lb-list" tag="ol" class="lb-list">
      <li v-for="e in entries" :key="e.rank + '-' + e.name" class="lb-row">
        <span class="lb-rank">{{ e.rank }}</span>
        <span class="lb-avatar" :style="{ background: e.color }">{{ e.emoji }}</span>
        <span class="lb-name">{{ e.name }}</span>
        <span class="lb-points">{{ e.points }}</span>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.lb {
  min-width: 280px;
  max-width: 420px;
  text-align: left;
  background: var(--surface-1, #181b23);
  border: 1px solid var(--border, #23252f);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.42));
}
.lb-title {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted, #9aa0b8);
  font-weight: 700;
  margin-bottom: 12px;
}
.lb-empty {
  font-size: 13px;
  color: var(--muted, #9aa0b8);
}
.lb-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-2, #1e212b);
  border: 1px solid var(--border, #23252f);
  border-radius: 10px;
  padding: 8px 10px;
  transition: transform 0.25s var(--ease, ease), opacity 0.25s var(--ease, ease), background 0.2s var(--ease, ease);
}
.lb-row:hover { background: var(--surface-3, #272b36); }
.lb-rank {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted, #9aa0b8);
  min-width: 20px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.lb-row:nth-child(1) .lb-rank { color: var(--warn, #e6a817); }
.lb-row:nth-child(2) .lb-rank { color: var(--muted, #9aa0b8); }
.lb-row:nth-child(3) .lb-rank { color: #c0842a; }
.lb-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
  border: 1px solid var(--border-2, #2c2f3a);
}
.lb-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #eceef2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lb-points {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent, #4f7cff);
  font-variant-numeric: tabular-nums;
}
.lb-list-move { transition: transform 0.35s var(--ease, ease); }
.lb-list-enter-active, .lb-list-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.lb-list-enter-from, .lb-list-leave-to { opacity: 0; transform: translateY(6px); }
.lb-list-leave-active { position: absolute; }
@media (prefers-reduced-motion: reduce) {
  .lb-row, .lb-list-move, .lb-list-enter-active, .lb-list-leave-active { transition: none; }
}
</style>
