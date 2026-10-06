## 1. Aggregation queries

- [ ] 1.1 Add time-bucketed aggregate queries in `stats.go` (events, participants, engaged, completed, answer rate, NPS, Q&A volume)
- [ ] 1.2 Add per-event metrics query for the event table
- [ ] 1.3 Pin bucket granularity from the requested range; add indexes only if profiling warrants
- [ ] 1.4 Tests: seeded multi-event dataset verifies totals, series buckets, funnel stages, NPS

## 2. Endpoints

- [ ] 2.1 `GET /api/admin/analytics?from&to&deck`
- [ ] 2.2 `GET /api/admin/analytics/events?from&to&deck`
- [ ] 2.3 `GET /api/admin/analytics/events.csv?from&to&deck`
- [ ] 2.4 Register routes in `server/main.go`; handler tests for filters, empty range, CSV shape

## 3. Admin UI

- [ ] 3.1 Add an Analytics view with range/deck filters (`admin.html`/`admin.js` or new `analytics.html`/`analytics.js`)
- [ ] 3.2 Participation/NPS trend chart and a sortable per-event table with funnel
- [ ] 3.3 CSV export button

## 4. Docs & verification

- [ ] 4.1 README: metric and funnel definitions
- [ ] 4.2 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 4.3 Manual: verify filters and that CSV matches the table
