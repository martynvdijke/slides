## 1. Server

- [x] 1.1 Add an ephemeral per-event slide cache to the broker (or handlers) with get/set
- [x] 1.2 Accept an inbound `slide` message `{index,total,title}` on the event WS, allowed only for an authenticated presenter session
- [x] 1.3 Broadcast a `slide` frame to all subscribers (no full state rebuild)
- [x] 1.4 Include `CurrentSlide` in `StateDTO`/`BuildState` so late joiners see it
- [x] 1.5 Ensure unauthenticated `slide` attempts are rejected and logged

## 2. Client — audience + projector

- [x] 2.1 `app.js` + `audience.html`: show a subtle "Slide N / total" indicator, updating on `slide` frames and state
- [x] 2.2 `live.js` (projector): same indicator near the header
- [x] 2.3 Hide the indicator when no slide has been reported

## 3. Deck / presenter

- [x] 3.1 `PresenterPanel.vue`: emit slide changes on navigation (throttled) when authenticated
- [x] 3.2 `useLiveRoom.ts`: expose `currentSlide` and a `sendSlide()` helper
- [x] 3.3 Mirror edited deck files into `decks/meetup/`

## 4. Verification

- [x] 4.1 `cd server && go build ./... && go test ./...` (add a slide-broadcast/auth test)
- [x] 4.2 Manual: navigate the deck → phone and projector indicators track within a second
- [x] 4.3 Manual: an anonymous client sending `slide` is rejected and cannot move the indicator
- [x] 4.4 Confirm a late-joining phone receives the current slide in its initial state
