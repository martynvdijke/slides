package db

import (
	"path/filepath"
	"testing"
)

func TestCloneEventCopiesDraftsNoAudience(t *testing.T) {
	if err := Init(filepath.Join(t.TempDir(), "clone.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer Close()
	ev, _ := CreateEvent("Orig", "orig", "desc", "2026-01-01")
	q1, _ := CreateQuestion(ev.ID, "poll", "live", "Q1", []string{"A", "B"}, false, true, 0, "", "")
	q2, _ := CreateQuestion(ev.ID, "poll", "live", "Qfb", []string{"X", "Y"}, true, false, 1, "", "")
	// add audience data
	pid, _ := GetOrCreateParticipant("tok1", ev.ID)
	_, _, _, _ = UpsertAnswerWithScoring(q1.ID, pid, "A", "")
	_, _ = CreateQA(ev.ID, "hello", "anon")
	newID, err := CloneEvent(ev.ID, "orig-copy", "Cloned")
	if err != nil {
		t.Fatalf("clone: %v", err)
	}
	if newID == ev.ID {
		t.Fatalf("same id")
	}
	// questions copied as drafts
	qs, _ := ListQuestions(newID)
	fb, _ := ListFeedbackQuestions(newID)
	if len(qs) != 1 || len(fb) != 1 {
		t.Fatalf("questions %d fb %d", len(qs), len(fb))
	}
	if qs[0].Status != "draft" || qs[0].ShowResults {
		t.Fatalf("status %s show %v", qs[0].Status, qs[0].ShowResults)
	}
	if qs[0].ActivatedAt != nil {
		t.Fatalf("activated not null")
	}
	// no audience data
	if n, _ := countQuery("SELECT COUNT(*) FROM participants WHERE event_id=?", newID); n != 0 {
		t.Fatalf("participants copied %d", n)
	}
	if n, _ := countQuery("SELECT COUNT(*) FROM answers WHERE question_id IN (SELECT id FROM questions WHERE event_id=?)", newID); n != 0 {
		t.Fatalf("answers copied")
	}
	if n, _ := countQuery("SELECT COUNT(*) FROM qa_questions WHERE event_id=?", newID); n != 0 {
		t.Fatalf("qa copied")
	}
	_ = q2
}

func TestCloneUniqueCode(t *testing.T) {
	if err := Init(filepath.Join(t.TempDir(), "clone2.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer Close()
	ev, _ := CreateEvent("E", "mycode", "", "")
	_, _ = CloneEvent(ev.ID, "mycode-copy", "")
	_, _ = CloneEvent(ev.ID, "mycode-copy", "")
	// should have 3 events with distinct codes
	events, _ := ListEvents()
	codes := map[string]bool{}
	for _, e := range events {
		if codes[e.Code] {
			t.Fatalf("duplicate code %s", e.Code)
		}
		codes[e.Code] = true
	}
	if len(events) != 3 {
		t.Fatalf("expected 3 got %d", len(events))
	}
}
