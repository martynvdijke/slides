## ADDED Requirements

### Requirement: Root entry page
The server SHALL serve a dedicated entry page at the exact path `/` instead of the generated deck index.

#### Scenario: Root visit
- **WHEN** a visitor requests `GET /`
- **THEN** the server responds with the embedded entry page

#### Scenario: Deck subpaths unaffected
- **WHEN** a visitor requests `GET /meetup/` or `GET /opencode/`
- **THEN** the request is still served by the existing deck file server

#### Scenario: Deck index still reachable
- **WHEN** a visitor requests `GET /index.html`
- **THEN** the generated deck index is served

### Requirement: Host and Participant choices
The entry page SHALL present a Host path to `/admin` and a Participant path to `/join`.

#### Scenario: Host path
- **WHEN** a visitor activates the Host option
- **THEN** the browser navigates to `/admin`

#### Scenario: Participant path
- **WHEN** a visitor activates the Participant option
- **THEN** the browser navigates to `/join`

#### Scenario: Participant room code
- **WHEN** a visitor enters a room code in the entry input and submits
- **THEN** the browser navigates to `/join?room=CODE` so the existing join flow auto-submits

### Requirement: Signed-in auto-continue
The entry page SHALL detect an existing authenticated session and continue the user to the admin dashboard without re-authentication.

#### Scenario: Existing session
- **WHEN** the entry page loads and `GET /api/auth/me` returns a user
- **THEN** the page shows a continue affordance and redirects to `/admin`

#### Scenario: Auth check failure
- **WHEN** the session check fails or reports unauthenticated
- **THEN** the entry page still renders the Host and Participant choices

### Requirement: First-run setup awareness
The entry page SHALL reflect first-run state so the Host path is presented as initial setup when no admin account exists.

#### Scenario: No accounts yet
- **WHEN** `GET /api/setup/status` reports `needs_setup` as true
- **THEN** the Host path copy and call to action indicate first admin setup
