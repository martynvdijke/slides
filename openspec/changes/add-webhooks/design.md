## Context

There is no outbound HTTP anywhere in the server today (`grep` for `http.Post`/`NewRequest` finds none). The established pattern for external integrations is configuration stored in the single-row `settings` table plus an env override, used by `emailcfg` (SMTP) and `otelcfg` (OTLP). `handlers/mail.go` shows the outbound-send style, and `admin.go` exposes `GET|PUT /api/admin/settings/email` plus `POST /api/admin/settings/email/test`. Event mutations already funnel through `BroadcastEvent(eventID)` (common.go:310) and public mutations through `createQA`/`toggleVote`/`submitAnswerWithMeta`.

## Goals / Non-Goals

**Goals:**
- Let an admin configure one outbound webhook URL and choose which event types fire.
- Sign payloads so receivers can verify authenticity.
- Fire asynchronously so delivery never affects request latency or correctness.
- Provide a test action.

**Non-Goals:**
- Multiple webhooks, retries with backoff queues, or delivery dashboards.
- Slack-specific formatting beyond generic JSON (receivers adapt JSON on their side).
- Per-event webhook overrides (global settings only).

## Decisions

- **Config storage.** Add `settings` columns `webhook_url`, `webhook_secret`, `webhook_enabled`, `webhook_events` (JSON array of type strings), mirroring the `smtp_*` columns, with `ensureColumn` migration and `Get/UpdateWebhookSettings` helpers. Optional env overrides `WEBHOOK_URL`, `WEBHOOK_SECRET`, `WEBHOOK_EVENTS`.
- **Sender module.** New `server/webhookcfg` (config resolve, like `emailcfg`) plus a small `handlers`-level `notify(type, event, data)` that:
  1. resolves config; returns immediately if disabled or URL empty;
  2. marshals a stable envelope `{event, type, data, timestamp}`;
  3. when a secret is set, computes HMAC-SHA256 over the raw body and sends `X-Signature: sha256=<hex>`;
  4. POSTs with a short client timeout in a goroutine; errors are logged and counted, never returned to the caller.
- **Trigger points.** Subscribe the sender to the same places that already broadcast:
  - `qa.created` → after `db.CreateQA` in `public.go`.
  - `question.activated` → in `ActivateQuestion`/`AdminNextQuestion` after commit.
  - `question.closed` → in `AdminCloseQuestion` and the countdown reaper.
  - `event.closed` → in `AdminUpdateEvent` when status transitions to closed.
- **Type filtering.** `webhook_events` lists the enabled types; an empty list means all supported types.
- **Test action.** `POST /api/admin/settings/webhooks/test` sends a sample `{event:"test"}` payload synchronously and returns `{ok, status, body}` truncated, like the email test.
- **SSRF guard.** Validate the URL scheme is http/https; reject loopback/private ranges unless an explicit `WEBHOOK_ALLOW_PRIVATE=1` env is set (the feature is admin-only, so this is defense in depth).

## Risks / Trade-offs

- **Blocked/slow receivers.** Async send + short timeout isolates the request path; goroutines are fire-and-forget.
- **Secret leakage.** Store the secret like the SMTP password (settings row, never returned in GET responses — return only `webhook_secret_set: true`).
- **Duplicate/ordering.** No delivery guarantees; at-least-once semantics with possible reordering is acceptable for notifications.
- **SSRF.** Admin-only endpoint plus the private-range guard limits abuse.
