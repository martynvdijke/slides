## Context

Existing schema: `questions(id, event_id, kind, mode, prompt, options JSON, position, status, show_results, is_feedback, media_url, media_type)`; `answers(id, question_id, participant_id, value, UNIQUE(question_id, participant_id))`; `participants(id, token UNIQUE, event_id)`. Event linkage for answers is through `questions.event_id`. Migrations are additive via `ensureColumn`.

## Goals / Non-Goals

**Goals:**
- Make existing polls competitive with minimal new concepts.
- Server-authoritative scoring (clients cannot self-report points).
- Live standings without expensive queries.

**Non-Goals:**
- Re-scoring historical answers.
- Complex anti-cheat or per-device fingerprinting.
- Scoring question kinds that are not `poll`/`yesno`.

## Decisions

- Add `questions.correct_index INTEGER NULL`, `points_base INTEGER NOT NULL DEFAULT 100`, `activated_at INTEGER NULL`; `answers.is_correct INTEGER NULL`, `points_awarded INTEGER NOT NULL DEFAULT 0`, `elapsed_ms INTEGER NULL`, `client_uuid TEXT NULL` (partial unique index); `participants.display_name/emoji/color/last_seen`.
- Scoring formula: `elapsed = clamp(now - activated_at, 0, 30000)`; `correct ? max(round(points_base * (1 - elapsed/30000)), round(points_base * 0.1)) : 0`.
- Leaderboard: `SUM(answers.points_awarded)` grouped by `answers.participant_id`, joined through `questions.event_id` to `participants`; top 10; cached ~1s in memory and pushed through the existing state-refresh broadcast.
- Expose `correct_index` in the state only when `show_results` is true, to avoid leaking the answer before reveal; per-participant `my_correct`/`my_points` are private to the requester.
- Identity reuses the anonymous `meetup_participant` cookie and existing `participants` row; no new table. Sanitize name (≤24 chars), color (allowlist), emoji (allowlist).

## Risks / Trade-offs

- Network latency skews speed scoring → 30s window and a minimum award bound the effect.
- Revealing correctness before the host reveals results → acceptable (private to the answerer).
- Leaderboard query cost → indexed `SUM` + short cache; recompute only on score change.
- Identity is unauthenticated → sanitized, denormalized, and never correlated across events.
