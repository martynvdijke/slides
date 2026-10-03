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

// TestEventWebSocketFlow drives the live channel end to end: connect, receive
// state, submit an answer/QA/vote over the socket and observe the resulting
// frames.
func TestEventWebSocketFlow(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "ws.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	ev, err := db.CreateEvent("WS Event", "ws-1", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	q, err := db.CreateQuestion(ev.ID, "poll", "live", "Pick one", []string{"A", "B"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if err := db.ActivateQuestion(ev.ID, q.ID, nil); err != nil {
		t.Fatalf("ActivateQuestion: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws/events/{code}", EventWS)
	srv := httptest.NewServer(mux)
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
		if err := json.Unmarshal(data, &m); err != nil {
			t.Fatalf("unmarshal frame: %v", err)
		}
		return m
	}
	// readUntil skips ping/pong and unrelated frames until one of want appears.
	readUntil := func(want ...string) map[string]any {
		t.Helper()
		allowed := map[string]bool{}
		for _, w := range want {
			allowed[w] = true
		}
		for i := 0; i < 10; i++ {
			m := readFrame()
			typ, _ := m["type"].(string)
			if allowed[typ] {
				return m
			}
		}
		t.Fatalf("no frame of type %v seen", want)
		return nil
	}
	write := func(v any) {
		t.Helper()
		data, _ := json.Marshal(v)
		if err := c.Write(ctx, websocket.MessageText, data); err != nil {
			t.Fatalf("write: %v", err)
		}
	}

	// Initial push carries the active question.
	state := readUntil("state")
	data, _ := json.Marshal(state["data"])
	var st struct {
		ActiveQuestion *struct {
			ID       int64 `json:"id"`
			Answered bool  `json:"answered"`
		} `json:"active_question"`
	}
	if err := json.Unmarshal(data, &st); err != nil {
		t.Fatalf("state data: %v", err)
	}
	if st.ActiveQuestion == nil || st.ActiveQuestion.ID != q.ID {
		t.Fatalf("expected active question %d in initial state, got %+v", q.ID, st.ActiveQuestion)
	}

	// Answer round trip.
	write(map[string]any{"type": "answer", "question_id": q.ID, "value": "A"})
	res := readUntil("result")
	if forWhat, _ := res["for"].(string); forWhat != "answer" {
		t.Fatalf("expected answer result, got %+v", res)
	}
	if ok, _ := res["ok"].(bool); !ok {
		t.Fatalf("answer not acknowledged: %+v", res)
	}
	state = readUntil("state")
	data, _ = json.Marshal(state["data"])
	if err := json.Unmarshal(data, &st); err != nil {
		t.Fatalf("state data after answer: %v", err)
	}
	if st.ActiveQuestion == nil || !st.ActiveQuestion.Answered {
		t.Fatalf("expected answer to be reflected in state, got %+v", st.ActiveQuestion)
	}

	// Q&A round trip.
	write(map[string]any{"type": "qa", "body": "Does this work?", "author": "tester"})
	res = readUntil("result")
	if forWhat, _ := res["for"].(string); forWhat != "qa" {
		t.Fatalf("expected qa result, got %+v", res)
	}
	if id, _ := res["id"].(float64); id == 0 {
		t.Fatalf("expected qa id in result, got %+v", res)
	}

	// Vote round trip.
	qaID := int64(res["id"].(float64))
	write(map[string]any{"type": "vote", "id": qaID})
	res = readUntil("result")
	if forWhat, _ := res["for"].(string); forWhat != "vote" {
		t.Fatalf("expected vote result, got %+v", res)
	}
	if voted, _ := res["voted"].(bool); !voted {
		t.Fatalf("expected vote to register, got %+v", res)
	}

	// Unknown type yields an error frame.
	write(map[string]any{"type": "bogus"})
	if typ := readUntil("error"); typ["error"] == "" {
		t.Fatalf("expected error message, got %+v", typ)
	}
}
