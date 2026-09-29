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
| `<LiveJoin event="CODE" />` | QR code + short room code + join URL |
| `<LiveQuestion event="CODE" />` | The active question, rich media prompt (image/video) and live results |
| `<LiveQa event="CODE" :limit="5" />` | Top upvoted approved audience questions |
| `<LiveQr event="CODE" />` | Back-compat card combining join + question |

Drop them into any slide:

```md
---
layout: center
---

# Ask me anything

<LiveJoin event="YOUR-EVENT-CODE" />

<div class="mt-8">
  <LiveQuestion event="YOUR-EVENT-CODE" />
</div>
```

How the server URL is resolved:

1. the `base` prop, if you pass one;
2. otherwise `VITE_LIVE_BASE_URL` (baked in at build time — used on GitHub Pages);
3. otherwise same-origin (the all-in-one container).

The components share one WebSocket per deck/event and reconnect automatically.
If the backend is unreachable they render the join card and wait, so the deck
still works as a static presentation.

## Run the backend

The server is a Go module in `server/`:

```bash
cd server
go run .            # http://localhost:8080
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

### Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `DB_PATH` | `./slides.db` | SQLite database file |
| `MEDIA_DIR` | `./media` | Uploaded question media |
| `DECKS_DIR` | `./dist` | Built decks to serve at `/` (falls back to the embedded SPA) |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | Absolute base used in QR codes |
| `OIDC_ENABLED` | `false` | Enable OIDC login |
| `OIDC_ISSUER_URL` | — | OIDC issuer |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | OIDC client credentials |
| `OIDC_REDIRECT_URL` | `http://localhost:8080/api/auth/oidc/callback` | Callback URL |
| `OIDC_SCOPES` | `openid email profile groups` | Requested scopes |
| `OIDC_ADMIN_EMAILS` | — | Emails granted admin |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_*` | — | OpenTelemetry (env overrides admin settings) |

Umami and OTel can also be configured in the admin panel; environment
variables take precedence for OTel.

### Storage model

SQLite runs in **WAL mode** with a busy timeout. Answers go through a single
serialized writer that batches writes in one transaction, and question results
are cached in-process for a few seconds, so bursts of concurrent answers don't
fight over the write lock. No external memcached/Redis is required.

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
docker run --rm -p 8080:8080 -v slides-data:/data slides
```

Open <http://localhost:8080> for the deck index, `/admin` for the admin panel
and `/join` to join a room. The database and uploads live in `/data`.

## Deploy

- **Container images** — a release publishes `ghcr.io/martynvdijke/slides` and
  `martynvdijke/slides` (multi-arch) via [`release.yaml`](./.github/workflows/release.yaml).

## Workflows

| Workflow | Purpose |
| --- | --- |
| [`ci.yaml`](./.github/workflows/ci.yaml) | `npm ci`, test/build the Go server, build all decks, validate the Dockerfile |
| [`release.yaml`](./.github/workflows/release.yaml) | semantic-release + build/push Docker images + Gotify notify |
| [`deploy-gh-pages.yml`](./.github/workflows/deploy-gh-pages.yml) | Build and deploy to GitHub Pages |
| [`renovate.yml`](./.github/workflows/renovate.yml) | Self-hosted Renovate using `renovate.json` |
| [`stale-branches.yml`](./.github/workflows/stale-branches.yml) | Close stale branches |
| [`workflow-lint.yml`](./.github/workflows/workflow-lint.yml) | actionlint + zizmor + pinact |

Secrets: `RENOVATE_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `GOTIFY_API_BASE`,
`GOTIFY_APP_TOKEN`, `OTLP_ENDPOINT`, `OTLP_HEADERS`.
Variables: `LIVE_BASE_URL`, `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID`.
