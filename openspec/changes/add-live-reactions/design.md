## Context

`server/live/broker.go` currently fans out a single wake frame per event; each subscriber reacts by rebuilding a personalized `BuildState` and writing it. Reactions must not trigger a state rebuild per emoji (too costly), so the broker needs to distinguish frame kinds.

## Goals / Non-Goals

**Goals:**
- Cheap, high-frequency emoji reactions end to end.
- No database writes.
- Bounded server fan-out and bounded client DOM.

**Non-Goals:**
- Persisting reactions or exposing historical reaction analytics.
- Per-emoji identity or attribution.

## Decisions

- Introduce a typed broker frame (e.g. `live.Frame{Kind string, Data []byte}`) so the WS handler can tell a `refresh` (rebuild state) from a `reactions` (forward verbatim) message. The admin stats socket keeps working.
- Aggregate in the broker on a ~150ms ticker into `map[emoji]int`, then broadcast one small JSON frame per event per tick.
- Validate the emoji against a fixed allowlist; enforce a per-subscriber token bucket (~5/s, burst 10) and drop excess silently.
- Client-side: cap simultaneous floating nodes (pooled, ~30 max), throttle sends to ~1 per 80ms, and use CSS/`requestAnimationFrame` animation with `pointer-events: none`.

## Risks / Trade-offs

- Reaction flooding → server-side rate limit + bounded batch size; client bounded node pool.
- Broker refactor could affect the admin stats socket → keep `refresh` semantics identical and verify the stats WS.
- Overlay obscuring slide content → pointer-events none, low opacity, short lifetimes.
