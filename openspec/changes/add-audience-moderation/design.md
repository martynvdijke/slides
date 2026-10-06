## Context

Open/wordcloud answers are trimmed and length-capped only. Q&A is pre-moderated (pending → approved/hidden/answered) but has no participant column and no throttle. Aggregate queries (`computeQuestionStats`) include every answer and are cached for ~3s. The only limiter is the per-connection reaction token bucket; settings live in a single global row; events have no configuration beyond `feedback_open`.

## Goals / Non-Goals

**Goals:**
- Default-off filtering and throttling.
- Answer-level visibility with an admin moderation queue.
- Per-event Q&A slow mode.
- No behavior change when disabled; reuse existing settings/DTO/broadcast patterns.

**Non-Goals:**
- ML toxicity detection.
- Obfuscation/leetspeak normalization.
- Filtering names/authors; captcha or join gating.
- Per-event word lists (global list v1).
- Retroactive filtering (admins moderate manually).
- Audit logging.

## Decisions

- **Filter as global settings** (`filter_enabled`, `filter_words`, `filter_action` ∈ flag|reject), applied at write time in one shared helper used by the answer and Q&A paths. Matches the existing settings pattern; per-event lists deferred.
- **Matching**: lowercase, tokenize on non-alphanumeric boundaries, whole-token match; list split on newlines/commas; an empty list is a no-op. Avoids mid-word false positives.
- **`flag` is the default action.** Answers are stored with `status='flagged'`, excluded from aggregates, and the submitter sees "under review". Q&A rows keep their lifecycle but get `flagged=1` (badge, sorted first in the admin queue) since pending Q&A is invisible anyway. `reject` refuses with an error and stores nothing.
- **Answer visibility**: `answers.status TEXT NOT NULL DEFAULT 'visible'` ∈ visible|flagged|hidden. `computeQuestionStats` filters to visible. Moderation actions invalidate the stats cache and broadcast so live results update; CSV export and the results page inherit the same filtering.
- **Moderation API/UI**: `GET /api/admin/events/{id}/answers?status=&question_id=` returns question prompt, value, status, created_at and participant display identity (never tokens); `PATCH /api/admin/events/{id}/answers/{aid}` sets status. The admin Q&A panel gains a flagged-first moderation queue with approve/hide/restore.
- **Slow mode**: `events.qa_slow_mode_s INTEGER NOT NULL DEFAULT 0`; `qa_questions.participant_id` added so the server can check a participant's last submission. One shared helper enforces it on both REST and WS; rejections carry `retry_after_s`; the audience app shows the wait. DB-backed so reconnects and restarts do not reset it.
- **Explicit submitter feedback**: flag → accepted-with-review message; reject → explicit error; slow mode → retry countdown. No silent drops.

## Risks / Trade-offs

- False positives → whole-token matching, admin approve action, filter off by default.
- Obfuscation bypass → accepted limitation; admins can hide answers manually.
- Flagged answers excluded from aggregates may puzzle presenters → pending-moderation counts in admin and an "under review" hint to submitters.
- Cache invalidation bugs → moderation actions explicitly invalidate the stats cache and broadcast; covered by tests.

## Migration Plan

Additive `ensureColumn` migrations (`answers.status`, `qa_questions.participant_id`, `qa_questions.flagged`, `events.qa_slow_mode_s`, `settings.filter_*`); explicit SELECT lists updated. Defaults reproduce current behavior. Rollback safe.

## Open Questions

- None blocking; per-event filter lists can be layered on later.
