## Why

**Every authenticated user is currently a full admin.** `AdminAuth` (common.go:296) only checks that a session exists; `users.role` defaults to `'admin'` and is never enforced. That blocks co-presenting and delegation: you cannot invite someone to moderate Q&A or drive slides without also granting them user management, webhooks and data deletion. This change introduces least-privilege roles, event-scoped collaborators and OIDC group → role mapping.

## What Changes

- A role model: **owner**, **admin**, **host**, **moderator**, **viewer**, with system roles on `users` and per-event roles via a new `event_collaborators(event_id, user_id, role)` table.
- Enforce roles: `AdminAuth` becomes role-aware; endpoints are classified by the permission they require (manage users/settings vs. run an event vs. moderate Q&A vs. read-only).
- **Event collaborators**: invite a registered user (by email/username) to an event with a role; hosts see and revoke collaborators.
- **OIDC group mapping**: map IdP groups to roles (`OIDC_ADMIN_GROUPS`, `OIDC_HOST_GROUPS`) using the existing `groups` scope, alongside today's email allowlist.
- Admin console hides/disables controls the current user lacks permission for, and only routes/actions the role allows are exposed.
- Backward compatible: the first-ever user remains owner/admin; existing users default to `admin` unless downgraded.

## Capabilities

### New Capabilities
- `access-control`: Role-based authorization with system roles, per-event collaborators and OIDC group mapping.

### Modified Capabilities
- (none — unauthorized users simply gain fewer capabilities than today)

## Impact

- `server/handlers/common.go` (`AdminAuth` → role/permission checks, `currentUser`), `server/handlers/auth.go` (OIDC group mapping), `server/handlers/admin.go` (per-endpoint guards).
- `server/db/db.go` (roles, `event_collaborators`, lookups).
- `server/main.go` (guarded route groups).
- `server/static/admin.js`, `admin.html` (role-aware UI, collaborator management).
- `README.md`, `.env.example`, `compose.yaml` (OIDC group variables).
