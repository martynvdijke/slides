## 1. Server

- [x] 1.1 Add `AdminEventReport` — `GET /api/admin/events/{id}/report` returning `text/html; charset=utf-8`
- [x] 1.2 Assemble data from existing helpers (list questions live+feedback, per-question stats, `EventStats`, approved Q&A, `GetLeaderboard`)
- [x] 1.3 Render with `html/template` (auto-escaping); embed the template as a string constant; no client JS
- [x] 1.4 Include per-question bars/wordcloud/NPS/ranking summaries, feedback summary, Q&A with votes, leaderboard; mark correct options when revealed
- [x] 1.5 Add print-friendly CSS; `Content-Disposition: inline`
- [x] 1.6 Register the route in `server/main.go` under the admin mux

## 2. Console

- [x] 2.1 Add a Report action beside the existing export button in the results panel (admin.js + admin.html)
- [x] 2.2 Open in a new tab; keep CSV export unchanged

## 3. Verification

- [x] 3.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [x] 3.2 Go test: report renders 200 HTML for an event with answers; escaping test with `<script>` in a prompt/Q&A; empty event renders valid HTML; unauthenticated request rejected
- [x] 3.3 Manual: open a report, confirm results/leaderboard render and print layout is clean
