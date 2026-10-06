## Context

Individual quiz scoring/leaderboard lives in `server/db/stats.go` (top-N query around db.go:2209, joining `participants` for `display_name/emoji/color`). Participants are created per event by `participantID` (common.go) and their identity is set from the `identity` WebSocket case (ws.go:281) via `db.UpdateParticipantIdentity`. `events` already supports per-event toggles (e.g. `feedback_open`, `show_podium`) added through the `ensureColumn` additive-migration path (db.go:~417). Live state is broadcast by waking SSE subscribers (`BroadcastEvent`) and by the per-event broker in `server/live/broker.go`.

## Goals / Non-Goals

**Goals**
- Opt-in team competition per event, layered on the existing answer/scoring pipeline.
- Team membership attached to the anonymous participant identity — no accounts required.
- A live team leaderboard consistent with the individual one.

**Non-Goals**
- Team-level question authoring or per-team question sets.
- Authenticated participant accounts (see `add-persistent-participant-identity`).
- Cross-event team standings.

## Decisions

- **Schema (additive).**
  - `events.team_mode INTEGER NOT NULL DEFAULT 0`.
  - `teams (id, event_id, name, join_code TEXT UNIQUE, emoji, color, created_at)` — `join_code` unique per event so it can be entered or deep-linked.
  - `participants.team_id INTEGER` (nullable; `NULL` = individual/unassigned).
  All added via `ensureColumn` / `CREATE TABLE IF NOT EXISTS` so existing databases migrate cleanly.
- **Assignment.** Two paths: (a) participant selects a team in the audience app (`POST /api/events/{code}/team`), (b) host auto-assigns round-robin (`POST /api/admin/events/{id}/teams/assign`) for events without pre-registration. A participant may switch teams until they answer their first scored question; afterwards switching is rejected (409) to keep standings honest.
- **Scoring.** Reuse per-answer `points_base` scaled by speed. Team points = `SUM(points)` over members; team leaderboard groups by `team_id` and excludes unassigned participants. Computed in SQL in `stats.go`, exposed as a `Teams []TeamStanding` field on the live-state DTO only when `team_mode` is on.
- **Broadcast.** Team changes and auto-assign call `BroadcastEvent(eventID)`; the projector re-fetches state. Reuse the existing wake mechanism rather than adding a new frame type.
- **Projector.** `TeamLeaderboard.vue` mirrors `Leaderboard.vue`; the deck's `useLiveRoom.ts` already receives the full state, so it renders teams when `state.team_mode` is true.

## Risks / Trade-offs

- **Late joiners / team imbalance.** Auto-assign round-robin mitigates; hosts can rebalance manually.
- **Team switching gaming.** Freeze team after the first scored answer.
- **Empty teams.** Allowed (a team with 0 points); hidden from the projector by default with an admin toggle.
- **Backward compatibility.** `team_mode=0` keeps the individual path byte-for-byte; DTO gains are additive.
