## Why

Participant identity today is **per event**: `participants` rows are created per event by a per-event device cookie (`participantID` in common.go), and `display_name/emoji/color` are set from the WebSocket `identity` case. A returning attendee must retype their name at every event, and there is no stable, consent-based identity to power team mode, streak-style engagement or cross-event analytics. This change adds an **opt-in** cross-event profile while keeping anonymous participation the default.

## What Changes

- Add an opt-in **participant profile** stored server-side, addressed by a single long-lived, `HttpOnly` signed cookie (`slides_profile`), separate from the per-event participant cookie.
- Profile fields: `display_name`, `emoji`, `color`, `first_seen`, `last_seen`, `events_count`.
- On the join/entry flow, if a profile exists, **prefill** the name/emoji/color so joining is one tap; the participant can edit or clear it.
- Derive lightweight, non-competitive **badges/streaks** (e.g. events attended) from the profile history for display in the audience app.
- Self-service **view / export / delete** of the profile (delete also erases derived stats).
- Fully opt-in: with no profile cookie, participation is anonymous exactly as today.

## Capabilities

### New Capabilities
- `participant-profile`: Opt-in cross-event participant identity with prefill, self-service access and deletion.

### Modified Capabilities
- (none — anonymous per-event identity is unchanged)

## Impact

- `server/db/db.go` (profiles table or additive columns; lookup by token).
- `server/handlers/common.go` (profile cookie helpers), `handlers/public.go` / `ws.go` (prefill + attach), `server/main.go` (routes).
- `server/static/join.js`, `app.js`, `audience.html`, `entry.html` (prefill + profile UI).
- `README.md` (privacy note).
- Additive only; no change to answer/Q&A contracts.
