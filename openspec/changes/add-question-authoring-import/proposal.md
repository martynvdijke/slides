## Why

Questions can only be created one-by-one, live, inside the admin console. Hosts running recurring talks, workshops and training sessions want to **prepare** a question set ahead of time, review it, and reuse individual questions without cloning an entire event. Bulk import plus a reusable library turns event prep from minutes of typing into a paste.

## What Changes

- **Bulk import** of questions from CSV, YAML, JSON or Markdown into an event, with a parse → validate → **dry-run preview** → commit flow.
- Field mapping for `kind`, `prompt`, `options`, `correct_index`, `points_base`, `mode`, `is_feedback`, and timing (`duration_sec`, `auto_close`, `auto_reveal`, `time_limit_s`).
- Per-row validation with a clear error report; import is transactional (all-or-nothing on commit) with an option to import only valid rows.
- A **reusable question library** (per host/org): save questions from an event, browse/search, and add selected questions to any event.
- Admin UI: an Import panel (paste or file upload + preview) and a Library panel.

## Capabilities

### New Capabilities
- `question-import`: Bulk, validated import of questions from text formats with a dry-run preview.
- `question-library`: Reusable, searchable question collection that can be added to events.

### Modified Capabilities
- (none)

## Impact

- `server/db/db.go` (bulk insert in one transaction; `question_library` table).
- `server/handlers/admin.go`, `server/main.go` (import + library routes).
- `server/static/admin.js`, `admin.html` (Import and Library panels).
- `README.md` (import format reference).
- Additive; existing single-question creation is unchanged.
