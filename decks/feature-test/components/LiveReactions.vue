<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

const props = withDefaults(defineProps<{
  event?: string
  room?: string
  base?: string
}>(), {
  event: '',
  room: '',
  base: '',
})

const { reactions, staticMode } = useLiveRoom({
  event: props.event,
  room: props.room,
  base: props.base,
})

interface Node {
  id: number
  emoji: string
  x: number
  drift: number
  duration: number
  delay: number
  size: number
  active: boolean
}

const MAX_NODES = 18
const nodes = ref<Node[]>([])
let seq = 0
let cleanupTimer: ReturnType<typeof setTimeout> | null = null

function prefersReduced(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

function spawn(emoji: string) {
  if (prefersReduced()) return
  const inactive = nodes.value.find(n => !n.active)
  const n: Node = {
    id: seq++,
    emoji,
    x: 8 + Math.random() * 84,
    drift: (Math.random() - 0.5) * 40,
    duration: 2000 + Math.random() * 1200,
    delay: 0,
    size: 18 + Math.random() * 18,
    active: true,
  }
  if (inactive) {
    Object.assign(inactive, n)
  } else if (nodes.value.length < MAX_NODES) {
    nodes.value.push(n)
  } else {
    const idx = Math.floor(Math.random() * nodes.value.length)
    Object.assign(nodes.value[idx], n)
  }
  setTimeout(() => {
    const found = nodes.value.find(v => v.id === n.id)
    if (found) found.active = false
  }, n.duration + 100)
}

watch(reactions, (batch) => {
  if (!batch || !batch.length) return
  if (prefersReduced()) return
  for (const { emoji, count } of batch) {
    const c = Math.min(count, 3)
    for (let i = 0; i < c; i++) {
      setTimeout(() => spawn(emoji), i * 140)
    }
  }
}, { deep: true })

onUnmounted(() => {
  if (cleanupTimer) clearTimeout(cleanupTimer)
})
</script>

<template>
  <div v-if="!staticMode" class="live-reactions" aria-hidden="true">
    <span
      v-for="n in nodes.filter(x => x.active)"
      :key="n.id"
      class="live-reactions-emoji"
      :style="{
        left: n.x + '%',
        fontSize: n.size + 'px',
        '--drift': n.drift + 'px',
        '--dur': n.duration + 'ms',
      } as any"
    >{{ n.emoji }}</span>
  </div>
</template>

<style scoped>
.live-reactions {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 9999;
}
.live-reactions-emoji {
  position: absolute;
  bottom: -40px;
  transform: translateX(-50%);
  display: inline-block;
  line-height: 1;
  will-change: transform, opacity;
  animation: rise var(--dur) ease-out forwards;
  opacity: .9;
  user-select: none;
}
@keyframes rise {
  0% {
    transform: translate3d(0, 0, 0) scale(0.7);
    opacity: 0;
  }
  12% { opacity: 1; transform: translate3d(0, -10vh, 0) scale(1); }
  60% { opacity: 1; }
  100% {
    transform: translate3d(var(--drift), -88vh, 0) scale(0.88);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .live-reactions { display: none; }
}
</style>
