<script setup lang="ts">
import { computed } from 'vue'
import { useLiveRoom, type LeaderboardEntry } from '../composables/useLiveRoom'

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
  title: 'Podium',
})

const { leaderboard, event: liveEvent, connected, configured, staticMode } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

const showPodium = computed(() => !!liveEvent.value?.show_podium)
const entries = computed(() => (leaderboard.value || []).slice(0, props.limit))
const podiumOrder = computed(() => {
  const top = entries.value.slice(0, 3)
  return [top[1], top[0], top[2]].filter((e): e is LeaderboardEntry => !!e)
})
const rest = computed(() => entries.value.slice(3))
const blockClass = ['second', 'first', 'third']
const blockMedal = ['2', '1', '3']
</script>

<template>
  <div v-if="!staticMode || configured">
    <div v-if="!configured" class="podium">
      <div class="podium-empty">Set a room code to show the podium.</div>
    </div>
    <div v-else-if="showPodium" class="podium">
      <div class="podium-title">{{ title }}</div>
      <div v-if="!entries.length" class="podium-empty">
        <template v-if="connected">No scores yet — play a quiz to get on the podium!</template>
        <template v-else>No scores yet.</template>
      </div>
      <template v-else>
        <div class="podium-stage">
          <div
            v-for="(e, i) in podiumOrder"
            :key="e.rank + '-' + e.name"
            class="podium-col"
            :class="blockClass[i]"
          >
            <div class="podium-avatar" :style="{ background: e.color }">{{ e.emoji }}</div>
            <div class="podium-name">{{ e.name }}</div>
            <div class="podium-block">
              <div class="podium-medal">{{ blockMedal[i] }}</div>
              <div class="podium-rank">#{{ e.rank }}</div>
              <div class="podium-pts">{{ e.points }}</div>
            </div>
          </div>
        </div>
        <TransitionGroup v-if="rest.length" name="podium-list" tag="ol" class="podium-rest">
          <li v-for="e in rest" :key="e.rank + '-' + e.name" class="podium-row">
            <span class="podium-row-rank">{{ e.rank }}</span>
            <span class="podium-row-avatar" :style="{ background: e.color }">{{ e.emoji }}</span>
            <span class="podium-row-name">{{ e.name }}</span>
            <span class="podium-row-pts">{{ e.points }}</span>
          </li>
        </TransitionGroup>
      </template>
    </div>
  </div>
</template>

<style scoped>
.podium {
  min-width: 300px;
  max-width: 480px;
  text-align: left;
  background: var(--surface-1, #181b23);
  border: 1px solid var(--border, #23252f);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.42));
}
.podium-title {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted, #9aa0b8);
  font-weight: 700;
  margin-bottom: 12px;
}
.podium-empty {
  font-size: 13px;
  color: var(--muted, #9aa0b8);
}
.podium-stage {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 10px;
  margin-bottom: 14px;
}
.podium-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 84px;
}
.podium-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  line-height: 1;
  border: 1px solid var(--border-2, #2c2f3a);
}
.podium-name {
  font-family: var(--font-display, "Space Grotesk", sans-serif);
  font-size: 12px;
  font-weight: 600;
  color: var(--text, #eceef2);
  max-width: 96px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.podium-block {
  width: 100%;
  border-radius: 10px 10px 4px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 6px;
  color: var(--text, #eceef2);
  border: 1px solid var(--border, #23252f);
}
.podium-col.first .podium-block { height: 130px; background: var(--surface-2, #1e212b); border-color: var(--accent, #4f7cff); }
.podium-col.second .podium-block { height: 100px; background: var(--surface-2, #1e212b); }
.podium-col.third .podium-block { height: 80px; background: var(--surface-2, #1e212b); }
.podium-medal { font-family: var(--font-mono, "JetBrains Mono", monospace); font-size: 18px; font-weight: 700; color: var(--muted, #9aa0b8); line-height: 1; }
.podium-col.first .podium-medal { color: var(--accent, #4f7cff); }
.podium-rank { font-family: var(--font-mono, "JetBrains Mono", monospace); font-size: 11px; font-weight: 700; opacity: 0.7; color: var(--muted, #9aa0b8); }
.podium-pts { font-family: var(--font-mono, "JetBrains Mono", monospace); font-size: 14px; font-weight: 800; color: var(--text, #eceef2); }
.podium-rest {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.podium-row {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--surface-2, #1e212b);
  border: 1px solid var(--border, #23252f);
  border-radius: 10px;
  padding: 6px 9px;
  transition: transform 0.25s var(--ease, ease), opacity 0.25s var(--ease, ease);
}
.podium-row-rank {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted, #9aa0b8);
  min-width: 18px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.podium-row-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  border: 1px solid var(--border-2, #2c2f3a);
  flex-shrink: 0;
}
.podium-row-name {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text, #eceef2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.podium-row-pts {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-size: 12px;
  font-weight: 700;
  color: var(--accent, #4f7cff);
  font-variant-numeric: tabular-nums;
}
.podium-list-move { transition: transform 0.35s var(--ease, ease); }
.podium-list-enter-active, .podium-list-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.podium-list-enter-from, .podium-list-leave-to { opacity: 0; transform: translateY(6px); }
.podium-list-leave-active { position: absolute; }
@media (prefers-reduced-motion: reduce) {
  .podium-row, .podium-list-move, .podium-list-enter-active, .podium-list-leave-active { transition: none; }
}
</style>
