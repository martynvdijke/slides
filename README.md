<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" alt="Slides" width="260">
  </picture>
</p>

# Slides

A monorepo for hosting multiple [Slidev](https://sli.dev) decks, plus the Go
server that powers **live audience questions** inside those decks.

Each deck lives in `decks/<name>/` and is an npm workspace. The live-question
backend lives in `server/` (one Go binary) and can serve the built decks,
the audience app, the admin panel and the WebSocket API from a single
container — or you can keep hosting static decks on GitHub Pages and point
them at a hosted backend.

## Decks

- [`meetup`](./decks/meetup) — Dutch Kubernetes/Cloud Native Meetup, with live Q&A, polls and feedback slides.
- [`opencode`](./decks/opencode) — OpenCode: what it is, the Console, Go, running it at home, and OpenCode Web on your phone.

## Setup

```bash
npm install
```

## Develop a deck

```bash
npm run dev -w meetup
```

Runs the deck's dev server with hot reload at `http://localhost:3030`.

## Build everything

```bash
npm run build
```

Builds every deck into `dist/<name>/` and generates a landing page at
`dist/index.html`. The landing reads each deck's `slides.md` frontmatter and
shows its **title, date and tags** (see [Deck metadata](#deck-metadata)).

For a sub-path deployment (e.g. GitHub Pages project site), set `BASE_PATH`:

```bash
BASE_PATH=/slides/ npm run build
```

## Add a new deck

```bash
cp -r templates/deck decks/my-new-deck
```

Then replace `DECK_NAME` with `my-new-deck` in `decks/my-new-deck/package.json`
and `decks/my-new-deck/slides.md`, and run `npm install` so the workspace is
linked. The template already ships the live-question components (below).

### Deck metadata

The first frontmatter block drives the landing page and the deck itself:

```yaml
---
theme: default
title: My talk
info: One-line description for the index page.
date: 2026-09-28
tags: [kubernetes, cloud-native]
---
```

Decks are sorted newest-first on the landing page.

## Live questions in a deck

Every deck copied from the template already has:

| Component | What it shows |
| --- | --- |
| `<LiveJoin />` | QR code + short room code + join URL |
| `<LiveQuestion />` | The active question, rich media prompt (image/video) and live results |
| `<LiveQa :limit="5" />` | Top upvoted approved audience questions |
| `<LiveQr />` | Back-compat card combining join + question |
| `<PresenterPanel />` | Presenter overlay: sign in, write a question, attach a photo/video, ask or close it live |

Point them at a room with a prop (`room="AB2C3"` or `event="my-event-code"`),
or leave them empty and set the build-time variables:

```bash
VITE_ROOM_CODE=AB2C3 npm run build -w meetup    # resolve a short room code
VITE_EVENT_CODE=my-event-code npm run build -w meetup
VITE_LIVE_BASE_URL=https://meetup.example.com   # hosted backend (GitHub Pages)
```

Drop them into any slide:

```md
---
layout: center
---

# Ask me anything

<LiveJoin />

<div class="mt-8">
  <LiveQuestion />
</div>
```

Resolution order: the `room`/`event` prop, then `VITE_ROOM_CODE`/`VITE_EVENT_CODE`,
then a visible "not configured" hint. The server URL is the `base` prop, then
`VITE_LIVE_BASE_URL`, then same-origin (the all-in-one container). A short room
code is resolved to the event at runtime via `GET /api/join/{room}`.

The components share one WebSocket per room and reconnect automatically. If the
backend is unreachable they render the join card and wait, so the deck still
works as a static presentation.

### Presenter panel

`<PresenterPanel />` lets you drive the room from inside the slides: press `p`
to toggle it (or add the `fab` prop for a corner button, or embed
`<PresenterPanel :open="true" />` on a presenter-only slide). It signs in to the
backend, writes a prompt, picks or uploads an **image/video**, and asks or closes
the question live.

```md
<PresenterPanel room="AB2C3" fab />
```

In the all-in-one container this is same-origin and uses the admin session
cookie. On GitHub Pages the deck is cross-origin, so the backend must allowlist
the Pages origin — set `CORS_ORIGINS` (and `COOKIE_SAMESITE=none` with
`COOKIE_SECURE=true` over HTTPS).

## Run the backend

The server is a Go module in `server/`:

```bash
cd server
go run .            # http://localhost:6270
```

Open `/admin` to create the first admin user, then create an event. Every
event gets a stable `code` (used in URLs) and a **5-character room code**
(case-insensitive, unambiguous alphabet) that you show on the slide. Audience
members scan the QR or open `/join` and type the room code.

The audience app is at `/e/{code}`, the projector view at `/live/{code}`.

### What the backend does

- **Live questions** over a WebSocket at `/ws/events/{code}` (server pushes
  state/results; clients send answers, Q&A and votes).
- **Question kinds**: poll, multi-select, ranking, yes/no, rating, NPS, open
  text and word cloud, each with an optional **image or video prompt**.
- **Q&A** with upvoting and moderation, **feedback** forms, **presentations**
  upload, **Word clouds**, **CSV export**.
- **OIDC login** (Authelia-compatible) alongside local accounts.
- **Umami analytics** and **OpenTelemetry** tracing/metrics/logs.
- **Health probe** at `GET /healthz` (used by the compose healthcheck).

### Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `6270` | HTTP listen port |
| `DB_PATH` | `./slides.db` | SQLite database file |
| `MEDIA_DIR` | `./media` | Uploaded question media |
| `DECKS_DIR` | `./dist` | Built decks to serve at `/` (falls back to the embedded SPA) |
| `PUBLIC_BASE_URL` | `http://localhost:6270` | Absolute base used in QR codes |
| `OIDC_ENABLED` | `false` | Enable OIDC login |
| `OIDC_ISSUER_URL` | — | OIDC issuer |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | OIDC client credentials |
| `OIDC_REDIRECT_URL` | `http://localhost:6270/api/auth/oidc/callback` | Callback URL |
| `OIDC_SCOPES` | `openid email profile groups` | Requested scopes |
| `OIDC_ADMIN_EMAILS` | — | Emails granted admin |
| `CORS_ORIGINS` | — | Comma-separated origins allowed credentialed cross-origin admin calls (e.g. your GitHub Pages origin). `*` reflects any origin read-only |
| `COOKIE_SAMESITE` | `lax` | Session cookie `SameSite` (`lax`, `strict` or `none`); use `none` for cross-site |
| `COOKIE_SECURE` | `false` | Force `Secure` cookies (implied by `COOKIE_SAMESITE=none`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_*` | — | OpenTelemetry (env overrides admin settings) |

Umami and OTel can also be configured in the admin panel; environment
variables take precedence for OTel.

### Storage model

SQLite runs in **WAL mode** with a busy timeout. Answers go through a single
serialized writer that batches writes in one transaction, and question results
are cached in-process for a few seconds, so bursts of concurrent answers don't
fight over the write lock. No external memcached/Redis is required.

## Tests

**Go** (unit + HTTP/WebSocket integration):

```bash
cd server
go test ./...
```

Covers the room-code lifecycle, credentialed CORS, admin auth, question media
upload and the full setup → login → create media question → activate →
audience answer → live result flow over `httptest` + a real WebSocket.

**End-to-end** (Playwright, boots the built Go server against a temp database):

```bash
npx playwright install chromium   # once
npm run test:e2e
```

The suite drives a browser through admin setup/login, creating an event, joining
with a room code, answering a poll and rendering an image question, plus the
built deck and QR endpoint. `e2e/start-server.mjs` builds the Go binary and
serves `dist/` on `127.0.0.1:4173` (override with `E2E_PORT`).

## GitHub Pages

Pushing to `main` builds all decks and deploys `dist/` via
[`deploy-gh-pages.yml`](./.github/workflows/deploy-gh-pages.yml). Enable
**Settings → Pages → Source: GitHub Actions** once in the repository.

GitHub Pages can't run the Go backend, so static decks point at a hosted
backend through repository **Variables** (Settings → Secrets and variables →
Actions → Variables):

| Variable | Purpose |
| --- | --- |
| `LIVE_BASE_URL` | Public backend for live questions, e.g. `https://meetup.example.com` |
| `UMAMI_SCRIPT_URL` | Umami script URL for the landing page and decks (optional) |
| `UMAMI_WEBSITE_ID` | Umami website id (optional) |

Leave `LIVE_BASE_URL` empty for a fully static, presentation-only deploy.

## Docker

One image contains the Go server, the admin/audience app and all built decks:

```bash
docker build -t slides .
docker run --rm -p 6270:6270 -v slides-data:/data slides
```

Open <http://localhost:6270> for the deck index, `/admin` for the admin panel
and `/join` to join a room. The database and uploads live in `/data`. The
container exposes `GET /healthz` for probes.

### Docker Compose

[`compose.yaml`](./compose.yaml) runs the same image together with optional
Umami analytics and an OpenTelemetry collector, configured from
[`.env.example`](./.env.example) (copy it to `.env`):

```bash
docker compose up -d                          # slides on http://localhost:6270
docker compose --profile analytics up -d      # + Umami on http://localhost:6271
docker compose --profile observability up -d  # + OTLP collector on 4317/4318
```

- **Analytics** — after the first start, open <http://localhost:6271>, sign in
  with `admin` / `umami`, create a website and paste its script URL and website
  id into *Admin → Analytics* in the Slides UI.
- **Observability** — set
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` in `.env`, restart
  the `slides` service, and traces/metrics/logs show up in the collector logs.
  [`otel-collector.yaml`](./otel-collector.yaml) is a ready-to-edit debug
  pipeline.

## Deploy

- **Container images** — a release publishes `ghcr.io/martynvdijke/slides` and
  `martynvdijke/slides` (multi-arch) via [`release.yaml`](./.github/workflows/release.yaml).

## Workflows

| Workflow | Purpose |
| --- | --- |
| [`ci.yaml`](./.github/workflows/ci.yaml) | `npm ci`, test/build the Go server, build all decks, run Playwright e2e, validate the Dockerfile and `compose.yaml` |
| [`release.yaml`](./.github/workflows/release.yaml) | semantic-release + build/push Docker images + Gotify notify |
| [`deploy-gh-pages.yml`](./.github/workflows/deploy-gh-pages.yml) | Build and deploy to GitHub Pages |
| [`renovate.yml`](./.github/workflows/renovate.yml) | Self-hosted Renovate using `renovate.json` |
| [`stale-branches.yml`](./.github/workflows/stale-branches.yml) | Close stale branches |
| [`workflow-lint.yml`](./.github/workflows/workflow-lint.yml) | actionlint + zizmor + pinact |

Secrets: `RENOVATE_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `GOTIFY_API_BASE`,
`GOTIFY_APP_TOKEN`, `OTLP_ENDPOINT`, `OTLP_HEADERS`.
Variables: `LIVE_BASE_URL`, `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID`.
