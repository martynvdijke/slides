## 1. Data layer

- [ ] 1.1 Add `events.team_mode` and `participants.team_id` via `ensureColumn`; create `teams` table (`id, event_id, name, join_code, emoji, color, created_at`) with a unique index on `(event_id, join_code)`
- [ ] 1.2 Add `db.CreateTeam/UpdateTeam/DeleteTeam/ListTeams/GetTeamByCode/SetParticipantTeam`
- [ ] 1.3 Add team leaderboard aggregation in `stats.go` (sum member points, ordered), excluding unassigned participants
- [ ] 1.4 Tests: team CRUD, assignment, delete-unassigns-members, aggregation correctness, individual-mode unaffected

## 2. Server endpoints

- [ ] 2.1 Admin: `POST/GET /api/admin/events/{id}/teams`, `PATCH/DELETE /api/admin/events/{id}/teams/{tid}`, `POST /api/admin/events/{id}/teams/assign`
- [ ] 2.2 Public: `POST /api/events/{code}/team` (select/join), reject switch-after-answer with 409
- [ ] 2.3 Include `team_mode` and `teams` standings in the live-state DTO when enabled; `BroadcastEvent` on changes
- [ ] 2.4 Handler tests: enable/disable, join by code, switch rejection, standings in state

## 3. Audience app

- [ ] 3.1 Add a team picker/join-by-code step in `audience.html` + `app.js` when `team_mode` is on
- [ ] 3.2 Show the participant's team and team rank after answering

## 4. Admin console

- [ ] 4.1 Add a team-mode toggle and team management panel (list/create/rename/delete/assign) in `admin.html` + `admin.js`

## 5. Deck / projector

- [ ] 5.1 Add `TeamLeaderboard.vue` in `templates/deck/components` and mirror to `decks/meetup/components`
- [ ] 5.2 Render team standings from `useLiveRoom.ts` when `state.team_mode` is true

## 6. Verification

- [ ] 6.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 6.2 `npm run build` succeeds; manual: run a 2-team quiz and confirm live standings
