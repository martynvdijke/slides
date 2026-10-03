package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"

	"slides/db"
	"slides/live"
)

const wsWriteTimeout = 10 * time.Second

var allowedReactions = map[string]bool{"👏": true, "🔥": true, "❤️": true, "😂": true, "🤯": true, "👍": true}
var allowedColors = map[string]bool{"#6366F1": true, "#EC4899": true, "#F59E0B": true, "#10B981": true, "#38BDF8": true, "#F43F5E": true, "#A855F7": true, "#84CC16": true}

type wsEnvelope struct {
	Type  string          `json:"type"`
	For   string          `json:"for,omitempty"`
	OK    *bool           `json:"ok,omitempty"`
	Error string          `json:"error,omitempty"`
	ID    int64           `json:"id,omitempty"`
	Votes int             `json:"votes,omitempty"`
	Voted bool            `json:"voted,omitempty"`
	Data  json.RawMessage `json:"data,omitempty"`
	// scoring fields for answer result
	IsCorrect     *bool `json:"is_correct,omitempty"`
	PointsAwarded *int  `json:"points_awarded,omitempty"`
	TotalPoints   *int  `json:"total_points,omitempty"`
}

type wsInbound struct {
	Type       string `json:"type"`
	QuestionID int64  `json:"question_id"`
	Value      string `json:"value"`
	Body       string `json:"body"`
	Author     string `json:"author"`
	ID         int64  `json:"id"`
	Emoji      string `json:"emoji"`
	Name       string `json:"name"`
	Color      string `json:"color"`
	ClientUUID string `json:"client_uuid"`
}

func writeWS(ctx context.Context, c *websocket.Conn, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	wctx, cancel := context.WithTimeout(ctx, wsWriteTimeout)
	defer cancel()
	return c.Write(wctx, websocket.MessageText, data)
}

func writeWSData(ctx context.Context, c *websocket.Conn, typ string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return writeWS(ctx, c, wsEnvelope{Type: typ, Data: data})
}

func writeRaw(ctx context.Context, c *websocket.Conn, raw []byte) error {
	wctx, cancel := context.WithTimeout(ctx, wsWriteTimeout)
	defer cancel()
	return c.Write(wctx, websocket.MessageText, raw)
}

func okEnvelope(forWhat string) wsEnvelope {
	ok := true
	return wsEnvelope{Type: "result", For: forWhat, OK: &ok}
}

func acceptWS(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	return websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
}

func EventWS(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	pid := participantID(w, r, ev.ID)
	isPresenter := sessionUser(r) != nil
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

	// simple token bucket: 10 burst, 5 per sec
	var tokens = 10
	var lastRefill = time.Now()
	allowReaction := func() bool {
		now := time.Now()
		elapsed := now.Sub(lastRefill).Seconds()
		tokens += int(elapsed * 5)
		if tokens > 10 {
			tokens = 10
		}
		lastRefill = now
		if tokens > 0 {
			tokens--
			return true
		}
		return false
	}

	var lastSlideMs int64
	for {
		select {
		case fr, open := <-ch:
			if !open {
				return
			}
			if fr.Kind == live.KindReactions || fr.Kind == live.KindSlide {
				if err := writeRaw(ctx, c, fr.Data); err != nil {
					return
				}
				continue
			}
			// refresh
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
			// intercept slide before dispatch
			var slidePeek struct {
				Type  string `json:"type"`
				Index *int   `json:"index"`
				Total *int   `json:"total"`
				Title string `json:"title"`
			}
			_ = json.Unmarshal(raw, &slidePeek)
			if slidePeek.Type == "slide" {
				if !isPresenter {
					_ = writeWS(ctx, c, wsEnvelope{Type: "error", For: "slide", Error: "unauthorized"})
					continue
				}
				now := time.Now().UnixMilli()
				if now-lastSlideMs < 200 {
					continue
				}
				lastSlideMs = now
				idx := 0
				if slidePeek.Index != nil {
					idx = *slidePeek.Index
				}
				tot := 0
				if slidePeek.Total != nil {
					tot = *slidePeek.Total
				}
				s := live.Slide{Index: idx, Total: tot, Title: slidePeek.Title}
				Broker.SetSlide(ev.Code, s)
				Broker.BroadcastSlide(ev.Code, s)
				_ = writeWS(ctx, c, okEnvelope("slide"))
				continue
			}
			// quick peek for reaction to handle rate limit without waiting for full dispatch
			var peek wsInbound
			_ = json.Unmarshal(raw, &peek)
			if peek.Type == "reaction" {
				if !allowedReactions[peek.Emoji] {
					continue
				}
				if !allowReaction() {
					continue
				}
				Broker.AddReaction(ev.Code, peek.Emoji)
				continue
			}
			env := handleEventWSMessage(ev, pid, raw)
			if err := writeWS(ctx, c, env); err != nil {
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

func handleEventWSMessage(ev *db.Event, pid int64, raw []byte) wsEnvelope {
	var m wsInbound
	if err := json.Unmarshal(raw, &m); err != nil {
		return wsEnvelope{Type: "error", Error: "invalid message"}
	}
	switch m.Type {
	case "answer":
		isCorrect, pts, total, err := submitAnswerWithMeta(ev, pid, m.QuestionID, m.Value, m.ClientUUID)
		if err != nil {
			return wsEnvelope{Type: "error", For: "answer", Error: err.Error()}
		}
		env := okEnvelope("answer")
		env.IsCorrect = &isCorrect
		env.PointsAwarded = &pts
		env.TotalPoints = &total
		return env
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
		env.ID = m.ID
		env.Votes = votes
		env.Voted = voted
		return env
	case "identity":
		name := strings.TrimSpace(m.Name)
		if utf8.RuneCountInString(name) > 24 {
			runes := []rune(name)
			name = string(runes[:24])
		}
		color := m.Color
		if !allowedColors[color] {
			color = ""
		}
		emoji := m.Emoji
		if !allowedReactions[emoji] {
			emoji = ""
		}
		if pid != 0 {
			// only update non-empty? but sanitize spec says store sanitized
			// if empty, keep existing? We'll store what was provided after sanitization, trimming empty keeps existing via fallback?
			p, _ := db.GetParticipantByID(pid)
			if p != nil {
				if name == "" {
					name = p.DisplayName
				}
				if emoji == "" {
					emoji = p.Emoji
				}
				if color == "" {
					color = p.Color
				}
			}
			_ = db.UpdateParticipantIdentity(pid, name, emoji, color)
			db.InvalidateLeaderboard(ev.ID)
			BroadcastEvent(ev.ID)
		}
		env := okEnvelope("identity")
		return env
	case "ping":
		return wsEnvelope{Type: "pong"}
	case "slide":
		return okEnvelope("slide")
	case "reaction":
		// handled in EventWS loop; ignore here
		return wsEnvelope{Type: "error", Error: "unknown message type"}
	default:
		return wsEnvelope{Type: "error", Error: "unknown message type"}
	}
}

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
		case fr, open := <-ch:
			if !open {
				return
			}
			if fr.Kind == live.KindReactions || fr.Kind == live.KindSlide {
				// forward slide frames? admin stats ignores but forward is fine; ignore like reactions for stats
				if fr.Kind == live.KindSlide {
					// optionally forward raw; we just ignore for stats but don't block
				}
				continue
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
