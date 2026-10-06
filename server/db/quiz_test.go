package db

import (
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// quizFixtures creates an event with one untimed draft poll question.
func quizFixtures(t *testing.T) (*Event, *Question) {
	t.Helper()
	tmpDB(t)
	ev, err := CreateEvent("Quiz Game Loop", "quiz-1", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	q, err := CreateQuestion(ev.ID, "poll", "live", "Pick", []string{"A", "B"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	return ev, q
}

// setPhase writes lifecycle fields directly so tests control the clock.
func setPhase(t *testing.T, questionID int64, status string, limitS int, activatedAt *int64) {
	t.Helper()
	fields := map[string]any{"status": status, "time_limit_s": limitS}
	if activatedAt != nil {
		fields["activated_at"] = *activatedAt
	} else {
		fields["activated_at"] = nil
	}
	if _, err := UpdateQuestion(questionID, fields); err != nil {
		t.Fatalf("set phase %s: %v", status, err)
	}
}

func TestTimeLimitAndPodiumRoundTrip(t *testing.T) {
	ev, q := quizFixtures(t)

	if q.TimeLimitS != 0 {
		t.Fatalf("new question time_limit_s = %d, want 0 (untimed)", q.TimeLimitS)
	}
	if ev.ShowPodium {
		t.Fatalf("new event show_podium = true, want false")
	}

	updated, err := UpdateQuestion(q.ID, map[string]any{"time_limit_s": 25})
	if err != nil {
		t.Fatalf("UpdateQuestion time_limit_s: %v", err)
	}
	if updated.TimeLimitS != 25 {
		t.Fatalf("updated time_limit_s = %d, want 25", updated.TimeLimitS)
	}
	got, err := GetQuestion(q.ID)
	if err != nil {
		t.Fatalf("GetQuestion: %v", err)
	}
	if got.TimeLimitS != 25 {
		t.Fatalf("persisted time_limit_s = %d, want 25", got.TimeLimitS)
	}

	updEv, err := UpdateEvent(ev.ID, map[string]any{"show_podium": true})
	if err != nil {
		t.Fatalf("UpdateEvent show_podium: %v", err)
	}
	if !updEv.ShowPodium {
		t.Fatalf("updated event show_podium = false, want true")
	}
	reloaded, err := GetEventByID(ev.ID)
	if err != nil {
		t.Fatalf("GetEventByID: %v", err)
	}
	if !reloaded.ShowPodium {
		t.Fatalf("persisted show_podium = false, want true")
	}
}

func TestLockExpiredQuestionsAndIdempotency(t *testing.T) {
	ev, _ := quizFixtures(t)
	now := time.Now().UnixMilli()

	expired, err := CreateQuestion(ev.ID, "poll", "live", "Expired", []string{"A", "B"}, false, true, 2, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion expired: %v", err)
	}
	untimed, err := CreateQuestion(ev.ID, "poll", "live", "Untimed", []string{"A", "B"}, false, true, 3, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion untimed: %v", err)
	}
	future, err := CreateQuestion(ev.ID, "poll", "live", "Future", []string{"A", "B"}, false, true, 4, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion future: %v", err)
	}

	past := now - 11_000
	setPhase(t, expired.ID, "live", 10, &past)
	setPhase(t, untimed.ID, "live", 0, &past)
	setPhase(t, future.ID, "live", 60, &now)

	n, err := LockExpiredQuestions(ev.ID, now)
	if err != nil {
		t.Fatalf("LockExpiredQuestions: %v", err)
	}
	if n != 1 {
		t.Fatalf("LockExpiredQuestions changed %d, want 1", n)
	}
	if got, _ := GetQuestion(expired.ID); got.Status != "locked" {
		t.Fatalf("expired question status = %q, want locked", got.Status)
	}
	if got, _ := GetQuestion(untimed.ID); got.Status != "live" {
		t.Fatalf("untimed question status = %q, want live (0 = untimed)", got.Status)
	}
	if got, _ := GetQuestion(future.ID); got.Status != "live" {
		t.Fatalf("future question status = %q, want live", got.Status)
	}

	// Idempotent: nothing left to lock.
	if n, err := LockExpiredQuestions(ev.ID, now); err != nil || n != 0 {
		t.Fatalf("second LockExpiredQuestions = (%d, %v), want (0, nil)", n, err)
	}

	// Single-question variant respects untimed, expired and idempotency rules.
	if locked, err := LockQuestionIfExpired(ev.ID, untimed.ID, now+1_000_000); err != nil || locked {
		t.Fatalf("untimed LockQuestionIfExpired = (%v, %v), want (false, nil)", locked, err)
	}
	if locked, err := LockQuestionIfExpired(ev.ID, future.ID, now+1); err != nil || locked {
		t.Fatalf("not-yet-expired LockQuestionIfExpired = (%v, %v), want (false, nil)", locked, err)
	}
	if locked, err := LockQuestionIfExpired(ev.ID, future.ID, now+60_000); err != nil || !locked {
		t.Fatalf("expired LockQuestionIfExpired = (%v, %v), want (true, nil)", locked, err)
	}
	if locked, err := LockQuestionIfExpired(ev.ID, future.ID, now+61_000); err != nil || locked {
		t.Fatalf("repeat LockQuestionIfExpired = (%v, %v), want (false, nil)", locked, err)
	}
}

func TestGetActiveQuestionPhasePreference(t *testing.T) {
	ev, _ := quizFixtures(t)
	now := time.Now().UnixMilli()

	revealed, _ := CreateQuestion(ev.ID, "poll", "live", "Revealed", []string{"A", "B"}, false, true, 2, "", "")
	locked, _ := CreateQuestion(ev.ID, "poll", "live", "Locked", []string{"A", "B"}, false, true, 3, "", "")
	live, _ := CreateQuestion(ev.ID, "poll", "live", "Live", []string{"A", "B"}, false, true, 4, "", "")

	t1, t2, t3 := now-3000, now-2000, now-1000
	setPhase(t, revealed.ID, "revealed", 0, &t1)
	setPhase(t, locked.ID, "locked", 0, &t2)
	setPhase(t, live.ID, "live", 0, &t3)

	got, err := GetActiveQuestion(ev.ID)
	if err != nil {
		t.Fatalf("GetActiveQuestion: %v", err)
	}
	if got == nil || got.ID != live.ID {
		t.Fatalf("active question = %+v, want live %d", got, live.ID)
	}

	setPhase(t, live.ID, "closed", 0, &t3)
	if got, _ := GetActiveQuestion(ev.ID); got == nil || got.ID != locked.ID {
		t.Fatalf("active question = %+v, want locked %d", got, locked.ID)
	}

	setPhase(t, locked.ID, "closed", 0, &t2)
	if got, _ := GetActiveQuestion(ev.ID); got == nil || got.ID != revealed.ID {
		t.Fatalf("active question = %+v, want revealed %d", got, revealed.ID)
	}

	setPhase(t, revealed.ID, "closed", 0, &t1)
	got, err = GetActiveQuestion(ev.ID)
	if err != nil {
		t.Fatalf("GetActiveQuestion after close: %v", err)
	}
	if got != nil {
		t.Fatalf("active question = %+v, want nil when all phases are closed", got)
	}
}

func TestRevealQuestionGating(t *testing.T) {
	ev, q := quizFixtures(t)

	// CreateQuestion leaves new rows in draft; promoting to live mirrors what
	// activation does before a host can reveal.
	setPhase(t, q.ID, "live", 0, nil)

	// Revealing a still-live question publishes results (show_results flips on).
	if _, err := UpdateQuestion(q.ID, map[string]any{"show_results": false}); err != nil {
		t.Fatalf("clear show_results: %v", err)
	}
	if err := RevealQuestion(ev.ID, q.ID); err != nil {
		t.Fatalf("RevealQuestion live: %v", err)
	}
	got, _ := GetQuestion(q.ID)
	if got.Status != "revealed" || !got.ShowResults {
		t.Fatalf("after reveal status=%q show_results=%v, want revealed/true", got.Status, got.ShowResults)
	}

	// Revealing again is a no-op, not an error.
	if err := RevealQuestion(ev.ID, q.ID); err != nil {
		t.Fatalf("RevealQuestion revealed: %v", err)
	}

	// A draft question cannot jump straight to revealed.
	draft, _ := CreateQuestion(ev.ID, "poll", "live", "Draft", []string{"A", "B"}, false, true, 2, "", "")
	err := RevealQuestion(ev.ID, draft.ID)
	if err == nil || !strings.Contains(err.Error(), "cannot be revealed") {
		t.Fatalf("RevealQuestion draft = %v, want cannot-be-revealed error", err)
	}

	// A closed question cannot be revealed either.
	closedQ, _ := CreateQuestion(ev.ID, "poll", "live", "Closed", []string{"A", "B"}, false, true, 3, "", "")
	setPhase(t, closedQ.ID, "closed", 0, nil)
	if err := RevealQuestion(ev.ID, closedQ.ID); err == nil || !strings.Contains(err.Error(), "cannot be revealed") {
		t.Fatalf("RevealQuestion closed = %v, want cannot-be-revealed error", err)
	}

	// Cross-event reveal and unknown ids report not-found.
	other, _ := CreateEvent("Other", "quiz-2", "", "")
	if err := RevealQuestion(other.ID, q.ID); err == nil || !strings.Contains(err.Error(), "question not found") {
		t.Fatalf("cross-event RevealQuestion = %v, want question not found", err)
	}
	if err := RevealQuestion(ev.ID, 999_999); err == nil || !strings.Contains(err.Error(), "question not found") {
		t.Fatalf("unknown RevealQuestion = %v, want question not found", err)
	}
}

func TestActivateQuestionClearsPodiumAndPriorPhases(t *testing.T) {
	ev, q1 := quizFixtures(t)
	q2, err := CreateQuestion(ev.ID, "poll", "live", "Second", []string{"A", "B"}, false, true, 2, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion second: %v", err)
	}

	if _, err := UpdateEvent(ev.ID, map[string]any{"show_podium": true}); err != nil {
		t.Fatalf("show podium: %v", err)
	}
	if err := ActivateQuestion(ev.ID, q1.ID, nil); err != nil {
		t.Fatalf("ActivateQuestion q1: %v", err)
	}
	if got, _ := GetQuestion(q1.ID); got.Status != "live" {
		t.Fatalf("q1 status = %q, want live", got.Status)
	}
	if re, _ := GetEventByID(ev.ID); re.ShowPodium {
		t.Fatalf("activation did not clear the podium")
	}

	// Push q1 through the timed lock phase, re-open the podium, then activate q2.
	now := time.Now().UnixMilli()
	past := now - 20_000
	setPhase(t, q1.ID, "locked", 10, &past)
	if _, err := UpdateEvent(ev.ID, map[string]any{"show_podium": true}); err != nil {
		t.Fatalf("re-show podium: %v", err)
	}
	if err := ActivateQuestion(ev.ID, q2.ID, nil); err != nil {
		t.Fatalf("ActivateQuestion q2: %v", err)
	}

	if got, _ := GetQuestion(q1.ID); got.Status != "closed" {
		t.Fatalf("q1 status after q2 activation = %q, want closed", got.Status)
	}
	if got, _ := GetQuestion(q2.ID); got.Status != "live" {
		t.Fatalf("q2 status = %q, want live", got.Status)
	}
	if re, _ := GetEventByID(ev.ID); re.ShowPodium {
		t.Fatalf("q2 activation did not clear the podium")
	}
	if active, _ := GetActiveQuestion(ev.ID); active == nil || active.ID != q2.ID {
		t.Fatalf("active question = %+v, want q2", active)
	}

	// Activating an unknown question is a no-op error and leaves phases alone.
	if err := ActivateQuestion(ev.ID, 999_999, nil); err == nil {
		t.Fatalf("ActivateQuestion unknown = nil, want error")
	}
}

// TestMigrationQuizLoopColumns verifies the additive columns survive a second
// migrate and are usable, matching the project's additive-migration contract.
func TestMigrationQuizLoopColumns(t *testing.T) {
	p := filepath.Join(t.TempDir(), "mig-quiz.db")
	if err := Init(p); err != nil {
		t.Fatalf("Init1: %v", err)
	}
	if err := migrate(); err != nil {
		t.Fatalf("migrate again: %v", err)
	}
	Close()

	if err := Init(p); err != nil {
		t.Fatalf("Init2: %v", err)
	}
	defer Close()

	for _, tc := range []struct{ table, col string }{
		{"questions", "time_limit_s"},
		{"events", "show_podium"},
	} {
		var n int
		err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?", tc.table, tc.col).Scan(&n)
		if err != nil {
			t.Fatalf("pragma_table_info(%s.%s): %v", tc.table, tc.col, err)
		}
		if n != 1 {
			t.Fatalf("column %s.%s missing after re-migrate", tc.table, tc.col)
		}
	}
}
