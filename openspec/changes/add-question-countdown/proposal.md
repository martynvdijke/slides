## Why

Live questions stay open until a presenter remembers to close them, which creates dead air and lets late answers trickle in long after the room has moved on. A host-set countdown gives each question a clear window, auto-closes it, and (optionally) auto-reveals results, turning every poll from limp into urgent without the presenter babysitting a stopwatch.

## What Changes

- Questions gain an optional `duration_sec` (5–180), `auto_close`, and `auto_reveal` setting.
- When a question is activated, the server records an authoritative `expires_at` derived from `activated_at + duration_sec`.
- On expiry the server closes the question automatically and broadcasts a refresh; if `auto_reveal` is set, results are shown.
- The active question DTO exposes `expires_at` and `remaining_sec` so clients can render a countdown ring driven by server time.
- Audience app, projector (`live.js`), and in-deck `LiveQuestion.vue` render a countdown for timed questions.
- Presenter panel and admin console let the host set a duration and show a timer chip.
- Fully backward compatible: questions without a duration behave exactly as today.

## Capabilities

### New Capabilities
- `question-countdown`: Host-set per-question timer with authoritative server expiry, auto-close, and optional auto-reveal.

### Modified Capabilities
- (none)

## Impact

- `server/db/db.go` (migration: `duration_sec`, `auto_close`, `auto_reveal`; activation sets `expires_at`; query for due questions).
- `server/handlers/admin.go` (create/update question accept duration settings; activate accepts a duration override).
- `server/handlers/common.go` (`QuestionDTO` gains `expires_at`, `remaining_sec`, `duration_sec`, `auto_reveal`).
- `server/handlers/ws.go` + a scheduler (per-event `time.AfterFunc`/reaper that closes due questions and broadcasts).
- `server/static/app.js`, `server/static/live.js`, `server/static/admin.js`, `server/static/admin.html`.
- `templates/deck/components/LiveQuestion.vue`, `templates/deck/components/PresenterPanel.vue`, `templates/deck/composables/useLiveRoom.ts` (+ `decks/meetup` mirror).
