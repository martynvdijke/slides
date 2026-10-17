package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"slides/db"
	"slides/live"
)

func TestResolveSlideQuestionID(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "slide-sync.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	Broker.Close()
	Broker = live.New()

	ev, _ := db.CreateEvent("E", "slide-sync-ev", "", "")
	// deck sync creates question with external_id meetup:s01
	// Use direct db insert via deck sync path: create question then set mapping
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q1", []string{"a", "b"}, false, true, 1, "", "")
	// attach deck mapping
	_, _ = db.DB.Exec("UPDATE questions SET external_id=?, deck_slug=?, slide_id=?, auto_activate=1 WHERE id=?", "meetup:s01", "meetup", "s01", q.ID)

	// with deck_slug resolves
	if id := resolveSlideQuestionID(ev.ID, "s01", "meetup"); id != q.ID {
		t.Fatalf("with deck_slug got %d want %d", id, q.ID)
	}
	// without deck_slug fallback resolves via slide_id
	if id := resolveSlideQuestionID(ev.ID, "s01", ""); id != q.ID {
		t.Fatalf("fallback got %d want %d", id, q.ID)
	}
	// unknown slide yields 0
	if id := resolveSlideQuestionID(ev.ID, "nope", "meetup"); id != 0 {
		t.Fatalf("unknown got %d want 0", id)
	}
	if id := resolveSlideQuestionID(ev.ID, "", "meetup"); id != 0 {
		t.Fatalf("empty slide_id got %d want 0", id)
	}
	// Slide struct serialization includes optional fields and omits when zero
	s := live.Slide{Index: 3, Total: 10, Title: "Hello", QuestionID: q.ID, SlideID: "s01", DeckSlug: "meetup"}
	b, _ := json.Marshal(s)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	if m["question_id"] == nil || int(m["question_id"].(float64)) != int(q.ID) {
		t.Fatalf("question_id missing %v", m)
	}
	if m["slide_id"] != "s01" || m["deck_slug"] != "meetup" {
		t.Fatalf("slide_id/deck_slug missing %v", m)
	}
	// omitempty when zero/empty
	s2 := live.Slide{Index: 1, Total: 5, Title: "NoQ"}
	b2, _ := json.Marshal(s2)
	var m2 map[string]any
	_ = json.Unmarshal(b2, &m2)
	if _, ok := m2["question_id"]; ok {
		t.Fatalf("question_id should be omitted %v", m2)
	}
	if _, ok := m2["slide_id"]; ok {
		t.Fatalf("slide_id should be omitted %v", m2)
	}

	// Broker Set/Get carries enriched fields, and BuildState serializes current_slide with them
	Broker.SetSlide(ev.Code, s)
	got, ok := Broker.GetSlide(ev.Code)
	if !ok || got.QuestionID != q.ID || got.SlideID != "s01" || got.DeckSlug != "meetup" {
		t.Fatalf("broker got %+v", got)
	}
	state := BuildState(ev, 0)
	if state.CurrentSlide == nil || state.CurrentSlide.QuestionID != q.ID {
		t.Fatalf("state current_slide %+v want question_id %d", state.CurrentSlide, q.ID)
	}
	// state JSON shape
	sb, _ := json.Marshal(state)
	var sj map[string]any
	_ = json.Unmarshal(sb, &sj)
	cs, _ := sj["current_slide"].(map[string]any)
	if cs == nil || cs["question_id"] == nil {
		t.Fatalf("state json missing current_slide.question_id %v", sj)
	}

	// slide without mapped question yields QuestionID==0 but still carries slide_id/deck_slug
	s3 := live.Slide{Index: 2, Total: 10, Title: "NoQ slide", SlideID: "unknown", DeckSlug: "meetup"}
	// resolve returns 0, so QuestionID stays 0
	if id := resolveSlideQuestionID(ev.ID, "unknown", "meetup"); id != 0 {
		t.Fatalf("expected 0 for unknown")
	}
	Broker.SetSlide(ev.Code, s3)
	got3, _ := Broker.GetSlide(ev.Code)
	if got3.QuestionID != 0 {
		t.Fatalf("want 0 got %d", got3.QuestionID)
	}
	if got3.SlideID != "unknown" || got3.DeckSlug != "meetup" {
		t.Fatalf("slide_id/deck_slug not carried %+v", got3)
	}
	// BroadcastSlide JSON includes enriched fields
	ch, unsub := Broker.Subscribe(ev.Code)
	defer unsub()
	Broker.BroadcastSlide(ev.Code, s)
	fr := <-ch
	var env struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	_ = json.Unmarshal(fr.Data, &env)
	if env.Type != "slide" {
		t.Fatalf("type %q", env.Type)
	}
	var sd live.Slide
	_ = json.Unmarshal(env.Data, &sd)
	if sd.QuestionID != q.ID || sd.SlideID != "s01" || sd.DeckSlug != "meetup" {
		t.Fatalf("broadcast slide %+v want enriched", sd)
	}
}

func TestBuildStateCurrentSlideQuestionIDZeroWhenNoMapping(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "slide-sync2.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	Broker.Close()
	Broker = live.New()
	ev, _ := db.CreateEvent("E", "slide-sync-ev2", "", "")
	Broker.SetSlide(ev.Code, live.Slide{Index: 1, Total: 5, Title: "Intro", SlideID: "intro", DeckSlug: "meetup"})
	state := BuildState(ev, 0)
	if state.CurrentSlide == nil {
		t.Fatalf("no current_slide")
	}
	if state.CurrentSlide.QuestionID != 0 {
		t.Fatalf("want 0 got %d", state.CurrentSlide.QuestionID)
	}
}

func TestAdminSlideControlPreservesMapping(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "admin-slide-preserve.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	Broker.Close()
	Broker = live.New()

	ev, _ := db.CreateEvent("E", "admin-preserve-ev", "", "")
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q1", []string{"a", "b"}, false, true, 1, "", "")
	_, _ = db.DB.Exec("UPDATE questions SET external_id=?, deck_slug=?, slide_id=?, slide_index=?, auto_activate=1, status='draft' WHERE id=?", "meetup:s01", "meetup", "s01", 5, q.ID)
	Broker.SetSlide(ev.Code, live.Slide{Index: 3, Total: 10, Title: "Intro", SlideID: "intro", DeckSlug: "meetup"})

	// admin moves to mapped index 5 — must resolve and activate
	ch, unsub := Broker.Subscribe(ev.Code)
	defer unsub()
	body := bytes.NewBufferString(`{"index":5}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/events/"+strconv.FormatInt(ev.ID, 10)+"/slide", body)
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("id", strconv.FormatInt(ev.ID, 10))
	rr := httptest.NewRecorder()
	AdminSlideControl(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	got, ok := Broker.GetSlide(ev.Code)
	if !ok {
		t.Fatalf("no slide after admin control")
	}
	if got.Index != 5 {
		t.Fatalf("index %d want 5", got.Index)
	}
	if got.QuestionID != q.ID {
		t.Fatalf("QuestionID %d want %d", got.QuestionID, q.ID)
	}
	if got.SlideID != "s01" || got.DeckSlug != "meetup" {
		t.Fatalf("mapping wrong %+v", got)
	}
	if got.Total != 10 {
		t.Fatalf("Total %d want 10", got.Total)
	}
	if aq, _ := db.GetActiveQuestion(ev.ID); aq == nil || aq.ID != q.ID {
		t.Fatalf("active question not activated %+v want %d", aq, q.ID)
	}
	// broadcast slide frame must carry question_id/slide_id
	found := false
	for {
		select {
		case fr := <-ch:
			if fr.Kind != live.KindSlide {
				continue
			}
			var env struct {
				Type string          `json:"type"`
				Data json.RawMessage `json:"data"`
			}
			_ = json.Unmarshal(fr.Data, &env)
			if env.Type != "slide" {
				continue
			}
			var sd live.Slide
			_ = json.Unmarshal(env.Data, &sd)
			if sd.Index == 5 && sd.QuestionID == q.ID && sd.SlideID == "s01" {
				found = true
			}
		default:
			break
		}
		if found || len(ch) == 0 {
			break
		}
	}
	if !found {
		t.Fatalf("no slide broadcast with question_id")
	}

	// move to unmapped index 6 — must clear QuestionID and not activate
	body2 := bytes.NewBufferString(`{"action":"next"}`)
	req2 := httptest.NewRequest(http.MethodPost, "/api/admin/events/"+strconv.FormatInt(ev.ID, 10)+"/slide", body2)
	req2.Header.Set("Content-Type", "application/json")
	req2.SetPathValue("id", strconv.FormatInt(ev.ID, 10))
	rr2 := httptest.NewRecorder()
	AdminSlideControl(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Fatalf("next status %d", rr2.Code)
	}
	got2, _ := Broker.GetSlide(ev.Code)
	if got2.Index != 6 {
		t.Fatalf("next index %d want 6", got2.Index)
	}
	if got2.QuestionID != 0 {
		t.Fatalf("unmapped index should have QuestionID 0 got %d", got2.QuestionID)
	}
	if got2.SlideID != "" || got2.DeckSlug != "" {
		t.Fatalf("unmapped should clear slide_id/deck_slug %+v", got2)
	}
}

func TestPresenterSlideActivatesAndBroadcastsConsistently(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "presenter-lockstep.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	Broker.Close()
	Broker = live.New()

	ev, _ := db.CreateEvent("E", "presenter-lockstep-ev", "", "")
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q-lock", []string{"a", "b"}, false, true, 1, "", "")
	_, _ = db.DB.Exec("UPDATE questions SET external_id=?, deck_slug=?, slide_id=?, auto_activate=1, status='draft' WHERE id=?", "meetup:s02", "meetup", "s02", q.ID)

	ch, unsub := Broker.Subscribe(ev.Code)
	defer unsub()

	// simulate presenter slide frame handling: activate + SetSlide + BroadcastSlide in lockstep
	s := live.Slide{Index: 2, Total: 10, Title: "Slide 2", SlideID: "s02", DeckSlug: "meetup"}
	if qid := resolveSlideQuestionID(ev.ID, s.SlideID, s.DeckSlug); qid != 0 {
		s.QuestionID = qid
	}
	_ = ActivateQuestionForSlide(ev.ID, s.Index, s.SlideID, s.DeckSlug)
	Broker.SetSlide(ev.Code, s)
	Broker.BroadcastSlide(ev.Code, s)

	// active_question must be activated
	if aq, _ := db.GetActiveQuestion(ev.ID); aq == nil || aq.ID != q.ID {
		t.Fatalf("active question not activated %+v want %d", aq, q.ID)
	}
	// broker slide must carry question_id
	got, _ := Broker.GetSlide(ev.Code)
	if got.QuestionID != q.ID {
		t.Fatalf("broker slide QuestionID %d want %d", got.QuestionID, q.ID)
	}
	// collect slide frames, ignoring refresh frames
	collectSlide := func() (live.Slide, bool) {
		for {
			select {
			case fr := <-ch:
				if fr.Kind != live.KindSlide {
					continue
				}
				var env struct {
					Type string          `json:"type"`
					Data json.RawMessage `json:"data"`
				}
				_ = json.Unmarshal(fr.Data, &env)
				if env.Type != "slide" {
					continue
				}
				var sd live.Slide
				_ = json.Unmarshal(env.Data, &sd)
				return sd, true
			default:
				return live.Slide{}, false
			}
		}
	}
	sd, ok := collectSlide()
	if !ok {
		t.Fatal("no slide broadcast — ghost activation would occur if throttled")
	}
	if sd.QuestionID != q.ID || sd.Index != 2 {
		t.Fatalf("broadcast %+v want QuestionID %d Index 2", sd, q.ID)
	}

	// no-op frame (same index) still keeps lockstep: second frame should also broadcast
	_ = ActivateQuestionForSlide(ev.ID, s.Index, s.SlideID, s.DeckSlug)
	Broker.SetSlide(ev.Code, s)
	Broker.BroadcastSlide(ev.Code, s)
	sd2, ok2 := collectSlide()
	if !ok2 {
		t.Fatal("second no-op frame produced no broadcast")
	}
	if sd2.QuestionID != q.ID {
		t.Fatalf("second broadcast QuestionID %d want %d", sd2.QuestionID, q.ID)
	}
}

func TestSlideReactivatesUsedQuestion(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "reactivate.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	Broker.Close()
	Broker = live.New()

	ev, _ := db.CreateEvent("E", "reactivate-ev", "", "")
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q-used", []string{"a", "b"}, false, true, 1, "", "")
	// Already used/closed question, still mapped + auto_activate.
	_, _ = db.DB.Exec("UPDATE questions SET external_id=?, deck_slug=?, slide_id=?, slide_index=?, auto_activate=1, status='closed' WHERE id=?", "meetup:s07", "meetup", "s07", 7, q.ID)

	// Navigating to the slide must re-activate the previously used question.
	if err := ActivateQuestionForSlide(ev.ID, 7, "s07", "meetup"); err != nil {
		t.Fatalf("activate: %v", err)
	}
	if aq, _ := db.GetActiveQuestion(ev.ID); aq == nil || aq.ID != q.ID {
		t.Fatalf("used question not re-activated: %+v want %d", aq, q.ID)
	}

	// An already-live question must be a no-op (no timer reset on repeated frames).
	var firstActivated int64
	_ = db.DB.QueryRow("SELECT activated_at FROM questions WHERE id=?", q.ID).Scan(&firstActivated)
	if err := ActivateQuestionForSlide(ev.ID, 7, "s07", "meetup"); err != nil {
		t.Fatalf("second activate: %v", err)
	}
	var secondActivated int64
	_ = db.DB.QueryRow("SELECT activated_at FROM questions WHERE id=?", q.ID).Scan(&secondActivated)
	if secondActivated != firstActivated {
		t.Fatalf("live question re-activated (activated_at changed %d -> %d)", firstActivated, secondActivated)
	}
}
