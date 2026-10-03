## Context

Today `db.ActivateQuestion` sets `status='live'` and `activated_at=nowMs`, closing any other live question, and `BroadcastEvent` wakes every subscriber to rebuild `BuildState`. Nothing ever closes a question except an explicit admin call. Question stats/scoring already read `activated_at` for the quiz speed bonus, and `QuestionDTO` already flows to all three surfaces (audience app, projector, deck).

The countdown must be **authoritative on the server**: clients tick locally for smoothness but never decide when a question closes. It must also survive a process restart (a question activated for 60s should still expire if the server restarts at t=30s).

## Goals / Non-Goals

**Goals:**
- Per-question optional timer, auto-close on expiry, optional auto-reveal of results.
- Server-authoritative expiry, resilient to restart and clock skew.
- Visible countdown on phone, projector, and slide using a single `expires_at`.
- Zero behavior change for questions with no duration.

**Non-Goals:**
- Per-question pause/resume of the timer.
- Scheduling questions to *start* at a future time (that is the queue feature).
- Persistent countdown history/analytics.

## Decisions

- **Store settings on the question.** `duration_sec INTEGER` (0 = untimed), `auto_close INTEGER` (default 1 when a duration is set), `auto_reveal INTEGER` (default 0). Do not add an `expires_at` column; derive it as `activated_at + duration_sec*1000` so there is a single source of truth and no stale timestamp.
- **Reaper, not one timer per question.** Add a lightweight in-process scheduler in `server/handlers` (or `server/live`) that runs on a ~1s tick, queries `SELECT id, event_id FROM questions WHERE status='live' AND duration_sec>0 AND activated_at + duration_sec*1000 <= now`, and for each: `CloseQuestion`, optionally set `show_results`, then `BroadcastEvent`. A tick-based reaper survives restarts for free and avoids leaked timers.
- **Auto-reveal** sets `show_results=1` on the question at close so the existing results rendering (already gated on `show_results`) lights up without new client logic.
- **DTO.** Add `duration_sec`, `auto_reveal`, `expires_at`, and `remaining_sec` to `QuestionDTO`. Compute `remaining_sec` server-side at state build time (`max(0, expires_at - now)/1000`) so clients that join late get a correct value; clients then tick down locally between refreshes.
- **Client ticking.** All three surfaces render a ring/number from `remaining_sec` and decrement locally each second, resyncing on every `state` frame. Clock skew is irrelevant because the base value comes from the server.
- **Activate override.** `POST .../activate` accepts an optional `{duration_sec}` that overrides the question's stored value for this activation (lets the presenter ad-hoc time a question).

## Risks / Trade-offs

- **Reaper cost.** A 1s global tick with an indexed query is negligible at this scale; add an index on `questions(status)` if needed.
- **Close vs auto-reveal ordering.** Must close first (so no more answers) then reveal, in one DB transaction where possible, then a single broadcast.
- **Restart mid-question.** Because expiry is derived from `activated_at`, a restart merely resumes the correct countdown; a question already past expiry closes on the first reaper tick.
- **Backward compat.** Older decks ignore the new DTO fields; untimed questions never enter the reaper query.
