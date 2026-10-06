## Context

`AdminCreateQuestion` (admin.go:~428) inserts a question via `db.CreateQuestion(eventID, kind, mode, prompt, options, isFeedback, showResults, position, mediaURL, mediaType)` and then applies remaining fields (`correct_index`, `points_base`, `duration_sec`, `auto_close`, `auto_reveal`, and now `time_limit_s`) through `db.UpdateQuestion` (db.go:1162), whose `allowed` map is the canonical field list. Cloning (`db.CloneEvent`) already does a bulk `INSERT ... SELECT` of questions, proving bulk-copy patterns. The admin console renders questions in `renderQuestions` (admin.js).

## Goals / Non-Goals

**Goals**
- Turn a text document into a validated, ordered question set for an event.
- Make single questions reusable across events without cloning the whole event.
- Never create partial garbage: preview before commit, transactional commit.

**Non-Goals**
- Importing media binaries (only `media_url` references).
- Authoring questions inside Slidev markdown.
- Multi-event import in one call.

**Decisions**

- **Format normalization.** A small parser per format into a common `[]QuestionDraft`, then one validator. CSV: header row with known columns; `options` pipe-separated (`A|B|C`). YAML/JSON: array of objects mirroring the allowed field set. Markdown: a documented convention (e.g. `## prompt` followed by `- [ ] option` / `- [x] correct` lines) so questions can be drafted in a doc.
- **Draft struct + validation.** Reuse the same rules the create handler enforces (kind ∈ supported set, ≥2 options for poll, `correct_index` within range, non-negative points and durations). Validation returns per-row messages with row numbers; nothing is written until commit.
- **Dry-run + commit.** `POST /api/admin/events/{id}/questions/import?dry_run=1` returns parsed drafts, inferred positions and warnings. The same endpoint with `dry_run=0` (or a `commit` flag) inserts **all** rows in one transaction; a `partial=true` option inserts only valid rows and reports the rest.
- **Positions.** Appended after the event's current max `position`, preserving document order.
- **Library.** `question_library (id, owner_scope, kind, mode, prompt, options, correct_index, points_base, duration_sec, auto_close, auto_reveal, time_limit_s, created_at)`. "Save to library" copies an event question in; "add from library" copies a library row into an event (a copy, so edits don't propagate). `owner_scope` is a placeholder that `add-multi-host-rbac` can refine to an org.
- **Endpoints.** `POST …/questions/import`, `GET/POST /api/admin/library`, `POST /api/admin/events/{id}/questions/from-library`.

## Risks / Trade-offs

- **Format drift.** The Markdown/CSV conventions must be documented and tested; a strict validator prevents silent mis-parsing.
- **CSV quoting.** Use Go's `encoding/csv` rather than manual splitting.
- **Library growth.** Search + optional tag filtering; no hard cap initially.
- **Duplicates.** Import does not dedupe; the library UI can warn on identical prompts (optional).
