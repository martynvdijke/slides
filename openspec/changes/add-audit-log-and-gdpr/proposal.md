## Why

Two compliance gaps exist for organisational use. First, **administrative actions are unaudited** — there is no record of who changed settings, deleted an event or managed users. Second, **participant data cannot be exported or erased** on request; `participants`, `answers`, `qa_questions`/`qa_votes` and profiles persist indefinitely with no retention control. Both are routine requirements for public-sector and enterprise deployments under GDPR.

## What Changes

- An **audit log** recording administrative mutations: actor (user), action, target type/id, metadata, IP and timestamp.
- An **Audit view** in the admin console with filters (actor, action, date) and CSV export.
- A configurable **retention** setting; a cleanup routine can erase event/participant data older than the retention window.
- **GDPR tooling:** per-participant data **export** (JSON) and **erase** endpoints, event-level erase, and self-service deletion (aligned with `add-persistent-participant-identity`).
- Documentation of what is stored, lawful basis notes and retention behavior in `README.md`.
- Audit entries are append-only and never expose secrets.

## Capabilities

### New Capabilities
- `audit-log`: Append-only record of administrative actions with a filterable, exportable view.
- `data-privacy`: Participant/event data export, erasure and configurable retention.

### Modified Capabilities
- (none)

## Impact

- `server/db/db.go` (`audit_log` table, retention/erasure helpers).
- `server/handlers/*.go` + middleware (record mutations; export/erase endpoints).
- `server/main.go` (Audit view route, privacy endpoints under admin).
- `server/static/admin.js`, `admin.html` (Audit view, erasure controls).
- `README.md` (data handling, retention, erasure).
- Additive schema; no breaking changes.
