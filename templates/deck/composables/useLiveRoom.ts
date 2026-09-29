import { computed, isRef, ref, watchEffect, type Ref } from 'vue'

/**
 * useLiveRoom — a tiny shared client for the slides live-question server.
 *
 * Drop `<LiveJoin>`, `<LiveQuestion>`, `<LiveQa>` or `<PresenterPanel>` into
 * any deck. They share one WebSocket per (base, event) pair, so a deck with
 * several live components never opens more than one connection.
 *
 * Address resolution, most specific first:
 *   event   – the stable public event code (e.g. "cloud-native-a1b2");
 *   room    – the short room code (e.g. "AB2C3"), resolved to an event via
 *             GET /api/join/{room};
 *   env     – VITE_EVENT_CODE / VITE_ROOM_CODE baked in at build time;
 *   base    – ...prop, else VITE_LIVE_BASE_URL, else same-origin.
 *
 * With no event/room configured `configured` is false and components render a
 * setup hint instead of a broken QR code.
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

type Value<T> = T | Ref<T>

function env(key: string): string {
  try {
    return (import.meta as any).env?.[key] || ''
  } catch {
    return ''
  }
}

function readValue<T>(value: Value<T> | undefined, fallback: T): T {
  if (value === undefined) return fallback
  return isRef(value) ? value.value : value
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

/** Fetch the public event for a short room code (returns null when unknown). */
export async function resolveRoom(base: string, room: string): Promise<LiveEvent | null> {
  try {
    const r = await fetch(trimSlash(base) + '/api/join/' + encodeURIComponent(room), { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    if (!j || !j.code) return null
    return j as LiveEvent
  } catch {
    return null
  }
}

export function useLiveRoom(options: {
  event?: Value<string>
  room?: Value<string>
  base?: Value<string>
} = {}) {
  const baseUrl = computed(() => {
    const explicit = readValue(options.base, '')
    return explicit || env('VITE_LIVE_BASE_URL')
  })

  const explicitEvent = computed(() => readValue(options.event, '') || env('VITE_EVENT_CODE'))
  const explicitRoom = computed(() => readValue(options.room, '') || env('VITE_ROOM_CODE'))

  const resolvedCode = ref('')
  const resolveError = ref(false)

  watchEffect(() => {
    if (explicitEvent.value) {
      resolvedCode.value = explicitEvent.value
      resolveError.value = false
      return
    }
    const room = explicitRoom.value
    if (!room) {
      resolvedCode.value = ''
      resolveError.value = false
      return
    }
    // Resolve the short room code once; guard against stale async results.
    let active = true
    resolveError.value = false
    resolveRoom(baseUrl.value, room).then((ev) => {
      if (!active) return
      if (ev) {
        resolvedCode.value = ev.code
      } else {
        resolvedCode.value = ''
        resolveError.value = true
      }
    })
    return () => { active = false }
  })

  const client = ref<RoomClient | null>(null)
  watchEffect(() => {
    if (resolvedCode.value) {
      client.value = roomClient(resolvedCode.value, baseUrl.value)
    } else {
      client.value = null
    }
  })

  const state = computed(() => client.value?.state.value ?? null)
  const connected = computed(() => client.value?.connected.value ?? false)

  const configured = computed(() => !!resolvedCode.value)
  const event = computed<LiveEvent | null>(() => state.value?.event ?? null)
  const active = computed<LiveQuestion | null>(() => state.value?.active_question ?? null)
  const qa = computed<QAItem[]>(() => state.value?.qa ?? [])
  const roomCode = computed(() => event.value?.room_code || explicitRoom.value || '')

  const code = computed(() => resolvedCode.value)
  const joinUrl = computed(() => (code.value ? trimSlash(baseUrl.value) + '/e/' + encodeURIComponent(code.value) : ''))
  const qrSrc = computed(() => (code.value ? trimSlash(baseUrl.value) + '/api/events/' + encodeURIComponent(code.value) + '/qr.png' : ''))
  const joinPageUrl = computed(() => trimSlash(baseUrl.value) + '/join')

  function mediaUrl(raw?: string): string {
    if (!raw) return ''
    if (/^https?:\/\//.test(raw)) return raw
    return trimSlash(baseUrl.value) + (raw.startsWith('/') ? raw : '/' + raw)
  }

  return {
    state,
    connected,
    configured,
    resolveError,
    event,
    active,
    qa,
    roomCode,
    code,
    joinUrl,
    joinPageUrl,
    qrSrc,
    mediaUrl,
  }
}
