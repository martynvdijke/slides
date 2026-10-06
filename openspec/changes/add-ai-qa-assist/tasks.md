## 1. Configuration

- [ ] 1.1 Add `aiEnabled()` gated on `AI_ENABLED` + `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL`
- [ ] 1.2 Document the variables in `README.md` and `.env.example`; pass through in `compose.yaml` (commented)
- [ ] 1.3 Unit test the gating matrix (off, partially configured, fully configured)

## 2. Provider client

- [ ] 2.1 Add `server/ai` with an OpenAI-compatible chat client (plain `net/http`, no SDK)
- [ ] 2.2 Implement clustering prompt + strict-JSON parse with defensive fallback
- [ ] 2.3 Implement digest prompt with per-event TTL cache keyed by Q&A-set hash
- [ ] 2.4 Tests: parse success/failure, cache hit/miss/TTL expiry (fake provider)

## 3. Endpoints

- [ ] 3.1 `GET /api/admin/events/{id}/qa/clusters` (admin-auth) returning `{enabled, themes}` or `{enabled:false}`
- [ ] 3.2 `POST /api/admin/events/{id}/qa/digest` returning `{enabled, digest}`
- [ ] 3.3 Register routes in `server/main.go` under the admin mux
- [ ] 3.4 Handler tests: disabled response, clustered response, provider-error response

## 4. Surfaces

- [ ] 4.1 `admin.js`/`admin.html`: show clusters and a "Summarize" digest control only when enabled
- [ ] 4.2 `PresenterPanel.vue` (+ `decks/meetup` mirror): render the digest/clusters, hidden when disabled

## 5. Verification

- [ ] 5.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 5.2 Manual: run with a fake/real provider and confirm clusters + digest; run disabled and confirm no change
