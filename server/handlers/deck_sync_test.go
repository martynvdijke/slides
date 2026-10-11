package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"slides/db"
	"slides/live"
)

func setupDeckTest(t *testing.T) (int64, string) {
	t.Helper()
	if err := db.Init(filepath.Join(t.TempDir(), "deck.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func(){ db.Close() })
	Broker.Close()
	Broker = live.New()
	ev, _ := db.CreateEvent("E", "deck-ev", "", "")
	u, _ := db.CreateUser("admin", "hash", "admin")
	tok := "tok-deck"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	return ev.ID, tok
}

func doDeckSync(t *testing.T, eid int64, tok string, body any) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/events/{id}/deck/sync", AdminAuth(http.HandlerFunc(AdminDeckSync)))
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/admin/events/1/deck/sync", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req.SetPathValue("id", "1")
	_ = eid
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	return rr
}

func TestDeckSyncIdempotent(t *testing.T) {
	eid, tok := setupDeckTest(t)
	slides := []map[string]any{
		{"slide_id":"s03-poll-cicd","position":12,"prompt":"Q1","kind":"poll","options":[]string{"a","b"},"points_base":100,"correct_index":1,"duration_sec":0,"time_limit_s":30,"show_results":true,"activate":"auto"},
		{"slide_id":"s04","position":13,"prompt":"Q2","kind":"poll","options":[]string{"x","y"},"points_base":100,"show_results":true,"activate":"auto"},
	}
	body := map[string]any{"deck_slug":"meetup","slides":slides}
	rr := doDeckSync(t, eid, tok, body)
	if rr.Code != 200 { t.Fatalf("first sync %d %s", rr.Code, rr.Body.String()) }
	var res map[string]int
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if res["created"]!=2 || res["synced"]!=2 { t.Fatalf("res %+v",res) }
	// second sync same
	rr2 := doDeckSync(t, eid, tok, body)
	if rr2.Code != 200 { t.Fatalf("second sync %d %s", rr2.Code, rr2.Body.String()) }
	_ = json.Unmarshal(rr2.Body.Bytes(), &res)
	if res["created"]!=0 || res["updated"]!=2 { t.Fatalf("second res %+v",res) }
	// ensure no duplicates
	qs, _ := db.ListQuestions(eid)
	if len(qs)!=2 { t.Fatalf("expected 2 questions got %d",len(qs)) }
	// prune one
	slides2 := slides[:1]
	body2 := map[string]any{"deck_slug":"meetup","slides":slides2}
	rr3 := doDeckSync(t, eid, tok, body2)
	_ = json.Unmarshal(rr3.Body.Bytes(), &res)
	if res["archived"]!=1 { t.Fatalf("archived %+v",res) }
	// pruned question should be closed not deleted
	q, _ := db.FindQuestionByExternalID(eid, "meetup:s04")
	if q==nil { t.Fatalf("pruned question not found") }
	if q.Status!="closed" { t.Fatalf("pruned status %s",q.Status) }
	// answers preserved? add answer then prune already tested not deleted
}

func TestAutoActivation(t *testing.T) {
	eid, tok := setupDeckTest(t)
	slides := []map[string]any{
		{"slide_id":"s01","position":5,"prompt":"Q1","kind":"poll","options":[]string{"a","b"},"points_base":100,"show_results":true,"activate":"auto"},
		{"slide_id":"s02","position":6,"prompt":"Q2","kind":"poll","options":[]string{"a","b"},"points_base":100,"show_results":true,"activate":"manual"},
	}
	body := map[string]any{"deck_slug":"meetup","slides":slides}
	rr := doDeckSync(t, eid, tok, body)
	if rr.Code != 200 { t.Fatalf("sync %d %s", rr.Code, rr.Body.String()) }
	// auto activate s01 via slideID
	if err:=ActivateQuestionForSlide(eid, 99, "s01", "meetup"); err != nil { t.Fatalf("activate %v",err) }
	q1, _ := db.FindQuestionByExternalID(eid, "meetup:s01")
	if q1.Status!="live" { t.Fatalf("q1 not live %s",q1.Status) }
	// re-navigate no-op
	if err:=ActivateQuestionForSlide(eid, 99, "s01", "meetup"); err != nil { t.Fatalf("re-activate %v",err) }
	q1b, _ := db.FindQuestionByExternalID(eid, "meetup:s01")
	if q1b.Status!="live" { t.Fatalf("q1b status %s",q1b.Status) }
	// manual should not auto-activate
	if err:=ActivateQuestionForSlide(eid, 6, "s02", "meetup"); err != nil { t.Fatalf("activate manual %v",err) }
	q2, _ := db.FindQuestionByExternalID(eid, "meetup:s02")
	if q2.Status!="draft" { t.Fatalf("manual auto-activated %s",q2.Status) }
	// fallback position: sync with position 10, navigate via index without id
	slides2 := []map[string]any{
		{"slide_id":"s03","position":10,"prompt":"Q3","kind":"poll","options":[]string{"a","b"},"show_results":true,"activate":"auto"},
	}
	body2 := map[string]any{"deck_slug":"other","slides":slides2}
	rr2 := doDeckSync(t, eid, tok, body2)
	if rr2.Code != 200 { t.Fatalf("sync2 %d %s", rr2.Code, rr2.Body.String()) }
// slides without id must not auto-activate
	if err:=ActivateQuestionForSlide(eid, 10, "", ""); err != nil { t.Fatalf("fallback %v",err) }
	q3, _ := db.FindQuestionByExternalID(eid, "other:s03")
	if q3.Status!="draft" { t.Fatalf("fallback should stay draft without id, got %s",q3.Status) }
	// with id it activates
	if err:=ActivateQuestionForSlide(eid, 10, "s03", "other"); err != nil { t.Fatalf("with id %v",err) }
	q3b, _ := db.FindQuestionByExternalID(eid, "other:s03")
	if q3b.Status!="live" { t.Fatalf("with id not live %s",q3b.Status) }
}

func TestInvalidKind(t *testing.T) {
	eid, tok := setupDeckTest(t)
	body := map[string]any{"deck_slug":"meetup","slides":[]map[string]any{{"slide_id":"s01","position":1,"prompt":"Q","kind":"badkind","options":[]string{"a","b"}}}}
	rr := doDeckSync(t, eid, tok, body)
	if rr.Code != 400 { t.Fatalf("expected 400 got %d %s", rr.Code, rr.Body.String()) }
	qs, _ := db.ListQuestions(eid)
	if len(qs)!=0 { t.Fatalf("should have 0 questions") }
}

func TestGrid2x2(t *testing.T) {
	if !db.ValidQuestionKind("grid2x2") { t.Fatalf("grid2x2 not valid") }
	_, err := db.ValidateAnswer("grid2x2", nil, `{"x":0.5,"y":0.3}`)
	if err != nil { t.Fatalf("valid grid %v",err) }
	_, err = db.ValidateAnswer("grid2x2", nil, `{"x":2,"y":0}`)
	if err==nil { t.Fatalf("expected error for out of range") }
}

func TestNonDeckUnchanged(t *testing.T) {
	eid, _ := setupDeckTest(t)
	q, _ := db.CreateQuestion(eid, "poll", "live", "manual", []string{"a","b"}, false, true, 0, "", "")
	if err:=db.ActivateQuestion(eid, q.ID, nil); err != nil { t.Fatalf("activate %v",err) }
	fresh, _ := db.GetQuestion(q.ID)
	if fresh.Status!="live" { t.Fatalf("not live") }
	if err:=db.CloseQuestion(eid, q.ID); err!=nil { t.Fatalf("close %v",err) }
	fresh2,_:=db.GetQuestion(q.ID)
	if fresh2.Status!="closed" { t.Fatalf("not closed") }
}

func TestCrossEventAutoJoin(t *testing.T) {
    if err := db.Init(filepath.Join(t.TempDir(), "cross.db")); err != nil { t.Fatalf("init %v", err) }
    defer db.Close()
    evA, _ := db.CreateEvent("A", "ev-a", "", "")
    evB, _ := db.CreateEvent("B", "ev-b", "", "")
    // participant for A only
    tok := "cross-participant-token"
    pidA, _ := db.GetOrCreateParticipant(tok, evA.ID)
    _ = pidA
    // request B with A's participant cookie -> should auto-join 200, not 401
    mux := http.NewServeMux()
    mux.HandleFunc("GET /api/events/{code}/state", GetEventState)
    req := httptest.NewRequest("GET", "/api/events/ev-b/state", nil)
    req.SetPathValue("code", "ev-b")
    req.AddCookie(&http.Cookie{Name: "meetup_participant", Value: tok})
    rr := httptest.NewRecorder()
    mux.ServeHTTP(rr, req)
    if rr.Code != 200 {
        t.Fatalf("expected 200 auto-join got %d %s", rr.Code, rr.Body.String())
    }
    // should have set new join cookie and participant for B
    hasJoin := false
    for _, c := range rr.Result().Cookies() {
        if c.Name == "meetup_join" { hasJoin = true }
    }
    if !hasJoin { t.Fatalf("expected meetup_join cookie") }
    _ = evB
}

func TestDeckPruneReaddResetsDraft(t *testing.T) {
    eid, tok := setupDeckTest(t)
    body := map[string]any{"deck_slug":"meetup","slides":[]map[string]any{{"slide_id":"s04","position":1,"prompt":"Q","kind":"poll","options":[]string{"a","b"},"show_results":true,"activate":"auto"}}}
    rr := doDeckSync(t, eid, tok, body)
    if rr.Code != 200 { t.Fatalf("sync %d", rr.Code) }
    // prune
    rr2 := doDeckSync(t, eid, tok, map[string]any{"deck_slug":"meetup","slides":[]map[string]any{}})
    if rr2.Code != 200 { t.Fatalf("prune %d", rr2.Code) }
    q, _ := db.FindQuestionByExternalID(eid, "meetup:s04")
    if q.Status != "closed" { t.Fatalf("pruned not closed %s", q.Status) }
    // re-add
    rr3 := doDeckSync(t, eid, tok, body)
    if rr3.Code != 200 { t.Fatalf("readd %d", rr3.Code) }
    q2, _ := db.FindQuestionByExternalID(eid, "meetup:s04")
    if q2.Status != "draft" { t.Fatalf("re-added should be draft got %s", q2.Status) }
}

func TestPartialIndexNegative(t *testing.T) {
    eid, tok := setupDeckTest(t)
    // manual question with external_id=''
    q, _ := db.CreateQuestion(eid, "poll", "live", "manual", []string{"a","b"}, false, true, 99, "", "")
    // deck sync should not overwrite it
    body := map[string]any{"deck_slug":"meetup","slides":[]map[string]any{{"slide_id":"s99","position":99,"prompt":"deck","kind":"poll","options":[]string{"x","y"},"show_results":true}}}
    rr := doDeckSync(t, eid, tok, body)
    if rr.Code != 200 { t.Fatalf("sync %d", rr.Code) }
    manual, _ := db.GetQuestion(q.ID)
    if manual.Prompt != "manual" { t.Fatalf("manual overwritten %s", manual.Prompt) }
    // empty slides should not touch manual
    rr2 := doDeckSync(t, eid, tok, map[string]any{"deck_slug":"meetup","slides":[]map[string]any{}})
    if rr2.Code != 200 { t.Fatalf("empty sync %d", rr2.Code) }
    manual2, _ := db.GetQuestion(q.ID)
    if manual2.Status != manual.Status { t.Fatalf("manual status changed") }
}

func TestActivationThrottleCoalescing(t *testing.T) {
    eid, tok := setupDeckTest(t)
    slides := []map[string]any{
        {"slide_id":"sThrottle1","position":1,"prompt":"Q1","kind":"poll","options":[]string{"a","b"},"show_results":true,"activate":"auto"},
        {"slide_id":"sThrottle2","position":2,"prompt":"Q2","kind":"poll","options":[]string{"a","b"},"show_results":true,"activate":"auto"},
    }
    body := map[string]any{"deck_slug":"meetup","slides":slides}
    rr := doDeckSync(t, eid, tok, body)
    if rr.Code != 200 { t.Fatalf("sync %d", rr.Code) }
    // two slides <200ms apart - both should activate despite throttle
    _ = ActivateQuestionForSlide(eid, 1, "sThrottle1", "meetup")
    _ = ActivateQuestionForSlide(eid, 2, "sThrottle2", "meetup")
    q1, _ := db.FindQuestionByExternalID(eid, "meetup:sThrottle1")
    q2, _ := db.FindQuestionByExternalID(eid, "meetup:sThrottle2")
    // first is closed (second activation closes first), second live - both were activated
    if q2.Status != "live" { t.Fatalf("q2 not live %s", q2.Status) }
    // q1 should be closed not draft, proving it was activated
    if q1.Status == "draft" { t.Fatalf("q1 still draft, throttle dropped activation") }
}
