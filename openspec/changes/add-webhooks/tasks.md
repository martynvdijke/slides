## 1. Config + data

- [x] 1.1 Add `settings` columns `webhook_url`, `webhook_secret`, `webhook_enabled`, `webhook_events` (JSON array) with `ensureColumn` migrations
- [x] 1.2 Add `db.GetWebhookSettings` / `db.UpdateWebhookSettings` following the SMTP/OTel helpers
- [x] 1.3 Add `server/webhookcfg` resolving DB settings + `WEBHOOK_*` env overrides

## 2. Sender

- [x] 2.1 Add a `notify(eventType, event, data)` sender: async POST, short timeout, JSON envelope `{event,type,data,timestamp}`
- [x] 2.2 HMAC-SHA256 `X-Signature: sha256=<hex>` over the raw body when a secret is set
- [x] 2.3 URL scheme validation + private-range guard (override via `WEBHOOK_ALLOW_PRIVATE=1`)
- [x] 2.4 Log/count failures without affecting callers

## 3. Triggers

- [x] 3.1 `qa.created` at `createQA` (public.go)
- [x] 3.2 `question.activated` after activation (admin.go / next endpoint)
- [x] 3.3 `question.closed` at close + countdown reaper
- [x] 3.4 `event.closed` when event status becomes closed (AdminUpdateEvent)

## 4. Endpoints + UI

- [x] 4.1 `GET|PUT /api/admin/settings/webhooks` (secret write-only, `webhook_secret_set` on read)
- [x] 4.2 `POST /api/admin/settings/webhooks/test` returning status + truncated body
- [x] 4.3 Register routes in `server/main.go`
- [x] 4.4 Admin settings panel (admin.html/admin.js) matching the email/otel settings pattern
- [x] 4.5 Document `WEBHOOK_*` in `.env.example`

## 5. Verification

- [x] 5.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [x] 5.2 Go test: notify builds a signed payload and is a no-op when disabled (use httptest receiver)
- [x] 5.3 Go test: settings round-trip never returns the secret
- [x] 5.4 Manual: point at a local receiver, trigger a Q&A, observe the POST
