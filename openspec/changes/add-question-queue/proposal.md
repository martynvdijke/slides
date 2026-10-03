## Why

Preparing a talk means writing a sequence of questions, but today the host can only create questions as drafts and activate them one at a time, with awkward dead air between them while typing the next one. A queue lets the presenter line up the whole narrative in advance and advance with a single Next press, keeping the room's momentum.

## What Changes

- Draft questions form an explicit ordered queue per event, driven by `position`.
- New bulk reorder endpoint to arrange the queue.
- New `next` endpoint that activates the next draft in order (closing the current live question), so the presenter can advance without hunting for the right question.
- Optionally skip the current question and move on (`skip`), leaving it closed/archived.
- Admin console gets drag handles and a queue strip showing upcoming questions; the presenter panel gets a Next control and a queue-length indicator.
- Reuses existing `position`, `status`, and activate-close-others semantics; no schema change.

## Capabilities

### New Capabilities
- `question-queue`: Ordered draft queue with reorder and one-press advance for the presenter.

### Modified Capabilities
- (none)

## Impact

- `server/db/db.go` (bulk `ReorderQuestions`, `NextQueuedQuestion`, transactional ordering).
- `server/handlers/admin.go` (`AdminReorderQuestions`, `AdminNextQuestion`).
- `server/main.go` (routes).
- `server/static/admin.js`, `server/static/admin.html` (drag handles, queue strip).
- `templates/deck/components/PresenterPanel.vue`, `templates/deck/composables/useLiveRoom.ts` (+ `decks/meetup` mirror) — Next control and queue length.
