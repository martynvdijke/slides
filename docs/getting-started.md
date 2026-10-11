# Getting started

This page takes you from a checkout to a live event: run the backend, develop a
deck, build everything and add your own deck.

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 24 | building and developing decks |
| [Go](https://go.dev) | 1.27 | building and running the server |
| [Docker](https://docs.docker.com) | recent | the all-in-one image and Compose |

The backend also needs Python ≥ 3.11 only if you build this documentation site
with [Zensical](https://zensical.org) — see [Deployment](deployment.md).

## Install dependencies

From the repository root:

```bash
npm install
```

This installs every deck workspace and the shared Slidev tooling.

## Run the backend

The server is a Go module in `server/`:

=== "Go run"

    ```bash
    cd server
    go run .            # http://localhost:6270
    ```

=== "Docker"

    ```bash
    docker build -t slides .
    docker run --rm -p 6270:6270 -v slides-data:/data slides
    ```

On first run, open <http://localhost:6270/admin> and create the first admin
account. Then create an event — every event gets a stable `code` (used in URLs)
and a **5-character room code** (case-insensitive, unambiguous alphabet) that
you show on the slide.

!!! note "Seeding from decks"
    The published image sets `SEED_DECK_QUESTIONS=1` and `SEED_FEATURE_TEST=1`,
    so on startup it imports each deck's built `questions.json` and creates a
    deterministic `feature-test` event. When running the server by hand you can
    set the same variables (see [Configuration](configuration.md)) or create
    everything through the admin panel.

Key URLs served by the backend:

| Path | What |
| --- | --- |
| `/` | Host/join entry page (or the built deck index) |
| `/admin` | Admin panel |
| `/join` | Join page — type a room code |
| `/e/{code}` | Audience app |
| `/live/{code}` | Projector view |
| `/results/{code}` | Public results page (opt-in) |
| `/swagger/` | Interactive API reference |
| `/healthz` | Liveness probe |

## Develop a deck

```bash
npm run dev -w meetup
```

Runs the deck's dev server with hot reload at <http://localhost:3030>.

While developing, point the deck at your local backend by passing a prop or
setting the build-time variables (see [Decks](decks.md)):

```bash
VITE_LIVE_BASE_URL=http://localhost:6270 \
VITE_ROOM_CODE=AB2C3 \
npm run dev -w meetup
```

Deck live questions are authored either as **interactive slide layouts**
(`layout: poll` etc.) or as **markdown comment blocks**. To push a deck's
interactive slides to a running backend while you edit:

```bash
DECK_SYNC_BASE_URL=http://localhost:6270 \
DECK_SYNC_EVENT_ID=1 \
DECK_SYNC_TOKEN=<admin session cookie> \
DECK_SLUG=meetup \
npm run sync:deck -w meetup
```

## Build everything

```bash
npm run build
```

The root build script runs three steps:

1. `npm run build --workspaces` — builds each deck into `dist/<name>/`.
2. `node scripts/extract-questions.mjs` — parses the `<!-- live-question -->`
   blocks from each deck's `slides.md` and writes `dist/<name>/questions.json`
   (the manifest the server seeds from).
3. `node scripts/build-index.mjs` — generates the landing page at
   `dist/index.html`, reading each deck's `slides.md` frontmatter and showing its
   **title, date and tags**.

For a sub-path deployment (for example a GitHub Pages project site), set
`BASE_PATH`:

```bash
BASE_PATH=/slides/ npm run build
```

## Add a new deck

```bash
cp -r templates/deck decks/my-new-deck
```

Then:

1. Replace `DECK_NAME` with `my-new-deck` in
   `decks/my-new-deck/package.json` and `decks/my-new-deck/slides.md`.
2. Run `npm install` so the workspace is linked.
3. Start it with `npm run dev -w my-new-deck`.

The template already ships the live-question components, the interactive
layouts (`poll`, `multi`, `ranking`, `yesno`, `rating`, `nps`, `open`,
`wordcloud`, `qa`, `grid2x2`) and a `THEME.md` authoring guide — see
[Decks](decks.md) for what each one does.

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

Decks are sorted newest-first on the landing page, then alphabetically. See
[Decks](decks.md) for the rest of the Slidev frontmatter you can set, the
per-deck `features` flags and how to author questions.

## Next steps

- [Decks](decks.md) — components, layouts, markdown authoring and the presenter panel.
- [Questions](questions.md) — author every kind of question.
- [Configuration](configuration.md) — tune the backend.
- [Deployment](deployment.md) — ship it to GitHub Pages or a container host.
