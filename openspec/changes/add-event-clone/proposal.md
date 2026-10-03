## Why

Hosts run recurring talks and workshops that re-use the same question set. Today they must recreate every event and re-type every question by hand, which is slow and error-prone. A clone action turns a past event into a template, and a lightweight library view lets hosts find and reuse it.

## What Changes

- New "clone event" action that duplicates an event's metadata and all of its questions (live and feedback), producing a fresh draft event with a new code.
- Cloned questions keep kind, options, prompt, media reference, scoring config (`correct_index`, `points_base`) and timing config (`duration_sec`, `auto_close`, `auto_reveal`), but reset runtime state (`status='draft'`, `activated_at=NULL`, `show_results` reset to the question's default).
- The admin events list gains a Clone control next to the existing select/delete actions.
- A clone never copies participants, answers, Q&A, votes, sessions or presentations (no audience data leaks between events).
- The cloned event's `room_code` is regenerated and its `code` is derived from the source code with a uniqueness-checked suffix.

## Capabilities

### New Capabilities
- `event-clone`: Duplicate an event and its question set as a fresh draft event for reuse.

### Modified Capabilities
- (none)

## Impact

- `server/db/db.go` (new `CloneEvent` transactional copy helper).
- `server/handlers/admin.go` (`AdminCloneEvent`).
- `server/main.go` (route `POST /api/admin/events/{id}/clone`).
- `server/static/admin.js`, `server/static/admin.html` (Clone control in the events panel).
