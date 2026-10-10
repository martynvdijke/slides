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
- [`feature-test`](./decks/feature-test) — testing deck that exercises every live question kind, image/video prompts and all in-slide components.

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
| `<Podium />` | Quiz podium: top three scorers, shown while the host has it toggled on |

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

### Feature-test defaults

The `feature-test` deck builds with `VITE_EVENT_CODE=feature-test` baked in
and resolves its API same-origin, so on the all-in-one container
(`slides.vandijke.xyz`) its live components connect with no query params. The
server seeds a deterministic `feature-test` event when `SEED_FEATURE_TEST` is
truthy (the published image sets it to `1`). `?event=<code>` still overrides
the baked code, and setting `VITE_EVENT_CODE` / `VITE_LIVE_BASE_URL` at build
time overrides the defaults for other hosts.

The components share one WebSocket per room and reconnect automatically. If the
backend is unreachable they render the join card and wait, so the deck still
works as a static presentation.

### Questions defined in markdown

You can define live/quiz questions directly in a deck's `slides.md` with an HTML comment block anywhere in the markdown — it renders nothing in the slides:

```md
<!-- live-question
id: k8s-control-plane
kind: multi
prompt: Which of these are Kubernetes control-plane components?
options:
  - kube-apiserver
  - etcd
  - kubelet
correct: 0
points: 100
time_limit_s: 30
-->
```

Fields:

- `id` — stable key for updates (optional, auto-generated if omitted).
- `kind` — `poll`, `multi`, `ranking`, `yesno`, `rating`, `nps`, `open`, `wordcloud`.
- `prompt` — question text (required).
- `options` — list of choices (requires ≥2 for `poll`/`multi`/`ranking`).
- `correct` — correct answer as index (`0`-based) or exact option text.
- `points` — maps to `points_base` (default `100`).
- `mode` — `live` (default) or `feedback`.
- `show_results` — whether to show the tally (default `true`).
- `time_limit_s` / `duration_sec` — time limit in seconds.
- `media_url` / `media_type` — optional image or video prompt.

At build time each deck emits `dist/<deck>/questions.json`. On startup the Go server seeds those questions into the event whose `code` equals the deck name when `SEED_DECK_QUESTIONS` is truthy (the published image sets it to `1`). Re-imports on each container upgrade update existing questions in place rather than duplicating them. Markdown is the source of truth — edits to the deck are applied on the next start.

### Presenter panel

`<PresenterPanel />` turns the deck itself into the presenter console, so you
can **ask and close live questions without leaving the slides**:

1. Add the component once per deck (it renders as an overlay, not a slide):

   ```md
   <PresenterPanel room="AB2C3" fab />
   ```

2. Open it with the `p` hotkey, the corner ▶ button (`fab`), or pin it on a
   presenter-only slide with `<PresenterPanel :open="true" />`.
3. Sign in with a local admin account, or reuse the admin session already active
   in the same-origin container (including one created through
   [OIDC login](#oidc-login)).
4. Pick the **kind** — poll, multi-select, ranking, yes/no, rating, NPS, open
   text or word cloud — write the prompt, and for the choice kinds add
   comma-separated options.
5. Optionally attach an **image or video** to the prompt (upload a file or paste
   a URL); the audience sees it with the question.
6. **Ask now** pushes the question live to every audience device, **Save draft**
   stores it for later, **Reveal** publishes the correct answer and results, and
   **Close current** ends the active question. A per-question **time limit**
   (0 = untimed) locks answers automatically when it expires. The `show results`
   checkbox controls whether the audience tally is shown, and `feedback` routes
   the question to the post-event feedback form.
7. **Show podium** swaps the projector and audience screens to the quiz
   leaderboard; asking the next question hides it again.

The panel header shows the resolved room and the live answer count. In the
all-in-one container this is same-origin and uses the admin session cookie. On
GitHub Pages the deck is cross-origin, so the backend must allowlist the Pages
origin — set `CORS_ORIGINS` (and `COOKIE_SAMESITE=none` with
`COOKIE_SECURE=true` over HTTPS).

### Quiz game loop

Scored poll and yes/no questions can run as a timed round. Set a **time limit**
in the presenter panel (or `time_limit_s` through the API) and the audience and
projector count down to a server-computed deadline that survives reconnects.
When time runs out the question **locks**: answers are rejected and results stay
hidden. The host then **reveals** the correct answer (presenter panel or admin
console), which also publishes the tally and each participant's result. Points
are scored on submission but only disclosed at reveal — unless `show results`
is on, which keeps the legacy instant feedback. **Show podium** puts the top
three scorers on the projector and audience app; activating any question clears
it.

### Audience questions (Q&A)

Audience members ask from their phones, not from the deck: scan the
`<LiveJoin />` QR (or open the join page and enter the room code), switch to the
**Q&A** tab, and submit a question with an optional name. The backend queues it
for moderation; an admin approves, hides or marks it answered in `/admin`.
Approved questions can be upvoted, `<LiveQa :limit="5" />` mirrors the top-voted
ones on a slide, and `<LiveQuestion />` shows the active prompt with its live
results.

### Moderation & safety

The **Content filter** card in `/admin` → Settings holds a global, opt-in word
list. Words are matched case-insensitively on whole tokens (so `badword` catches
`Badword!` but not `badminton`) across open-text and word-cloud answers and Q&A
bodies; names are never filtered. The action chooses what happens on a match:
**flag for review** (default) stores the submission with a `flagged` status and
tells the author it is under review, while **reject** refuses it outright and
stores nothing.

Flagged and hidden answers stay out of live results, the projector, exports and
the leaderboard until they are approved. The **Answer moderation** queue in the
Q&A panel lists flagged answers first — with the prompt, the answer and the
submitter's display identity — and lets the host approve or hide each one; every
change refreshes the connected clients immediately. Q&A rows flagged by the
filter are sorted first and badged in the normal moderation list.

Each event can also set a **Q&A slow mode** (seconds per participant, 0 = off).
Within the interval a participant's next question is rejected with a retry hint,
and the audience app disables the form and shows a live countdown. The interval
is measured from stored submissions, so it survives reconnects and restarts.

### Post-event recap

Turn on **Publish results page** in the event settings to open a public
`/results/{code}` page. It renders the participation stats, every question's
aggregate (including NPS and word clouds), the approved/answered Q&A and the
leaderboard — never participant identities — and carries a `noindex` directive.
While publishing is off the page and its API return 404. Hidden or flagged
answers and pending Q&A stay out of it.

Attendees can opt in to a recap email from the audience app; the address is
stored per event and participant and can be removed by the attendee or the host.
The **Recap** card in `/admin` → Settings keeps the host recipient list, shows
the per-event opt-ins, renders a plain-text preview and sends the recap (event
summary, participation, headline results, top scores, Q&A highlights and a link
to the results page) through the configured SMTP server, with a per-recipient
report and a 200-recipient cap per send.

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

The audience app is at `/e/{code}`, the projector view at `/live/{code}`, and
the public (opt-in) results page at `/results/{code}`.

### What the backend does

- **Live questions** over a WebSocket at `/ws/events/{code}` (server pushes
  state/results; clients send answers, Q&A and votes).
- **Question kinds**: poll, multi-select, ranking, yes/no, rating, NPS, open
  text and word cloud, each with an optional **image or video prompt**.
- **Quiz game loop**: per-question time limits with auto-lock, host reveal and a
  top-3 podium, with correctness disclosed only at reveal unless results are
  shown.
- **Q&A** with upvoting and moderation, **feedback** forms, **presentations**
  upload, **Word clouds**, **CSV export**.
- **Moderation & safety**: opt-in whole-word content filter (flag or reject) on
  free-text answers and Q&A, a flagged-first answer moderation queue with
  approve/hide, and a per-event Q&A slow mode with a client countdown.
- **Post-event recap**: a gated public results page (`/results/{code}`),
  attendee email opt-ins per event, and a plain-text recap email with preview,
  recipient union/dedupe and per-recipient send reporting.
- **OIDC login** (Authelia-compatible) alongside local accounts — see
  [OIDC login](#oidc-login).
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

### OIDC login

Admins can sign in through any OIDC provider that publishes discovery
(`/.well-known/openid-configuration`) — Authelia, Keycloak, Authentik, Okta,
Entra ID and friends — either alongside local accounts or instead of them.

1. Register a **confidential** client with the provider and set its redirect URI
   to `<PUBLIC_BASE_URL>/api/auth/oidc/callback`.
2. Set the environment variables and restart the server (uncomment them in
   [`.env.example`](./.env.example) for the compose stack):

   ```bash
   OIDC_ENABLED=true
   OIDC_ISSUER_URL=https://auth.example.com
   OIDC_CLIENT_ID=slides
   OIDC_CLIENT_SECRET=change-me
   OIDC_REDIRECT_URL=https://slides.example.com/api/auth/oidc/callback
   OIDC_SCOPES="openid email profile groups"
   OIDC_ADMIN_EMAILS=you@example.com,teammate@example.com   # optional
   ```

   OIDC is only active when `OIDC_ENABLED` is true **and** the issuer, client id
   and client secret are all set.
3. `/admin` now shows a **Sign in with OIDC** button next to the local form, on
   both the first-run setup screen and the returning login screen.

Who gets an account:

- **First user ever** — while the `users` table is empty, the first OIDC sign-in
  is provisioned as `admin`, so you can bootstrap the server entirely through
  SSO.
- **Known users** — emails that already exist in `users` are signed in and keep
  their role.
- **Allowlisted emails** — unknown identities whose email is listed in
  `OIDC_ADMIN_EMAILS` (comma-separated, case-insensitive) are provisioned as
  admin.
- **Everyone else** — rejected and redirected to
  `/admin?oidc_error=unknown_user`; no account is created.

The identity is taken from the `email` claim, falling back to
`preferred_username` and then `sub`. The callback verifies the ID token and the
anti-forgery `state` cookie, and issues the same session cookie as a local login
(cleared by `GET /api/auth/oidc/logout`). Once signed in on the all-in-one
container, the in-slide [presenter panel](#presenter-panel) reuses that session
automatically.

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
audience answer → live result flow over `httptest` + a real WebSocket, plus the
quiz lifecycle: time-limit validation, auto-lock idempotency and recovery,
reveal gating, deferred scoring disclosure and podium clearing, plus moderation:
filter matching edge cases, flag/reject flows, aggregate exclusion and slow-mode
boundaries with reconnect persistence, plus the post-event recap: the publish
gate and results shape, subscription validation/dedupe, recipient resolution,
preview never sending, and send reporting with a fake mailer.

**End-to-end** (Playwright, boots the built Go server against a temp database):

```bash
npx playwright install chromium   # once
npm run test:e2e
```

The suite drives a browser through admin setup/login, creating an event, joining
with a room code, answering a poll and rendering an image question, plus the
built deck and QR endpoint. It also walks the timed quiz loop end to end
(countdown → auto-lock → reveal → podium), the untimed instant-feedback
regression, and audience moderation (a flagged answer hidden from results then
approved, and slow mode rejecting a rapid question with a countdown). The recap
spec publishes an event and opens its results page, then opts an attendee in and
asserts the delivered email through a fake SMTP inbox started by
`e2e/start-server.mjs`.
`e2e/start-server.mjs` builds the Go binary and serves `dist/` on
`127.0.0.1:4173` (override with `E2E_PORT`), and starts a fake SMTP server whose
inbox is exposed for assertions on port `E2E_PORT + 1` (override with
`E2E_MAIL_PORT`).

`e2e/feature-test.spec.ts` drives the [`feature-test`](./decks/feature-test)
deck end to end: it points the in-slide components at a live event with
`?event=CODE`, then walks every question kind (poll, multi, ranking, yes/no,
rating, NPS, open, word cloud) across the audience, projector and in-slide
views, checks image and video prompts, and exercises the presenter overlay,
podium, leaderboard, Q&A and reactions.

**Load test** (50 concurrent WebSocket participants by default):

```bash
npm run test:load
```

`e2e/load.mjs` is a dependency-free Node script. With no `LOAD_BASE_URL` it
builds and boots the Go server itself, then opens `LOAD_USERS` (default `50`)
concurrent WebSocket clients that each join, answer the same poll and wait for
their scored result. It verifies the answers were persisted, prints latency
percentiles and throughput, and exits non-zero on any failure. Point it at a
running server with `LOAD_BASE_URL=https://host npm run test:load`.

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
