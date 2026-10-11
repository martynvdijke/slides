# Operations

This page covers running Slides day-to-day: health checks, the background
reaper, telemetry, webhooks, event cloning, deck control and backups.

## Health check

```http
GET /healthz  →  {"status":"ok"}
```

The probe reports that the HTTP server is up and intentionally does **not** touch
the database. The Compose service healthcheck polls it every 30s.

## Graceful shutdown

On `SIGINT`/`SIGTERM` the server stops accepting connections, closes the live
broker, drains in-flight requests (10s budget) and flushes OpenTelemetry (5s
budget). No answers are lost because writes are batched and committed before
acknowledgement.

## Background reaper

A single goroutine (`handlers.StartReaper`) ticks every second and:

- finds questions whose `duration_sec` timer has elapsed and auto-closes them,
- locks timed questions whose `time_limit_s` deadline passed,
- broadcasts the transition to connected clients,
- fires the `question.closed` webhook.

Because the deadline is stored (`activated_at + duration_sec`/`time_limit_s`), a
restart or reconnect resumes the same schedule.

## OpenTelemetry

Telemetry is opt-in. With no endpoint configured the handler is still wrapped but
exports nothing; set `OTEL_EXPORTER_OTLP_ENDPOINT` (or the admin setting) to
start exporting traces, metrics and logs.

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=slides
```

Check the resolved configuration:

```http
GET /api/admin/otel/status
```

Environment values win over stored settings, and stored settings only apply
after a restart (the admin UI shows a **Restart required** badge). See
[Deployment](deployment.md) for the Compose observability profile.

## Webhooks

Webhooks POST a JSON envelope to `WEBHOOK_URL` for allowlisted events. Delivery
is fire-and-forget with a 5s timeout.

```json
{
  "event": "AB2C3",
  "type": "qa.created",
  "data": { "event_code": "…", "qa_id": 42, "body": "…" },
  "timestamp": 1750000000000
}
```

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Webhook-Event` | The event type |
| `X-Signature` | `sha256=<hmac>` when a secret is set |

Event types and their data:

| Type | Fired when | Data |
| --- | --- | --- |
| `qa.created` | An audience question is submitted | `event_code`, `event_name`, `qa_id`, `body` |
| `question.activated` | A question goes live | `event_code`, `event_name`, `question_id` |
| `question.closed` | A question closes (host or reaper) | `event_code`, `event_name`, `question_id` |
| `event.closed` | The event status is set to closed | `event_code`, `event_name`, `event_id` |

!!! warning "SSRF guard"
    Webhook URLs are validated: only `http`/`https` are accepted, and the host
    must resolve to a public IP. Private, loopback, link-local and unique-local
    addresses are blocked unless `WEBHOOK_ALLOW_PRIVATE=1` is set.

Verify a signature by recomputing the HMAC-SHA256 of the raw body:

```python
import hmac, hashlib
expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
```

Use **Send test** in the admin Webhooks card, or
`POST /api/admin/settings/webhooks/test`, to confirm connectivity.

## Event clone

`POST /api/admin/events/{id}/clone` duplicates an event — its questions and
configuration — so you can reuse a deck pattern for the next meetup. The clone
gets a fresh event `code` and a fresh **room code**, and no answers, Q&A or
participants are copied.

## Deck control and feature flags

The host can drive the deck from `/admin`: `POST /api/admin/events/{id}/slide`
takes an absolute `index` or a relative `action` (`next` / `prev`) and broadcasts
the change on the same channel the presenter's deck uses, so the projector, the
audience app and every joined deck stay in step. A presenter who is also signed
in as an admin can broadcast its own slide changes over the WebSocket, and the
server uses those to auto-activate the matching interactive question.

Each event also carries **feature flags** (`feature_live`, `feature_qa`,
`feature_slides`, `feature_feedback`, `feature_leaderboard`). They default on and
are usually seeded from a deck's `features` frontmatter; when a flag is off the
corresponding audience tab and panel are hidden. See
[Configuration](configuration.md).

## Reports and stats

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/events/{id}/export.csv` | Download all answers as CSV |
| `GET /api/admin/events/{id}/report` | Event report |
| `GET /api/admin/stats` | Global totals |
| `GET /api/admin/events/{id}/stats` | Per-event totals (also streamed over `/ws/admin/events/{id}/stats`) |

## Backup and restore

The persistent state is two things: the **SQLite database** and the **media
directory**.

=== "SQLite (WAL)"

    The database runs in WAL mode, so you will see three files:

    ```text
    slides.db        # main database
    slides.db-wal    # write-ahead log
    slides.db-shm    # shared-memory index
    ```

    For a consistent backup, either stop the server, or use the SQLite online
    backup API / `VACUUM INTO` rather than copying `slides.db` alone. A plain
    file copy while running can miss committed data still living in the WAL.

    ```bash
    sqlite3 slides.db "VACUUM INTO '/backup/slides.db'"
    ```

=== "Media"

    Uploaded question media lives under `MEDIA_DIR`. Copy it as a directory; file
    names are UUIDs, so a filesystem-level snapshot is safe.

=== "Container volumes"

    In Compose both live in the `slides-data` volume mounted at `/data`. Back up
    the volume (or the bind-mounted directory).

!!! note "Migrations are safe"
    On startup the server applies idempotent additive migrations, so restoring an
    older database and starting a newer binary upgrades it in place.

## Retention

- Sessions are cleaned on startup (`DeleteExpiredSessions`).
- Password-reset tokens expire and are stored hashed.
- There is no automatic data retention policy; export or delete events
  explicitly.

## Next steps

- [Configuration](configuration.md) — telemetry and webhook settings.
- [Architecture](architecture.md) — the writer, cache and broker internals.
- [Deployment](deployment.md) — Compose profiles.
