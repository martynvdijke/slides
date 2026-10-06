## 1. Data & server lifecycle

- [x] 1.1 Add `questions.time_limit_s` and `events.show_podium` (schema + `ensureColumn`), update explicit SELECT/scan paths and DTOs (`activated_at`, `deadline_at`, podium flag)
- [x] 1.2 Extend question statuses with `locked` and `revealed`, include them in `GetActiveQuestion`, and add a status whitelist to `AdminUpdateQuestion`
- [x] 1.3 Compute the deadline on activation and schedule the auto-lock (`time.AfterFunc`), idempotent and replaced/stopped on activate/close
- [x] 1.4 Enforce the deadline lazily on answer submission and reconcile expired-but-live questions when building state

## 2. Reveal, podium & disclosure

- [x] 2.1 Add the reveal endpoint (`locked → revealed`, sets `show_results`) and the podium toggle endpoint; clear podium on activation; broadcast both
- [x] 2.2 Defer `is_correct` / `points_awarded` / `my_correct` in submit responses and state while live/locked (disclose at reveal, or when `show_results` is on)

## 3. Frontends

- [x] 3.1 Admin UI: time-limit field, reveal/close controls, podium toggle, countdown and new status handling
- [x] 3.2 Projector: countdown, locked/revealed rendering, podium screen
- [x] 3.3 Audience app: countdown, disabled inputs at lock, deferred correctness chip at reveal, podium view

## 4. Deck components

- [x] 4.1 PresenterPanel: time-limit input, reveal/close flow, podium toggle and countdown
- [x] 4.2 `LiveQuestion` + `useLiveRoom`: deadline/phase fields and rendering; add a podium component; mirror all changes to `decks/meetup/**`

## 5. Verification

- [x] 5.1 Go tests: deadline validation, auto-lock idempotency/recovery, reveal gating, podium clear on activation, untimed compatibility (`cd server && go build ./... && go test ./...`)
- [x] 5.2 End-to-end: timed question countdown → lock → reveal → podium; untimed regression flow
- [x] 5.3 README / API docs updated for new fields and endpoints
