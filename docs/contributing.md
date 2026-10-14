# Contributing

Thanks for helping improve Slides. This page covers the test suites, the CI and
release workflows, and where things live.

## Repository layout

```text
.
├── server/              # Go backend (one binary)
│   ├── main.go          # routes, CORS, middleware
│   ├── handlers/        # REST, WebSocket, auth, reaper, recap
│   ├── db/              # SQLite access, migrations, aggregation
│   ├── live/            # per-event WebSocket broker
│   ├── static/          # embedded admin/audience/projector pages
│   └── docs/            # generated swagger.yaml / swagger.json
├── decks/               # Slidev deck workspaces
├── templates/deck/      # starter deck
├── scripts/             # build-index.mjs + extract-questions.mjs
├── e2e/                 # Playwright specs + test server
└── docs/ + zensical.toml  # this documentation site
```

## Tests

=== "Go"

    ```bash
    cd server
    go test ./...
    ```

    Unit and HTTP/WebSocket integration tests using `httptest`, a real
    WebSocket and a temporary database. Coverage includes the room-code
    lifecycle, credentialed CORS, admin auth, media upload, the full setup →
    login → activate → answer → result flow, the quiz lifecycle (time limits,
    auto-lock idempotency and recovery, reveal gating, deferred scoring, podium
    clearing), moderation (filter edge cases, flag/reject, aggregate exclusion,
    slow-mode boundaries), and the recap (publish gate, subscription
    validation/dedupe, recipient resolution, preview never sending, send
    reporting with a fake mailer).

=== "End-to-end (Playwright)"

    ```bash
    npx playwright install chromium   # once
    npm run test:e2e
    ```

    `e2e/start-server.mjs` builds the Go binary, serves `dist/` on
    `127.0.0.1:4173` (override with `E2E_PORT`) and starts a fake SMTP server
    whose inbox is exposed on `E2E_PORT + 1` (override with `E2E_MAIL_PORT`).

    The suite drives a browser through admin setup/login, event creation,
    joining with a room code, answering a poll, image questions, the timed quiz
    loop (countdown → auto-lock → reveal → podium), the untimed feedback
    regression, audience moderation and the recap email delivery.

=== "Scripts"

    ```bash
    npm run test:scripts
    ```

    Node's built-in test runner exercises `scripts/extract-questions.mjs`: the
    `<!-- live-question -->` parser (fields, `correct` as index or option text,
    defaults, de-duplication, missing-option skipping) and the `features`
    frontmatter parser.

=== "Docs"

    ```bash
    python3 -m venv .venv && . .venv/bin/activate && pip install -r docs/requirements.txt
    zensical build --strict --clean     # must pass with no warnings
    zensical serve                      # http://localhost:8000
    ```

## Workflows

| Workflow | Purpose |
| --- | --- |
| `ci.yaml` | `npm ci`, test/build the Go server, build all decks, run Playwright e2e, validate the Dockerfile and `compose.yaml` |
| `release.yaml` | semantic-release + build/push Docker images + Gotify notify |
| `deploy-gh-pages.yml` | Build and deploy the decks (and per-deck PDFs) to GitHub Pages |
| `renovate.yml` | Self-hosted Renovate using `renovate.json` |
| `stale-branches.yml` | Close stale branches |
| `workflow-lint.yml` | actionlint + zizmor + pinact |

### CI

`ci.yaml` runs on every push to `main` and every pull request. It has a `ci` job
(Go tests/build, deck build, Docker/compose validation), a `playwright` job that
needs it, and an OTel export job.

### Release

`release.yaml` calls `ci.yaml` via `workflow_call`, then runs
[semantic-release](https://semantic-release.gitbook.io) with the changelog,
exec, git and GitHub plugins. On a new release it builds and pushes
`ghcr.io/martynvdijke/slides` and `martynvdijke/slides`, then notifies via
Gotify.

Commit messages drive versioning, so use conventional commits (`feat:`, `fix:`,
`docs:`, …). Skip a release with `[skip ci]` in the head commit message.

Secrets used: `RENOVATE_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`,
`GOTIFY_API_BASE`, `GOTIFY_APP_TOKEN`, `OTLP_ENDPOINT`, `OTLP_HEADERS`.

## Adding a deck

See [Getting started](getting-started.md): copy `templates/deck`, rename
`DECK_NAME`, and `npm install`. Deck components and props are documented in
[Decks](decks.md).

## Changing the server

- Keep new routes grouped with the existing public/admin/auth blocks in
  `server/main.go` and annotate handlers with Swagger comments under
  `@Tags admin`, `@Tags public` or `@Tags auth` so `server/docs/swagger.yaml`
  stays current.
- Add a test alongside the handler (the repo has `*_test.go` files per area).
- Use additive, idempotent migrations in `server/db/db.go` (`ensureColumn`).

## Changing these docs

The site is built with **Zensical** from `docs/`. Add a page, then list it in the
`nav` array in `zensical.toml`. Run `zensical build --strict --clean` before
opening a pull request — strict mode fails on broken links and warnings.

## Next steps

- [Architecture](architecture.md) — where each piece lives.
- [Configuration](configuration.md) — the options you may be touching.
- [Deployment](deployment.md) — how builds are published.
