## 1. Audience app

- [x] 1.1 Add a per-event action buffer persisted in `localStorage`
- [x] 1.2 Flush the buffer in order on WebSocket reconnect with the REST fallback
- [x] 1.3 Prune buffer entries made obsolete by a state refresh
- [x] 1.4 Add haptic feedback on successful submit (guarded)

## 2. Server

- [x] 2.1 Accept an optional `client_uuid` on `answer` and ignore duplicates

## 3. Verification

- [x] 3.1 `cd server && go build ./... && go test ./...`
- [x] 3.2 Simulate a disconnect, submit an answer, reconnect, and confirm exactly-once delivery
