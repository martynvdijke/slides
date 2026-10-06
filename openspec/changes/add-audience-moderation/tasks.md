## 1. Data & settings

- [x] 1.1 Add `answers.status`, `qa_questions.participant_id`, `qa_questions.flagged`, `events.qa_slow_mode_s` and `settings.filter_enabled/filter_words/filter_action` (schema + `ensureColumn`); update explicit SELECT/scan paths and DTOs
- [x] 1.2 Admin settings GET/PUT for the filter and the event slow-mode field

## 2. Filter engine

- [x] 2.1 Shared matching helper (normalize, tokenize, whole-token, list parsing) with unit tests
- [x] 2.2 Apply the filter to answer submission and Q&A creation on both WS and REST paths: flag vs reject, with submitter feedback

## 3. Answer moderation

- [x] 3.1 Exclude non-visible answers from `computeQuestionStats` and all aggregate/export paths; invalidate the cache and broadcast on moderation
- [x] 3.2 Admin list/moderate answer endpoints with event scoping; admin queue UI (flagged first, approve/hide/restore)

## 4. Slow mode

- [x] 4.1 Enforce the per-participant interval on WS and REST using stored submissions; return a retry hint
- [x] 4.2 Audience UI shows the remaining wait and blocks resubmission; admin event editor exposes the field

## 5. Verification

- [x] 5.1 Go tests: matching edge cases, flag/reject paths, aggregate exclusion, slow-mode boundaries and reconnect persistence, event scoping (`cd server && go build ./... && go test ./...`)
- [x] 5.2 End-to-end: flagged answer hidden from results then approved; slow-mode rejection with countdown feedback
- [x] 5.3 README / API docs updated for filter, moderation and slow mode
