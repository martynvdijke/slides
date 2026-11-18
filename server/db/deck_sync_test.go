package db

import "testing"

// Re-syncing a deck must not demote a question that is already on screen.
// UpsertDeckQuestion used to force status='draft' on every conflict update,
// which made a live question disappear from GetActiveQuestion (live|locked|revealed).
func TestSyncDeckQuestionsPreservesStatusOnResync(t *testing.T) {
	tmpDB(t)
	ev, _, err := EnsureEvent("deck-sync", "Deck sync", "seeded")
	if err != nil {
		t.Fatalf("EnsureEvent: %v", err)
	}
	slides := []DeckSlide{
		{SlideID: "q1", Position: 1, Prompt: "Pick one", Kind: "poll", Options: []string{"A", "B"}, ShowResults: true, Activate: "auto", DurationSec: 60, TimeLimitS: 30},
	}

	created, updated, archived, err := SyncDeckQuestions(ev.ID, "deck-sync", slides)
	if err != nil {
		t.Fatalf("SyncDeckQuestions 1: %v", err)
	}
	if created != 1 || updated != 0 || archived != 0 {
		t.Fatalf("first sync: created=%d updated=%d archived=%d want 1,0,0", created, updated, archived)
	}
	q, err := FindQuestionByExternalID(ev.ID, "deck-sync:q1")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID: %v", err)
	}
	if q.Status != "draft" {
		t.Fatalf("fresh insert status=%q want draft", q.Status)
	}

	// Put the question live, as the presenter would.
	if err := ActivateQuestion(ev.ID, q.ID, nil); err != nil {
		t.Fatalf("ActivateQuestion: %v", err)
	}
	live, err := FindQuestionByExternalID(ev.ID, "deck-sync:q1")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID after activate: %v", err)
	}
	if live.Status != "live" {
		t.Fatalf("after activate status=%q want live", live.Status)
	}

	// Re-sync the same deck (with an edited prompt) while it is live.
	slides[0].Prompt = "Pick one (edited)"
	created2, updated2, archived2, err := SyncDeckQuestions(ev.ID, "deck-sync", slides)
	if err != nil {
		t.Fatalf("SyncDeckQuestions 2: %v", err)
	}
	if created2 != 0 || updated2 != 1 || archived2 != 0 {
		t.Fatalf("second sync: created=%d updated=%d archived=%d want 0,1,0", created2, updated2, archived2)
	}
	resynced, err := FindQuestionByExternalID(ev.ID, "deck-sync:q1")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID after resync: %v", err)
	}
	if resynced.ID != q.ID {
		t.Fatalf("question ID changed on resync %d -> %d", q.ID, resynced.ID)
	}
	if resynced.Status != "live" {
		t.Fatalf("status after resync=%q want live (must not be demoted to draft)", resynced.Status)
	}
	if resynced.Prompt != "Pick one (edited)" {
		t.Fatalf("prompt not updated on resync: %q", resynced.Prompt)
	}
	// The live question must still be the one the audience sees.
	active, err := GetActiveQuestion(ev.ID)
	if err != nil {
		t.Fatalf("GetActiveQuestion: %v", err)
	}
	if active == nil || active.ID != q.ID {
		t.Fatalf("GetActiveQuestion after resync = %+v, want question %d", active, q.ID)
	}

	// A newly added slide still starts life as a draft.
	slides = append(slides, DeckSlide{SlideID: "q2", Position: 2, Prompt: "Second", Kind: "poll", Options: []string{"C", "D"}, ShowResults: true})
	created3, updated3, _, err := SyncDeckQuestions(ev.ID, "deck-sync", slides)
	if err != nil {
		t.Fatalf("SyncDeckQuestions 3: %v", err)
	}
	if created3 != 1 || updated3 != 1 {
		t.Fatalf("third sync: created=%d updated=%d want 1,1", created3, updated3)
	}
	q2, err := FindQuestionByExternalID(ev.ID, "deck-sync:q2")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID q2: %v", err)
	}
	if q2.Status != "draft" {
		t.Fatalf("new slide status=%q want draft", q2.Status)
	}
	// The live one survived the second re-sync too.
	stillLive, err := FindQuestionByExternalID(ev.ID, "deck-sync:q1")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID q1 after third sync: %v", err)
	}
	if stillLive.Status != "live" {
		t.Fatalf("status after third sync=%q want live", stillLive.Status)
	}
}

// Deck sync must carry a slide's media the same way the seed path does: on the
// first insert and on every re-sync update (including clearing it).
func TestSyncDeckQuestionsCarriesMedia(t *testing.T) {
	tmpDB(t)
	ev, _, err := EnsureEvent("deck-media", "Deck media", "seeded")
	if err != nil {
		t.Fatalf("EnsureEvent: %v", err)
	}
	slides := []DeckSlide{
		{SlideID: "m1", Position: 1, Prompt: "With media", Kind: "poll", Options: []string{"A", "B"}, ShowResults: true, MediaURL: "/media/first.png", MediaType: "image"},
	}

	created, updated, _, err := SyncDeckQuestions(ev.ID, "deck-media", slides)
	if err != nil {
		t.Fatalf("SyncDeckQuestions 1: %v", err)
	}
	if created != 1 || updated != 0 {
		t.Fatalf("first sync: created=%d updated=%d want 1,0", created, updated)
	}
	q, err := FindQuestionByExternalID(ev.ID, "deck-media:m1")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID: %v", err)
	}
	if q.MediaURL != "/media/first.png" || q.MediaType != "image" {
		t.Fatalf("insert media=%q/%q want /media/first.png/image", q.MediaURL, q.MediaType)
	}

	// Re-sync with different media: the update must overwrite it.
	slides[0].MediaURL = "/media/second.mp4"
	slides[0].MediaType = "video"
	created2, updated2, _, err := SyncDeckQuestions(ev.ID, "deck-media", slides)
	if err != nil {
		t.Fatalf("SyncDeckQuestions 2: %v", err)
	}
	if created2 != 0 || updated2 != 1 {
		t.Fatalf("second sync: created=%d updated=%d want 0,1", created2, updated2)
	}
	q2, err := FindQuestionByExternalID(ev.ID, "deck-media:m1")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID after resync: %v", err)
	}
	if q2.MediaURL != "/media/second.mp4" || q2.MediaType != "video" {
		t.Fatalf("resync media=%q/%q want /media/second.mp4/video", q2.MediaURL, q2.MediaType)
	}

	// Dropping the media from the slide must clear it, not keep the stale value.
	slides[0].MediaURL = ""
	slides[0].MediaType = ""
	if _, _, _, err := SyncDeckQuestions(ev.ID, "deck-media", slides); err != nil {
		t.Fatalf("SyncDeckQuestions 3: %v", err)
	}
	q3, err := FindQuestionByExternalID(ev.ID, "deck-media:m1")
	if err != nil {
		t.Fatalf("FindQuestionByExternalID after clear: %v", err)
	}
	if q3.MediaURL != "" || q3.MediaType != "" {
		t.Fatalf("cleared media=%q/%q want empty", q3.MediaURL, q3.MediaType)
	}
}
