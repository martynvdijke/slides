## 1. Data layer

- [x] 1.1 Add `db.CloneEvent(sourceID int64, newCode, newName string) (int64, error)` performing the event insert and the `INSERT ... SELECT` question copy in one transaction
- [x] 1.2 Force cloned questions to `status='draft'`, `activated_at=NULL`, `show_results=0`; carry kind/mode/prompt/options/position/is_feedback/media_url/media_type/correct_index/points_base/duration_sec/auto_close/auto_reveal
- [x] 1.3 Generate a unique clone code (`<source>-copy`, `-copy2`, ... with fallback to random) and a fresh room code
- [x] 1.4 Add a test in `server/db` cloning an event with live + feedback questions and asserting counts, reset status, and absence of participants/answers/QA

## 2. Server endpoint

- [x] 2.1 Add `AdminCloneEvent` — `POST /api/admin/events/{id}/clone` (optional `{name}`), returns the new `EventDTO`
- [x] 2.2 Register the route in `server/main.go` under the admin mux
- [x] 2.3 Add a handler test asserting 200 + new event + copied questions, and 404 for an unknown source id

## 3. Admin console

- [x] 3.1 Add a Clone control to each event card in `renderEvents` (admin.js)
- [x] 3.2 On success, reload events and select the clone
- [x] 3.3 Add any needed markup in `admin.html`

## 4. Verification

- [x] 4.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [x] 4.2 Manual: clone an event with questions, confirm the copy is independent and its questions are drafts
