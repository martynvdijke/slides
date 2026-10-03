## Why

Slides and live interaction live in separate worlds: the deck advances in Slidev while the audience app and projector have no idea which slide is showing. Presenters context-switch to the presenter panel, the QR/notice can be stale, and there is no way to know which slide a question belongs to. Syncing the current slide index over the existing event WebSocket makes GitHub Pages decks feel native to the hosted backend and gives the audience orientation.

## What Changes

- The presenter broadcasts the current slide index (and total) over the event WebSocket using a new `slide` message type.
- The server stores the last-known slide per event (ephemeral, in memory) and includes it in the state snapshot as `current_slide`.
- The audience app and projector show a subtle "Slide N / total" indicator; the QR/join notice can depend on it.
- The in-deck presenter panel emits the slide change automatically (watching Slidev's navigation) when authenticated.
- Optional association of a question with a slide index is recorded for later analytics, but questions are not auto-activated.
- Fully backward compatible: clients that ignore `current_slide` keep working, and decks that never send `slide` simply leave it unset.

## Capabilities

### New Capabilities
- `slide-sync`: Presenter-driven current-slide broadcast over the event WebSocket with audience/projector display.

### Modified Capabilities
- (none)

## Impact

- `server/live/broker.go` (a non-refresh frame kind for slide updates, or a small per-event slide cache).
- `server/handlers/ws.go` (accept an authenticated `slide` inbound message; broadcast).
- `server/handlers/common.go` (`StateDTO.CurrentSlide`).
- `server/static/app.js` + `audience.html` (slide indicator).
- `server/static/live.js` (projector slide indicator).
- `templates/deck/components/PresenterPanel.vue`, `templates/deck/composables/useLiveRoom.ts` (+ `decks/meetup` mirror) — emit slide changes, expose `currentSlide`.
