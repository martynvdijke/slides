## Why

An event produces Q&A, poll results, NPS and a leaderboard, but after the last slide that data is only reachable behind admin auth — attendees leave with nothing and hosts have nothing to share. A publishable results page plus an opt-in recap email turns one live hour into a durable artifact.

## What Changes

- Add a per-event **publish results** switch (default off). While off, the results API and page are not reachable; nothing is shared.
- Add a public results page at `/results/{code}` with aggregate question results (all kinds), NPS, participation stats, answered Q&A and the leaderboard, rendered in the existing embedded frontend style.
- Add optional attendee email opt-in in the audience app, stored per event and participant with explicit consent; participants can remove it, and admins can view/remove subscriptions per event.
- Add an admin recap action with **preview** and **send**: a plain-text recap (event summary, headline results, link to the results page) is emailed to opted-in attendees and configured host recipients.
- Recipients are the explicit admin-configured list plus any admin user with a stored email; empty/invalid addresses are skipped safely and per-recipient failures are reported.
- Additive schema only; unused features change nothing.

## Capabilities

### New Capabilities
- `event-results-page`: per-event publishing control and a public shareable results page/API.
- `recap-subscriptions`: per-event attendee email opt-in with consent, unsubscribe and admin visibility.
- `recap-email`: admin-previewed recap email to hosts and opted-in attendees.

### Modified Capabilities
- (none — no capability specs have been archived yet)

## Impact

- `server/db/db.go` (`events.results_published`, new `recap_subscriptions` table, `settings.recap_emails`).
- `server/handlers/public.go`, `admin.go`, `stats.go` (public results endpoint, subscription endpoints, preview/send endpoints), `server/handlers/mail.go` (reuse, no interface change), `server/main.go` (routes, `/results/{code}` page).
- New `server/static/results.html` + `results.js`; audience opt-in UI in `server/static/app.js` / `audience.html`; admin publish/send UI in `server/static/admin.js` / `admin.html`.
- No changes to decks or the presentation build.
