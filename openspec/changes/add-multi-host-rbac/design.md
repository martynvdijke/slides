## Context

`AdminAuth` currently rejects only *unauthenticated* requests: `sessionUser(r)` returns the user and every user is treated as an admin. `users.role` exists (`TEXT NOT NULL DEFAULT 'admin'`) and OIDC provisioning (`provisionOIDCUser` in auth.go) sets it, but nothing reads it for authorization. `currentUser` (common.go:212) returns the admin injected by `AdminAuth`. OIDC scopes already request `groups`, and `oidcAdminEmails()` allowlists emails. Events are owned implicitly by whoever created them (no `owner_id`).

## Goals / Non-Goals

**Goals**
- Enforce least privilege on every admin/event endpoint.
- Let a host delegate event running and Q&A moderation without granting account/settings control.
- Reuse the existing OIDC pipeline to assign roles from IdP groups.

**Non-Goals**
- Per-question permissions or custom role building.
- External policy engines (OPA/Casbin).
- Downgrading the first-run owner flow.

## Decisions

- **Role ladder.** Ordered: `owner > admin > host > moderator > viewer`. Permission checks ask "at least role X". System role lives on `users.role`; event role on `event_collaborators`. Effective event permission = max(system role, event role).
- **`events.owner_id`** added via `ensureColumn`; the creator becomes owner. The first-ever user is system `owner`.
- **Middleware.** Replace blanket `AdminAuth` with `RequireRole(min)` for route groups:
  - account/settings (users, webhooks, settings, data deletion): `admin`
  - event CRUD, questions, teams, clone: `host`
  - Q&A moderation/content filter: `moderator`
  - stats/results/read: `viewer`
  Keep `AdminAuth` as `RequireRole(viewer)` for backward compatibility of any unclassified route, and classify every route explicitly.
- **Event scoping.** `RequireEventRole(min)` resolves the event from the route (`{id}`/`{code}`) and checks the effective per-event role; hosts can access events they own or collaborate on.
- **Collaborators.** `event_collaborators(event_id, user_id, role, created_at, UNIQUE(event_id,user_id))`. `POST/DELETE /api/admin/events/{id}/collaborators`; only `host`+ may manage them.
- **OIDC group mapping.** Read `groups` from the ID token/userinfo; `OIDC_ADMIN_GROUPS` → `admin`, `OIDC_HOST_GROUPS` → `host` (comma-separated). Email allowlist (`OIDC_ADMIN_EMAILS`) is retained as an alternative. Precedence: owner (first user) > group mapping > allowlist > default `viewer` for unknown provisioned users? Keep current behavior (unknown users rejected unless allowlisted) unless explicitly broadened; group mapping only assigns roles for allowed users.
- **UI.** `/api/auth/me` already returns `role`; admin.js gates sections on it. Collaborator management appears for `host`+.

## Risks / Trade-offs

- **Migration.** Existing non-first users are `admin` today; keep them `admin` to avoid lockout, and let the owner downgrade.
- **Route classification gaps.** A missed guard silently widens access; add a test that enumerates admin routes and asserts each has a non-`viewer` guard where expected.
- **OIDC group names vary by IdP.** Document that values are IdP-specific; fall back to the existing email allowlist.
- **Lockout.** The owner cannot remove their own owner role; at least one owner must remain.
