package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"slides/db"
)

// featureMux wires the routes the new features rely on.
func featureMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/setup", Setup)
	mux.HandleFunc("POST /api/auth/login", Login)
	mux.Handle("GET /api/auth/me", AuthMiddleware(http.HandlerFunc(Me)))
	mux.Handle("POST /api/admin/events", AdminAuth(http.HandlerFunc(AdminCreateEvent)))
	mux.Handle("POST /api/admin/events/{id}/questions", AdminAuth(http.HandlerFunc(AdminCreateQuestion)))
	mux.Handle("POST /api/admin/events/{id}/questions/{qid}/activate", AdminAuth(http.HandlerFunc(AdminActivateQuestion)))
	mux.Handle("GET /api/admin/events/{id}/leaderboard", AdminAuth(http.HandlerFunc(AdminGetLeaderboard)))
	mux.HandleFunc("GET /api/events/{code}/state", GetEventState)
	mux.HandleFunc("GET /api/events/{code}/leaderboard", PublicGetLeaderboard)
	mux.HandleFunc("POST /api/events/{code}/answers", SubmitAnswer)
	mux.HandleFunc("GET /ws/events/{code}", EventWS)
	return mux
}

// TestSetupSignsIn verifies the new behavior: POST /api/setup establishes a
// session so /api/auth/me works without a separate login.
func TestSetupSignsIn(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "setup.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	srv := httptest.NewServer(featureMux())
	defer srv.Close()

	client := newJarClient(t)
	code, body := postJSON(t, client, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"})
	if code != http.StatusOK {
		t.Fatalf("setup status = %d (%v)", code, body)
	}
	// Setup response now carries the signed-in user.
	user, _ := body["user"].(map[string]any)
	if user == nil || user["username"] != "admin" {
		t.Fatalf("setup response missing user: %v", body)
	}

	// Without a separate login, me should succeed thanks to the setup cookie.
	resp, err := client.Get(srv.URL + "/api/auth/me")
	if err != nil {
		t.Fatalf("me: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("me after setup = %d, want 200 (setup should set session cookie)", resp.StatusCode)
	}
}

// TestScoringHTTPFlow drives the full scored-poll flow through the REST API.
func TestScoringHTTPFlow(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "scoring_http.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	oldMediaDir := MediaDir
	MediaDir = t.TempDir()
	t.Cleanup(func() { MediaDir = oldMediaDir })

	srv := httptest.NewServer(featureMux())
	defer srv.Close()

	client := newJarClient(t)
	if code, _ := postJSON(t, client, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}

	code, created := postJSON(t, client, srv.URL+"/api/admin/events", map[string]any{"name": "Scoring Event"})
	if code != http.StatusOK {
		t.Fatalf("create event = %d (%v)", code, created)
	}
	eventID := int64(created["id"].(float64))
	eventCode, _ := created["code"].(string)

	qCode, q := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions", map[string]any{
		"kind":          "poll",
		"prompt":        "Which cloud?",
		"options":       []string{"AWS", "GCP", "Azure"},
		"correct_index": 1,
		"points_base":   100,
	})
	if qCode != http.StatusOK {
		t.Fatalf("create question = %d (%v)", qCode, q)
	}
	qid := int64(q["id"].(float64))
	if ci, ok := q["correct_index"].(float64); !ok || int(ci) != 1 {
		t.Fatalf("create response correct_index = %v, want 1", q["correct_index"])
	}
	if pb, ok := q["points_base"].(float64); !ok || int(pb) != 100 {
		t.Fatalf("create response points_base = %v, want 100", q["points_base"])
	}

	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(qid, 10)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate = %d", code)
	}

	// Correct answer.
	code, ans := postJSON(t, http.DefaultClient, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{
		"question_id": qid,
		"value":       "GCP",
		"client_uuid": "http-u1",
	})
	if code != http.StatusOK {
		t.Fatalf("answer = %d (%v)", code, ans)
	}
	if ok, _ := ans["is_correct"].(bool); !ok {
		t.Fatalf("correct answer is_correct = %v, want true (%v)", ans["is_correct"], ans)
	}
	if pts, _ := ans["points_awarded"].(float64); pts <= 0 {
		t.Fatalf("correct answer points_awarded = %v, want >0", ans["points_awarded"])
	}
	if tp, _ := ans["total_points"].(float64); tp <= 0 {
		t.Fatalf("correct answer total_points = %v, want >0", ans["total_points"])
	}

	// Wrong answer (different client uuid, same participant session is not shared
	// here so it creates a new participant; still must score 0).
	wrongClient := newJarClient(t)
	code, wrong := postJSON(t, wrongClient, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{
		"question_id": qid,
		"value":       "AWS",
		"client_uuid": "http-u2",
	})
	if code != http.StatusOK {
		t.Fatalf("wrong answer = %d (%v)", code, wrong)
	}
	if ok, _ := wrong["is_correct"].(bool); ok {
		t.Fatalf("wrong answer is_correct = true, want false")
	}
	if pts, _ := wrong["points_awarded"].(float64); pts != 0 {
		t.Fatalf("wrong answer points = %v, want 0", pts)
	}
}

// TestLeaderboardEndpoints checks both public and admin leaderboard routes.
func TestLeaderboardEndpoints(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "lb_http.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	srv := httptest.NewServer(featureMux())
	defer srv.Close()

	client := newJarClient(t)
	if code, _ := postJSON(t, client, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}
	_, created := postJSON(t, client, srv.URL+"/api/admin/events", map[string]any{"name": "LB Event"})
	eventID := int64(created["id"].(float64))
	eventCode, _ := created["code"].(string)

	_, q := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions", map[string]any{
		"kind": "poll", "prompt": "Pick", "options": []string{"A", "B"},
		"correct_index": 0, "points_base": 100,
	})
	qid := int64(q["id"].(float64))
	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(qid, 10)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate failed")
	}
	if code, _ := postJSON(t, http.DefaultClient, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{"question_id": qid, "value": "A", "client_uuid": "lb-u1"}); code != http.StatusOK {
		t.Fatalf("answer failed")
	}

	for name, url := range map[string]string{
		"public": srv.URL + "/api/events/" + eventCode + "/leaderboard",
		"admin":  srv.URL + "/api/admin/events/" + strconv.FormatInt(eventID, 10) + "/leaderboard",
	} {
		var req *http.Request
		var err error
		if name == "admin" {
			req, _ = http.NewRequest(http.MethodGet, url, nil)
			resp, err := client.Do(req)
			if err != nil {
				t.Fatalf("%s leaderboard: %v", name, err)
			}
			checkLeaderboardBody(t, name, resp)
			continue
		}
		req, err = http.NewRequest(http.MethodGet, url, nil)
		if err != nil {
			t.Fatalf("%s request: %v", name, err)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s leaderboard: %v", name, err)
		}
		checkLeaderboardBody(t, name, resp)
	}
}

func checkLeaderboardBody(t *testing.T, name string, resp *http.Response) {
	t.Helper()
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("%s leaderboard status = %d", name, resp.StatusCode)
	}
	var out struct {
		Entries []struct {
			Rank   int `json:"rank"`
			Points int `json:"points"`
		} `json:"entries"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("%s leaderboard decode: %v", name, err)
	}
	if len(out.Entries) == 0 {
		t.Fatalf("%s leaderboard empty, want at least one entry", name)
	}
	if out.Entries[0].Points <= 0 {
		t.Fatalf("%s leaderboard points = %d, want >0", name, out.Entries[0].Points)
	}
}

// TestStateSnapshotIncludesLeaderboardAndMe confirms the additive state fields.
func TestStateSnapshotIncludesLeaderboardAndMe(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "state.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	srv := httptest.NewServer(featureMux())
	defer srv.Close()

	client := newJarClient(t)
	if code, _ := postJSON(t, client, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}
	_, created := postJSON(t, client, srv.URL+"/api/admin/events", map[string]any{"name": "State Event"})
	eventCode, _ := created["code"].(string)

	resp, err := http.Get(srv.URL + "/api/events/" + eventCode + "/state")
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	defer resp.Body.Close()
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		t.Fatalf("decode state: %v", err)
	}
	if _, ok := raw["leaderboard"]; !ok {
		t.Fatalf("state missing leaderboard key: %v", raw)
	}
	if _, ok := raw["me"]; !ok {
		t.Fatalf("state missing me key: %v", raw)
	}
}

// TestWSReactionAndIdentity exercises the reaction and identity inbound paths.
func TestWSReactionAndIdentity(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ws_feat.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	ev, err := db.CreateEvent("WS Features", "wsf-1", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}

	srv := httptest.NewServer(featureMux())
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	url := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/events/" + ev.Code
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.CloseNow()

	readFrame := func() map[string]any {
		t.Helper()
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		return m
	}
	write := func(v any) {
		t.Helper()
		data, _ := json.Marshal(v)
		if err := c.Write(ctx, websocket.MessageText, data); err != nil {
			t.Fatalf("write: %v", err)
		}
	}

	// Drain the initial state frame.
	for i := 0; i < 3; i++ {
		if m := readFrame(); m["type"] == "state" {
			break
		}
	}

	// Allowed reaction is accepted silently (no error frame).
	write(map[string]any{"type": "reaction", "emoji": "👏"})

	// Identity update returns an ok envelope.
	write(map[string]any{"type": "identity", "name": "Dave", "emoji": "🔥", "color": "#6366F1"})
	gotIdentity := false
	for i := 0; i < 6; i++ {
		m := readFrame()
		if m["type"] == "result" && m["for"] == "identity" {
			gotIdentity = true
			break
		}
	}
	if !gotIdentity {
		t.Fatalf("did not receive identity result envelope")
	}

	// Unknown/invalid message still yields an error frame, proving the socket is
	// alive and the reaction above did not crash it.
	write(map[string]any{"type": "bogus"})
	gotError := false
	for i := 0; i < 6; i++ {
		m := readFrame()
		if m["type"] == "error" {
			gotError = true
			break
		}
	}
	if !gotError {
		t.Fatalf("expected error frame for bogus message")
	}
}

// TestAnswerViaWSReturnsScoring verifies answer frames carry scoring fields.
func TestAnswerViaWSReturnsScoring(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ws_score.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	ev, err := db.CreateEvent("WS Score", "wss-1", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	q, err := db.CreateQuestion(ev.ID, "poll", "live", "Pick", []string{"A", "B"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if _, err := db.UpdateQuestion(q.ID, map[string]any{"correct_index": 0, "points_base": 100}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	if err := db.ActivateQuestion(ev.ID, q.ID); err != nil {
		t.Fatalf("ActivateQuestion: %v", err)
	}

	srv := httptest.NewServer(featureMux())
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	url := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/events/" + ev.Code
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.CloseNow()

	readFrame := func() map[string]any {
		t.Helper()
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		return m
	}
	for i := 0; i < 3; i++ {
		if m := readFrame(); m["type"] == "state" {
			break
		}
	}
	data, _ := json.Marshal(map[string]any{"type": "answer", "question_id": q.ID, "value": "A", "client_uuid": "ws-score-1"})
	if err := c.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatalf("write answer: %v", err)
	}
	for i := 0; i < 6; i++ {
		m := readFrame()
		if m["type"] == "result" && m["for"] == "answer" {
			if ic, _ := m["is_correct"].(bool); !ic {
				t.Fatalf("ws answer is_correct = %v, want true (%v)", m["is_correct"], m)
			}
			if pts, _ := m["points_awarded"].(float64); pts <= 0 {
				t.Fatalf("ws answer points_awarded = %v, want >0", m["points_awarded"])
			}
			return
		}
	}
	t.Fatalf("no answer result frame received")
}

// keep bytes import used even if helpers change.
var _ = bytes.MinRead
