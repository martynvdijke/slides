## 1. Schema

- [x] 1.1 Add `questions.correct_index`, `points_base`, `activated_at` via `ensureColumn`
- [x] 1.2 Add `answers.is_correct`, `points_awarded`, `elapsed_ms`, `client_uuid` (+ partial unique index)
- [x] 1.3 Add `participants.display_name`, `emoji`, `color`, `last_seen`
- [x] 1.4 Verify migrations are idempotent (init twice)

## 2. Data layer

- [x] 2.1 Compute and persist correctness/points/elapsed on answer
- [x] 2.2 Add a top-N leaderboard query (join through `questions.event_id`)
- [x] 2.3 Store and read participant identity

## 3. Server protocol

- [x] 3.1 Extend `QuestionDTO`/state with `correct_index`, `points_base`, `my_correct`, `my_points`, `leaderboard`, `me`
- [x] 3.2 Extend the `answer` result envelope with `is_correct`, `points_awarded`, `total_points`
- [x] 3.3 Handle an inbound `identity` message with sanitization
- [x] 3.4 Set `activated_at` on question activation
- [x] 3.5 Push leaderboard updates on score change

## 4. Admin API + UI

- [x] 4.1 Accept `correct_index`/`points_base` in admin question create/update
- [x] 4.2 Add admin UI controls for correct option and points
- [x] 4.3 Show a leaderboard view in the admin dashboard

## 5. Audience app

- [x] 5.1 Collect and send participant identity
- [x] 5.2 Show correctness/points after answering
- [x] 5.3 Render the live leaderboard

## 6. Deck / projector

- [x] 6.1 Add `Leaderboard.vue` and mirror to `decks/meetup`
- [x] 6.2 Add correct-answer + points controls to `PresenterPanel`
- [x] 6.3 Reveal correctness/points in `LiveQuestion`
- [x] 6.4 Extend `useLiveRoom.ts` for leaderboard/identity/quiz results

## 7. Verification

- [x] 7.1 `cd server && go build ./... && go test ./...`
- [x] 7.2 End-to-end: correct answer updates the leaderboard; wrong answer scores zero; old clients unaffected
