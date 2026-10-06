## 1. Data layer

- [ ] 1.1 Add `events.owner_id` via `ensureColumn`; set the creator as owner
- [ ] 1.2 Add `event_collaborators` table with unique `(event_id, user_id)`; add `GetEventRole/ListCollaborators/AddCollaborator/RemoveCollaborator`
- [ ] 1.3 Define the role ladder and helpers (`roleAtLeast`, `effectiveEventRole`)
- [ ] 1.4 Tests: role ordering, effective permission, owner-protection rule

## 2. Authorization

- [ ] 2.1 Add `RequireRole(min)` and `RequireEventRole(min)` middleware; keep `AdminAuth` as `RequireRole(viewer)`
- [ ] 2.2 Classify every admin/event route under `server/main.go` by minimum role
- [ ] 2.3 OIDC: parse `groups`, map `OIDC_ADMIN_GROUPS`/`OIDC_HOST_GROUPS` in `provisionOIDCUser`; document precedence with the email allowlist
- [ ] 2.4 Tests: 403 for insufficient role, event-scoped access, group mapping, allowlist fallback, route-guard coverage test

## 3. Endpoints & UI

- [ ] 3.1 `POST/DELETE /api/admin/events/{id}/collaborators` (host+)
- [ ] 3.2 `admin.js`/`admin.html`: hide/disable sections by role; add collaborator management panel
- [ ] 3.3 `/api/auth/me` role drives UI gating (already returns role)

## 4. Docs & verification

- [ ] 4.1 README + `.env.example` + `compose.yaml`: roles, collaborator workflow, OIDC group variables
- [ ] 4.2 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 4.3 Manual: invite a moderator (can moderate, cannot manage), verify a viewer is read-only
