package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"

	"slides/db"
)

const joinCookie = "meetup_join"

var joinTTL = func() time.Duration {
	if v := os.Getenv("JOIN_TTL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return 4 * time.Hour
}()

// for tests: allow overriding via env already, also expose now var
var nowFunc = time.Now

type JoinSessionDTO struct {
	ExpiresAt  int64 `json:"expires_at"`
	RemainingS int   `json:"remaining_s"`
}

func setJoinCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     joinCookie,
		Value:    token,
		Path:     "/",
		MaxAge:   int(joinTTL.Seconds()),
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	})
}

func clearJoinCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     joinCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	})
}

// resolveJoin implements frozen join semantics.
// Returns participantID, *JoinSession (maybe nil), expired bool.
// If presenter/admin bypass, it returns participant from participantID flow without expiry checks.
func resolveJoin(w http.ResponseWriter, r *http.Request, ev *db.Event) (int64, *db.JoinSession, bool) {
	// presenter/admin bypass
	if sessionUser(r) != nil {
		// Still ensure participant identity for scoring, but no join check
		pid := participantID(w, r, ev.ID)
		return pid, nil, false
	}
	// check join cookie
	if c, err := r.Cookie(joinCookie); err == nil && c.Value != "" {
		js, err := db.GetJoinSession(c.Value)
		if err == nil && js != nil && js.EventID == ev.ID {
			if nowFunc().After(js.ExpiresAt) {
				return 0, js, true
			}
			// valid
			_ = db.TouchJoinSession(js.Token)
			return js.ParticipantID, js, false
		}
		// token not found or wrong event -> treat as no valid join
	}
	// no valid join: check identity cookie - only treat as expired if token exists for THIS event
	if c, err := r.Cookie(participantCookie); err == nil && c.Value != "" {
		if _, err := db.GetParticipantByTokenForEvent(c.Value, ev.ID); err == nil {
			return 0, nil, true
		}
		// token from different event -> auto-join path
	}
	// no identity -> auto-join
	token := uuid.NewString()
	http.SetCookie(w, &http.Cookie{
		Name:     participantCookie,
		Value:    token,
		Path:     "/",
		MaxAge:   int(participantTTL.Seconds()),
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	})
	pid, err := db.GetOrCreateParticipant(token, ev.ID)
	if err != nil {
		return 0, nil, false
	}
	js, err := db.CreateJoinSession(pid, ev.ID, joinTTL)
	if err == nil {
		setJoinCookie(w, js.Token)
		return pid, js, false
	}
	return pid, nil, false
}

func joinExpiredResponse(w http.ResponseWriter, r *http.Request, ev *db.Event) {
	clearJoinCookie(w)
	writeJSON(w, http.StatusUnauthorized, map[string]string{
		"error":      "join_expired",
		"code":       "join_expired",
		"rejoin_url": "/e/" + ev.Code,
		"room_code":  ev.RoomCode,
	})
}

// JoinEvent handles POST /api/events/{code}/join
func JoinEvent(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		writeLookupFailureMessage(w, err, "event not found")
		return
	}
	// presenter bypass just returns ok
	if sessionUser(r) != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	// Ensure participant identity
	var pid int64
	var token string
	if c, err := r.Cookie(participantCookie); err == nil && c.Value != "" {
		token = c.Value
		pid, _ = db.GetOrCreateParticipant(token, ev.ID)
	} else {
		token = uuid.NewString()
		http.SetCookie(w, &http.Cookie{
			Name:     participantCookie,
			Value:    token,
			Path:     "/",
			MaxAge:   int(participantTTL.Seconds()),
			HttpOnly: true,
			Secure:   cookieSecure(),
			SameSite: cookieSameSite(),
		})
		pid, _ = db.GetOrCreateParticipant(token, ev.ID)
	}
	js, err := db.CreateJoinSession(pid, ev.ID, joinTTL)
	if err != nil {
		// try to return anyway
		jsonError(w, "failed", http.StatusInternalServerError)
		return
	}
	setJoinCookie(w, js.Token)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "expires_at": js.ExpiresAt.UnixMilli()})
}

// resolveJoinForWS is like resolveJoin but without writing HTTP 401, for WS handshake
func resolveJoinForWS(w http.ResponseWriter, r *http.Request, ev *db.Event) (int64, *db.JoinSession, bool) {
	if c, err := r.Cookie(joinCookie); err == nil && c.Value != "" {
		js, err := db.GetJoinSession(c.Value)
		if err == nil && js != nil && js.EventID == ev.ID {
			if nowFunc().After(js.ExpiresAt) {
				return 0, js, true
			}
			_ = db.TouchJoinSession(js.Token)
			return js.ParticipantID, js, false
		}
	}
	if c, err := r.Cookie(participantCookie); err == nil && c.Value != "" {
		if _, err := db.GetParticipantByTokenForEvent(c.Value, ev.ID); err == nil {
			return 0, nil, true
		}
	}
	token := uuid.NewString()
	http.SetCookie(w, &http.Cookie{
		Name:     participantCookie,
		Value:    token,
		Path:     "/",
		MaxAge:   int(participantTTL.Seconds()),
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	})
	pid, err := db.GetOrCreateParticipant(token, ev.ID)
	if err != nil {
		return 0, nil, false
	}
	js, err := db.CreateJoinSession(pid, ev.ID, joinTTL)
	if err == nil {
		setJoinCookie(w, js.Token)
		return pid, js, false
	}
	return pid, nil, false
}

// checkJoin is a helper for protected handlers: returns pid or writes 401 and returns 0,false
func checkJoin(w http.ResponseWriter, r *http.Request, ev *db.Event) (int64, *db.JoinSession, bool) {
	pid, js, expired := resolveJoin(w, r, ev)
	if expired {
		joinExpiredResponse(w, r, ev)
		return 0, nil, false
	}
	return pid, js, true
}

// isJoinExpired checks if the current request's join session is expired (for WS per-message)
func isJoinExpired(r *http.Request, ev *db.Event) bool {
	if sessionUser(r) != nil {
		return false
	}
	if c, err := r.Cookie(joinCookie); err == nil && c.Value != "" {
		js, err := db.GetJoinSession(c.Value)
		if err == nil && js != nil && js.EventID == ev.ID {
			if nowFunc().After(js.ExpiresAt) {
				return true
			}
			return false
		}
	}
	if c, err := r.Cookie(participantCookie); err == nil && c.Value != "" {
		if _, err := db.GetParticipantByTokenForEvent(c.Value, ev.ID); err == nil {
			return true
		}
	}
	return false
}

// helper to build join_session DTO
func buildJoinSessionDTO(js *db.JoinSession) *JoinSessionDTO {
	if js == nil {
		return nil
	}
	remaining := int(time.Until(js.ExpiresAt).Seconds())
	if remaining < 0 {
		remaining = 0
	}
	return &JoinSessionDTO{ExpiresAt: js.ExpiresAt.UnixMilli(), RemainingS: remaining}
}

// Ensure json marshaling of StateDTO includes join_session if present: we will patch BuildState

var _ = json.Marshal // keep import
