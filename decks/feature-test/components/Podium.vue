<script setup lang="ts">
import { computed } from 'vue'
import { useLiveRoom, type LeaderboardEntry } from '../composables/useLiveRoom'

/**
 * Podium — the end-of-quiz top-3 celebration plus the remaining standings.
 *
 * Shows only while the host has switched the event podium on
 * (`event.show_podium`); activating the next question switches it back off
 * server-side. Drop it on a closing slide and it appears when it matters.
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
const blockMedal = ['🥈', '🥇', '🥉']
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
        <ol v-if="rest.length" class="podium-rest">
          <li v-for="e in rest" :key="e.rank + '-' + e.name" class="podium-row">
            <span class="podium-row-rank">{{ e.rank }}</span>
            <span class="podium-row-avatar" :style="{ background: e.color }">{{ e.emoji }}</span>
            <span class="podium-row-name">{{ e.name }}</span>
            <span class="podium-row-pts">{{ e.points }}</span>
          </li>
        </ol>
      </template>
    </div>
  </div>
</template>

<style scoped>
.podium {
  min-width: 300px;
  max-width: 480px;
  text-align: left;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 16px 18px;
}
.podium-title {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
  font-weight: 700;
  margin-bottom: 12px;
}
.podium-empty {
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
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
  font-size: 21px;
  line-height: 1;
  border: 2px solid rgba(255, 255, 255, 0.25);
}
.podium-name {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
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
  color: #0f172a;
}
.podium-col.first .podium-block { height: 130px; background: linear-gradient(180deg, #fbbf24, #b45309); }
.podium-col.second .podium-block { height: 100px; background: linear-gradient(180deg, #d1d5db, #6b7280); }
.podium-col.third .podium-block { height: 80px; background: linear-gradient(180deg, #f59e0b, #92400e); }
.podium-medal { font-size: 20px; }
.podium-rank { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; font-weight: 700; opacity: 0.75; }
.podium-pts { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 14px; font-weight: 800; }
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
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  padding: 6px 9px;
}
.podium-row-rank {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  min-width: 18px;
  text-align: right;
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
  border: 1px solid rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}
.podium-row-name {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.podium-row-pts {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  color: #38bdf8;
}
</style>
