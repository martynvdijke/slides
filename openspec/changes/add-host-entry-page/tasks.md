## 1. Routing

- [x] 1.1 Add an exact-root handler in `server/main.go` that serves embedded `entry.html` (`GET /{$}`)
- [x] 1.2 Confirm the existing `GET /` deck file server is retained for subpaths

## 2. Entry page

- [x] 2.1 Create `server/static/entry.html` with the Host/Participant split, room-code input, and deck-index link
- [x] 2.2 Implement signed-in auto-continue via `GET /api/auth/me` and first-run copy via `GET /api/setup/status`

## 3. Verification

- [x] 3.1 `cd server && go build ./... && go test ./...`
- [x] 3.2 Manually curl `/`, `/meetup/`, `/opencode/`, `/index.html`, `/admin` and confirm expected responses
