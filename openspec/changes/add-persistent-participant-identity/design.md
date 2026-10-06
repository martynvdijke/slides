## Context

Two cookies exist today: the host/session cookie (`meetup_session`) and the per-event participant cookie (`participantCookie`) which resolves to one `participants` row per event via `db.GetOrCreateParticipant(token, eventID)` (common.go). Identity is written by the `identity` WebSocket case through `db.UpdateParticipantIdentity(id, name, emoji, color)` (db.go:1997) and stored on the `participants` row (`display_name/emoji/color/last_seen`, added via `ensureColumn`). There is no cross-event record.

## Goals / Non-Goals

**Goals**
- One-tap re-identification for returning attendees, with consent.
- A stable handle that later features (team mode, analytics, badges) can key on without accounts.
- Strict privacy: anonymous default, self-service deletion.

**Non-Goals**
- Turning audience members into authenticated accounts or merging with host accounts (`users`).
- Server-side login/password for participants.
- Tracking across unrelated sites.

## Decisions

- **Separate cookie.** New `slides_profile` cookie, `HttpOnly`, `SameSite=Lax`, long TTL, token = UUID. It is validated against a `participant_profiles` row; unknown tokens are ignored (and a new one only issued on explicit opt-in). Kept distinct from the per-event participant cookie so existing flows are untouched.
- **Schema (additive).** `participant_profiles (id, token TEXT UNIQUE, display_name, emoji, color, created_at, last_seen, events_count INTEGER DEFAULT 0)`. On each join with a profile, `last_seen` updates and `events_count` increments once per distinct event (tracked via a small `profile_events(profile_id, event_id)` join to stay accurate).
- **Prefill.** `GET /api/profile` returns the profile (or 204). `join.js`/`app.js` prefill from it; `PUT /api/profile` sets/updates; `DELETE /api/profile` erases the profile and its `profile_events` rows, and clears the cookie. All public, token-scoped.
- **Attaching to answers.** On join, if a profile exists, its display fields seed the `participants` row (name/emoji/color) so leaderboard/Q&A attribution works without retyping. This is a copy, not a foreign key, so deleting a profile does not corrupt event history (see `add-audit-log-and-gdpr` for erasure semantics).
- **Badges/streaks.** Derived at read time from `events_count` (e.g. "3 events"); no separate storage. Kept non-competitive to avoid pressure.
- **Opt-in.** No profile is created unless the participant opens profile setup and saves. The join flow works anonymously otherwise.

## Risks / Trade-offs

- **Privacy.** A persistent identifier is sensitive; default off, clearly labelled, deletable, and never shared with hosts beyond the per-event attribution already shown.
- **Cookie loss.** Clearing cookies loses the profile (acceptable; anonymous fallback).
- **Duplicate identity across devices.** Not solved (no accounts by design); documented as a limitation.
- **Interaction with erasure.** Deletion clears the profile; historical event rows keep the copied display name unless event-level erasure is invoked.
