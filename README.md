# Slides

A monorepo for hosting multiple [Slidev](https://sli.dev) decks. Each deck lives in
`decks/<name>/` and is an npm workspace.

## Decks

- [`opencode-go`](./decks/opencode-go) — OpenCode: what it is, the Console, Go ($10/mo), running it at home, and OpenCode Web on your phone.

## Setup

```bash
npm install
```

## Develop a deck

```bash
npm run dev -w opencode-go
```

Runs the deck's dev server with hot reload at `http://localhost:3030`.

## Build everything

```bash
npm run build
```

Builds every deck into `dist/<name>/` and generates a landing page at `dist/index.html`.

For a sub-path deployment (e.g. GitHub Pages project site), set `BASE_PATH`:

```bash
BASE_PATH=/slides/ npm run build
```

## Add a new deck

```bash
cp -r templates/deck decks/my-new-deck
```

Then replace `DECK_NAME` with `my-new-deck` in `decks/my-new-deck/package.json`
and `decks/my-new-deck/slides.md`, and run `npm install` so the workspace is linked.

## Docker

Builds all decks and serves them behind the landing overviewer (`/`) with nginx:

```bash
docker build -t slides .
docker run --rm -p 8080:80 slides
```

Open <http://localhost:8080> and pick a deck.

## Deploy

- **GitHub Pages** — pushing to `main` builds all decks and deploys `dist/` via
  [`deploy-gh-pages.yml`](./.github/workflows/deploy-gh-pages.yml). Enable
  **Settings → Pages → Source: GitHub Actions** once in the repository.
- **Container images** — a release publishes `ghcr.io/martynvdijke/slides` and
  `martynvdijke/slides` (multi-arch) via [`release.yaml`](./.github/workflows/release.yaml).

## Workflows

Standard automation, mirroring the other projects:

| Workflow | Purpose |
| --- | --- |
| [`ci.yaml`](./.github/workflows/ci.yaml) | `npm ci`, build all decks, validate the Dockerfile |
| [`release.yaml`](./.github/workflows/release.yaml) | semantic-release + build/push Docker images + Gotify notify |
| [`deploy-gh-pages.yml`](./.github/workflows/deploy-gh-pages.yml) | Build and deploy to GitHub Pages |
| [`renovate.yml`](./.github/workflows/renovate.yml) | Self-hosted Renovate using `renovate.json` |
| [`stale-branches.yml`](./.github/workflows/stale-branches.yml) | Close stale branches |
| [`workflow-lint.yml`](./.github/workflows/workflow-lint.yml) | actionlint + zizmor + pinact |

Secrets: `RENOVATE_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `GOTIFY_API_BASE`,
`GOTIFY_APP_TOKEN`, `OTLP_ENDPOINT`, `OTLP_HEADERS`.
