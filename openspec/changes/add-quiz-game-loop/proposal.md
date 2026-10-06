## Why

Quiz scoring, correctness and a live leaderboard exist, but the run of show is still a presenter clicking one question at a time: there is no clock, no locked/reveal moment and no finale. Without those phases the room cannot feel like a game. Completing the loop turns existing quiz questions into an event format — no new question kinds required.

## What Changes

- Add an optional per-question time limit (seconds; 0 = untimed), editable in the admin question editor and the in-slide presenter panel.
- Compute a server-authoritative deadline on activation and expose it in the live state so every client (deck, projector, audience) counts down from the same clock.
- Auto-lock a timed question when the deadline passes: late answers are rejected server-side and the question enters a `locked` phase instead of vanishing.
- Add an explicit reveal phase: the presenter reveals results and the correct answer after lock; reveal is broadcast and survives reconnects.
- Defer correctness disclosure: points are still scored at submit time, but `is_correct` / `points_awarded` are only shown to the participant at reveal.
- Add a presenter-toggled podium: top 3 plus full standings shown on the projector and audience app, hidden automatically when the next question activates.
- Keep untimed questions and older decks working: phases are additive, and older clients degrade to answer controls that the server politely rejects.

## Capabilities

### New Capabilities
- `quiz-timing`: server-authoritative question time limits, countdown propagation and auto-lock.
- `quiz-reveal`: locked → revealed lifecycle with controlled results and correctness disclosure.
- `quiz-podium`: presenter-toggled final standings screen.

### Modified Capabilities
- (none — no capability specs have been archived yet)

## Impact

- `server/db/db.go` (`questions.time_limit_s`, phase transitions, `events.show_podium`, deferred disclosure).
- `server/handlers/admin.go` (time-limit DTO, reveal and podium endpoints, status validation), `common.go` / `ws.go` / `public.go` (phase-aware state, answer rejection, deferred feedback).
- `server/static/app.js`, `live.js`, `admin.js`, `admin.html` (countdown, locked/revealed rendering, podium).
- `templates/deck/**` and `decks/meetup/**` (PresenterPanel timer/reveal/podium controls, LiveQuestion countdown/reveal, podium component, `useLiveRoom`) — mirrored in both decks.
