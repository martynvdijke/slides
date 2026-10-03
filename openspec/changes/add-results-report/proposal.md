## Why

After a session, hosts want a shareable summary of what happened — questions, results, and standout Q&A — without exporting raw CSV and assembling slides by hand. A one-click report produces a clean, self-contained results page (and keeps the existing CSV export) so the host can share outcomes with the team or the audience.

## What Changes

- New admin endpoint that generates a self-contained HTML results report for an event.
- The report includes: event metadata, per-question results (bar/wordcloud/NPS/ranking summaries with counts and percentages), feedback summary, Q&A (approved, with votes), and the leaderboard when scoring was used.
- A "Download report" / "Open report" action in the admin results panel beside the existing CSV export.
- The report is styled for screen and print, embeds no scripts, and contains no participant identifiers beyond display names already shown in the leaderboard.
- CSV export is retained unchanged.

## Capabilities

### New Capabilities
- `results-report`: Generate a shareable HTML summary of an event's results.

### Modified Capabilities
- (none)

## Impact

- `server/handlers/admin.go` (new `AdminEventReport` handler; reuse existing stats/aggregation helpers).
- `server/db/stats.go`, `server/db/db.go` (reuse `EventStats`, per-question stats, `GetLeaderboard`; add no new aggregation if avoidable).
- `server/main.go` (route `GET /api/admin/events/{id}/report`).
- `server/static/admin.js`, `server/static/admin.html` (report action in the results panel).
