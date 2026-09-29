<script setup lang="ts">
/**
 * Backwards-compatible combined card: join QR + room code + live question
 * results. Prefer composing <LiveJoin>, <LiveQuestion> and <LiveQa> directly
 * for more control.
 */
withDefaults(defineProps<{
  event: string
  base?: string
  results?: boolean
}>(), {
  base: '',
  results: true,
})
</script>

<template>
  <div class="liveqr-wrap">
    <LiveJoin :event="event" :base="base" />
    <div class="liveqr-panel">
      <LiveQuestion :event="event" :base="base" :show-results="results" />
    </div>
  </div>
</template>

<style scoped>
.liveqr-wrap {
  display: flex;
  gap: 22px;
  align-items: flex-start;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 900px;
  margin: 0 auto;
}
.liveqr-panel {
  flex: 1;
  min-width: 280px;
  max-width: 440px;
}
</style>
