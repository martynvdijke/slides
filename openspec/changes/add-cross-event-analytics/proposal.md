## Why

The results report is **per event**. Hosts and organisers cannot see whether engagement, NPS or participation is improving over time, nor where audiences drop off, which makes it hard to justify the format, compare decks, or improve future sessions. A cross-event analytics view turns the accumulated event data into a trend and funnel story.

## What Changes

- An **org-wide analytics dashboard** in the admin console: participation over time, NPS trend, answer rate, Q&A volume, session counts, average attendance.
- A **per-event funnel**: joined → answered ≥1 question → completed all questions → Q&A/vote, with drop-off percentages.
- Filters by date range and deck; sortable event table with key metrics.
- A server endpoint `GET /api/admin/analytics?from=&to=&deck=` returning aggregates, and `GET /api/admin/analytics/events?…` for the table.
- **CSV export** of the current view.
- Aggregates only; no new per-participant data is collected.

## Capabilities

### New Capabilities
- `event-analytics`: Cross-event aggregate metrics, trends, funnels and a filterable dashboard.

### Modified Capabilities
- (none)

## Impact

- `server/db/stats.go` (aggregate/time-bucketed queries), `server/db/db.go` (only if an index is needed).
- `server/handlers/admin.go`, `server/main.go` (analytics endpoints and page route).
- `server/static/admin.js`, `admin.html` (new Analytics view) — or a dedicated `analytics.html`/`analytics.js`.
- `README.md` (metrics definitions).
- Read-only; no schema changes required beyond optional indexes.
