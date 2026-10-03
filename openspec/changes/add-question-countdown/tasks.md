## 1. Data model

- [ ] 1.1 Migrate `questions`: add `duration_sec INTEGER NOT NULL DEFAULT 0`, `auto_close INTEGER NOT NULL DEFAULT 1`, `auto_reveal INTEGER NOT NULL DEFAULT 0`
- [ ] 1.2 Extend the `Question` struct and all question scans/selects to include the new columns
- [ ] 1.3 Add `db.ListDueQuestions(nowMs)` returning live timed questions whose `activated_at + duration_sec*1000 <= now`
- [ ] 1.4 Make `ActivateQuestion` accept an optional duration override and reset `show_results` appropriately when (re)activating

## 2. DTO + state

- [ ] 2.1 Add `duration_sec`, `auto_reveal`, `expires_at`, `remaining_sec` to `QuestionDTO`
- [ ] 2.2 Populate them in `questionDTO`/`BuildState`; compute `remaining_sec` server-side and clamp at 0

## 3. Server behaviour

- [ ] 3.1 Add a tick-based reaper that closes due questions and broadcasts a refresh
- [ ] 3.2 On expiry: close the question; if `auto_reveal`, set `show_results=1`; then broadcast once
- [ ] 3.3 Start the reaper in the server bootstrap and stop it cleanly on shutdown
- [ ] 3.4 `AdminCreateQuestion`/`AdminUpdateQuestion` validate and persist `duration_sec` (0 or 5–180), `auto_close`, `auto_reveal`
- [ ] 3.5 `AdminActivateQuestion` accepts an optional `{duration_sec}` override

## 4. Frontend — audience app

- [ ] 4.1 Render a countdown (ring or numeric) when the active question has `remaining_sec`
- [ ] 4.2 Tick locally each second and resync on every `state` frame
- [ ] 4.3 Disable/blur the answer controls when the question has expired while awaiting the refresh

## 5. Frontend — projector + deck

- [ ] 5.1 `live.js`: countdown ring beside the prompt, hiding when untimed
- [ ] 5.2 `LiveQuestion.vue`: countdown display; resync on state
- [ ] 5.3 `useLiveRoom.ts`: expose `remainingSec` reactively
- [ ] 5.4 `PresenterPanel.vue` + `admin.html`/`admin.js`: duration selector on create/edit, timer chip on the question card
- [ ] 5.5 Mirror all edited deck files into `decks/meetup/`

## 6. Verification

- [ ] 6.1 `cd server && go build ./... && go test ./...` (add a reaper/scoring test)
- [ ] 6.2 Manual: set 10s question, activate, confirm ring on phone+projector, auto-close at 0, auto-reveal when enabled
- [ ] 6.3 Confirm an untimed question behaves exactly as before (no countdown, no auto-close)
- [ ] 6.4 Restart server mid-countdown and confirm the question still expires on schedule
