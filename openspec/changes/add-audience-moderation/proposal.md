## Why

Q&A has a moderation queue, but open-text and word-cloud answers reach aggregate results and the projector unfiltered, Q&A submission is unthrottled, and a bad answer cannot be removed after the fact. A small, configurable safety layer makes the tool usable at public events instead of only friendly meetups.

## What Changes

- Add a global, default-off blocked-word filter (enabled switch, word list, action `flag` or `reject`) applied to open-text / word-cloud answers and Q&A bodies before storage.
- Add answer visibility states (`visible`, `flagged`, `hidden`): non-visible answers are excluded from all aggregates, projections, the results page and CSV exports, and the submitter is told the answer is under review instead of seeing silence.
- Add an admin moderation queue for open answers (flagged first) with approve / hide / restore actions, plus the ability to proactively hide any visible answer.
- Add a per-event Q&A slow mode (seconds; 0 = off) enforced per participant on both the WebSocket and REST paths, with a clear retry hint to the audience.
- Store the submitting participant on Q&A rows (additive) so slow mode is enforceable across reconnects.
- Defaults preserve current behavior: filter disabled, slow mode off, all answers visible.

## Capabilities

### New Capabilities
- `content-filter`: configurable blocked-word filtering of audience text before storage.
- `answer-moderation`: answer visibility states and an admin moderation queue.
- `qa-slow-mode`: per-event per-participant Q&A submission interval.

### Modified Capabilities
- (none — no capability specs have been archived yet)

## Impact

- `server/db/db.go` (`answers.status`, `qa_questions.participant_id` and `flagged`, `events.qa_slow_mode_s`, settings filter columns; aggregate queries filter non-visible).
- `server/handlers/public.go`, `ws.go` (filter + slow-mode enforcement on both paths, retry hints), `admin.go` (moderation endpoints, event slow-mode field, filter settings), `common.go` (DTOs).
- `server/static/admin.js` / `admin.html` (filter card, moderation queue, slow-mode field), `app.js` / `audience.html` (under-review and rate-limit feedback).
- New shared moderation helper in the `handlers` package; no new dependencies.
