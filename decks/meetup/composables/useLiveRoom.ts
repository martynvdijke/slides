import { computed, isRef, ref, type Ref } from 'vue'

/**
 * useLiveRoom — a tiny shared client for the slides live-question server.
 *
 * Drop `<LiveJoin>`, `<LiveQuestion>` and `<LiveQa>` into any deck. They share
 * one WebSocket per (base, event) pair so a deck with several live components
 * never opens more than one connection.
 *
 * The server URL resolution:
 *   1. the `base` prop, if given;
 *   2. else `VITE_LIVE_BASE_URL` baked in at build time (used on GitHub Pages
 *      to point at the hosted backend);
 *   3. else same-origin (the all-in-one container build).
 *
 * When `base` is empty the join link is relative, which is what you want when
 * the Go server serves the decks itself.
 */

export interface LiveResult {
  label: string
  count: number
  score?: number
  avg_rank?: number
}

export interface LiveQuestion {
  id: number
  kind: string
  prompt: string
  options: string[]
  results: LiveResult[]
  total: number
  respondents: number
  show_results: boolean
  media_url?: string
  media_type?: string
  is_feedback?: boolean
  answered?: boolean
  nps?: number
}

export interface LiveEvent {
  id: number
  code: string
  room_code?: string
  name: string
  description?: string
  status?: string
}

interface QAItem {
  id: number
  body: string
  author: string
  votes: number
  voted?: boolean
}

function envBase(): string {
  try {
    return (import.meta as any).env?.VITE_LIVE_BASE_URL || ''
  } catch {
    return ''
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

class RoomClient {
  state = ref<any>(null)
  connected = ref(false)
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoff = 1000
  private stopped = false

  constructor(private eventCode: string, private base: string) {
    this.connect()
  }

  private get origin(): string {
    if (this.base) return trimSlash(this.base)
    if (typeof location !== 'undefined') return location.origin
    return ''
  }

  private wsUrl(): string {
    const origin = this.origin
    if (origin) {
      return origin.replace(/^http/, 'ws') + '/ws/events/' + encodeURIComponent(this.eventCode)
    }
    const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss://' : 'ws://'
    const host = typeof location !== 'undefined' ? location.host : ''
    return proto + host + '/ws/events/' + encodeURIComponent(this.eventCode)
  }

  private stateUrl(): string {
    return this.origin + '/api/events/' + encodeURIComponent(this.eventCode) + '/state'
  }

  private connect() {
    if (this.stopped) return
    if (typeof WebSocket === 'undefined') {
      this.schedule()
      return
    }
    try {
      const ws = new WebSocket(this.wsUrl())
      this.ws = ws
      ws.onopen = () => {
        this.connected.value = true
        this.backoff = 1000
      }
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data)
          if (m && m.type === 'state') this.state.value = m.data
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onclose = () => {
        this.ws = null
        this.connected.value = false
        this.schedule()
      }
      ws.onerror = () => {
        try { ws.close() } catch {}
      }
    } catch {
      this.schedule()
    }
  }

  private schedule() {
    if (this.stopped || this.reconnectTimer) return
    const delay = this.backoff
    this.backoff = Math.min(this.backoff * 2, 10000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.pollOnce()
      this.connect()
    }, delay)
  }

  private async pollOnce() {
    try {
      const r = await fetch(this.stateUrl(), { cache: 'no-store' })
      if (r.ok) {
        this.state.value = await r.json()
        this.connected.value = true
      }
    } catch {
      /* offline; the join card still renders */
    }
  }

  dispose() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    try { this.ws?.close() } catch {}
    this.ws = null
  }
}

const clients = new Map<string, RoomClient>()

function roomClient(eventCode: string, base: string): RoomClient {
  const key = base + '|' + eventCode
  let client = clients.get(key)
  if (!client) {
    client = new RoomClient(eventCode, base)
    clients.set(key, client)
  }
  return client
}

export function useLiveRoom(
  eventCode: Ref<string> | string,
  base?: Ref<string> | string,
) {
  const code = computed(() => (isRef(eventCode) ? eventCode.value : eventCode))
  const baseUrl = computed(() => {
    const explicit = isRef(base) ? base?.value : base
    return explicit || envBase()
  })
  const client = roomClient(code.value, baseUrl.value)

  const event = computed<LiveEvent | null>(() => client.state.value?.event ?? null)
  const active = computed<LiveQuestion | null>(() => client.state.value?.active_question ?? null)
  const qa = computed<QAItem[]>(() => client.state.value?.qa ?? [])
  const roomCode = computed(() => event.value?.room_code || '')

  const joinUrl = computed(() => trimSlash(baseUrl.value) + '/e/' + encodeURIComponent(code.value))
  const qrSrc = computed(() => trimSlash(baseUrl.value) + '/api/events/' + encodeURIComponent(code.value) + '/qr.png')
  const joinPageUrl = computed(() => trimSlash(baseUrl.value) + '/join')

  function mediaUrl(raw?: string): string {
    if (!raw) return ''
    if (/^https?:\/\//.test(raw)) return raw
    return trimSlash(baseUrl.value) + (raw.startsWith('/') ? raw : '/' + raw)
  }

  return {
    state: client.state,
    connected: client.connected,
    event,
    active,
    qa,
    roomCode,
    joinUrl,
    joinPageUrl,
    qrSrc,
    mediaUrl,
  }
}
