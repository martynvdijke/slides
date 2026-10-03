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

const { leaderboard, connected, configured } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const entries = computed(() => (leaderboard.value || []).slice(0, props.limit))
</script>

<template>
  <div class="lb">
    <div class="lb-title">{{ title }}</div>
    <div v-if="!configured" class="lb-empty">Set a room code to show standings.</div>
    <div v-else-if="!entries.length" class="lb-empty">
      <template v-if="connected">No scores yet — answer a question to get on the board.</template>
      <template v-else>No scores yet.</template>
    </div>
    <ol v-else class="lb-list">
      <li v-for="e in entries" :key="e.rank + '-' + e.name" class="lb-row">
        <span class="lb-rank">{{ e.rank }}</span>
        <span class="lb-avatar" :style="{ background: e.color }">{{ e.emoji }}</span>
        <span class="lb-name">{{ e.name }}</span>
        <span class="lb-points">{{ e.points }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.lb {
  min-width: 280px;
  max-width: 420px;
  text-align: left;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 16px;
  padding: 16px 18px;
}
.lb-title {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
  font-weight: 700;
  margin-bottom: 10px;
}
.lb-empty {
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
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
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 8px 10px;
  transition: transform 0.25s ease, background 0.25s ease;
}
.lb-row:hover { background: rgba(255,255,255,0.09); }
.lb-rank {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #94a3b8;
  min-width: 20px;
  text-align: right;
}
.lb-row:nth-child(1) .lb-rank { color: #facc15; }
.lb-row:nth-child(2) .lb-rank { color: #cbd5e1; }
.lb-row:nth-child(3) .lb-rank { color: #fb923c; }
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
  border: 1px solid rgba(255,255,255,0.18);
}
.lb-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lb-points {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #38bdf8;
}
</style>
