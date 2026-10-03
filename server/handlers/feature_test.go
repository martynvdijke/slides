package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"slides/db"
	"slides/live"
)

func TestCountdownDTOFields(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "cd.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("E", "cd-ev", "", "")
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q", []string{"A", "B"}, false, true, 0, "", "")
	_, _ = db.UpdateQuestion(q.ID, map[string]any{"duration_sec": 60})
	if err := db.ActivateQuestion(ev.ID, q.ID, nil); err != nil {
		t.Fatalf("activate: %v", err)
	}
	fresh, _ := db.GetQuestion(q.ID)
	if fresh.DurationSec != 60 {
		t.Fatalf("duration %d", fresh.DurationSec)
	}
	// BuildState via questionDTO should have expires_at
	dto := questionDTO(*fresh, true)
	if dto.ExpiresAt == nil || dto.RemainingSec == nil {
		t.Fatalf("expected expires/remaining, got %+v", dto)
	}
	if dto.DurationSec != 60 {
		t.Fatalf("dto duration")
	}
	// untimed
	q2, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q2", []string{"A", "B"}, false, true, 1, "", "")
	dto2 := questionDTO(*q2, true)
	if dto2.ExpiresAt != nil || dto2.RemainingSec != nil {
		t.Fatalf("untimed should not have expires")
	}
}

func TestListDueQuestions(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "due.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("E", "due-ev", "", "")
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q", []string{"A", "B"}, false, true, 0, "", "")
	_, _ = db.UpdateQuestion(q.ID, map[string]any{"duration_sec": 5, "auto_reveal": true})
	_ = db.ActivateQuestion(ev.ID, q.ID, nil)
	// set activated_at to past
	past := time.Now().UnixMilli() - 6000
	_, _ = db.DB.Exec("UPDATE questions SET activated_at=? WHERE id=?", past, q.ID)
	due, err := db.ListDueQuestions(time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("listdue: %v", err)
	}
	if len(due) != 1 || due[0].ID != q.ID {
		t.Fatalf("expected due, got %v", due)
	}
	// simulate reaper close
	_ = db.CloseQuestion(ev.ID, q.ID)
	_ = db.SetQuestionShowResults(q.ID, true)
	fresh, _ := db.GetQuestion(q.ID)
	if fresh.Status != "closed" || !fresh.ShowResults {
		t.Fatalf("close+reveal failed %+v", fresh)
	}
}

func TestReorderAndNext(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "rq.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("E", "rq-ev", "", "")
	var ids []int64
	for i := 0; i < 3; i++ {
		q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q", []string{"A", "B"}, false, true, i, "", "")
		ids = append(ids, q.ID)
	}
	// reorder reverse
	rev := []int64{ids[2], ids[1], ids[0]}
	if err := db.ReorderQuestions(ev.ID, rev); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	qs, _ := db.ListQuestions(ev.ID)
	if qs[0].ID != rev[0] || qs[1].ID != rev[1] || qs[2].ID != rev[2] {
		t.Fatalf("order wrong %v", qs)
	}
	// next advances in order
	q1, err := db.NextQueuedQuestion(ev.ID)
	if err != nil || q1 == nil || q1.ID != rev[0] {
		t.Fatalf("next1 %v %v", q1, err)
	}
	q2, _ := db.NextQueuedQuestion(ev.ID)
	if q2 == nil || q2.ID != rev[1] {
		t.Fatalf("next2 %v", q2)
	}
	// double-next safety: only one live
	active, _ := db.GetActiveQuestion(ev.ID)
	if active == nil || active.ID != rev[1] {
		t.Fatalf("active %v", active)
	}
	// exhaust
	_, _ = db.NextQueuedQuestion(ev.ID)
	empty, _ := db.NextQueuedQuestion(ev.ID)
	if empty != nil {
		t.Fatalf("expected empty")
	}
	// invalid reorder
	if err := db.ReorderQuestions(ev.ID, []int64{9999}); err == nil {
		t.Fatalf("expected error")
	}
	// admin reorder endpoint
	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/events/{id}/questions/reorder", AdminAuth(http.HandlerFunc(AdminReorderQuestions)))
	// login helper: create user/session
	// use sessionUser bypass: create session directly
	u, _ := db.CreateUser("admin", "hash", "admin")
	tok := "tok-reorder"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	body, _ := json.Marshal(map[string]any{"order": rev})
	req := httptest.NewRequest("POST", "/api/admin/events/1/questions/reorder", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	// need event id 1 exists
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	// we used id 1 but event id is ev.ID (1 likely). Check 200
	if rr.Code != 200 {
		t.Fatalf("reorder endpoint %d %s", rr.Code, rr.Body.String())
	}
}

func TestSlideAuth(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "slide.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("E", "slide-ev", "", "")
	// reset broker
	Broker.Close()
	Broker = live.New()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws/events/{code}", EventWS)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	url := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/events/" + ev.Code
	// anonymous
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	// consume state
	_, _, _ = c.Read(ctx)
	// send slide unauthorized
	data, _ := json.Marshal(map[string]any{"type": "slide", "index": 2, "total": 10, "title": "Hi"})
	_ = c.Write(ctx, websocket.MessageText, data)
	_, raw, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var env wsEnvelope
	_ = json.Unmarshal(raw, &env)
	if env.Type != "error" || env.Error != "unauthorized" {
		t.Fatalf("expected unauthorized, got %s", string(raw))
	}
	c.CloseNow()
	// authorized
	u, _ := db.CreateUser("admin2", "hash", "admin")
	tok := "tok-slide"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	// dial with cookie
	c2, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: http.Header{"Cookie": []string{"meetup_session=" + tok}}})
	if err != nil {
		t.Fatalf("dial auth: %v", err)
	}
	defer c2.CloseNow()
	_, _, _ = c2.Read(ctx) // state
	data2, _ := json.Marshal(map[string]any{"type": "slide", "index": 3, "total": 10, "title": "Slide3"})
	_ = c2.Write(ctx, websocket.MessageText, data2)
	_, raw2, err := c2.Read(ctx)
	if err != nil {
		t.Fatalf("read2: %v", err)
	}
	var env2 wsEnvelope
	_ = json.Unmarshal(raw2, &env2)
	if env2.Type != "result" {
		t.Fatalf("expected ok, got %s", string(raw2))
	}
	// BroadcastSlide should have sent a slide frame, but it's consumed as next frame; check broker cache
	if s, ok := Broker.GetSlide(ev.Code); !ok || s.Index != 3 {
		t.Fatalf("slide not cached %+v %v", s, ok)
	}
	// BuildState current_slide
	st := BuildState(ev, 0)
	if st.CurrentSlide == nil || st.CurrentSlide.Index != 3 {
		t.Fatalf("state slide %v", st.CurrentSlide)
	}
}

// TestAdminCreateQuestionFlexBool guards the integration contract between the
// admin UI (which sends auto_close/auto_reveal as 0/1 integers) and the create
// handler (which historically only accepted JSON booleans). Regression for the
// 400 "invalid json" mismatch.
func TestAdminCreateQuestionFlexBool(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "flex.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("E", "flex-ev", "", "")
	u, _ := db.CreateUser("admin", "hash", "admin")
	tok := "tok-flex"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))

	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/events/{id}/questions", AdminAuth(http.HandlerFunc(AdminCreateQuestion)))

	// integers 0/1, exactly as server/static/admin.js sends
	body := `{"kind":"poll","prompt":"Q","options":["A","B"],"duration_sec":30,"auto_close":1,"auto_reveal":1}`
	req := httptest.NewRequest("POST", "/api/admin/events/1/questions", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("integer payload should succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	qs, _ := db.ListQuestions(ev.ID)
	if len(qs) != 1 {
		t.Fatalf("expected 1 question, got %d", len(qs))
	}
	if !qs[0].AutoClose || !qs[0].AutoReveal {
		t.Fatalf("auto flags not persisted: close=%v reveal=%v", qs[0].AutoClose, qs[0].AutoReveal)
	}
	if qs[0].DurationSec != 30 {
		t.Fatalf("duration %d", qs[0].DurationSec)
	}

	// booleans must also still work (backward compatible)
	body2 := `{"kind":"poll","prompt":"Q2","options":["A","B"],"auto_close":false,"auto_reveal":true}`
	req2 := httptest.NewRequest("POST", "/api/admin/events/1/questions", bytes.NewReader([]byte(body2)))
	req2.Header.Set("Content-Type", "application/json")
	req2.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req2.SetPathValue("id", "1")
	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)
	if rr2.Code != 200 {
		t.Fatalf("boolean payload should succeed, got %d: %s", rr2.Code, rr2.Body.String())
	}
	qs2, _ := db.ListQuestions(ev.ID)
	var got *db.Question
	for i := range qs2 {
		if qs2[i].Prompt == "Q2" {
			got = &qs2[i]
		}
	}
	if got == nil || got.AutoClose || !got.AutoReveal {
		t.Fatalf("boolean flags not persisted: %+v", got)
	}
}
