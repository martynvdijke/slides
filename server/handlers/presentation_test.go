package handlers

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"slides/db"
)

// presentationFixtures boots a temp DB + media dir and returns a signed-in
// session token. Callers build the mux they need.
func presentationFixtures(t *testing.T, dbName string) string {
	t.Helper()
	if err := db.Init(filepath.Join(t.TempDir(), dbName)); err != nil {
		t.Fatalf("init: %v", err)
	}
	oldMediaDir := MediaDir
	MediaDir = t.TempDir()
	t.Cleanup(func() {
		MediaDir = oldMediaDir
		db.Close()
	})
	u, err := db.CreateUser("admin", "h", "admin")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	tok := "tok-presentation-" + dbName
	if err := db.CreateSession(tok, u, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("create session: %v", err)
	}
	return tok
}

// uploadPresentation posts a multipart file to the admin upload handler.
func uploadPresentation(t *testing.T, mux *http.ServeMux, tok string, eventID int64, filename string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if err := w.WriteField("title", "Quarterly deck"); err != nil {
		t.Fatalf("title field: %v", err)
	}
	if err := w.WriteField("speaker", "Ada"); err != nil {
		t.Fatalf("speaker field: %v", err)
	}
	fw, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("file field: %v", err)
	}
	if _, err := fw.Write(content); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}
	id := strconv.FormatInt(eventID, 10)
	req := httptest.NewRequest("POST", "/api/admin/events/"+id+"/presentations", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	req.SetPathValue("id", id)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	return rr
}

// TestPresentationUploadKeepsOriginalFilename pins the contract the admin list
// and download rely on: the bytes are stored under a unique (UUID) name, while
// the API reports and serves the original upload name.
func TestPresentationUploadKeepsOriginalFilename(t *testing.T) {
	tok := presentationFixtures(t, "presentation-upload.db")
	ev, err := db.CreateEvent("Upload", "pres-up", "", "")
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("POST /api/admin/events/{id}/presentations", AdminAuth(http.HandlerFunc(AdminUploadPresentation)))
	mux.Handle("GET /api/admin/events/{id}/presentations", AdminAuth(http.HandlerFunc(AdminListPresentations)))
	mux.Handle("GET /api/events/{code}/presentations", http.HandlerFunc(ListPublicPresentations))
	mux.Handle("GET /api/events/{code}/presentations/{id}/download", http.HandlerFunc(DownloadPresentation))
	mux.Handle("DELETE /api/admin/events/{id}/presentations/{pid}", AdminAuth(http.HandlerFunc(AdminDeletePresentation)))

	content := []byte("%PDF-1.4 e2e presentation bytes")
	rr := uploadPresentation(t, mux, tok, ev.ID, "quarterly-deck.pdf", content)
	if rr.Code != http.StatusOK {
		t.Fatalf("upload = %d %s", rr.Code, rr.Body.String())
	}
	var uploaded PresentationDTO
	if err := json.Unmarshal(rr.Body.Bytes(), &uploaded); err != nil {
		t.Fatalf("decode upload: %v", err)
	}
	if uploaded.Filename != "quarterly-deck.pdf" {
		t.Fatalf("upload filename = %q, want the original name", uploaded.Filename)
	}
	if uploaded.Title != "Quarterly deck" || uploaded.Size != int64(len(content)) {
		t.Fatalf("upload dto = %+v", uploaded)
	}

	// The row keeps the stored name for disk lookup, separate from the display name.
	row, err := db.GetPresentation(uploaded.ID)
	if err != nil || row == nil {
		t.Fatalf("get presentation: %v", err)
	}
	if row.Filename == "quarterly-deck.pdf" || row.OriginalFilename != "quarterly-deck.pdf" {
		t.Fatalf("stored name leaked into the display name: filename=%q original=%q", row.Filename, row.OriginalFilename)
	}
	if _, err := os.Stat(filepath.Join(MediaDir, row.Filename)); err != nil {
		t.Fatalf("stored file missing: %v", err)
	}

	// Both the admin and the public list report the original name.
	listNames := func(path string) []string {
		req := httptest.NewRequest("GET", path, nil)
		req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d %s", path, rec.Code, rec.Body.String())
		}
		var dtos []PresentationDTO
		if err := json.Unmarshal(rec.Body.Bytes(), &dtos); err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
		var names []string
		for _, d := range dtos {
			names = append(names, d.Filename)
		}
		return names
	}
	eid := strconv.FormatInt(ev.ID, 10)
	for _, path := range []string{
		"/api/admin/events/" + eid + "/presentations",
		"/api/events/" + ev.Code + "/presentations",
	} {
		names := listNames(path)
		if len(names) != 1 || names[0] != "quarterly-deck.pdf" {
			t.Fatalf("%s names = %v, want [quarterly-deck.pdf]", path, names)
		}
	}

	// Download round-trips the bytes and carries the original name.
	req := httptest.NewRequest("GET", uploaded.URL, nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("download = %d %s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.Bytes(); !bytes.Equal(got, content) {
		t.Fatalf("download body = %q, want round-trip of %q", got, content)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "quarterly-deck.pdf") {
		t.Fatalf("Content-Disposition = %q, want the original filename", cd)
	}

	// Deleting through the owning event removes the row and the stored bytes.
	del := httptest.NewRequest("DELETE", "/api/admin/events/"+eid+"/presentations/"+strconv.FormatInt(uploaded.ID, 10), nil)
	del.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
	drec := httptest.NewRecorder()
	mux.ServeHTTP(drec, del)
	if drec.Code != http.StatusNoContent {
		t.Fatalf("delete = %d %s", drec.Code, drec.Body.String())
	}
	if _, err := db.GetPresentation(uploaded.ID); err == nil {
		t.Fatal("presentation row still exists after delete")
	}
	if _, err := os.Stat(filepath.Join(MediaDir, row.Filename)); !os.IsNotExist(err) {
		t.Fatalf("stored file still present after delete (stat err = %v)", err)
	}
}

// TestDeletePresentationScopedToEvent pins the event in the delete path: a
// presentation must not be deletable through another event's URL.
func TestDeletePresentationScopedToEvent(t *testing.T) {
	tok := presentationFixtures(t, "presentation-scope.db")
	evA, _ := db.CreateEvent("A", "pres-a", "", "")
	evB, _ := db.CreateEvent("B", "pres-b", "", "")
	pB, err := db.CreatePresentation(evB.ID, "B deck", "", "stored-b.pdf", "b.pdf", 10)
	if err != nil {
		t.Fatalf("create presentation: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("DELETE /api/admin/events/{id}/presentations/{pid}", AdminAuth(http.HandlerFunc(AdminDeletePresentation)))
	do := func(eid, pid int64) *httptest.ResponseRecorder {
		sid := strconv.FormatInt(eid, 10)
		spid := strconv.FormatInt(pid, 10)
		req := httptest.NewRequest("DELETE", "/api/admin/events/"+sid+"/presentations/"+spid, nil)
		req.AddCookie(&http.Cookie{Name: "meetup_session", Value: tok})
		req.SetPathValue("id", sid)
		req.SetPathValue("pid", spid)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		return rr
	}

	if rr := do(evA.ID, pB.ID); rr.Code != http.StatusBadRequest {
		t.Fatalf("cross-event delete = %d %s, want 400", rr.Code, rr.Body.String())
	}
	if p, err := db.GetPresentation(pB.ID); err != nil || p == nil {
		t.Fatalf("cross-event delete removed the presentation: %v", err)
	}
	if rr := do(evA.ID, 999999); rr.Code != http.StatusNotFound {
		t.Fatalf("unknown presentation delete = %d, want 404", rr.Code)
	}
	if rr := do(evB.ID, pB.ID); rr.Code != http.StatusNoContent {
		t.Fatalf("owning event delete = %d %s, want 204", rr.Code, rr.Body.String())
	}
}
