package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"slides/db"
)

func TestDeleteQuestionScopedToEvent(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "admin-delete.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	evA, _ := db.CreateEvent("A", "del-a", "", "")
	evB, _ := db.CreateEvent("B", "del-b", "", "")
	qB, _ := db.CreateQuestion(evB.ID, "poll", "live", "Q", []string{"A", "B"}, false, true, 0, "", "")
	if err := db.ActivateQuestion(evB.ID, qB.ID, nil); err != nil {
		t.Fatalf("activate: %v", err)
	}
	u, _ := db.CreateUser("admin", "h", "admin")
	tok := "tok-admin-delete"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	mux := http.NewServeMux()
	mux.Handle("DELETE /api/admin/events/{id}/questions/{qid}", AdminAuth(http.HandlerFunc(AdminDeleteQuestion)))
	do := func(eid, qid int64) *httptest.ResponseRecorder {
		sid := strconv.FormatInt(eid, 10)
		sqid := strconv.FormatInt(qid, 10)
		req := httptest.NewRequest("DELETE", "/api/admin/events/"+sid+"/questions/"+sqid, nil)
		req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
		req.SetPathValue("id", sid)
		req.SetPathValue("qid", sqid)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		return rr
	}

	// A mismatched event id must not delete another event's question.
	if rr := do(evA.ID, qB.ID); rr.Code != http.StatusBadRequest {
		t.Fatalf("cross-event delete = %d %s, want 400", rr.Code, rr.Body.String())
	}
	if q, err := db.GetQuestion(qB.ID); err != nil || q == nil {
		t.Fatalf("cross-event delete removed the question: %v", err)
	}

	// An unknown question id is a 404, not a silent success.
	if rr := do(evA.ID, 999999); rr.Code != http.StatusNotFound {
		t.Fatalf("unknown question delete = %d, want 404", rr.Code)
	}

	// The owning event deletes it and the live question stops being active.
	if rr := do(evB.ID, qB.ID); rr.Code != http.StatusNoContent {
		t.Fatalf("delete = %d %s, want 204", rr.Code, rr.Body.String())
	}
	if _, err := db.GetQuestion(qB.ID); err == nil {
		t.Fatal("question still exists after delete")
	}
	if active, err := db.GetActiveQuestion(evB.ID); err == nil && active != nil {
		t.Fatalf("deleted live question still active: %+v", active)
	}
}

// TestQuestionPointsBaseValidation pins the scoring boundary: a negative base
// would subtract from a participant's total and an absurd base would dwarf
// every other question, so both are rejected before the score is ever stored.
func TestQuestionPointsBaseValidation(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "admin-points.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("Points", "points-a", "", "")
	q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q", []string{"A", "B"}, false, true, 0, "", "")
	if _, err := db.UpdateQuestion(q.ID, map[string]any{"points_base": 100}); err != nil {
		t.Fatalf("seed points_base: %v", err)
	}
	u, _ := db.CreateUser("admin", "h", "admin")
	tok := "tok-admin-points"
	_ = db.CreateSession(tok, u, time.Now().Add(time.Hour))
	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/events/{id}/questions", AdminAuth(http.HandlerFunc(AdminCreateQuestion)))
	mux.Handle("PATCH /api/admin/events/{id}/questions/{qid}", AdminAuth(http.HandlerFunc(AdminUpdateQuestion)))
	eid := strconv.FormatInt(ev.ID, 10)

	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		return rr
	}

	// Creating with a negative base is a 400 and creates nothing.
	before, _ := db.ListQuestions(ev.ID)
	rr := do("POST", "/api/admin/events/"+eid+"/questions", `{"kind":"poll","prompt":"Bad","options":["A","B"],"points_base":-50}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("negative create = %d %s, want 400", rr.Code, rr.Body.String())
	}
	after, _ := db.ListQuestions(ev.ID)
	if len(after) != len(before) {
		t.Fatalf("rejected create still inserted a question: %d -> %d", len(before), len(after))
	}

	// Updating to a negative base is a 400 and leaves the stored value alone.
	qid := strconv.FormatInt(q.ID, 10)
	if rr := do("PATCH", "/api/admin/events/"+eid+"/questions/"+qid, `{"points_base":-1}`); rr.Code != http.StatusBadRequest {
		t.Fatalf("negative update = %d %s, want 400", rr.Code, rr.Body.String())
	}
	got, _ := db.GetQuestion(q.ID)
	if got.PointsBase != 100 {
		t.Fatalf("points_base after rejected update = %d, want 100", got.PointsBase)
	}

	// The documented bounds stay accepted.
	if rr := do("PATCH", "/api/admin/events/"+eid+"/questions/"+qid, `{"points_base":10000}`); rr.Code != http.StatusOK {
		t.Fatalf("max update = %d %s, want 200", rr.Code, rr.Body.String())
	}
	if rr := do("PATCH", "/api/admin/events/"+eid+"/questions/"+qid, `{"points_base":0}`); rr.Code != http.StatusOK {
		t.Fatalf("zero update = %d %s, want 200 (0 means unset)", rr.Code, rr.Body.String())
	}
}
