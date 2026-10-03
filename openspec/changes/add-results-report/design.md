## Context

`AdminExportCSV` (admin.go:1202) already assembles per-question aggregates plus Q&A into `text/csv`. Aggregations exist: `db.EventStats` (stats.go:18) for counts/response rate, `computeQuestionStats`/`multiStats`/`rankingStats`/`npsStats` (db.go:1347+) for per-question results, and `GetLeaderboard` (db.go:1962). There is no templating or PDF generation in the repo; the only report pattern is CSV. The admin results panel is `loadResults` (admin.js:717).

## Goals / Non-Goals

**Goals:**
- Produce a single self-contained HTML document summarizing an event's results.
- Reuse existing aggregation functions; no new heavy queries.
- One action in the admin results panel; also directly reachable by URL.

**Non-Goals:**
- PDF generation (print CSS from the HTML is acceptable).
- Charts requiring external JS libraries (render simple inline SVG/CSS bars instead).
- Public access (admin-auth only).

## Decisions

- **HTML generation in Go.** Build the document with `html/template` (auto-escaping) held as an embedded string constant in the handler package — avoids a new template directory while staying XSS-safe. No client-side JS in the output.
- **Data assembly.** Call the same functions CSV export and stats use: list questions (live + feedback), compute stats, fetch approved Q&A and leaderboard. Reuse `EventStats` for the header summary.
- **Rendering.** CSS-only bars/wordcloud sizes; inline SVG for ranking/NPS where needed. Screen + `@media print` styles so the host can "Print to PDF".
- **Endpoint.** `GET /api/admin/events/{id}/report` returns `text/html; charset=utf-8` with `Content-Disposition: inline` (browsers can save it). Title includes the event name and date.
- **Privacy.** Include only data already exposed to the host: question aggregates, approved Q&A text/author as stored, and leaderboard display names/emoji. No participant tokens or raw ids.
- **UI.** Add a "Report" button next to the existing export button (admin.js:229), opening the URL in a new tab.

## Risks / Trade-offs

- **Large events.** A single HTML document for a very large event could be big; acceptable for a summary, and no images are embedded (media is referenced by URL or omitted).
- **Escaping.** Use `html/template` (or explicit escaping) for all inserted text — question prompts, options, Q&A bodies and names are user-controlled.
- **Duplicate logic with CSV.** Keep the report handler thin and share helpers with the CSV builder to avoid divergence.
