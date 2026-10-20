package handlers

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"slides/db"
)

// A missing row must stay a 404, but a broken store must surface as 500
// instead of being reported as "not found".
func TestLookupErrorsAreNotCollapsedInto404(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "lookup-errors.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()

	missing := httptest.NewRequest(http.MethodGet, "/api/admin/events/999/report", nil)
	missing.SetPathValue("id", "999")
	rec := httptest.NewRecorder()
	AdminEventReport(rec, missing)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing event status = %d, want 404", rec.Code)
	}

	if _, err := db.DB.Exec("DROP TABLE events"); err != nil {
		t.Fatalf("drop events: %v", err)
	}
	broken := httptest.NewRequest(http.MethodGet, "/api/admin/events/999/report", nil)
	broken.SetPathValue("id", "999")
	rec = httptest.NewRecorder()
	AdminEventReport(rec, broken)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("database error status = %d, want 500; body=%s", rec.Code, rec.Body.String())
	}
}
