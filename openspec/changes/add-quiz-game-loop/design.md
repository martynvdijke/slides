## Context

The question lifecycle is `draft → live → closed`. `AdminActivateQuestion` closes any other live question and sets `activated_at`; `GetActiveQuestion` returns only `status='live'`, so a closed question disappears from every client. Today "reveal" is just a PATCH of `show_results=true` on the still-live question. Scoring happens at submit time with elapsed capped at 30s; the leaderboard is a top-10 derived from awarded points. The only server-side timer in the codebase is the reaction debounce in the broker. Clients rebuild the full state on every `refresh` frame.

## Goals / Non-Goals

**Goals:**
- Server-authoritative countdown that survives reconnects.
- Explicit locked → revealed phases with controlled disclosure of the correct answer.
- Deferred correctness disclosure for suspense.
- Presenter-toggled podium, reconnect-safe.
- Untimed questions and older decks keep working.

**Non-Goals:**
- Question sets / auto-advance between questions (presenter still picks each question).
- Team mode.
- Changes to scoring math, question kinds, or the live leaderboard.
- Re-scoring answers at reveal.

## Decisions

- **Phases as question status values.** Add `locked` and `revealed` next to `draft|live|closed`; `GetActiveQuestion` returns the newest question in `live|locked|revealed`. One active question in state, minimal churn. Alternative (a separate `phase` column) duplicates lifecycle state.
- **Deadline, not a ticking broadcast.** `questions.time_limit_s INTEGER NOT NULL DEFAULT 0`; activation computes `deadline_at = activated_at + time_limit_s*1000` and the DTO exposes `activated_at`/`deadline_at`, so each client renders its own countdown with no extra frames. Reconnects recover the remaining time from state.
- **Auto-lock with a lazy fallback.** Activation schedules `time.AfterFunc(time_limit)` that idempotently locks the question if still live and broadcasts; answer submission also checks the deadline, and `BuildState` reconciles an expired-but-still-live question. A missed timer or restart cannot leave a question answerable.
- **Reveal endpoint.** `POST /api/admin/events/{id}/questions/{qid}/reveal` sets `status='revealed'` and `show_results=1`, then broadcasts. Legacy `show_results` PATCH keeps working for old decks.
- **Deferred disclosure.** Scoring stays at submit time (speed-scaled points depend on it). While the question is `live`/`locked`, answer responses and state omit `is_correct` / `points_awarded` / `my_correct`; they appear once `revealed`, or when `show_results` is on (preserves legacy instant feedback).
- **Podium on the event.** `events.show_podium INTEGER NOT NULL DEFAULT 0` toggled via `POST /api/admin/events/{id}/podium`, included in `EventDTO`/state, cleared when a question is activated. Persisted so late/reconnecting clients see it. Rendering on projector, audience app and a deck component.
- **Status whitelist.** `AdminUpdateQuestion` gains a status whitelist (`draft|live|locked|revealed|closed`) to prevent arbitrary states.

## Risks / Trade-offs

- Old decks render answer controls during locked/revealed → the server rejects late answers with an error; acceptable, documented degradation.
- Client clock skew → the countdown is cosmetic; rejection stays server-authoritative.
- Timer goroutine per active question → at most one at a time, replaced on activation; lazy fallback covers restarts.
- Deferred disclosure changes today's instant feedback → gated on `revealed || show_results`, so existing flows can keep it.

## Migration Plan

Additive `ensureColumn` migrations (`questions.time_limit_s`, `events.show_podium`); no data rewrite. Rollback = revert the image; extra columns are ignored.

## Open Questions

- None blocking. Question sets / auto-advance are explicitly deferred to a later change.
