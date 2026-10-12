package db

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSyncEventQuestionsIdempotent(t *testing.T) {
	tmpDB(t)
	ev, _, err := EnsureEvent("feature-test", "Feature test", "seeded")
	if err != nil {
		t.Fatalf("EnsureEvent: %v", err)
	}
	ci := 1
	q1SR := true
	q2SR := true
	qs := []SeedQuestion{
		{ID: "q-poll", Kind: "poll", Mode: "live", Prompt: "Poll Q?", Options: []string{"A", "B"}, ShowResults: &q1SR},
		{ID: "q-multi", Kind: "multi", Mode: "live", Prompt: "Multi Q?", Options: []string{"X", "Y", "Z"}, CorrectIndex: &ci, PointsBase: 100, ShowResults: &q2SR, TimeLimitS: 30},
	}
	created, updated, err := SyncEventQuestions(ev.ID, qs)
	if err != nil {
		t.Fatalf("SyncEventQuestions 1: %v", err)
	}
	if created != len(qs) || updated != 0 {
		t.Fatalf("first sync: created=%d updated=%d want %d,0", created, updated, len(qs))
	}
	// Capture IDs.
	qPoll, err := GetQuestionBySeedKey(ev.ID, "q-poll")
	if err != nil {
		t.Fatalf("GetQuestionBySeedKey q-poll: %v", err)
	}
	qMulti, err := GetQuestionBySeedKey(ev.ID, "q-multi")
	if err != nil {
		t.Fatalf("GetQuestionBySeedKey q-multi: %v", err)
	}
	firstPollID := qPoll.ID
	firstMultiID := qMulti.ID

	// Second sync with a field edit.
	qs[0].Prompt = "Poll Q edited?"
	created2, updated2, err := SyncEventQuestions(ev.ID, qs)
	if err != nil {
		t.Fatalf("SyncEventQuestions 2: %v", err)
	}
	if created2 != 0 || updated2 != len(qs) {
		t.Fatalf("second sync: created=%d updated=%d want 0,%d", created2, updated2, len(qs))
	}
	qPoll2, _ := GetQuestionBySeedKey(ev.ID, "q-poll")
	if qPoll2.ID != firstPollID {
		t.Fatalf("poll ID changed %d -> %d", firstPollID, qPoll2.ID)
	}
	if qPoll2.Prompt != "Poll Q edited?" {
		t.Fatalf("prompt not updated: %q", qPoll2.Prompt)
	}
	qMulti2, _ := GetQuestionBySeedKey(ev.ID, "q-multi")
	if qMulti2.ID != firstMultiID {
		t.Fatalf("multi ID changed %d -> %d", firstMultiID, qMulti2.ID)
	}
	// seed_key stored.
	if _, err := GetQuestionBySeedKey(ev.ID, "q-poll"); err != nil {
		t.Fatalf("GetQuestionBySeedKey stored: %v", err)
	}
	if _, err := GetQuestionBySeedKey(ev.ID, "unknown-key"); err != sql.ErrNoRows {
		t.Fatalf("GetQuestionBySeedKey unknown: err=%v want sql.ErrNoRows", err)
	}
}

func TestSeedDeckQuestionsFromDir(t *testing.T) {
	tmpDB(t)
	decksDir := t.TempDir()
	deckPath := filepath.Join(decksDir, "feature-test")
	if err := os.MkdirAll(deckPath, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	sr := true
	ci := 0
	manifest := SeedManifest{
		Deck:      "feature-test",
		EventCode: "feature-test",
		EventName: "Feature test",
		Questions: []SeedQuestion{
			{ID: "k8s-control-plane", Kind: "multi", Mode: "live", Prompt: "What is it?", Options: []string{"A", "B"}, CorrectIndex: &ci, PointsBase: 100, ShowResults: &sr, TimeLimitS: 30, SlideIndex: 5},
		},
	}
	// Ensure JSON shape matches frozen spec.
	data, _ := json.Marshal(manifest)
	if err := os.WriteFile(filepath.Join(deckPath, "questions.json"), data, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := SeedDeckQuestionsFromDir(decksDir); err != nil {
		t.Fatalf("SeedDeckQuestionsFromDir 1: %v", err)
	}
	ev, err := GetEventByCode("feature-test")
	if err != nil {
		t.Fatalf("GetEventByCode: %v", err)
	}
	qs, err := ListQuestions(ev.ID)
	if err != nil {
		t.Fatalf("ListQuestions: %v", err)
	}
	if len(qs) != 1 {
		t.Fatalf("questions count %d want 1", len(qs))
	}
	// Deck mapping must be filled so slide broadcasts (id-only) can resolve it.
	if qs[0].ExternalID != "feature-test:k8s-control-plane" {
		t.Fatalf("external_id %q want feature-test:k8s-control-plane", qs[0].ExternalID)
	}
	if qs[0].DeckSlug != "feature-test" {
		t.Fatalf("deck_slug %q want feature-test", qs[0].DeckSlug)
	}
	if qs[0].SlideID != "k8s-control-plane" {
		t.Fatalf("slide_id %q want k8s-control-plane", qs[0].SlideID)
	}
	if !qs[0].AutoActivate {
		t.Fatalf("auto_activate false want true")
	}
	// The ws.go fallback resolves by slide_id alone (presenter frames carry no deck_slug).
	var resolvedID int64
	if err := DB.QueryRow("SELECT id FROM questions WHERE event_id=? AND slide_id=? AND external_id<>''", ev.ID, "k8s-control-plane").Scan(&resolvedID); err != nil {
		t.Fatalf("slide_id fallback lookup: %v", err)
	}
	if resolvedID != qs[0].ID {
		t.Fatalf("fallback resolved %d want %d", resolvedID, qs[0].ID)
	}
	// No duplicates on second run.
	if err := SeedDeckQuestionsFromDir(decksDir); err != nil {
		t.Fatalf("SeedDeckQuestionsFromDir 2: %v", err)
	}
	qs2, _ := ListQuestions(ev.ID)
	if len(qs2) != 1 {
		t.Fatalf("second run count %d want 1", len(qs2))
	}
	if qs[0].ID != qs2[0].ID {
		t.Fatalf("ID changed on second run %d -> %d", qs[0].ID, qs2[0].ID)
	}
	if qs2[0].ExternalID != "feature-test:k8s-control-plane" || qs2[0].SlideID != "k8s-control-plane" {
		t.Fatalf("mapping lost on second run: external_id=%q slide_id=%q", qs2[0].ExternalID, qs2[0].SlideID)
	}
}
