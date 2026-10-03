## Context

`questions` already has `position` (used for sort) and `status` (`draft`, `live`, `closed`). `db.ActivateQuestion` sets one question live and closes any other live question, then `BroadcastEvent` pushes new state. `AdminListQuestions` returns all questions ordered by position, and `admin.js:renderQuestions` already renders per-question move up/down controls that swap positions. So the pieces for a queue exist; what's missing is explicit queue semantics and a one-press advance.

## Goals / Non-Goals

**Goals:**
- Treat the ordered list of `draft` questions as the presenter's queue.
- Let the host reorder the queue reliably (bulk, transactional).
- Let the presenter advance to the next draft with a single action from either the admin console or the in-deck presenter panel.

**Non-Goals:**
- Auto-advance on a timer (that is the countdown feature; they compose but are independent).
- Cross-event question libraries or cloning (separate feature).
- Branching/conditional queues.

## Decisions

- **No schema change.** Reuse `position` as the queue order and `status='draft'` as "queued". `position` is already integer-sortable and returned by `ListQuestions`.
- **Bulk reorder endpoint.** `POST /api/admin/events/{id}/questions/reorder` with `{order: [qid, qid, ...]}` rewrites `position` to the array index inside a single transaction. This avoids N round-trips and position collisions from the existing pairwise up/down swaps. Keep the existing up/down controls working (they can call reorder with the swapped slice).
- **Next endpoint.** `POST /api/admin/events/{id}/questions/next` selects the lowest-`position` `draft` question and calls `ActivateQuestion` (which closes the current live one). Returns the activated question or a "queue empty" signal. Implement selection + activation transactionally so two rapid Next presses cannot activate two questions.
- **Skip.** `POST .../next` accepts `{skip: true}` to archive/close the current live question without activating the next one (leave the presenter in control of the pause).
- **Presenter panel.** `PresenterPanel.vue` already talks to the admin API when authenticated; add a Next button and a queue-length badge fed from the questions list. Requires the panel to fetch/list questions (it already creates and activates, so the API access exists).
- **Broadcast.** Activation already broadcasts; the queue strip in `admin.js` refreshes on the same `BroadcastEvent`/stats WS it already listens to.

## Risks / Trade-offs

- **Concurrent edits.** Bulk reorder in one transaction prevents partial orderings; use the existing serialized-writer pattern in `db`.
- **Position drift.** Questions created later get `position = len+1`; reorder normalizes to 0..n-1, which is idempotent.
- **Presenter panel auth.** Cross-origin decks rely on the existing CORS/credentials path; the Next button should degrade gracefully (hide) when not authenticated, exactly like the rest of the panel.
