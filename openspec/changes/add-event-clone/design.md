## Context

`db.CreateEvent(name, code, description, eventDate)` (db.go:665) inserts only four columns; `events` also carries `room_code`, `status`, `feedback_open`. `db.CreateQuestion` (db.go:944) takes ten arguments and the remaining question fields (`correct_index`, `points_base`, `duration_sec`, `auto_close`, `auto_reveal`) are currently applied by a follow-up `UpdateQuestion` call in `AdminCreateQuestion` (admin.go:428). `db.UpdateQuestion` (db.go:1011) already accepts all sixteen question fields. `AdminCreateEvent` (admin.go:123) generates a code and room code and returns an `EventDTO`. The admin events list renders cards with select and delete actions in `renderEvents` (admin.js:168).

## Goals / Non-Goals

**Goals:**
- Duplicate an event's metadata and its entire question set in one transaction.
- Produce a safe, independent draft event: new unique `code` and `room_code`, runtime state reset.
- Expose a single `POST /api/admin/events/{id}/clone` endpoint and a UI action.

**Non-Goals:**
- Cross-event question library/browsing UI beyond the clone action.
- Copying audience data (participants, answers, Q&A, votes, presentations, sessions).
- Cloning uploads/media files (media references are copied; orphaned media is out of scope).

## Decisions

- **Transactional copy in the db layer.** `db.CloneEvent(sourceID int64, newCode, newName string) (int64, error)`:
  1. Load source event (`name`, `description`, `event_date`, `status` reset to `open`, `feedback_open` carried over).
  2. Insert the new event with a freshly generated `code` and `room_code`.
  3. `INSERT INTO questions (...) SELECT ... FROM questions WHERE event_id=?` copying `kind, mode, prompt, options, position, is_feedback, media_url, media_type, correct_index, points_base, duration_sec, auto_close, auto_reveal` and forcing `status='draft'`, `activated_at=NULL`, `show_results=0`.
  All steps in one transaction using the existing serialized-writer pattern.
- **Code derivation.** Base the clone code on the source (`<source>-copy`, then `-copy2`, ...) and verify uniqueness against `events.code`; generate a fresh `room_code` via the existing `genRoomCode`/`SetEventRoomCode` path.
- **Status reset.** Cloned event is `open`; cloned questions are `draft`. `feedback_open` is carried so a feedback-form event stays a feedback event.
- **Endpoint.** `POST /api/admin/events/{id}/clone` returns the new `EventDTO`. Body optional `{name}` to override the cloned name; defaults to `<source name> (copy)`.
- **UI.** Add a Clone button in `renderEvents` beside the existing select/delete controls; on success, `loadEvents()` and select the new event.

## Risks / Trade-offs

- **Duplicate timestamps.** Preserve `created_at` on copied questions for ordering stability; they are new rows so ids differ.
- **Code collisions.** Uniqueness check in a loop; if the space of suffixes is exhausted, fall back to a random code.
- **Media sharing.** Copied `media_url` references the same file; deleting one event's presentation must not delete shared media (existing orphan-GC concern, unchanged here).
- **No PII.** Explicitly exclude participants/answers/QA/votes to avoid leaking one audience's data into another event.
