## Why

Hosts want live events to reach beyond the room: post a new Q&A question to a Slack channel, notify a chat when a question goes live, or push results into another system when the event closes. Today there is no outbound integration at all — the only outbound channel is SMTP email. A configurable webhook lets hosts wire the session into whatever tooling they already use.

## What Changes

- New admin-configurable webhook settings: an enable flag, a URL, an optional secret (used to sign the payload), and event-type toggles.
- The server fires non-blocking outbound HTTP POSTs when selected domain events occur: `qa.created`, `question.activated`, `question.closed`, `event.closed`.
- Payloads are JSON with a stable envelope (`event`, `type`, `data`, `timestamp`) and, when a secret is configured, an `X-Signature` HMAC-SHA256 header over the raw body.
- A "Send test" action posts a sample payload and reports the response, mirroring the existing email test flow.
- Delivery is best-effort and must never block or fail the originating request; failures are logged and counted.

## Capabilities

### New Capabilities
- `webhooks`: Configurable outbound HTTP notifications for selected event actions, with signing and a test action.

### Modified Capabilities
- (none)

## Impact

- `server/db/db.go` (settings columns for webhook config + get/update helpers, following the `smtp_*`/`otel_*` pattern).
- `server/handlers/admin.go` (settings handlers + test action) and a new outbound sender module.
- `server/main.go` (settings routes + wiring the sender into event broadcasts).
- `server/handlers/public.go`, `server/handlers/admin.go` (call the sender at trigger points).
- `server/static/admin.js`, `server/static/admin.html` (webhook settings panel).
- `.env.example` (optional env overrides).
