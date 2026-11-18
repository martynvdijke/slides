package db

import (
	"testing"
	"time"
)

// expireFixture creates an event with one activated, timed poll question whose
// deadline is already in the past, so ListDueQuestions reports it as due.
func expireFixture(t *testing.T, code string, autoReveal bool, status string) (*Event, *Question) {
	t.Helper()
	tmpDB(t)
	ev, err := CreateEvent("Expiry", code, "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	q, err := CreateQuestion(ev.ID, "poll", "live", "Timed", []string{"A", "B"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if _, err := UpdateQuestion(q.ID, map[string]any{"duration_sec": 5, "auto_reveal": autoReveal}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	if err := ActivateQuestion(ev.ID, q.ID, nil); err != nil {
		t.Fatalf("ActivateQuestion: %v", err)
	}
	past := time.Now().UnixMilli() - 6_000
	if _, err := DB.Exec("UPDATE questions SET activated_at=?, status=? WHERE id=?", past, status, q.ID); err != nil {
		t.Fatalf("backdate question: %v", err)
	}
	return ev, q
}

// TestExpireQuestionAutoRevealKeepsQuestionVisible is the regression guard for
// the reaper closing auto-reveal questions: they must move to 'revealed' with
// results published and still be the event's active question.
func TestExpireQuestionAutoRevealKeepsQuestionVisible(t *testing.T) {
	ev, q := expireFixture(t, "exp-1", true, "live")

	before, _ := GetQuestion(q.ID)
	if before.Status != "live" || before.ShowResults {
		t.Fatalf("before expiry status=%q show_results=%v, want live/false", before.Status, before.ShowResults)
	}

	due, err := ListDueQuestions(time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("ListDueQuestions: %v", err)
	}
	if len(due) != 1 || due[0].ID != q.ID {
		t.Fatalf("due questions = %+v, want just %d", due, q.ID)
	}

	// Exactly what one reaper tick does per due question.
	for _, d := range due {
		if err := ExpireQuestion(d.EventID, d.ID, d.AutoReveal); err != nil {
			t.Fatalf("ExpireQuestion: %v", err)
		}
	}

	got, err := GetQuestion(q.ID)
	if err != nil || got == nil {
		t.Fatalf("GetQuestion: %v", err)
	}
	if got.Status != "revealed" || !got.ShowResults {
		t.Fatalf("after expiry status=%q show_results=%v, want revealed/true", got.Status, got.ShowResults)
	}

	active, err := GetActiveQuestion(ev.ID)
	if err != nil {
		t.Fatalf("GetActiveQuestion: %v", err)
	}
	if active == nil || active.ID != q.ID {
		t.Fatalf("active question = %+v, want %d still visible", active, q.ID)
	}
	if active.Status != "revealed" || !active.ShowResults {
		t.Fatalf("active question status=%q show_results=%v, want revealed/true", active.Status, active.ShowResults)
	}

	// No longer due: the transition is not repeated on the next tick.
	if due, _ := ListDueQuestions(time.Now().UnixMilli()); len(due) != 0 {
		t.Fatalf("question still due after expiry: %+v", due)
	}
}

// TestExpireQuestionClosesWhenNotAutoReveal preserves the historical behavior
// for questions that do not auto-reveal.
func TestExpireQuestionClosesWhenNotAutoReveal(t *testing.T) {
	ev, q := expireFixture(t, "exp-2", false, "live")

	due, err := ListDueQuestions(time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("ListDueQuestions: %v", err)
	}
	if len(due) != 1 || due[0].AutoReveal {
		t.Fatalf("due questions = %+v, want one non-auto-reveal question", due)
	}
	if err := ExpireQuestion(due[0].EventID, due[0].ID, due[0].AutoReveal); err != nil {
		t.Fatalf("ExpireQuestion: %v", err)
	}

	got, _ := GetQuestion(q.ID)
	if got.Status != "closed" {
		t.Fatalf("after expiry status=%q, want closed", got.Status)
	}
	if active, _ := GetActiveQuestion(ev.ID); active != nil {
		t.Fatalf("active question = %+v, want none after close", active)
	}
}

// TestExpireQuestionRevealsLockedQuestion covers questions whose answer window
// locked before their duration elapsed: the reaper still honors auto_reveal.
func TestExpireQuestionRevealsLockedQuestion(t *testing.T) {
	ev, q := expireFixture(t, "exp-3", true, "locked")

	due, err := ListDueQuestions(time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("ListDueQuestions: %v", err)
	}
	if len(due) != 1 || due[0].ID != q.ID {
		t.Fatalf("due questions = %+v, want locked %d", due, q.ID)
	}
	if err := ExpireQuestion(due[0].EventID, due[0].ID, due[0].AutoReveal); err != nil {
		t.Fatalf("ExpireQuestion: %v", err)
	}

	got, _ := GetQuestion(q.ID)
	if got.Status != "revealed" || !got.ShowResults {
		t.Fatalf("after expiry status=%q show_results=%v, want revealed/true", got.Status, got.ShowResults)
	}
	if active, _ := GetActiveQuestion(ev.ID); active == nil || active.ID != q.ID {
		t.Fatalf("active question = %+v, want %d", active, q.ID)
	}
}

// TestActivationSupersedesRevealedQuestion ensures a lingering revealed
// question is closed when the next one is activated or skipped, so it cannot
// resurface as the active question later.
func TestActivationSupersedesRevealedQuestion(t *testing.T) {
	tmpDB(t)
	ev, err := CreateEvent("Expiry", "exp-4", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	first, _ := CreateQuestion(ev.ID, "poll", "live", "First", []string{"A", "B"}, false, true, 1, "", "")
	second, _ := CreateQuestion(ev.ID, "poll", "live", "Second", []string{"A", "B"}, false, true, 2, "", "")
	if err := ActivateQuestion(ev.ID, first.ID, nil); err != nil {
		t.Fatalf("activate first: %v", err)
	}
	if err := RevealQuestion(ev.ID, first.ID); err != nil {
		t.Fatalf("reveal first: %v", err)
	}

	if _, err := NextQueuedQuestion(ev.ID); err != nil {
		t.Fatalf("NextQueuedQuestion: %v", err)
	}
	got, _ := GetQuestion(first.ID)
	if got.Status != "closed" {
		t.Fatalf("revealed question status=%q after next, want closed", got.Status)
	}
	if active, _ := GetActiveQuestion(ev.ID); active == nil || active.ID != second.ID {
		t.Fatalf("active question = %+v, want %d", active, second.ID)
	}

	// Skip closes the live question and everything else on stage.
	if err := SkipLiveQuestion(ev.ID); err != nil {
		t.Fatalf("SkipLiveQuestion: %v", err)
	}
	if active, _ := GetActiveQuestion(ev.ID); active != nil {
		t.Fatalf("active question = %+v, want none after skip", active)
	}
}
