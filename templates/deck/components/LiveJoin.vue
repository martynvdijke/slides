<script setup lang="ts">
import { computed } from 'vue'
import { useLiveRoom } from '../composables/useLiveRoom'

/**
 * Join card: QR code, the short room code and the join URL.
 * Works offline — it always renders, and only the live questions need the
 * server to be reachable.
 */
const props = withDefaults(defineProps<{
  event: string
  base?: string
  room?: string
  size?: number
  hint?: boolean
}>(), {
  base: '',
  room: '',
  size: 240,
  hint: true,
})

const { qrSrc, joinUrl, joinPageUrl, roomCode } = useLiveRoom(props.event, props.base)

const displayRoom = computed(() => props.room || roomCode.value)
const shortUrl = computed(() => joinUrl.value.replace(/^https?:\/\//, ''))
</script>

<template>
  <div class="live-join">
    <div class="live-join-qr">
      <img :src="qrSrc" alt="Scan to join" :width="size" :height="size" loading="lazy" />
    </div>
    <div class="live-join-meta">
      <div v-if="displayRoom" class="live-join-room-label">Room code</div>
      <div v-if="displayRoom" class="live-join-room">{{ displayRoom }}</div>
      <div class="live-join-url">{{ shortUrl }}</div>
      <div v-if="hint" class="live-join-hint">
        Scan, or visit <span class="live-join-join">{{ joinPageUrl.replace(/^https?:\/\//, '') }}</span> and enter the code
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-join {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  text-align: left;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 18px 22px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}
.live-join-qr {
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  line-height: 0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  border-top: 3px solid #326ce5;
}
.live-join-qr img {
  display: block;
  object-fit: contain;
}
.live-join-meta {
  min-width: 200px;
}
.live-join-room-label {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #94a3b8;
  font-weight: 700;
}
.live-join-room {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 2.6rem;
  font-weight: 800;
  letter-spacing: 0.28em;
  color: #f1f5f9;
  line-height: 1.1;
  margin: 2px 0 10px;
}
.live-join-url {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  color: #cbd5e1;
  word-break: break-all;
}
.live-join-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
  max-width: 280px;
}
.live-join-join {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: #93c5fd;
}
</style>
