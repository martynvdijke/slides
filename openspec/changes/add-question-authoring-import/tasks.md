## 1. Parsers & validation

- [ ] 1.1 Add a `QuestionDraft` struct and validator reusing the create-handler rules (kind, options, correct_index, non-negative points/durations)
- [ ] 1.2 CSV parser (`encoding/csv`, pipe-separated options) with header mapping
- [ ] 1.3 YAML/JSON parser (array of field objects)
- [ ] 1.4 Markdown parser for the documented question convention
- [ ] 1.5 Tests: each format → drafts; invalid rows produce numbered errors

## 2. Data layer

- [ ] 2.1 Add `db.InsertQuestions(eventID, drafts, startPosition)` bulk transactional insert
- [ ] 2.2 Add `question_library` table plus `SaveToLibrary/ListLibrary/SearchLibrary/AddLibraryToEvent`
- [ ] 2.3 Tests: transactional rollback on error, position ordering, library copy independence

## 3. Endpoints

- [ ] 3.1 `POST /api/admin/events/{id}/questions/import` with `dry_run` and `partial` options
- [ ] 3.2 `GET/POST /api/admin/library`, `POST /api/admin/events/{id}/questions/from-library`
- [ ] 3.3 Register routes in `server/main.go`; handler tests for dry-run, commit, partial, library flows

## 4. Admin UI

- [ ] 4.1 Import panel: textarea/file input, format selector, preview table with warnings, commit button (`admin.html`/`admin.js`)
- [ ] 4.2 Library panel: list/search, save current question, add selected to event

## 5. Docs & verification

- [ ] 5.1 README: import format reference (CSV/YAML/JSON/Markdown) with examples
- [ ] 5.2 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 5.3 Manual: import a 10-question Markdown set (dry-run then commit) and add a library question to another event
