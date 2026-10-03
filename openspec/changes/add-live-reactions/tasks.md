## 1. Server

- [x] 1.1 Add typed broker frames (`refresh` vs `reactions`) and a per-event reaction aggregator with a ~150ms tick
- [x] 1.2 Handle inbound `reaction` messages in `ws.go` with allowlist validation and a per-client rate limit
- [x] 1.3 Keep the admin stats WebSocket behaving as before

## 2. Audience app

- [x] 2.1 Add a reaction bar (allowlisted emoji) to the audience app
- [x] 2.2 Send `reaction` over WebSocket with client-side throttling

## 3. Deck / projector

- [x] 3.1 Add `LiveReactions.vue` overlay (bounded node pool) and mirror it to `decks/meetup`
- [x] 3.2 Expose reaction streams via `useLiveRoom.ts`

## 4. Verification

- [x] 4.1 `cd server && go build ./... && go test ./...`
- [x] 4.2 Confirm an old client/deck ignores `reactions` frames and keeps working
