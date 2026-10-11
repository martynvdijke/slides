package handlers

import (
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
)

func TestJoinSessionCreateGetExpiry(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "join.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev, _ := db.CreateEvent("E", "join-1", "", "")
	pid, _ := db.GetOrCreateParticipant("tok-a", ev.ID)
	js, err := db.CreateJoinSession(pid, ev.ID, 2*time.Second)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := db.GetJoinSession(js.Token)
	if err != nil || got.ParticipantID != pid {
		t.Fatalf("get: %v %+v", err, got)
	}
	// not expired yet
	if time.Now().After(got.ExpiresAt) {
		t.Fatal("should not be expired")
	}
	time.Sleep(2100 * time.Millisecond)
	n, _ := db.DeleteExpiredJoinSessions()
	if n != 1 {
		t.Fatalf("expected 1 deleted, got %d", n)
	}
	if _, err := db.GetJoinSession(js.Token); err == nil {
		t.Fatal("should be deleted")
	}
}

func TestGetOrCreateParticipantEventScoped(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "scoped.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	ev1, _ := db.CreateEvent("E1", "scoped-1", "", "")
	ev2, _ := db.CreateEvent("E2", "scoped-2", "", "")
	id1, _ := db.GetOrCreateParticipant("same-token", ev1.ID)
	id2, _ := db.GetOrCreateParticipant("same-token", ev2.ID)
	if id1 == id2 {
		t.Fatal("same token different events should have distinct ids")
	}
	// same event same token should return same id
	id1b, _ := db.GetOrCreateParticipant("same-token", ev1.ID)
	if id1 != id1b {
		t.Fatalf("same event should reuse id %d vs %d", id1, id1b)
	}
}

func TestStateExpiredVsAutoJoin(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "state.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	// use short TTL via joinTTL var override
	orig := joinTTL
	joinTTL = 2 * time.Second
	defer func() { joinTTL = orig }()
	ev, _ := db.CreateEvent("E", "state-1", "", "")
	_ = ev
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/events/{code}/state", GetEventState)
	mux.HandleFunc("POST /api/events/{code}/join", JoinEvent)

	// 1: absent identity -> auto-join 200 with join_session
	req := httptest.NewRequest("GET", "/api/events/state-1/state", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("auto-join state code %d %s", rr.Code, rr.Body.String())
	}
	var st StateDTO
	if err := json.Unmarshal(rr.Body.Bytes(), &st); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if st.JoinSession == nil {
		t.Fatal("expected join_session")
	}
	cookies := rr.Result().Cookies()
	var partCookie, joinCookieVal *http.Cookie
	for _, c := range cookies {
		if c.Name == "meetup_participant" {
			partCookie = c
		}
		if c.Name == "meetup_join" {
			joinCookieVal = c
		}
	}
	if partCookie == nil || joinCookieVal == nil {
		t.Fatal("expected both cookies")
	}

	// wait expiry
	time.Sleep(2100 * time.Millisecond)
	// returning with both cookies should be 401 expired + clear cookie
	req2 := httptest.NewRequest("GET", "/api/events/state-1/state", nil)
	req2.AddCookie(partCookie)
	req2.AddCookie(joinCookieVal)
	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)
	if rr2.Code != 401 {
		t.Fatalf("expected 401 expired, got %d %s", rr2.Code, rr2.Body.String())
	}
	var body map[string]string
	_ = json.Unmarshal(rr2.Body.Bytes(), &body)
	if body["code"] != "join_expired" || body["error"] != "join_expired" {
		t.Fatalf("body %v", body)
	}
	// check clear cookie header
	foundClear := false
	for _, c := range rr2.Result().Cookies() {
		if c.Name == "meetup_join" && c.MaxAge < 0 {
			foundClear = true
		}
	}
	if !foundClear {
		// also check Set-Cookie header contains MaxAge=-1
		h := rr2.Header().Get("Set-Cookie")
		if !strings.Contains(h, "meetup_join") {
			t.Fatalf("expected clear join cookie, header %q cookies %v", h, rr2.Result().Cookies())
		}
	}

	// POST /join should re-create
	req3 := httptest.NewRequest("POST", "/api/events/state-1/join", nil)
	req3.AddCookie(partCookie)
	rr3 := httptest.NewRecorder()
	mux.ServeHTTP(rr3, req3)
	if rr3.Code != 200 {
		t.Fatalf("join code %d %s", rr3.Code, rr3.Body.String())
	}
	var jresp map[string]any
	_ = json.Unmarshal(rr3.Body.Bytes(), &jresp)
	if jresp["ok"] != true {
		t.Fatalf("join ok false %v", jresp)
	}
	// new join cookie
	var newJoin *http.Cookie
	for _, c := range rr3.Result().Cookies() {
		if c.Name == "meetup_join" {
			newJoin = c
		}
	}
	if newJoin == nil {
		t.Fatal("missing new join cookie")
	}
	// now state should be 200 again
	req4 := httptest.NewRequest("GET", "/api/events/state-1/state", nil)
	req4.AddCookie(partCookie)
	req4.AddCookie(newJoin)
	rr4 := httptest.NewRecorder()
	mux.ServeHTTP(rr4, req4)
	if rr4.Code != 200 {
		t.Fatalf("state after rejoin %d %s", rr4.Code, rr4.Body.String())
	}
}

func TestWSExpiredSession(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ws-exp.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	orig := joinTTL
	joinTTL = 2 * time.Second
	defer func() { joinTTL = orig }()
	ev, _ := db.CreateEvent("E", "ws-exp-1", "", "")
	// create participant and expired join session manually
	pid, _ := db.GetOrCreateParticipant("ws-tok", ev.ID)
	// create with 1s TTL then sleep to expire
	js, _ := db.CreateJoinSession(pid, ev.ID, 1*time.Second)
	time.Sleep(1100 * time.Millisecond)

	mux2 := http.NewServeMux()
	mux2.HandleFunc("GET /ws/events/{code}", EventWS)
	srv := httptest.NewServer(mux2)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	url := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/events/" + ev.Code
	// dial with expired cookies
	cookies := "meetup_participant=ws-tok; meetup_join=" + js.Token
	c, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: http.Header{"Cookie": []string{cookies}}})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.CloseNow()
	_, data, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var m map[string]any
	_ = json.Unmarshal(data, &m)
	if m["type"] != "session_expired" || m["code"] != "join_expired" {
		t.Fatalf("expected session_expired, got %s", string(data))
	}
}
