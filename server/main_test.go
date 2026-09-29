package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// resetCORS restores the package-level CORS state. Tests in this file mutate
// globals, so they must not run in parallel.
func resetCORS() {
	corsAllowAll = false
	corsAllowed = map[string]bool{}
}

func corsRequest(t *testing.T, method, origin string) *httptest.ResponseRecorder {
	t.Helper()
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(method, "/api/events/demo/state", nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	withMiddleware(next).ServeHTTP(rec, req)
	return rec
}

func TestCORSDefaultReflectsOriginWithoutCredentials(t *testing.T) {
	resetCORS()
	t.Cleanup(resetCORS)

	rec := corsRequest(t, http.MethodGet, "https://example.github.io")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://example.github.io" {
		t.Fatalf("Allow-Origin = %q, want reflected origin", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
		t.Fatalf("Allow-Credentials = %q, want empty by default", got)
	}
}

func TestCORSNoOriginHasNoHeaders(t *testing.T) {
	resetCORS()
	t.Cleanup(resetCORS)

	rec := corsRequest(t, http.MethodGet, "")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Allow-Origin = %q, want empty when no Origin", got)
	}
}

func TestCORSAllowlistGrantsCredentials(t *testing.T) {
	resetCORS()
	t.Setenv("CORS_ORIGINS", "https://martynvdijke.github.io")
	initCORS()
	t.Cleanup(resetCORS)

	rec := corsRequest(t, http.MethodGet, "https://martynvdijke.github.io")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://martynvdijke.github.io" {
		t.Fatalf("Allow-Origin = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Allow-Credentials = %q, want true for allowlisted origin", got)
	}
}

func TestCORSAllowlistNormalizesTrailingSlash(t *testing.T) {
	resetCORS()
	t.Setenv("CORS_ORIGINS", "https://martynvdijke.github.io/")
	initCORS()
	t.Cleanup(resetCORS)

	rec := corsRequest(t, http.MethodGet, "https://martynvdijke.github.io")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://martynvdijke.github.io" {
		t.Fatalf("Allow-Origin = %q, want match despite configured trailing slash", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Allow-Credentials = %q, want true", got)
	}
}

func TestCORSUnlistedOriginGetsNoCredentials(t *testing.T) {
	resetCORS()
	t.Setenv("CORS_ORIGINS", "https://martynvdijke.github.io")
	initCORS()
	t.Cleanup(resetCORS)

	rec := corsRequest(t, http.MethodGet, "https://evil.example")
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
		t.Fatalf("Allow-Credentials = %q, want empty for unlisted origin", got)
	}
}

func TestCORSWildcardHasNoCredentials(t *testing.T) {
	resetCORS()
	t.Setenv("CORS_ORIGINS", "*")
	initCORS()
	t.Cleanup(resetCORS)

	rec := corsRequest(t, http.MethodGet, "https://anything.example")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Allow-Origin = %q, want *", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
		t.Fatalf("Allow-Credentials = %q, want empty for wildcard", got)
	}
}

func TestCORSPreflight(t *testing.T) {
	resetCORS()
	t.Setenv("CORS_ORIGINS", "https://martynvdijke.github.io")
	initCORS()
	t.Cleanup(resetCORS)

	rec := corsRequest(t, http.MethodOptions, "https://martynvdijke.github.io")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatal("Allow-Methods missing on preflight")
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Allow-Credentials = %q, want true", got)
	}
}

func TestInitCORSParsesCommaSeparatedList(t *testing.T) {
	resetCORS()
	t.Setenv("CORS_ORIGINS", "https://a.example, https://b.example/ ,")
	initCORS()
	t.Cleanup(resetCORS)

	if _, ok := corsAllowed["https://a.example"]; !ok {
		t.Fatal("expected https://a.example in allowlist")
	}
	if _, ok := corsAllowed["https://b.example"]; !ok {
		t.Fatal("expected trailing slash trimmed for https://b.example")
	}
	if corsAllowAll {
		t.Fatal("corsAllowAll should be false")
	}
}
