package handlers

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"slides/db"
)

// TestCorrectIndexValidation verifies that the optional correct answer is only
// accepted on the scored kinds (poll/yesno) and must point at one of the
// available options, on both the create and update admin paths.
func TestCorrectIndexValidation(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "correct_index.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	srv := httptest.NewServer(quizMux())
	defer srv.Close()

	client := newJarClient(t)
	if code, _ := postJSON(t, client, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}
	code, created := postJSON(t, client, srv.URL+"/api/admin/events", map[string]any{"name": "Correct Index"})
	if code != http.StatusOK {
		t.Fatalf("create event = %d (%v)", code, created)
	}
	eid := int64(created["id"].(float64))
	qs := srv.URL + "/api/admin/events/" + strconv.FormatInt(eid, 10) + "/questions"

	create := func(body map[string]any) (int, map[string]any) {
		return postJSON(t, client, qs, body)
	}

	t.Run("poll in range ok", func(t *testing.T) {
		c, q := create(map[string]any{"kind": "poll", "prompt": "p", "options": []string{"a", "b", "c"}, "correct_index": 2})
		if c != http.StatusOK {
			t.Fatalf("got %d (%v), want 200", c, q)
		}
	})

	t.Run("poll out of range rejected", func(t *testing.T) {
		if c, _ := create(map[string]any{"kind": "poll", "prompt": "p", "options": []string{"a", "b"}, "correct_index": 2}); c != http.StatusBadRequest {
			t.Fatalf("got %d, want 400", c)
		}
	})

	t.Run("poll negative rejected", func(t *testing.T) {
		if c, _ := create(map[string]any{"kind": "poll", "prompt": "p", "options": []string{"a", "b"}, "correct_index": -1}); c != http.StatusBadRequest {
			t.Fatalf("got %d, want 400", c)
		}
	})

	t.Run("yesno 0/1 ok and 2 rejected", func(t *testing.T) {
		if c, q := create(map[string]any{"kind": "yesno", "prompt": "p", "correct_index": 1}); c != http.StatusOK {
			t.Fatalf("yesno correct 1 got %d (%v)", c, q)
		}
		if c, _ := create(map[string]any{"kind": "yesno", "prompt": "p", "correct_index": 2}); c != http.StatusBadRequest {
			t.Fatalf("yesno correct 2 got %d, want 400", c)
		}
	})

	t.Run("non-scorable kind rejected", func(t *testing.T) {
		if c, _ := create(map[string]any{"kind": "multi", "prompt": "p", "options": []string{"a", "b"}, "correct_index": 0}); c != http.StatusBadRequest {
			t.Fatalf("multi correct got %d, want 400", c)
		}
	})

	t.Run("omitting correct stays non-scored", func(t *testing.T) {
		c, q := create(map[string]any{"kind": "poll", "prompt": "p", "options": []string{"a", "b"}})
		if c != http.StatusOK {
			t.Fatalf("got %d (%v), want 200", c, q)
		}
		if _, present := q["correct_index"]; present {
			t.Fatalf("expected no correct_index, got %v", q["correct_index"])
		}
	})

	// Update path.
	_, q := create(map[string]any{"kind": "poll", "prompt": "upd", "options": []string{"a", "b"}})
	qid := int64(q["id"].(float64))
	patch := func(body map[string]any) (int, map[string]any) {
		return patchJSON(t, client, qs+"/"+strconv.FormatInt(qid, 10), body)
	}

	t.Run("update out of range rejected", func(t *testing.T) {
		if c, _ := patch(map[string]any{"correct_index": 5}); c != http.StatusBadRequest {
			t.Fatalf("got %d, want 400", c)
		}
	})

	t.Run("update in range ok then clear ok", func(t *testing.T) {
		if c, body := patch(map[string]any{"correct_index": 1}); c != http.StatusOK {
			t.Fatalf("set got %d (%v), want 200", c, body)
		}
		c, body := patch(map[string]any{"correct_index": nil})
		if c != http.StatusOK {
			t.Fatalf("clear got %d (%v), want 200", c, body)
		}
		if _, present := body["correct_index"]; present {
			t.Fatalf("expected correct_index cleared, got %v", body["correct_index"])
		}
	})

	t.Run("update kind to non-scorable with correct rejected", func(t *testing.T) {
		if c, _ := patch(map[string]any{"kind": "open", "correct_index": 0}); c != http.StatusBadRequest {
			t.Fatalf("got %d, want 400", c)
		}
	})
}
