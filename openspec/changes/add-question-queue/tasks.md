## 1. Data + queries

- [x] 1.1 Add `db.ReorderQuestions(eventID, orderedIDs []int64)` writing positions 0..n-1 in one transaction
- [x] 1.2 Add `db.NextQueuedQuestion(eventID)` selecting the lowest-position draft, and activate it transactionally
- [x] 1.3 Keep existing pairwise position swaps working (route them through the new reorder or leave as-is)

## 2. Server endpoints

- [x] 2.1 `AdminReorderQuestions` — `POST /api/admin/events/{id}/questions/reorder` with `{order:[...]}`, validates ownership and known ids
- [x] 2.2 `AdminNextQuestion` — `POST /api/admin/events/{id}/questions/next` (optional `{skip:true}`); broadcasts on activation
- [x] 2.3 Register both routes in `server/main.go` under the admin mux

## 3. Admin console

- [x] 3.1 Queue strip showing upcoming draft questions in order
- [x] 3.2 Drag handles that call the reorder endpoint (kept in sync with existing up/down buttons)
- [x] 3.3 A "Next" action that calls the next endpoint and reflects the new live question

## 4. Deck presenter panel

- [x] 4.1 Add a Next control (and queue-length badge) to `PresenterPanel.vue`
- [x] 4.2 Hide/disable it when unauthenticated or the queue is empty
- [x] 4.3 Mirror to `decks/meetup/`; expose any needed helpers from `useLiveRoom.ts`

## 5. Verification

- [x] 5.1 `cd server && go build ./... && go test ./...` (add queue ordering/next test)
- [x] 5.2 Manual: queue 3 questions, reorder, press Next repeatedly → each activates in order and closes the previous
- [x] 5.3 Manual: Next on an empty queue is a safe no-op
- [x] 5.4 Confirm a rapid double Next cannot activate two questions
