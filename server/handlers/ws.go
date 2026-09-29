package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"slides/db"
)

// wsReadTimeout bounds how long a single JSON message may take once the reader
// has started receiving it.
const wsWriteTimeout = 10 * time.Second

// wsEnvelope is the common frame for every server->client WebSocket message.
// Only the fields relevant to Type are populated.
type wsEnvelope struct {
	Type  string          `json:"type"`
	For   string          `json:"for,omitempty"`
	OK    *bool           `json:"ok,omitempty"`
	Error string          `json:"error,omitempty"`
	ID    int64           `json:"id,omitempty"`
	Votes int             `json:"votes,omitempty"`
	Voted bool            `json:"voted,omitempty"`
	Data  json.RawMessage `json:"data,omitempty"`
}

// wsInbound is a client->server WebSocket message.
type wsInbound struct {
	Type       string `json:"type"`
	QuestionID int64  `json:"question_id"`
	Value      string `json:"value"`
	Body       string `json:"body"`
	Author     string `json:"author"`
	ID         int64  `json:"id"`
}

// writeWS marshals v and writes it as a single text frame.
func writeWS(ctx context.Context, c *websocket.Conn, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	wctx, cancel := context.WithTimeout(ctx, wsWriteTimeout)
	defer cancel()
	return c.Write(wctx, websocket.MessageText, data)
}

// writeWSData marshals nested DTOs into the envelope's data field.
func writeWSData(ctx context.Context, c *websocket.Conn, typ string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return writeWS(ctx, c, wsEnvelope{Type: typ, Data: data})
}

func okEnvelope(forWhat string) wsEnvelope {
	ok := true
	return wsEnvelope{Type: "result", For: forWhat, OK: &ok}
}

// acceptWS upgrades the request and enables cross-origin clients so slide decks
// hosted on GitHub Pages can subscribe to a separately hosted backend.
func acceptWS(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	return websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
}

// EventWS is the single real-time channel for one event. The server pushes
// personalized StateDTO frames; clients send answer, qa, vote and ping messages.
// @Summary  Live event WebSocket
// @Tags     public
// @Param    code path string true "Event code"
// @Router   /ws/events/{code} [get]
func EventWS(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	// Identity is established during the HTTP handshake so the participant
	// cookie is delivered before the socket opens.
	pid := participantID(w, r, ev.ID)
	ctx := r.Context()

	c, err := acceptWS(w, r)
	if err != nil {
		return
	}
	defer c.CloseNow()
	c.SetReadLimit(64 * 1024)

	ch, unsub := Broker.Subscribe(ev.Code)
	defer unsub()

	inbound := make(chan []byte, 16)
	go func() {
		defer close(inbound)
		for {
			_, data, err := c.Read(ctx)
			if err != nil {
				return
			}
			select {
			case inbound <- data:
			case <-ctx.Done():
				return
			}
		}
	}()

	sendState := func() bool {
		return writeWSData(ctx, c, "state", BuildState(ev, pid)) == nil
	}
	if !sendState() {
		return
	}

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case _, open := <-ch:
			if !open {
				return
			}
			if fresh, err := db.GetEventByID(ev.ID); err == nil && fresh != nil {
				ev = fresh
			}
			if !sendState() {
				return
			}
		case raw, open := <-inbound:
			if !open {
				return
			}
			if err := writeWS(ctx, c, handleEventWSMessage(ev, pid, raw)); err != nil {
				return
			}
		case <-ticker.C:
			if err := writeWS(ctx, c, wsEnvelope{Type: "ping"}); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// handleEventWSMessage dispatches one client message and returns the response
// frame. Mutating actions notify other subscribers via BroadcastEvent, which
// also refreshes this connection through the broker.
func handleEventWSMessage(ev *db.Event, pid int64, raw []byte) wsEnvelope {
	var m wsInbound
	if err := json.Unmarshal(raw, &m); err != nil {
		return wsEnvelope{Type: "error", Error: "invalid message"}
	}
	switch m.Type {
	case "answer":
		if err := submitAnswer(ev, pid, m.QuestionID, m.Value); err != nil {
			return wsEnvelope{Type: "error", For: "answer", Error: err.Error()}
		}
		return okEnvelope("answer")
	case "qa":
		qa, err := createQA(ev, m.Body, m.Author)
		if err != nil {
			return wsEnvelope{Type: "error", For: "qa", Error: err.Error()}
		}
		env := okEnvelope("qa")
		env.ID = qa.ID
		return env
	case "vote":
		votes, voted, err := toggleVote(ev, pid, m.ID)
		if err != nil {
			return wsEnvelope{Type: "error", For: "vote", Error: err.Error()}
		}
		env := okEnvelope("vote")
		env.Votes = votes
		env.Voted = voted
		return env
	case "ping":
		return wsEnvelope{Type: "pong"}
	default:
		return wsEnvelope{Type: "error", Error: "unknown message type"}
	}
}

// AdminEventStatsWS streams EventStatsDTO frames for one event to an
// authenticated admin. It is push-only; inbound frames are drained so control
// frames are still handled.
// @Summary  Live event statistics WebSocket
// @Tags     admin
// @Security CookieAuth
// @Param    id path int true "Event ID"
// @Router   /ws/admin/events/{id}/stats [get]
func AdminEventStatsWS(w http.ResponseWriter, r *http.Request) {
	ev, err := db.GetEventByID(pathID(r, "id"))
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	ctx := r.Context()
	c, err := acceptWS(w, r)
	if err != nil {
		return
	}
	defer c.CloseNow()

	ch, unsub := Broker.Subscribe(ev.Code)
	defer unsub()

	go func() {
		for {
			if _, _, err := c.Read(ctx); err != nil {
				return
			}
		}
	}()

	sendStats := func() bool {
		dto, err := buildEventStats(ev)
		if err != nil {
			log.Printf("ws stats: %v", err)
			return true
		}
		return writeWSData(ctx, c, "stats", dto) == nil
	}
	if !sendStats() {
		return
	}

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case _, open := <-ch:
			if !open {
				return
			}
			if fresh, err := db.GetEventByID(ev.ID); err == nil && fresh != nil {
				ev = fresh
			}
			if !sendStats() {
				return
			}
		case <-ticker.C:
			if err := writeWS(ctx, c, wsEnvelope{Type: "ping"}); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
