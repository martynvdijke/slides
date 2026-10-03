## Why

Opening the deployed container at `/` currently drops visitors onto the generated Slidev deck index, which hides the two primary roles — host and participant — and forces hosts to guess the `/admin` URL. The root should route people to the right place with as little friction as possible.

## What Changes

- Serve a new embedded Host/Audience entry page at the container root (`GET /`), replacing the deck index as the root landing.
- Offer two clear paths: **Host** → `/admin` (sign in, or first-run setup), and **Participant** → `/join`, with an inline room-code input that navigates to `/join?room=CODE` for auto-submission.
- When the visitor already has a valid session, auto-continue them to `/admin` with no re-login.
- Detect first-run state (`GET /api/setup/status`) and relabel the Host path as "set up the first admin account".
- Keep the deck index reachable at `/index.html`, and keep all deck subpaths (`/meetup/`, `/opencode/`) and static assets working.
- No change to the GitHub Pages static deploy (there is no Go server there).

## Capabilities

### New Capabilities
- `host-entry`: Container root entry experience that routes visitors into the Host or Participant flow with minimal friction.

### Modified Capabilities
- (none)

## Impact

- `server/main.go` routing (new exact-root handler only).
- New embedded `server/static/entry.html`.
- No API, database, or dependency changes. GitHub Pages output is unchanged.
