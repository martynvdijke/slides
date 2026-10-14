# Deployment

There are two deployment shapes:

1. **All-in-one container** — the Go server serves the built decks, the
   audience app, the admin panel and the API from one image.
2. **Static decks on GitHub Pages** — decks are hosted statically and point at a
   separately hosted backend for live questions.

## Docker

One image contains the Go server, the admin/audience app and all built decks.

```bash
docker build -t slides .
docker run --rm -p 6270:6270 -v slides-data:/data slides
```

Open <http://localhost:6270> for the deck index, `/admin` for the admin panel
and `/join` to join a room. The database and uploads live in `/data`. The
container exposes `GET /healthz` for probes.

### What the image does

The `Dockerfile` is a three-stage build:

1. **decks** — Node 24 builds every deck, extracts each deck's
   `questions.json` manifest and generates the landing page.
2. **server** — Go 1.27 builds a static `slides` binary.
3. **runtime** — Alpine with the binary and `dist/`, running as a non-root user.

Runtime defaults:

```text
ENV PORT=6270  DB_PATH=/data/slides.db  MEDIA_DIR=/data/media  DECKS_DIR=/app/dist
ENV SEED_FEATURE_TEST=1  SEED_DECK_QUESTIONS=1
VOLUME ["/data"]
```

`SEED_DECK_QUESTIONS=1` imports each deck's `questions.json` into the event named
after the deck on startup (idempotently, markdown wins), and
`SEED_FEATURE_TEST=1` seeds the deterministic `feature-test` event so the bundled
feature-test deck auto-connects. See [Configuration](configuration.md).

Built-in container URLs: `/`, `/admin`, `/join`, `/e/{code}`, `/live/{code}`,
`/api/*`, `/ws/*`, `/results/{code}`, `/swagger/` and `/healthz`.

## Docker Compose

[`compose.yaml`](https://github.com/martynvdijke/slides/blob/main/compose.yaml)
runs the same image together with optional Umami analytics and an
OpenTelemetry collector, configured from `.env.example` (copy it to `.env`):

```bash
docker compose up -d                          # slides on http://localhost:6270
docker compose --profile analytics up -d      # + Umami on http://localhost:6271
docker compose --profile observability up -d  # + OTLP collector on 4317/4318
```

=== "Core stack"

    The `slides` service builds from `.` (or pulls
    `ghcr.io/martynvdijke/slides:latest`), mounts the `slides-data` volume at
    `/data` and forwards the `.env` values as environment variables
    (`PUBLIC_BASE_URL`, the `OIDC_*` login settings, the `OTEL_*` endpoint and
    the `SEED_FEATURE_TEST` / `SEED_DECK_QUESTIONS` seeding switches). The
    healthcheck polls `/healthz`.

=== "Analytics profile"

    Adds **Umami** plus a Postgres database. After the first start, open
    <http://localhost:6271>, sign in with `admin` / `umami`, create a website
    and paste its script URL and website id into **Admin → Analytics** in the
    Slides UI.

=== "Observability profile"

    Adds `otel/opentelemetry-collector-contrib` with
    [`otel-collector.yaml`](https://github.com/martynvdijke/slides/blob/main/otel-collector.yaml),
    a debug pipeline that prints every batch to the container logs. Set
    `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` in `.env`, restart
    the `slides` service, and traces/metrics/logs show up in the collector logs.

!!! tip "Ship telemetry elsewhere"
    Replace the `debug` exporter in `otel-collector.yaml` with `otlphttp`, or add
    a second exporter and list both.

## GitHub Pages (static decks)

Pushing to `main` builds all decks and deploys `dist/` via the
`deploy-gh-pages.yml` workflow. Enable **Settings → Pages → Source: GitHub
Actions** once in the repository.

GitHub Pages can't run the Go backend, so static decks point at a hosted backend
through repository **Variables** (Settings → Secrets and variables → Actions →
Variables):

| Variable | Purpose |
| --- | --- |
| `LIVE_BASE_URL` | Public backend for live questions, e.g. `https://meetup.example.com` |
| `UMAMI_SCRIPT_URL` | Umami script URL for the landing page and decks (optional) |
| `UMAMI_WEBSITE_ID` | Umami website id (optional) |

Leave `LIVE_BASE_URL` empty for a fully static, presentation-only deploy.

### Static export

The workflow sets `BASE_PATH=/<repo-name>/` for a project site and passes the
variables through to the deck build:

```yaml
env:
  BASE_PATH: /${{ github.event.repository.name }}/
  VITE_STATIC_EXPORT: ${{ vars.LIVE_BASE_URL == '' && '1' || '' }}
  VITE_LIVE_BASE_URL: ${{ vars.LIVE_BASE_URL }}
  VITE_UMAMI_SCRIPT_URL: ${{ vars.UMAMI_SCRIPT_URL }}
  VITE_UMAMI_WEBSITE_ID: ${{ vars.UMAMI_WEBSITE_ID }}
```

- `VITE_STATIC_EXPORT=1` (when `LIVE_BASE_URL` is empty) hides the presenter
  panel and reactions, so the deck is a clean, presentation-only build.
- `VITE_LIVE_BASE_URL` wires the deck's live components to the hosted backend.
- `BASE_PATH` rewrites asset URLs for a sub-path deploy.

The Pages workflow also emits a per-deck PDF at `dist/<deck>/slides.pdf` (served at `/<repo>/<deck>/slides.pdf`). Locally, run `npm run build:pdf` after `npm run build` to produce them; it requires the Playwright Chromium browser (`npx playwright install chromium`).

### Wiring a hosted backend

For a cross-origin GitHub Pages deck with a live presenter panel, the backend
must allowlist the Pages origin:

```bash
CORS_ORIGINS=https://yourname.github.io
COOKIE_SAMESITE=none
COOKIE_SECURE=true
```

See [Configuration](configuration.md) for why credentialed calls need an exact
origin.

## Publishing this documentation site

The docs are built with [Zensical](https://zensical.org) from `docs/` and
`zensical.toml`. On CI run:

```bash
pip install zensical
zensical build --strict --clean
```

Zensical requires **Python ≥ 3.11**. The generated site is written to `site/`
(git-ignored). The `.github/workflows/docs.yml` workflow publishes it to GitHub
Pages with the official Zensical Pages recipe.

!!! note "Preview locally"
    ```bash
    python3 -m venv .venv && . .venv/bin/activate && pip install zensical
    zensical serve            # http://localhost:8000
    ```

## Container images

A release publishes `ghcr.io/martynvdijke/slides` and `martynvdijke/slides`
(multi-arch) via the `release.yaml` workflow.

## Next steps

- [Configuration](configuration.md) — the variables referenced above.
- [Operations](operations.md) — health, telemetry and webhooks.
- [Contributing](contributing.md) — the CI and release workflows.
