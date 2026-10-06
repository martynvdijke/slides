## 1. Data layer

- [ ] 1.1 Add `participant_profiles` table and `profile_events(profile_id, event_id)` join via `CREATE TABLE IF NOT EXISTS`
- [ ] 1.2 Add `db.GetProfileByToken/CreateProfile/UpdateProfile/DeleteProfile/RecordProfileEvent`
- [ ] 1.3 Tests: create/update/delete, events_count increments once per distinct event, delete cascades join rows

## 2. Server endpoints & cookie

- [ ] 2.1 Add `profileCookie` helpers in `common.go` (set/clear/read), `HttpOnly`, SameSite, long TTL
- [ ] 2.2 `GET/PUT/DELETE /api/profile` (token-scoped, public)
- [ ] 2.3 On join, copy profile display fields onto the per-event `participants` row when a profile exists
- [ ] 2.4 Register routes in `server/main.go`; handler tests for prefill, update, delete-clears-cookie

## 3. Audience surfaces

- [ ] 3.1 `join.js`/`entry.html`: prefill name from profile; offer "remember me" opt-in
- [ ] 3.2 `audience.html`/`app.js`: profile edit + view/export/delete controls; show events-attended badge

## 4. Privacy

- [ ] 4.1 README privacy note: what is stored, opt-in, self-service deletion
- [ ] 4.2 Ensure no profile cookie is created without explicit save

## 5. Verification

- [ ] 5.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 5.2 Manual: join anonymously (unchanged), create profile, rejoin another event (prefilled), delete profile
