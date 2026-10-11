package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListParticipantsOrderingAndCap(t *testing.T) {
	tmpDB(t)
	ev, _ := CreateEvent("E", "p-ev", "", "")
	// create 5 participants with distinct last_seen
	for i := 0; i < 5; i++ {
		tok := "tok" + string(rune('a'+i))
		id, _ := GetOrCreateParticipant(tok, ev.ID)
		// set last_seen manually
		DB.Exec("UPDATE participants SET last_seen=?, display_name=? WHERE id=?", int64(1000+i*10), "Name"+string(rune('A'+i)), id)
	}
	parts, err := ListParticipants(ev.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(parts) != 5 {
		t.Fatalf("len %d", len(parts))
	}
	// order DESC last_seen
	if parts[0].LastSeen < parts[1].LastSeen {
		t.Fatalf("ordering wrong")
	}
	// cap 200: create 205 and check
	for i := 0; i < 210; i++ {
		tok := "cap" + string(rune('0'+i%10)) + "-" + string(rune(i))
		id, _ := GetOrCreateParticipant(tok+string(rune(i)), ev.ID)
		DB.Exec("UPDATE participants SET last_seen=? WHERE id=?", int64(5000+i), id)
	}
	parts2, _ := ListParticipants(ev.ID)
	if len(parts2) != 200 {
		t.Fatalf("cap expected 200 got %d", len(parts2))
	}
}

func TestFeatureColumnsRoundTrip(t *testing.T) {
	tmpDB(t)
	ev, _ := CreateEvent("E", "feat-ev", "", "")
	// defaults true
	if !ev.FeatureLive || !ev.FeatureQA {
		t.Fatalf("defaults not true %+v", ev)
	}
	_, err := UpdateEvent(ev.ID, map[string]any{"feature_live": false, "feature_qa": 0, "feature_slides": true, "feature_feedback": 0, "feature_leaderboard": false})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	ev2, _ := GetEventByID(ev.ID)
	if ev2.FeatureLive != false || ev2.FeatureQA != false || ev2.FeatureSlides != true || ev2.FeatureFeedback != false || ev2.FeatureLeaderboard != false {
		t.Fatalf("roundtrip failed %+v", ev2)
	}
}

func TestSeedDeckFeatures(t *testing.T) {
	tmpDB(t)
	dir := t.TempDir()
	deckDir := filepath.Join(dir, "mydeck")
	os.MkdirAll(deckDir, 0755)
	manifest := `{"deck":"mydeck","event_code":"mydeck","event_name":"My Deck","questions":[{"id":"q1","kind":"poll","prompt":"Q","options":["A","B"]}],"features":["live","slides"]}`
	os.WriteFile(filepath.Join(deckDir, "questions.json"), []byte(manifest), 0644)
	if err := SeedDeckQuestionsFromDir(dir); err != nil {
		t.Fatalf("seed: %v", err)
	}
	ev, err := GetEventByCode("mydeck")
	if err != nil || ev == nil {
		t.Fatalf("get event %v", err)
	}
	if !ev.FeatureLive || !ev.FeatureSlides || ev.FeatureQA || ev.FeatureFeedback || ev.FeatureLeaderboard {
		t.Fatalf("features not applied %+v", ev)
	}
	// absent features should leave defaults when manifest has no features key
	dir2 := t.TempDir()
	deckDir2 := filepath.Join(dir2, "deck2")
	os.MkdirAll(deckDir2, 0755)
	manifest2 := `{"deck":"deck2","event_code":"deck2","event_name":"Deck2","questions":[{"id":"q1","kind":"poll","prompt":"Q","options":["A","B"]}]}`
	os.WriteFile(filepath.Join(deckDir2, "questions.json"), []byte(manifest2), 0644)
	// ensure event exists with custom features first
	ev2, _, _ := EnsureEvent("deck2", "Deck2", "")
	UpdateEvent(ev2.ID, map[string]any{"feature_live": false})
	SeedDeckQuestionsFromDir(dir2)
	ev2a, _ := GetEventByCode("deck2")
	if ev2a.FeatureLive != false {
		t.Fatalf("absent should leave defaults, got %+v", ev2a)
	}
}
