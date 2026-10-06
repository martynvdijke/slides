## 1. Data & settings

- [x] 1.1 Add `events.results_published` and `settings.recap_emails` (schema + `ensureColumn`) and the `recap_subscriptions` table; update explicit SELECT/scan paths
- [x] 1.2 DB helpers: subscription create/update/delete/list, publish toggle, recipient reads; expose `me.recap_subscribed` in state

## 2. Public results

- [x] 2.1 Public `GET /api/events/{code}/results` gated by `results_published` (404 when off), built from `buildEventStats` + approved/answered Q&A + leaderboard, with no participant identifiers
- [x] 2.2 Add `results.html` + `results.js` and the `/results/{code}` route with noindex; rendering and empty states

## 3. Subscriptions

- [x] 3.1 REST subscribe/unsubscribe endpoints with validation and normalization
- [x] 3.2 Audience opt-in UI with consent copy and unsubscribe; admin per-event subscription list with removal

## 4. Recap email

- [x] 4.1 Server-side recap composition (event summary, participation stats, headline results, results-page link via `PUBLIC_BASE_URL`)
- [x] 4.2 Preview and send endpoints: recipient union/dedupe/validation, SMTP guard, batch cap, per-recipient reporting
- [x] 4.3 Admin UI: publish toggle, preview and send with recipient count and result summary

## 5. Verification

- [x] 5.1 Go tests: publish gate, subscription validation/dedupe, recipient resolution, preview sends nothing, send reporting with a fake mailer (`cd server && go build ./... && go test ./...`)
- [x] 5.2 End-to-end: publish → open results page; opt in → recap delivered to the subscribed address
- [x] 5.3 README / API docs updated for the results page and recap endpoints
