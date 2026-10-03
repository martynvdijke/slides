## 1. Data + queries

- [ ] 1.1 Add `db.ReorderQuestions(eventID, orderedIDs []int64)` writing positions 0..n-1 in one transaction
- [ ] 1.2 Add `db.NextQueuedQuestion(eventID)` selecting the lowest-position draft, and activate it transactionally
- [ ] 1.3 Keep existing pairwise position swaps working (route them through the new reorder or leave as-is)

## 2. Server endpoints

- [ ] 2.1 `AdminReorderQuestions` — `POST /api/admin/events/{id}/questions/reorder` with `{order:[...]}`, validates ownership and known ids
- [ ] 2.2 `AdminNextQuestion` — `POST /api/admin/events/{id}/questions/next` (optional `{skip:true}`); broadcasts on activation
- [ ] 2.3 Register both routes in `server/main.go` under the admin mux

## 3. Admin console

- [ ] 3.1 Queue strip showing upcoming draft questions in order
- [ ] 3.2 Drag handles that call the reorder endpoint (kept in sync with existing up/down buttons)
- [ ] 3.3 A "Next" action that calls the next endpoint and reflects the new live question

## 4. Deck presenter panel

- [ ] 4.1 Add a Next control (and queue-length badge) to `PresenterPanel.vue`
- [ ] 4.2 Hide/disable it when unauthenticated or the queue is empty
- [ ] 4.3 Mirror to `decks/meetup/`; expose any needed helpers from `useLiveRoom.ts`

## 5. Verification

- [ ] 5.1 `cd server && go build ./... && go test ./...` (add queue ordering/next test)
- [ ] 5.2 Manual: queue 3 questions, reorder, press Next repeatedly → each activates in order and closes the previous
- [ ] 5.3 Manual: Next on an empty queue is a safe no-op
- [ ] 5.4 Confirm a rapid double Next cannot activate two questions
