# Configuration

Slides is configured from three layers, in order of precedence:

1. **Environment variables** (highest — always win).
2. **Admin settings** stored in the SQLite database (`/admin` → Settings).
3. **Built-in defaults** (lowest).

The rule "environment overrides the admin panel" applies to OTel, email and
webhooks. OTel settings saved in the admin panel only take effect **after a
server restart**; environment variables apply immediately.

## Core

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `6270` | HTTP listen port |
| `DB_PATH` | `./slides.db` | SQLite database file |
| `MEDIA_DIR` | `./media` | Uploaded question media |
| `DECKS_DIR` | `./dist` | Built decks served at `/` (falls back to the embedded app) |
| `PUBLIC_BASE_URL` | `http://localhost:6270` | Absolute base used in QR codes and reset links |
| `JOIN_TTL` | `4h` | Join-session lifetime (any Go duration, e.g. `90m`, `8h`) |
| `SEED_FEATURE_TEST` | off | Truthy seeds the deterministic `feature-test` event on startup |
| `SEED_DECK_QUESTIONS` | off | Truthy imports each deck's `questions.json` into its event on startup |

```bash
PORT=8080 DB_PATH=/data/slides.db MEDIA_DIR=/data/media \
  DECKS_DIR=/app/dist PUBLIC_BASE_URL=https://slides.example.com ./slides
```

!!! warning "`PUBLIC_BASE_URL` matters"
    QR codes and password-reset links are built from this value. If it does not
    match the URL people actually visit, the QR will point at the wrong host.

!!! note "`JOIN_TTL` is read directly by the server"
    The bundled `compose.yaml` does not forward it, so set it in the container
    environment (or your own compose override) when you need a shorter or longer
    join window than four hours.

## Security, CORS and cookies

| Variable | Default | Purpose |
| --- | --- | --- |
| `CORS_ORIGINS` | — | Comma-separated origins allowed credentialed cross-origin admin calls (e.g. your GitHub Pages origin). `*` reflects any origin read-only |
| `COOKIE_SAMESITE` | `lax` | Session cookie `SameSite`: `lax`, `strict` or `none` |
| `COOKIE_SECURE` | `false` | Force `Secure` cookies (implied by `COOKIE_SAMESITE=none`) |

By default any origin may **read** the public API without credentials (so GitHub
Pages decks can fetch state and open the WebSocket). Origins listed in
`CORS_ORIGINS` additionally get `Access-Control-Allow-Credentials`, which the
in-slide presenter panel needs for cross-origin admin calls.

=== "All-in-one container"

    Same-origin; no CORS configuration needed. Keep `COOKIE_SAMESITE=lax`.

=== "Deck on GitHub Pages"

    The deck is cross-origin, so allowlist its origin and switch the cookie for
    cross-site use over HTTPS:

    ```bash
    CORS_ORIGINS=https://yourname.github.io
    COOKIE_SAMESITE=none
    COOKIE_SECURE=true
    ```

!!! warning "Credentials and `*` don't mix"
    `CORS_ORIGINS=*` reflects any origin but **without** credentials, so the
    cross-origin presenter panel will not be able to sign in. List exact origins
    when you need credentialed admin calls.

## OIDC login

Admins can sign in through any OIDC provider that publishes discovery
(`/.well-known/openid-configuration`) — Authelia, Keycloak, Authentik, Okta,
Entra ID and friends — either alongside local accounts or instead of them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OIDC_ENABLED` | `false` | Enable OIDC login |
| `OIDC_ISSUER_URL` | — | OIDC issuer |
| `OIDC_CLIENT_ID` | — | OIDC client id |
| `OIDC_CLIENT_SECRET` | — | OIDC client secret |
| `OIDC_REDIRECT_URL` | `http://localhost:6270/api/auth/oidc/callback` | Callback URL |
| `OIDC_SCOPES` | `openid email profile groups` | Requested scopes |
| `OIDC_ADMIN_EMAILS` | — | Emails granted admin (comma-separated, case-insensitive) |

Setup:

1. Register a **confidential** client with the provider and set its redirect URI
   to `<PUBLIC_BASE_URL>/api/auth/oidc/callback`.
2. Set the variables and restart the server:

   ```bash
   OIDC_ENABLED=true
   OIDC_ISSUER_URL=https://auth.example.com
   OIDC_CLIENT_ID=slides
   OIDC_CLIENT_SECRET=change-me
   OIDC_REDIRECT_URL=https://slides.example.com/api/auth/oidc/callback
   OIDC_SCOPES="openid email profile groups"
   OIDC_ADMIN_EMAILS=you@example.com,teammate@example.com   # optional
   ```

OIDC is only active when `OIDC_ENABLED` is true **and** the issuer, client id and
client secret are all set.

### Who gets an account

- **First user ever** — while the `users` table is empty, the first OIDC sign-in
  is provisioned as `admin`, so you can bootstrap the server entirely through
  SSO.
- **Known users** — emails that already exist in `users` are signed in and keep
  their role.
- **Allowlisted emails** — unknown identities whose email is in
  `OIDC_ADMIN_EMAILS` are provisioned as admin.
- **Everyone else** — rejected and redirected to
  `/admin?oidc_error=unknown_user`; no account is created.

The identity is taken from the `email` claim, falling back to
`preferred_username` and then `sub`. The callback verifies the ID token and the
anti-forgery `state` cookie, and issues the same session cookie as a local login
(cleared by `GET /api/auth/oidc/logout`). Once signed in on the all-in-one
container, the in-slide presenter panel reuses that session automatically.

## Email / SMTP

Used for password-reset emails and recap sends. `SMTP_*` environment variables
override the admin **Email (SMTP)** settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | — | SMTP host (empty disables email) |
| `SMTP_PORT` | `587` (`465` for `SMTP_TLS=ssl`) | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM` | — | From address |
| `SMTP_TLS` | `starttls` | `starttls`, `ssl` or `none` |

## Webhooks

Outbound notifications for event activity. `WEBHOOK_*` environment variables
override the admin **Webhooks** settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEBHOOK_URL` | — | Destination URL |
| `WEBHOOK_SECRET` | — | HMAC-SHA256 signing secret |
| `WEBHOOK_ENABLED` | `false` | Master switch |
| `WEBHOOK_EVENTS` | — (all) | Comma-separated allowlist of event types |
| `WEBHOOK_ALLOW_PRIVATE` | `0` | Set to `1` to allow private/loopback hosts |

Allowed event types: `qa.created`, `question.activated`, `question.closed`,
`event.closed`.

Each delivery posts a JSON envelope with `X-Webhook-Event` and, when a secret is
set, an `X-Signature: sha256=…` HMAC header. See [Operations](operations.md) for
the payload shape and the SSRF guard.

## OpenTelemetry

Opt-in tracing, metrics and logs via OTLP. An empty endpoint disables it.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP endpoint (gRPC `4317` / HTTP `4318`) |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | — | Traces-specific endpoint |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | — | Metrics-specific endpoint |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | — | Logs-specific endpoint |
| `OTEL_SERVICE_NAME` | `meetup` (Compose sets `slides`) | Service name |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | Exporter headers (e.g. auth) |

The generic `OTEL_EXPORTER_OTLP_ENDPOINT` falls back for any signal without a
signal-specific endpoint. Environment values take precedence over admin
settings, and saved admin settings require a restart.

## Build-time variables (decks)

These are read by Vite when building a deck, not by the Go server.

| Variable | Purpose |
| --- | --- |
| `VITE_ROOM_CODE` | Short room code baked into the deck |
| `VITE_EVENT_CODE` | Stable event code baked into the deck |
| `VITE_LIVE_BASE_URL` | Hosted backend base for cross-origin decks |
| `VITE_STATIC_EXPORT` | `1` marks a presentation-only build (hides live UI) |
| `VITE_UMAMI_SCRIPT_URL` | Umami script URL injected into the deck |
| `VITE_UMAMI_WEBSITE_ID` | Umami website id injected into the deck |
| `BASE_PATH` | Sub-path for a project-site build (e.g. `/slides/`) |

See [Decks](decks.md) for the resolution order.

## Deck seeding

`npm run build` writes a `questions.json` manifest next to each built deck
(`dist/<deck>/questions.json`) with the questions extracted from that deck's
markdown comment blocks. When `SEED_DECK_QUESTIONS` is truthy the server imports
every manifest on startup into the event whose `code` equals the manifest's
`event_code` (falling back to the deck directory name), creating the event if
needed. Imports are idempotent by question `id`, so re-running updates questions
in place instead of duplicating them — markdown stays the source of truth. See
[Authoring questions in markdown](decks.md#authoring-questions-in-markdown).

`SEED_FEATURE_TEST` separately creates a deterministic event with `code`
`feature-test` so the bundled feature-test deck auto-connects. The published
image sets both `SEED_DECK_QUESTIONS=1` and `SEED_FEATURE_TEST=1`.

### Dev-time deck sync

These are only read by `scripts/sync-deck.mjs` (and the optional Vite plugin) to
push a deck's interactive slides to a running backend. They are never needed for
a normal build.

| Variable | Purpose |
| --- | --- |
| `DECK_SYNC_BASE_URL` | Backend origin (falls back to `VITE_LIVE_BASE_URL`) |
| `DECK_SYNC_EVENT_ID` | Numeric event id (falls back to `VITE_EVENT_ID` / `EVENT_ID`) |
| `DECK_SYNC_TOKEN` | Admin bearer token or session cookie (falls back to `ADMIN_TOKEN`) |
| `DECK_SLUG` | Deck identifier for the `external_id` key |
| `SLIDES_PATH` | Path to `slides.md` (default `./slides.md`) |

## Docker Compose variables

Read from `.env` (copy `.env.example`). See [Deployment](deployment.md).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | `http://localhost:6270` | QR base |
| `UMAMI_DB_PASSWORD` | `umami` | Postgres password for the analytics profile |
| `UMAMI_APP_SECRET` | `change-me` | Umami app secret |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Point at `http://otel-collector:4318` |
| `OTEL_SERVICE_NAME` | `slides` | Service name reported to OTel |
| `SEED_FEATURE_TEST` | `1` | Seed the deterministic `feature-test` event |
| `SEED_DECK_QUESTIONS` | `1` | Import each deck's `questions.json` on startup |

Plus all the OIDC variables above, forwarded to the `slides` service. `JOIN_TTL`
is not forwarded — set it in your own compose override if you need it.

## GitHub repository variables

Set under **Settings → Secrets and variables → Actions → Variables** for the
GitHub Pages workflow.

| Variable | Purpose |
| --- | --- |
| `LIVE_BASE_URL` | Public backend for live questions, e.g. `https://meetup.example.com` |
| `UMAMI_SCRIPT_URL` | Umami script URL for the landing page and decks (optional) |
| `UMAMI_WEBSITE_ID` | Umami website id (optional) |

Leave `LIVE_BASE_URL` empty for a fully static, presentation-only deploy.

## Admin panel settings

Everything below is stored in the `settings` row (single-row table) and editable
at `/admin` → Settings.

=== "Event settings"

    Per selected event: `name`, `description`, `event_date`, `status`
    (`open`/`closed`), `feedback_open`, `qa_slow_mode_s`, `results_published`,
    and the per-event feature flags `feature_live`, `feature_qa`,
    `feature_slides`, `feature_feedback` and `feature_leaderboard` (all default
    on). The flags are usually seeded from a deck's `features` frontmatter but
    can be patched through the API. **Show podium** is toggled with
    `POST /api/admin/events/{id}/podium`, and the host can drive the deck's
    slides with the admin deck controls (see [Operations](operations.md)).

=== "Branding"

    `brand` — a short brand text shown in the UI.

=== "Analytics (Umami)"

    `umami_script_url`, `umami_website_id`, `tracking_enabled`.

=== "Email (SMTP)"

    `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from`,
    `smtp_tls`. A **Send test email** button verifies delivery.

=== "Webhooks"

    `webhook_url`, `webhook_secret`, `webhook_enabled`, `webhook_events`, with a
    **Send test** button that shows the response.

=== "Content filter"

    `filter_enabled`, `filter_words`, `filter_action` — see
    [Moderation & safety](moderation.md).

=== "Recap"

    `recap_emails` (host recipients) plus preview and send controls — see
    [Recap & results](recap.md).

=== "OpenTelemetry"

    `otel_endpoint`, `otel_service_name`, `otel_headers`. Shows current status
    and a **Restart required** badge when the saved value differs from the
    running process.

## Storage model

SQLite runs in **WAL mode** with a busy timeout:

```text
dsn = <DB_PATH>?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)
      &_pragma=synchronous(NORMAL)&_pragma=foreign_keys(1)
```

- 8 max open/idle connections: WAL gives concurrent readers + one writer.
- Answers go through a **single serialized writer** that batches writes in one
  transaction, so bursts of concurrent answers don't fight over the write lock.
- Question results are **cached in-process for a few seconds**.
- No external memcached/Redis is required.

Schema highlights: `users`, `sessions`, `events`, `questions`, `participants`,
`answers`, `qa_questions`, `qa_votes`, `presentations`, `join_sessions`,
`recap_subscriptions`, `password_reset_tokens`, and the single-row `settings`
table. Question rows record their origin: `seed_key` for questions imported from
a deck's markdown comment blocks, and `external_id` / `deck_slug` / `slide_id` /
`auto_activate` for questions synced from interactive slides. Migrations are
idempotent additive column adds, applied on every startup.

## Next steps

- [Deployment](deployment.md) — Compose profiles and GitHub Pages.
- [Operations](operations.md) — health, OTel and webhooks in production.
- [Architecture](architecture.md) — how the parts fit together.
