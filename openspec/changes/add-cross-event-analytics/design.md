## Context

Per-event stats already exist: `GetQuestionStats`, the results report (`add-results-report`), and NPS/participation fields surfaced in the results view. Events, questions, answers, participants, and `qa_questions`/`qa_votes` are all event-scoped, so cross-event aggregation is a matter of querying across `event_id` with joins and time bucketing. The single-row `settings` table holds analytics config (currently only umami). There is no admin analytics page.

## Goals / Non-Goals

**Goals**
- A trend + funnel view across events that is cheap to compute on a self-hosted SQLite database.
- Deterministic metric definitions shared between UI and CSV export.
- No new PII or per-participant tracking.

**Non-Goals**
- Realtime streaming dashboards.
- External BI/warehouse integration.
- Cohort analysis by individual identity.

## Decisions

- **Metric definitions (fixed).**
  - *Participation*: distinct participants per event; *attendance* = participants with ≥1 answer.
  - *Answer rate*: answers / (participants × active questions).
  - *Funnel*: joined (participant rows) → engaged (≥1 answer) → completed (answered all non-feedback questions) → interacted-with-QA (≥1 qa_question or qa_vote).
  - *NPS*: from feedback/NPS answers, averaged across events in range.
- **Time bucketing.** Bucket by day/week/month using SQLite `strftime` on `events.event_date` / `answers.created_at`; the bucket granularity is derived from the requested range (≤31 days → day, ≤180 → week, else month).
- **Endpoints.**
  - `GET /api/admin/analytics?from&to&deck` → `{totals, series[], nps}`.
  - `GET /api/admin/analytics/events?from&to&deck` → per-event rows (name, date, participants, answer_rate, nps, qa_count).
  - `GET /api/admin/analytics/events.csv?…` → CSV of the same rows.
- **Indexes (optional).** Add indexes on `answers(question_id)`, `answers(participant_id)`, `qa_questions(event_id)` if profiling shows slow scans; additive via the migration path.
- **UI.** A new Analytics view in the admin console (or a separate page) with range/deck filters, a line chart for participation/NPS, and a sortable event table; export button. Kept dependency-free (canvas/SVG) to avoid adding a charting library, or reuse whatever the project already ships.
- **Scope with RBAC.** Analytics reads are `viewer`+ (`add-multi-host-rbac`); the default `AdminAuth` already permits authenticated users today.

## Risks / Trade-offs

- **SQLite performance.** Aggregate scans over many events can be slow; indexes + bucketing limit the work, and the dashboard is not realtime.
- **Metric ambiguity.** Definitions are pinned in one place (`stats.go`) and documented, so the table, chart and CSV agree.
- **Timezone.** Buckets use stored timestamps; document that dates are event-local/UTC per existing storage.
- **Privacy.** Aggregates only; never expose per-participant rows in the analytics view.
