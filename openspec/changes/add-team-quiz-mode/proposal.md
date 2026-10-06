## Why

Quiz scoring and a top-10 leaderboard already exist for individuals, but offsites, conference trivia and classrooms run as **tables/teams**. Today every participant competes alone, so the format cannot express "Table 4 is winning". Team mode is the natural competitive layer on top of the existing quiz game loop.

## What Changes

- Add an optional **team mode** toggle per event (`events.team_mode`), off by default so existing events stay individual.
- New event-scoped `teams` table (name, join code, emoji, color).
- Participants can pick or join a team after entering a room; the chosen team is attached to their identity.
- Server-side scoring aggregates member points **by team**; a live team leaderboard is pushed over the existing event WebSocket.
- Admin can create, rename, seed and delete teams, and optionally auto-distribute participants round-robin.
- Projector `<TeamLeaderboard />` component (or a team view on the existing `Leaderboard`), plus team display in the audience app.

## Capabilities

### New Capabilities
- `team-quiz`: Event-scoped teams, member assignment, aggregate team scoring and a live team leaderboard.

### Modified Capabilities
- (none — individual mode remains the default and is unchanged)

## Impact

- `server/db/db.go` (teams table, `participants.team_id`, aggregation query).
- `server/db/stats.go` (team leaderboard).
- `server/handlers/common.go`, `admin.go`, `ws.go`, `public.go` (DTOs, team CRUD, assignment, state).
- `server/static/admin.js`, `admin.html`, `app.js`, `audience.html`.
- `templates/deck/**` and `decks/meetup/**` (`TeamLeaderboard.vue`, `useLiveRoom.ts`).
- Additive schema only; no breaking API changes.
