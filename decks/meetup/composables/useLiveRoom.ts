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
  status?: string
  time_limit_s?: number
  activated_at?: number | null
  deadline_at?: number | null
  media_url?: string
  media_type?: string
  is_feedback?: boolean
  answered?: boolean
  nps?: number
  correct_index?: number | null
  points_base?: number
  my_correct?: boolean | null
  my_points?: number
  duration_sec?: number
  auto_reveal?: boolean
  expires_at?: number
  remaining_sec?: number | null
}

export interface LiveEvent {
  id: number
  code: string
  room_code?: string
  name: string
  description?: string
  status?: string
  show_podium?: boolean
}

interface QAItem {
  id: number
  body: string
  author: string
  votes: number
  voted?: boolean
}

export interface ReactionCount {
  emoji: string
  count: number
}

export interface LeaderboardEntry {
  rank: number
  name: string
  emoji: string
  color: string
  points: number
}

export interface Me {
  name: string
  emoji: string
  color: string
}

export interface AnswerResult {
  is_correct: boolean | null
  points_awarded: number
  total_points: number
}

export interface SlideInfo {
  index: number
  total: number
  title?: string
  id?: string
}

export interface JoinSession {
  expires_at: number
  remaining_s: number
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
  reactions = ref<ReactionCount[]>([])
  answerResult = ref<AnswerResult | null>(null)
  currentSlide = ref<SlideInfo | null>(null)
  remainingSec = ref<number | null>(null)
  // 4h join session — when expired the deck shows a projector hint
  sessionExpired = ref(false)
  rejoinUrl = ref('')
  joinSession = ref<JoinSession | null>(null)
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoff = 1000
  private stopped = false
  private remainingTimer: ReturnType<typeof setInterval> | null = null
  private slideThrottle: ReturnType<typeof setTimeout> | null = null
  private pendingSlide: SlideInfo | null = null
  private lastSlideSent = 0

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

  private joinUrlApi(): string {
    return this.origin + '/api/events/' + encodeURIComponent(this.eventCode) + '/join'
  }

  private markSessionExpired(rejoinUrl?: string) {
    this.sessionExpired.value = true
    if (rejoinUrl) this.rejoinUrl.value = rejoinUrl
    else if (!this.rejoinUrl.value) {
      // fallback — audience can rejoin via /e/{code}
      this.rejoinUrl.value = this.origin + '/e/' + encodeURIComponent(this.eventCode)
    }
    this.connected.value = false
    // stop auto-reconnect while expired — user must rejoin explicitly
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    try { this.ws?.close() } catch {}
    this.ws = null
  }

  private clearSessionExpired() {
    this.sessionExpired.value = false
  }

  private syncJoinSession(data: any) {
    // StateDTO may include join_session:{expires_at, remaining_s}
    if (data && data.join_session && typeof data.join_session.expires_at === 'number') {
      this.joinSession.value = {
        expires_at: data.join_session.expires_at,
        remaining_s: typeof data.join_session.remaining_s === 'number' ? data.join_session.remaining_s : 0,
      }
    } else {
      this.joinSession.value = null
    }
  }

  private syncCurrentSlide(data: any) {
    if (data && typeof data === 'object' && data.current_slide && typeof data.current_slide.index === 'number' && typeof data.current_slide.total === 'number') {
      this.currentSlide.value = { index: data.current_slide.index, total: data.current_slide.total, title: data.current_slide.title || '', id: data.current_slide.id || '' }
    } else if (data && data.current_slide === null) {
      this.currentSlide.value = null
    } else if (!data?.current_slide) {
      if (!this.currentSlide.value) this.currentSlide.value = null
    }
  }

  private syncRemainingSec(data: any) {
    // clear existing tick
    if (this.remainingTimer) {
      clearInterval(this.remainingTimer)
      this.remainingTimer = null
    }
    const aq = data?.active_question
    if (aq && typeof aq.remaining_sec === 'number') {
      const v = Math.max(0, Math.floor(aq.remaining_sec))
      this.remainingSec.value = v
      if (v > 0) {
        this.remainingTimer = setInterval(() => {
          if (this.remainingSec.value !== null && this.remainingSec.value > 0) {
            this.remainingSec.value = this.remainingSec.value - 1
            if (this.remainingSec.value <= 0) {
              this.remainingSec.value = 0
              if (this.remainingTimer) { clearInterval(this.remainingTimer); this.remainingTimer = null }
            }
          }
        }, 1000)
      }
    } else {
      this.remainingSec.value = null
    }
  }

  private connect() {
    if (this.stopped) return
    if (this.sessionExpired.value) return
    if (typeof WebSocket === 'undefined') {
      this.schedule()
      return
    }
    try {
      const ws = new WebSocket(this.wsUrl())
      this.ws = ws
      ws.onopen = () => {
        if (this.sessionExpired.value) {
          try { ws.close() } catch {}
          return
        }
        this.connected.value = true
        this.backoff = 1000
      }
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data)
          if (!m || typeof m.type !== 'string') return
          // 4h join expiry — sent before close
          if (m.type === 'session_expired' || m.code === 'join_expired') {
            const url = m?.data?.rejoin_url || m?.rejoin_url || ''
            this.markSessionExpired(url)
            return
          }
          if (m.type === 'state' && m.data) {
            // if we were expired but got a fresh state, clear the flag
            if (this.sessionExpired.value) this.clearSessionExpired()
            this.state.value = m.data
            this.syncCurrentSlide(m.data)
            this.syncRemainingSec(m.data)
            this.syncJoinSession(m.data)
            const aq = m.data?.active_question
            if (aq && typeof aq.my_correct !== 'undefined') {
              if (aq.my_correct !== null && aq.my_correct !== undefined) {
                this.answerResult.value = {
                  is_correct: aq.my_correct ?? null,
                  points_awarded: aq.my_points ?? 0,
                  total_points: this.answerResult.value?.total_points ?? 0,
                }
              }
            }
          } else if (m.type === 'slide') {
            const d = (m.data && typeof m.data.index === 'number') ? m.data : m
            if (typeof d.index === 'number' && typeof d.total === 'number') {
              this.currentSlide.value = { index: d.index, total: d.total, title: d.title || '', id: d.id || '' }
            }
          } else if (m.type === 'reactions' && Array.isArray(m.data)) {
            this.reactions.value = m.data as ReactionCount[]
          } else if (m.type === 'result' && m.for === 'answer') {
            if (typeof m.is_correct !== 'undefined' || typeof m.points_awarded !== 'undefined') {
              this.answerResult.value = {
                is_correct: m.is_correct ?? null,
                points_awarded: m.points_awarded ?? 0,
                total_points: m.total_points ?? 0,
              }
            }
          } else if (m.type === 'ping' || m.type === 'pong' || m.type === 'error') {
            // Surface join_expired delivered as an error frame as well
            if (m.code === 'join_expired' || m.error === 'join_expired') {
              const url = m?.data?.rejoin_url || m?.rejoin_url || ''
              this.markSessionExpired(url)
            }
          } else {
            // unknown type — ignore for backward compat
          }
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onclose = () => {
        this.ws = null
        if (this.sessionExpired.value) {
          this.connected.value = false
          return
        }
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
    if (this.stopped || this.sessionExpired.value || this.reconnectTimer) return
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
      const r = await fetch(this.stateUrl(), { cache: 'no-store', credentials: 'same-origin' })
      if (r.status === 401) {
        try {
          const j = await r.json()
          if (j && (j.code === 'join_expired' || j.error === 'join_expired')) {
            const url = j.rejoin_url || j?.data?.rejoin_url || ''
            this.markSessionExpired(url)
            return
          }
        } catch {}
        // generic 401 without code — don't treat as expired
        return
      }
      if (r.ok) {
        const data = await r.json()
        if (this.sessionExpired.value) this.clearSessionExpired()
        this.state.value = data
        this.syncCurrentSlide(data)
        this.syncRemainingSec(data)
        this.syncJoinSession(data)
        this.connected.value = true
      }
    } catch {
      /* offline; the join card still renders */
    }
  }

  async rejoin(): Promise<boolean> {
    try {
      const r = await fetch(this.joinUrlApi(), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!r.ok) {
        // if backend returns rejoin_url on failure, keep showing sheet
        try {
          const j = await r.json()
          if (j && j.rejoin_url) this.rejoinUrl.value = j.rejoin_url
        } catch {}
        return false
      }
      // success — clear expiry and reconnect
      this.clearSessionExpired()
      this.rejoinUrl.value = ''
      this.backoff = 1000
      await this.pollOnce()
      // re-open WS even if poll succeeded
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connect()
      }
      return true
    } catch {
      return false
    }
  }

  sendIdentity(name: string, emoji: string, color: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(JSON.stringify({ type: 'identity', name, emoji, color }))
    } catch {}
  }

  sendSlide(index: number, total: number, title?: string, id?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const payload: SlideInfo = { index, total, title: title || '', id: id || '' }
    const now = Date.now()
    const doSend = (p: SlideInfo) => {
      try {
        this.ws!.send(JSON.stringify({ type: 'slide', index: p.index, total: p.total, title: p.title || '', id: p.id || '' }))
        this.lastSlideSent = Date.now()
        this.currentSlide.value = { index: p.index, total: p.total, title: p.title || '', id: p.id || '' }
      } catch {}
    }
    if (this.slideThrottle) {
      this.pendingSlide = payload
      return
    }
    if (now - this.lastSlideSent < 200) {
      this.pendingSlide = payload
      this.slideThrottle = setTimeout(() => {
        this.slideThrottle = null
        const p = this.pendingSlide
        this.pendingSlide = null
        if (p) doSend(p)
      }, 200 - (now - this.lastSlideSent))
      return
    }
    doSend(payload)
  }

  dispose() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.remainingTimer) clearInterval(this.remainingTimer)
    this.remainingTimer = null
    if (this.slideThrottle) clearTimeout(this.slideThrottle)
    this.slideThrottle = null
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
  const sessionExpired = computed(() => client.value?.sessionExpired.value ?? false)
  const rejoinUrl = computed(() => client.value?.rejoinUrl.value ?? '')
  const joinSession = computed<JoinSession | null>(() => client.value?.joinSession.value ?? null)

  const staticMode = computed(() => !!env('VITE_STATIC_EXPORT'))
  const configured = computed(() => !!resolvedCode.value)
  const event = computed<LiveEvent | null>(() => state.value?.event ?? null)
  const active = computed<LiveQuestion | null>(() => state.value?.active_question ?? null)
  const deadlineAt = computed<number | null>(() => {
    const a = active.value
    if (!a) return null
    if (typeof a.deadline_at === 'number' && a.deadline_at > 0) return a.deadline_at
    if (typeof a.time_limit_s === 'number' && a.time_limit_s > 0 && typeof a.activated_at === 'number' && a.activated_at > 0) {
      return a.activated_at + a.time_limit_s * 1000
    }
    return null
  })
  const qa = computed<QAItem[]>(() => state.value?.qa ?? [])
  const roomCode = computed(() => event.value?.room_code || explicitRoom.value || '')

  const code = computed(() => resolvedCode.value)
  const joinUrl = computed(() => (code.value ? trimSlash(baseUrl.value) + '/e/' + encodeURIComponent(code.value) : ''))
  const qrSrc = computed(() => (code.value ? trimSlash(baseUrl.value) + '/api/events/' + encodeURIComponent(code.value) + '/qr.png' : ''))
  const joinPageUrl = computed(() => trimSlash(baseUrl.value) + '/join')

  const reactions = computed<ReactionCount[]>(() => client.value?.reactions.value ?? [])
  const leaderboard = computed<LeaderboardEntry[]>(() => state.value?.leaderboard ?? [])
  const me = computed<Me | null>(() => state.value?.me ?? null)
  const answerResult = computed<AnswerResult | null>(() => client.value?.answerResult.value ?? null)
  const remainingSec = computed<number | null>(() => client.value?.remainingSec.value ?? null)
  const currentSlide = computed<SlideInfo | null>(() => client.value?.currentSlide.value ?? null)

  function mediaUrl(raw?: string): string {
    if (!raw) return ''
    if (/^https?:\/\//.test(raw)) return raw
    return trimSlash(baseUrl.value) + (raw.startsWith('/') ? raw : '/' + raw)
  }

  function sendIdentity(name: string, emoji: string, color: string) {
    client.value?.sendIdentity(name, emoji, color)
  }

  function sendSlide(index: number, total: number, title?: string, id?: string) {
    client.value?.sendSlide(index, total, title, id)
  }

  async function rejoin(): Promise<boolean> {
    if (!client.value) return false
    return client.value.rejoin()
  }

  return {
    state,
    connected,
    sessionExpired,
    rejoinUrl,
    joinSession,
    staticMode,
    configured,
    resolveError,
    event,
    active,
    deadlineAt,
    qa,
    roomCode,
    code,
    joinUrl,
    joinPageUrl,
    qrSrc,
    mediaUrl,
    reactions,
    leaderboard,
    me,
    answerResult,
    remainingSec,
    currentSlide,
    sendIdentity,
    sendSlide,
    rejoin,
  }
}
