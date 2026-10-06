## Context

SMTP is configured through admin settings and `emailcfg`, and the mailer is plain text (`Send(to, subject, body)`). Participants are anonymous, device-scoped cookie rows with no email. Admin user emails are usually empty (setup and OIDC do not populate `users.email`) and there is no user-management route to set one. Stats are assembled by `buildEventStats` from `db.EventStats` + question DTOs; Q&A has approved/hidden/answered states; the leaderboard is already exposed publicly live. Pages are embedded HTML + JS served through the `page()` helper with explicit routes in `main.go`.

## Goals / Non-Goals

**Goals:**
- A shareable, host-controlled results page.
- Consent-based attendee email capture with unsubscribe.
- A safe recap send with preview and per-recipient reporting.
- Reuse of existing stats and email machinery.

**Non-Goals:**
- HTML email templates (plain text v1).
- General user/profile email management.
- Scheduled or automated sends, open/click tracking, tokenized unsubscribe links.
- Cross-event analytics.

## Decisions

- **Publish gate.** `events.results_published INTEGER NOT NULL DEFAULT 0`, toggled in admin. Public JSON (`GET /api/events/{code}/results`) and page (`/results/{code}`) return 404 while off. Simple, per-event, reconnect-safe.
- **Results content reuses `buildEventStats`** plus `db.ListQA` (approved/answered only) and `db.GetLeaderboard` (top 10). Payload strips participant ids/tokens and pending/hidden Q&A; open/wordcloud use the existing top-100 aggregates. The page sends `X-Robots-Tag: noindex`.
- **Subscriptions as a per-event table.** `recap_subscriptions(id, event_id, participant_id, email, created_at, UNIQUE(event_id, participant_id))` instead of an email column on `participants`, because participant rows are device-scoped and reused across events — consent must be per event. Subscribe/unsubscribe are REST using the participant cookie; state exposes `me.recap_subscribed`.
- **Recipients resolved at send time**: `settings.recap_emails` (admin-configurable list) ∪ admin users with a non-empty `email`; normalized, de-duplicated, validated. The settings list is required because user emails are commonly unset.
- **Plain-text recap composed server-side** from the same data as the results page. `GET /api/admin/events/{id}/recap/preview` renders without sending; `POST .../recap/send` sends per recipient and reports each outcome. SMTP must be enabled.
- **Batch cap** (e.g. 200 recipients per send), processed sequentially with a response summary. Async queueing is deferred.

## Risks / Trade-offs

- No unsubscribe link inside the email v1 → the audience app has a toggle and admins can remove subscriptions; the body notes where to manage it.
- Synchronous sends can be slow near the cap → capped list and a clear response summary; future job queue.
- Results may include named Q&A/leaderboard entries → only data that was public during the event, and the host explicitly publishes.
- SMTP misconfigured → send returns a clear error and the admin UI links to SMTP settings.

## Migration Plan

`ensureColumn` for `events.results_published` and `settings.recap_emails`; `CREATE TABLE IF NOT EXISTS recap_subscriptions`; update explicit SELECT/scan paths. Rollback safe.

## Open Questions

- Whether a tokenized unsubscribe link should ship in a later change (compliance nicety).
