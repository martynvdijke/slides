## Why

Polls currently show distributions but there is no notion of a correct answer, no reward for speed, and no standings — so the format cannot run as a competitive quiz. Adding correctness, speed-scaled points and a live leaderboard turns existing polls into a game, and lightweight participant identity makes standings and Q&A readable.

## What Changes

- Mark a correct option on `poll` and `yesno` questions and set a base point value.
- Score answers server-side: correct answers earn points scaled by how quickly they arrive after activation; wrong answers earn zero.
- Record a question activation timestamp for elapsed-time scoring.
- Expose a top-10 leaderboard in the live state snapshot and push updates when scores change.
- Add a projector `<Leaderboard />` component; show correctness and points to the answering participant.
- Add admin and presenter controls to set the correct option and points.
- Capture optional participant identity (name, emoji, color) for leaderboard and Q&A attribution.
- Schema additions are additive; existing question kinds and clients keep working.

## Capabilities

### New Capabilities
- `quiz-scoring`: server-authoritative correctness and speed-scaled points for quiz questions.
- `leaderboard`: live top-N standings derived from awarded points.
- `participant-identity`: optional per-participant display identity for attribution.

### Modified Capabilities
- (none)

## Impact

- `server/db/db.go` and `server/db/stats.go` (columns, scoring, leaderboard query).
- `server/handlers/common.go`, `admin.go`, `ws.go`, `public.go` (DTOs, state, endpoints, scoring).
- `server/static/admin.js`, `admin.html`, `app.js`, `audience.html`.
- `templates/deck/**` and `decks/meetup/**` (Leaderboard, PresenterPanel, LiveQuestion, useLiveRoom).
- No breaking API changes; all new JSON fields are additive.
