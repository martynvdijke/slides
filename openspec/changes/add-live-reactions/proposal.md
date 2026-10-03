## Why

Audience participation today is limited to answering questions, so the room is silent between prompts. Lightweight emoji reactions give presenters immediate, low-effort feedback and make the live session feel alive, without writing anything to the database.

## What Changes

- Audience phones can send emoji reactions (👏 🔥 ❤️ 😂 🤯 👍) over the existing event WebSocket.
- The server aggregates reactions per event and broadcasts batched counts on a ~150ms tick, with per-client rate limiting.
- A new projector/deck overlay component `<LiveReactions />` floats the reactions across the slide.
- A reaction bar is added to the audience app.
- Reactions are ephemeral: no database storage.
- Fully backward compatible — older decks ignore the new messages.

## Capabilities

### New Capabilities
- `live-reactions`: Ephemeral emoji reactions from the audience, aggregated and projected live.

### Modified Capabilities
- (none)

## Impact

- `server/live/broker.go` (typed broadcast frames + reaction aggregation).
- `server/handlers/ws.go` (reaction inbound handling, rate limiting).
- `server/static/app.js` + `server/static/audience.html` (reaction bar).
- `templates/deck/components/LiveReactions.vue` (+ `decks/meetup` mirror) and `templates/deck/composables/useLiveRoom.ts`.
- No database or REST changes.
