# Architecture

Slides is a Go HTTP server wrapped around an embedded vanilla-JS frontend, a
live WebSocket broker and a SQLite database, with Slidev decks built separately
by npm.

## Components at a glance

```text
                     ┌──────────────────────────────────────────┐
  Slidev deck ──────▶│             Go HTTP server               │
  (Vue components)   │  ┌────────────┐  ┌───────────────────┐   │
                     │  │  handlers  │  │   live.Broker     │   │
  Audience app ─────▶│  │  (REST/WS) │◀▶│ (per-event fanout)│   │
  Admin panel  ─────▶│  └─────┬──────┘  └─────────┬─────────┘   │
  Projector    ─────▶│        │                   │             │
                     │  ┌─────▼───────────────────▼─────────┐   │
                     │  │            db (SQLite WAL)        │   │
                     │  │  serialized writer + result cache │   │
                     │  └───────────────────────────────────┘   │
                     └───────┬───────────────┬──────────┬────────┘
                             │               │          │
                           media/          SMTP      OTLP collector
```

| Piece | Location | Responsibility |
| --- | --- | --- |
| HTTP server | `server/main.go` | Routing, CORS, middleware, graceful shutdown |
| Handlers | `server/handlers/` | REST endpoints, WebSocket, auth, reaper |
| Live broker | `server/live/broker.go` | In-process per-event pub/sub for WebSocket fanout |
| Database | `server/db/` | SQLite access, schema/migrations, aggregation, scoring |
| Observability | `server/otel.go`, `server/otelcfg/` | OTLP setup and resolution |
| Config helpers | `server/{emailcfg,webhookcfg}/` | env-over-DB resolution |
| Embedded SPA | `server/static/` | Admin, audience, projector, join, results pages |
| Decks | `decks/` | Slidev sources and live components |
| Deck template | `templates/deck/` | Starter deck for `cp -r` |

## Request lifecycle

1. **Middleware** sets security headers, applies CORS, answers preflight and
   logs the request. The whole mux is wrapped in an OpenTelemetry handler.
2. **Routing** — Go 1.22+ method-and-pattern routes. Admin routes go through
   `handlers.AdminAuth`; audience routes get a participant cookie.
3. **Handlers** read/write through `db` and broadcast through `live.Broker`.
4. **Static/decks** — `DECKS_DIR` is served at `/` when present, otherwise the
   embedded SPA is used so `go run` still works.

## The live broker

`live.Broker` keeps a set of subscribers per event code. Handlers publish state
after a mutation; the broker fans out JSON frames to every connected WebSocket.

```text
client answer ─▶ handler ─▶ db (validate + store) ─▶ broker.Publish(event)
                                                          │
                              ┌───────────────────────────┼───────────────┐
                              ▼                           ▼               ▼
                         deck(s)                    audience app     projector
```

Frames the audience socket emits include `state`, `result`, `slide`, `nav`,
`participants` and `reactions`. Because the deck's `useLiveRoom` shares one
socket per `(base, event)`, a deck with many live components still opens a
single connection and reconnects with backoff.

## The database writer

SQLite in WAL mode gives concurrent readers plus a single writer. To absorb
bursts of simultaneous answers the server:

- serializes all answer writes through **one writer** that batches them into a
  single transaction,
- caches **question results in-process for a few seconds** so repeated
  aggregate reads don't hit the DB,
- uses a per-connection `busy_timeout` so writers queue rather than fail with
  `SQLITE_BUSY`.

This removes the need for memcached/Redis. See [Configuration](configuration.md)
for the exact pragmas.

## Scoring

Scored questions (`poll`, `yesno`) store `correct_index` and `points_base`.
`correct_index` is **nullable**: a choice question with no correct option is a
non-scored interaction prompt (live tallies, no points, `is_correct` stays
`NULL`). Scoring happens on submission: a correct answer earns up to
`points_base`, scaled by how quickly it arrived. `is_correct`, `points_awarded`
and `elapsed_ms` are stored per answer, but the audience only learns them at
**reveal** (unless `show_results` is on). The leaderboard sums awarded points
with hidden/flagged answers excluded.

## Joining and presence

Audience members join by resolving a room code (`GET /api/join/{room}`) and
creating a **join session**: a short-lived (default **4 hours**, `JOIN_TTL`)
HttpOnly `meetup_join` cookie bound to the participant and event, backed by the
`join_sessions` table (cleaned on startup and every five minutes). An expired
session is rejected with `join_expired`; `POST /api/events/{code}/join` mints a
fresh one. The current roster is exposed for the waiting-room view via
`GET /api/events/{code}/participants` (public) and its admin counterpart, and is
pushed over the audience socket as a `participants` frame.

## Decks

Decks are independent npm workspaces. `npm run build` builds each workspace and
`scripts/build-index.mjs` reads each deck's `slides.md` frontmatter to generate
the landing page. The live components are shared between `decks/meetup` and
`templates/deck`; `useLiveRoom.ts` is the single client implementation.

A deck authors live questions in one of two ways:

- **Interactive slide layouts** — `layout: poll` (or `multi`, `ranking`, …) in
  the slide frontmatter. Each slide carries a stable `id`; the server keys its
  question by `external_id = "{deck_slug}:{slide_id}"`. When the presenter
  broadcasts a slide change, the server resolves that id and **auto-activates**
  the matching draft (unless `activate: manual`).
- **Markdown comment blocks** — `<!-- live-question … -->` YAML blocks.
  `scripts/extract-questions.mjs` turns them into `dist/<deck>/questions.json`,
  and at startup `db.SeedDeckQuestionsFromDir` imports them into the event named
  after the deck (idempotent by the question's `id`/`seed_key`).

Both paths land in the same `questions` table and flow through the same queue.
See [Decks](decks.md) for the authoring details.

The build output (`dist/`) is what the Go server serves from `DECKS_DIR` — or
what GitHub Pages serves statically when pointed at a hosted backend.

## Testing

| Layer | Command | Covers |
| --- | --- | --- |
| Go unit + integration | `cd server && go test ./...` | DB, HTTP, WebSocket, quiz, moderation, recap |
| End-to-end | `npm run test:e2e` | Browser flows against a built server |
| Docs build | `zensical build --strict --clean` | This site |

The Go tests use `httptest` plus a real WebSocket and a temporary database. The
Playwright suite boots the built server (`e2e/start-server.mjs`) against a temp
DB and a fake SMTP inbox. See [Contributing](contributing.md).

## Continuous integration

`ci.yaml` runs `npm ci`, the Go tests and build, the deck build, Dockerfile and
Compose validation, then the Playwright suite. It is reused by `release.yaml`
via `workflow_call`. See [Contributing](contributing.md) for the full workflow
list.

## Next steps

- [Operations](operations.md) — the reaper, webhooks and backups.
- [API reference](api.md) — the endpoint surface.
- [Contributing](contributing.md) — tests and workflows.
