## Context

`server/static/app.js` already keeps a WebSocket with exponential-backoff reconnect (max 10s) and a REST fallback for `answer`/`qa`/`vote`. It does not persist unsent actions across a disconnect.

## Goals / Non-Goals

**Goals:**
- No silent loss of audience input on flaky networks.
- Minimal, client-only complexity.

**Non-Goals:**
- A server-side durable queue.
- Offline support for read/state data.
- Full offline-first PWA behavior.

## Decisions

- Keep a FIFO buffer in memory, persisted to `localStorage` keyed by event so it survives a tab reload.
- Flush on `ws.onopen`; reuse the existing send/pending path; fall back to REST only if the socket remains closed.
- Tag `answer` messages with an optional `client_uuid`; the server ignores an insert for an already-seen uuid (the `answers` uniqueness is per question+participant, and the uuid guard covers replay edge cases).
- Haptics via `navigator.vibrate?.()` guarded for feature support.

## Risks / Trade-offs

- Ordering vs duplicates → send in FIFO order and dedup by uuid.
- Storage growth → cap the buffer size and drop oldest on overflow.
- Stale actions after the question closed → server validation rejects them; client prunes on state refresh.
