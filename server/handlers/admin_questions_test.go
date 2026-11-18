package handlers

import (
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
