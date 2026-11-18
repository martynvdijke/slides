package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"slides/db"
)

func mustAdmin(t *testing.T) (string, *http.ServeMux) {
	t.Helper()
	uid, _ := db.CreateUser("admin-ops", "hash", "admin")
	tok := "tok-ops-admin-ops"
	_ = db.CreateSession(tok, uid, time.Now().Add(time.Hour))
	return tok, nil
}

func TestCloneEndpoint(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ops-clone.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("Orig", "orig-code", "desc", "")
	_, _ = db.CreateQuestion(ev.ID, "poll", "live", "Q", []string{"A", "B"}, false, true, 0, "", "")
	u, _ := db.CreateUser("admin", "h", "admin")
	tok := "tok1"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/events/{id}/clone", AdminAuth(http.HandlerFunc(AdminCloneEvent)))
	req := httptest.NewRequest("POST", "/api/admin/events/1/clone", bytes.NewReader([]byte(`{"name":"NewName"}`)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("clone %d %s", rr.Code, rr.Body.String())
	}
	var dto EventDTO
	_ = json.Unmarshal(rr.Body.Bytes(), &dto)
	if dto.Name != "NewName" {
		t.Fatalf("name %s", dto.Name)
	}
}

func TestCloneCopiesEventSettings(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ops-clone-settings.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("Orig", "orig-settings", "desc", "")
	_, _ = db.UpdateEvent(ev.ID, map[string]any{
		"qa_slow_mode_s":      30,
		"feature_live":        false,
		"feature_qa":          true,
		"feature_slides":      false,
		"feature_feedback":    false,
		"feature_leaderboard": true,
	})
	_, _ = db.CreateQuestion(ev.ID, "poll", "live", "Q", []string{"A", "B"}, false, true, 0, "", "")
	u, _ := db.CreateUser("admin", "h", "admin")
	tok := "tok-clone-settings"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/events/{id}/clone", AdminAuth(http.HandlerFunc(AdminCloneEvent)))
	body, _ := json.Marshal(map[string]any{"name": "Copy"})
	id := strconv.FormatInt(ev.ID, 10)
	req := httptest.NewRequest("POST", "/api/admin/events/"+id+"/clone", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req.SetPathValue("id", id)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("clone %d %s", rr.Code, rr.Body.String())
	}
	var dto EventDTO
	if err := json.Unmarshal(rr.Body.Bytes(), &dto); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if dto.ID == ev.ID {
		t.Fatal("clone reuses the source event id")
	}
	if dto.Code == ev.Code || dto.RoomCode == "" || dto.RoomCode == ev.RoomCode {
		t.Fatalf("clone needs its own code and room code, got %q / %q", dto.Code, dto.RoomCode)
	}
	if dto.QASlowModeS != 30 {
		t.Fatalf("qa_slow_mode_s = %d, want 30", dto.QASlowModeS)
	}
	if dto.FeatureLive || !dto.FeatureQA || dto.FeatureSlides || dto.FeatureFeedback || !dto.FeatureLeaderboard {
		t.Fatalf("feature flags not copied: live=%v qa=%v slides=%v feedback=%v leaderboard=%v",
			dto.FeatureLive, dto.FeatureQA, dto.FeatureSlides, dto.FeatureFeedback, dto.FeatureLeaderboard)
	}
	qs, err := db.ListQuestions(dto.ID)
	if err != nil || len(qs) != 1 || qs[0].Prompt != "Q" || qs[0].Status != "draft" {
		t.Fatalf("cloned questions = %v (err %v)", qs, err)
	}
}

func TestWebhookSettingsSecretWriteOnly(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ops-web.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	u, _ := db.CreateUser("admin", "h", "admin")
	tok := "tok2"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	mux := http.NewServeMux()
	mux.Handle("PUT /api/admin/settings/webhooks", AdminAuth(http.HandlerFunc(AdminUpdateWebhookSettings)))
	mux.Handle("GET /api/admin/settings/webhooks", AdminAuth(http.HandlerFunc(AdminGetWebhookSettings)))
	// put with secret
	body, _ := json.Marshal(map[string]any{"url": "https://example.com/hook", "secret": "s3cr3t", "enabled": true, "events": []string{"qa.created"}})
	req := httptest.NewRequest("PUT", "/api/admin/settings/webhooks", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("put %d %s", rr.Code, rr.Body.String())
	}
	// get should not leak secret
	req2 := httptest.NewRequest("GET", "/api/admin/settings/webhooks", nil)
	req2.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)
	if rr2.Code != 200 {
		t.Fatalf("get %d", rr2.Code)
	}
	var out map[string]any
	_ = json.Unmarshal(rr2.Body.Bytes(), &out)
	if out["webhook_secret_set"] != true {
		t.Fatalf("expected secret_set true %v", out)
	}
	if _, ok := out["secret"]; ok {
		t.Fatalf("secret leaked")
	}
	// put without secret preserves
	body2, _ := json.Marshal(map[string]any{"url": "https://example.com/hook2", "enabled": true})
	req3 := httptest.NewRequest("PUT", "/api/admin/settings/webhooks", bytes.NewReader(body2))
	req3.Header.Set("Content-Type", "application/json")
	req3.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	rr3 := httptest.NewRecorder()
	mux.ServeHTTP(rr3, req3)
	if rr3.Code != 200 {
		t.Fatalf("put2 %d %s", rr3.Code, rr3.Body.String())
	}
	// verify still set
	_, sec, _, _, _ := db.GetWebhookSettings()
	if sec != "s3cr3t" {
		t.Fatalf("secret not preserved %q", sec)
	}
}

func TestWebhookTestAction(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ops-webtest.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	// fake webhook receiver
	recv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte("ok-received"))
	}))
	defer recv.Close()
	_ = db.UpdateWebhookSettings(recv.URL, "", true, []string{})
	u, _ := db.CreateUser("admin", "h", "admin")
	tok := "tok3"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/settings/webhooks/test", AdminAuth(http.HandlerFunc(AdminTestWebhook)))
	req := httptest.NewRequest("POST", "/api/admin/settings/webhooks/test", nil)
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("test %d %s", rr.Code, rr.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	if out["status"] == nil || out["body"] == nil {
		t.Fatalf("missing fields %v", out)
	}
}

func TestReportEndpoint(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ops-report.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("E", "rep-code", "desc", "")
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "<script>alert(1)</script>", []string{"A", "B"}, false, true, 0, "", "")
	pid, _ := db.GetOrCreateParticipant("tok-r", ev.ID)
	_, _, _, _ = db.UpsertAnswerWithScoring(q.ID, pid, "A", "")
	_, _ = db.CreateQA(ev.ID, "q body", "author")
	// approve QA
	qa, _ := db.ListQA(ev.ID)
	for _, qq := range qa {
		_ = db.UpdateQAStatus(qq.ID, "approved")
	}
	u, _ := db.CreateUser("admin", "h", "admin")
	tok := "tok4"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	mux := http.NewServeMux()
	mux.Handle("GET /api/admin/events/{id}/report", AdminAuth(http.HandlerFunc(AdminEventReport)))
	req := httptest.NewRequest("GET", "/api/admin/events/1/report", nil)
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req.SetPathValue("id", "1")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("report %d %s", rr.Code, rr.Body.String())
	}
	ct := rr.Header().Get("Content-Type")
	if !strings.Contains(ct, "text/html") {
		t.Fatalf("ct %s", ct)
	}
	body := rr.Body.String()
	if strings.Contains(body, "<script>alert") {
		t.Fatalf("not escaped")
	}
	if !strings.Contains(body, "&lt;script&gt;") {
		t.Fatalf("expected escaped prompt")
	}
	// empty event report
	ev2, _ := db.CreateEvent("Empty", "empty-code", "", "")
	req2 := httptest.NewRequest("GET", "/api/admin/events/2/report", nil)
	req2.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req2.SetPathValue("id", "2")
	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)
	if rr2.Code != 200 || !strings.Contains(rr2.Body.String(), "<html") {
		t.Fatalf("empty report failed %d %s", rr2.Code, rr2.Body.String())
	}
	_ = ev2
}
