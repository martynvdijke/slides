<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
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

const MAX_NODES = 30
const nodes = ref<Node[]>([])
let seq = 0
let cleanupTimer: ReturnType<typeof setTimeout> | null = null

function spawn(emoji: string) {
  // find reusable inactive slot or push
  const inactive = nodes.value.find(n => !n.active)
  const n: Node = {
    id: seq++,
    emoji,
    x: 5 + Math.random() * 90, // vw %
    drift: (Math.random() - 0.5) * 60, // px drift
    duration: 1800 + Math.random() * 1400,
    delay: 0,
    size: 22 + Math.random() * 26,
    active: true,
  }
  if (inactive) {
    Object.assign(inactive, n)
  } else if (nodes.value.length < MAX_NODES) {
    nodes.value.push(n)
  } else {
    // pool full — replace oldest inactive or random
    const idx = Math.floor(Math.random() * nodes.value.length)
    Object.assign(nodes.value[idx], n)
  }
  // deactivate after duration
  setTimeout(() => {
    const found = nodes.value.find(v => v.id === n.id)
    if (found) found.active = false
  }, n.duration + 100)
}

watch(reactions, (batch) => {
  if (!batch || !batch.length) return
  for (const { emoji, count } of batch) {
    const c = Math.min(count, 6)
    for (let i = 0; i < c; i++) {
      // stagger a bit
      setTimeout(() => spawn(emoji), i * 90)
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
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35));
  user-select: none;
}
@keyframes rise {
  0% {
    transform: translate3d(0, 0, 0) scale(0.7);
    opacity: 0;
  }
  10% { opacity: 1; transform: translate3d(0, -10vh, 0) scale(1); }
  60% { opacity: 1; }
  100% {
    transform: translate3d(var(--drift), -92vh, 0) scale(0.9);
    opacity: 0;
  }
}
</style>
