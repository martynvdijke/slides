# API reference

The server exposes a JSON REST API plus WebSocket streams, all under the same
origin. The full, generated OpenAPI spec ships with the server:

- **Interactive** — `/swagger/` when the server is running.
- **Source of truth** — [`server/docs/swagger.yaml`](https://github.com/martynvdijke/slides/blob/main/server/docs/swagger.yaml)
  (and `swagger.json`).

This page summarizes the surface; use Swagger for exact schemas.

## Conventions

- **Content type** — JSON in and out, except uploads (multipart) and media.
- **Participant cookie** — audience requests automatically get an anonymous
  per-event participant cookie. Send it back (browser default) to keep identity,
  votes and answers.
- **Join session** — most audience reads and the WebSocket also require a
  short-lived **join session** (`meetup_join` cookie, HttpOnly). Joining or a
  first visit creates one; it expires after the join TTL (default **4 hours**,
  `JOIN_TTL`). An expired session returns `401` with `{"error":"join_expired",
  "rejoin_url":"/e/{code}","room_code":"…"}`, and `POST /api/events/{code}/join`
  mints a fresh one.
- **Admin session** — admin endpoints need the `meetup_session` cookie issued by
  `POST /api/auth/login`, `POST /api/setup` or the OIDC flow.
- **Errors** — JSON `{ "error": "message" }` with a matching HTTP status.
- **CORS** — public reads are open; credentialed cross-origin admin calls
  require an allowlisted origin. See [Configuration](configuration.md).

## Authentication and setup

No session required unless noted.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/setup/status` | Whether first-run setup is needed |
| `POST` | `/api/setup` | Create the first admin account (signs you in) |
| `POST` | `/api/auth/login` | Local username/password login |
| `POST` | `/api/auth/logout` | Clear the session |
| `POST` | `/api/auth/forgot-password` | Email a reset link |
| `POST` | `/api/auth/reset-password` | Consume a reset token |
| `GET` | `/api/auth/me` | Current admin (session required) |
| `GET` | `/api/auth/oidc/status` | Whether OIDC is enabled |
| `GET` | `/api/auth/oidc/login` | Start the OIDC flow |
| `GET` | `/api/auth/oidc/callback` | OIDC redirect handler |
| `GET` | `/api/auth/oidc/logout` | Clear the session |

```bash
# Log in and keep the session cookie
curl -c cookies.txt -X POST http://localhost:6270/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"secret"}'
```

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness probe — returns `{"status":"ok"}`, does not touch the DB |

## Public audience API

Anonymous participant cookie; no admin session.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/join/{room}` | Resolve a short room code to an event |
| `GET` | `/api/events/{code}` | Public event metadata |
| `GET` | `/api/events/{code}/state` | Full live state snapshot |
| `POST` | `/api/events/{code}/join` | Join / rejoin an event (mints a join session) |
| `GET` | `/ws/events/{code}` | Live WebSocket (state, results, reactions, slide) |
| `POST` | `/api/events/{code}/answers` | Submit an answer |
| `GET` | `/api/events/{code}/qa` | List approved Q&A |
| `POST` | `/api/events/{code}/qa` | Ask a question (moderated) |
| `POST` | `/api/events/{code}/qa/{id}/vote` | Upvote a question |
| `GET` | `/api/events/{code}/participants` | Waiting-room roster (count + identities) |
| `GET` | `/api/events/{code}/presentations` | List downloadable presentations |
| `GET` | `/api/events/{code}/presentations/{id}/download` | Download a presentation |
| `GET` | `/api/events/{code}/qr.png` | PNG QR code for the join URL |
| `GET` | `/api/events/{code}/leaderboard` | Public quiz leaderboard |
| `GET` | `/api/events/{code}/results` | Gated public results (`404` unless published) |
| `POST` | `/api/events/{code}/recap/subscribe` | Opt in to the recap email |
| `POST` | `/api/events/{code}/recap/unsubscribe` | Opt out |
| `GET` | `/api/settings/analytics` | Public analytics settings |

### Answer submission

```http
POST /api/events/{code}/answers
Content-Type: application/json

{
  "question_id": 12,
  "value": "Kubernetes",
  "client_uuid": "0b0f…"
}
```

`value` is kind-specific: a string for `poll`/`yesno`/`rating`/`nps`/text, a JSON
array for `multi`/`ranking`, and a JSON object `{ "x": 0–1, "y": 0–1 }` for
`grid2x2`. The optional `client_uuid` makes submissions idempotent (a retried
answer with the same UUID is not double-counted). Answers to locked questions
are rejected.

### Waiting-room roster

`GET /api/events/{code}/participants` returns the compact roster used by the
projector, audience app and admin panel:

```json
{ "count": 2, "participants": [ { "name": "Ada", "emoji": "🦄", "color": "#7c6bff" } ] }
```

The public form exposes only display identity (no ids, no emails). The admin
form (`GET /api/admin/events/{id}/participants`) additionally returns ids and
timestamps.

## Uploaded media

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/media/{name}` | Serve an uploaded question image/video inline (UUID names) |

Upload through the admin endpoint below; the response `url` points here.

## Admin API

All routes require the admin session cookie.

=== "Events"

    | Method | Path |
    | --- | --- |
    | `GET` | `/api/admin/events` |
    | `POST` | `/api/admin/events` |
    | `PATCH` | `/api/admin/events/{id}` |
    | `DELETE` | `/api/admin/events/{id}` |
    | `POST` | `/api/admin/events/{id}/clone` |
    | `GET` | `/api/admin/events/{id}/report` |

=== "Questions"

    | Method | Path |
    | --- | --- |
    | `GET` | `/api/admin/events/{id}/questions` |
    | `POST` | `/api/admin/events/{id}/questions` |
    | `POST` | `/api/admin/events/{id}/questions/media` |
    | `PATCH` | `/api/admin/events/{id}/questions/{qid}` |
    | `DELETE` | `/api/admin/events/{id}/questions/{qid}` |
    | `POST` | `/api/admin/events/{id}/questions/{qid}/activate` |
    | `POST` | `/api/admin/events/{id}/questions/{qid}/close` |
    | `POST` | `/api/admin/events/{id}/questions/{qid}/reveal` |
    | `POST` | `/api/admin/events/{id}/questions/reorder` |
    | `POST` | `/api/admin/events/{id}/questions/next` |
    | `POST` | `/api/admin/events/{id}/podium` |

=== "Deck control"

    | Method | Path | Purpose |
    | --- | --- | --- |
    | `POST` | `/api/admin/events/{id}/deck/sync` | Upsert a deck's interactive slides |
    | `POST` | `/api/admin/events/{id}/slide` | Broadcast a slide index (`index` or `action: next/prev`) |

=== "Answers, Q&A, participants and presentations"

    | Method | Path |
    | --- | --- |
    | `GET` | `/api/admin/events/{id}/answers` |
    | `PATCH` | `/api/admin/events/{id}/answers/{aid}` |
    | `GET` | `/api/admin/events/{id}/qa` |
    | `PATCH` | `/api/admin/events/{id}/qa/{qid}` |
    | `DELETE` | `/api/admin/events/{id}/qa/{qid}` |
    | `GET` | `/api/admin/events/{id}/participants` |
    | `GET` | `/api/admin/events/{id}/presentations` |
    | `POST` | `/api/admin/events/{id}/presentations` |
    | `DELETE` | `/api/admin/events/{id}/presentations/{pid}` |

=== "Export, leaderboard and stats"

    | Method | Path |
    | --- | --- |
    | `GET` | `/api/admin/events/{id}/export.csv` |
    | `GET` | `/api/admin/events/{id}/leaderboard` |
    | `GET` | `/api/admin/stats` |
    | `GET` | `/api/admin/events/{id}/stats` |

=== "Recap"

    | Method | Path |
    | --- | --- |
    | `GET` | `/api/admin/events/{id}/recap` |
    | `DELETE` | `/api/admin/events/{id}/recap/{sid}` |
    | `GET` | `/api/admin/events/{id}/recap/preview` |
    | `POST` | `/api/admin/events/{id}/recap/send` |

=== "Settings"

    | Method | Path |
    | --- | --- |
    | `GET`/`PUT` | `/api/admin/settings/analytics` |
    | `GET`/`PUT` | `/api/admin/settings/branding` |
    | `GET`/`PUT` | `/api/admin/settings/email` |
    | `POST` | `/api/admin/settings/email/test` |
    | `GET`/`PUT` | `/api/admin/settings/webhooks` |
    | `POST` | `/api/admin/settings/webhooks/test` |
    | `GET`/`PUT` | `/api/admin/settings/filter` |
    | `GET`/`PUT` | `/api/admin/settings/recap` |
    | `GET`/`PUT` | `/api/admin/settings/otel` |
    | `GET` | `/api/admin/otel/status` |

### Syncing deck slides

Used by `scripts/sync-deck.mjs` and the optional Vite dev plugin to upsert a
deck's interactive slides as questions. See
[Interactive slides](decks.md#interactive-slides-markdown-layouts).

```http
POST /api/admin/events/{id}/deck/sync
Content-Type: application/json

{
  "deck_slug": "meetup",
  "slides": [
    {
      "slide_id": "meetup-poll-journey",
      "position": 12,
      "prompt": "Where are you on your cloud-native journey?",
      "kind": "poll",
      "options": ["Exploring", "Running in prod", "Scaling platform"],
      "points_base": 100,
      "correct_index": null,
      "duration_sec": 0,
      "time_limit_s": 30,
      "show_results": true,
      "activate": "auto"
    }
  ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `deck_slug` | yes | Deck identifier; the upsert key is `{deck_slug}:{slide_id}` |
| `slides` | no | One entry per interactive slide; omitted/empty means "prune everything for this deck" |
| `slides[].slide_id` | yes | Stable, unique within the deck; duplicate ids are rejected |
| `slides[].kind` | no | Defaults to `poll`; must be a valid kind |
| `slides[].options` | conditional | `poll`/`multi`/`ranking` need ≥ 2 |
| `slides[].correct_index` | no | Omit or `null` for a non-scored prompt |
| `slides[].points_base` | no | Defaults to `100` |
| `slides[].activate` | no | `auto` (default) or `manual` |
| `slides[].show_results` | no | Default `true` |

The upsert resets each slide's question to `draft` and re-syncs its fields, so
re-running is idempotent. Slides previously synced for the deck that are **not**
in the payload are **archived** (`status='closed'`, never deleted), and their
count is reported as `archived`.

Response:

```json
{ "synced": 1, "created": 1, "updated": 0, "archived": 0 }
```

| Status | When |
| --- | --- |
| `200` | Sync applied |
| `400` | Invalid JSON, missing `deck_slug`, duplicate `slide_id`, unknown kind, or too few options |
| `401` | Missing or invalid admin session |
| `404` | Unknown event |

### Remote slide control

`POST /api/admin/events/{id}/slide` broadcasts a slide change to the projector,
audience app and every deck joined to the event — the same channel the
presenter's own deck uses:

```http
POST /api/admin/events/{id}/slide
Content-Type: application/json

{ "index": 12 }
```

Send `{ "action": "next" }` or `{ "action": "prev" }` to step relative to the
cached slide. The response is `{ "ok": true, "index": 12 }`.

## WebSockets

| Path | Auth | Purpose |
| --- | --- | --- |
| `/ws/events/{code}` | participant + join cookie | Live state, results, reactions, slides and remote nav |
| `/ws/admin/events/{id}/stats` | admin session | Live statistics for the admin panel |

The audience socket pushes `state`, `result`, `slide`, `nav`, `participants` and
`reactions` frames; the deck's `useLiveRoom` client applies them. A presenter
(signed-in admin) may send `{type:"slide", index, total, title, id}` to broadcast
its current slide and auto-activate the matching question. The admin stats socket
streams aggregate updates. Both reconnect automatically.

## Static pages

The server also serves HTML pages (not JSON): `/` (entry), `/admin`, `/join`,
`/e/{code}` (audience), `/live/{code}` (projector) and `/results/{code}`
(noindex). The built deck index is served from `DECKS_DIR`.

## Next steps

- [Architecture](architecture.md) — how the API, broker and DB fit together.
- [Operations](operations.md) — webhooks and telemetry.
- [Questions](questions.md) — the shape of each question kind's answers.
