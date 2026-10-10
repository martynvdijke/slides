// Package handlers implements the HTTP API for the meetup app.
//
// Audience endpoints identify a device with an anonymous participant cookie so
// answers can be de-duplicated and votes counted without a login. Admin
// endpoints require a session cookie issued by the auth handlers.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"slides/db"
	"slides/live"
)

// Broker fans out "something changed" signals to every SSE connection of an
// event. Subscribers rebuild their own (participant-specific) state on wake-up.
var Broker = live.New()

// MediaDir is where uploaded presentations are stored. main sets it.
var MediaDir = "media"

const (
	sessionCookie     = "meetup_session"
	participantCookie = "meetup_participant"
	sessionTTL        = 30 * 24 * time.Hour
	participantTTL    = 365 * 24 * time.Hour
	maxBodyBytes      = 2 << 20
)

type ctxKey string

const userKey ctxKey = "user"

// ── JSON DTOs: the contract the embedded frontend is built against ──

type EventDTO struct {
	ID                 int64  `json:"id"`
	Code               string `json:"code"`
	RoomCode           string `json:"room_code"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	EventDate          string `json:"event_date"`
	Status             string `json:"status"`
	FeedbackOpen       bool   `json:"feedback_open"`
	ShowPodium         bool   `json:"show_podium"`
	QASlowModeS        int    `json:"qa_slow_mode_s"`
	ResultsPublished   bool   `json:"results_published"`
	FeatureLive        bool   `json:"feature_live"`
	FeatureQA          bool   `json:"feature_qa"`
	FeatureSlides      bool   `json:"feature_slides"`
	FeatureFeedback    bool   `json:"feature_feedback"`
	FeatureLeaderboard bool   `json:"feature_leaderboard"`
	Brand              string `json:"brand"`
	CreatedAt          string `json:"created_at,omitempty"`
	QuestionCount      int    `json:"question_count"`
	PendingQACount     int    `json:"pending_qa_count"`
}

type QuestionDTO struct {
	ID           int64       `json:"id"`
	EventID      int64       `json:"event_id"`
	Kind         string      `json:"kind"`
	Mode         string      `json:"mode"`
	Prompt       string      `json:"prompt"`
	Options      []string    `json:"options"`
	Position     int         `json:"position"`
	Status       string      `json:"status"`
	ShowResults  bool        `json:"show_results"`
	IsFeedback   bool        `json:"is_feedback"`
	Results      []db.Result `json:"results"`
	Total        int         `json:"total"`
	Respondents  int         `json:"respondents"`
	NPS          *int        `json:"nps,omitempty"`
	MediaURL     string      `json:"media_url"`
	MediaType    string      `json:"media_type"`
	MyAnswer     string      `json:"my_answer"`
	Answered     bool        `json:"answered"`
	CreatedAt    string      `json:"created_at,omitempty"`
	CorrectIndex *int        `json:"correct_index,omitempty"`
	PointsBase   int         `json:"points_base"`
	TimeLimitS   int         `json:"time_limit_s"`
	ActivatedAt  *int64      `json:"activated_at,omitempty"`
	DeadlineAt   *int64      `json:"deadline_at,omitempty"`
	MyCorrect    *bool       `json:"my_correct,omitempty"`
	MyPoints     int         `json:"my_points"`
	DurationSec  int         `json:"duration_sec"`
	AutoReveal   bool        `json:"auto_reveal"`
	ExpiresAt    *int64      `json:"expires_at,omitempty"`
	RemainingSec *int        `json:"remaining_sec,omitempty"`
}

// MediaDTO describes an uploaded question media file.
type MediaDTO struct {
	URL       string `json:"url"`
	MediaType string `json:"media_type"`
	Filename  string `json:"filename"`
	Size      int64  `json:"size"`
}

type QADTO struct {
	ID        int64  `json:"id"`
	Body      string `json:"body"`
	Author    string `json:"author"`
	Status    string `json:"status"`
	Flagged   bool   `json:"flagged"`
	Votes     int    `json:"votes"`
	Voted     bool   `json:"voted"`
	CreatedAt string `json:"created_at,omitempty"`
}

// ModerationAnswerDTO is one stored answer in the admin moderation queue. It
// never exposes participant tokens, only the display identity.
type ModerationAnswerDTO struct {
	ID            int64  `json:"id"`
	QuestionID    int64  `json:"question_id"`
	Prompt        string `json:"prompt"`
	Kind          string `json:"kind"`
	Value         string `json:"value"`
	Status        string `json:"status"`
	ParticipantID int64  `json:"participant_id"`
	Name          string `json:"name"`
	Emoji         string `json:"emoji"`
	Color         string `json:"color"`
	CreatedAt     string `json:"created_at,omitempty"`
}

type PresentationDTO struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Speaker   string `json:"speaker"`
	Filename  string `json:"filename"`
	Size      int64  `json:"size"`
	URL       string `json:"url"`
	CreatedAt string `json:"created_at,omitempty"`
}

type FeedbackDTO struct {
	Open      bool          `json:"open"`
	Questions []QuestionDTO `json:"questions"`
}

type MeDTO struct {
	Name            string `json:"name"`
	Emoji           string `json:"emoji"`
	Color           string `json:"color"`
	RecapSubscribed bool   `json:"recap_subscribed"`
	RecapEmail      string `json:"recap_email,omitempty"`
}

type StateDTO struct {
	Event          EventDTO              `json:"event"`
	ActiveQuestion *QuestionDTO          `json:"active_question"`
	QA             []QADTO               `json:"qa"`
	Feedback       FeedbackDTO           `json:"feedback"`
	Leaderboard    []db.LeaderboardEntry `json:"leaderboard"`
	Me             MeDTO                 `json:"me"`
	CurrentSlide   *live.Slide           `json:"current_slide,omitempty"`
}

type AnalyticsDTO struct {
	UmamiScriptURL  string `json:"umami_script_url"`
	UmamiWebsiteID  string `json:"umami_website_id"`
	TrackingEnabled bool   `json:"tracking_enabled"`
}

// ── Small HTTP helpers ──

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			log.Printf("writeJSON: %v", err)
		}
	}
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		return err
	}
	return nil
}

func pathID(r *http.Request, name string) int64 {
	n, _ := strconv.ParseInt(r.PathValue(name), 10, 64)
	return n
}

// eventByCode resolves the {code} path value to an event.
func eventByCode(r *http.Request) (*db.Event, error) {
	return db.GetEventByCode(r.PathValue("code"))
}

// ── Auth / identity ──

func withUser(ctx context.Context, u *db.User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// currentUser returns the authenticated admin injected by AdminAuth, or nil.
func currentUser(r *http.Request) *db.User {
	u, _ := r.Context().Value(userKey).(*db.User)
	return u
}

func sessionUser(r *http.Request) *db.User {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return nil
	}
	s, err := db.GetSession(c.Value)
	if err != nil || s == nil {
		return nil
	}
	if time.Now().After(s.ExpiresAt) {
		_ = db.DeleteSession(s.Token)
		return nil
	}
	u, err := db.GetUserByID(s.UserID)
	if err != nil {
		return nil
	}
	return u
}

// cookieSameSite reads COOKIE_SAMESITE (lax|strict|none) and defaults to Lax.
// Use "none" when the admin/presenter UI runs on a different origin (e.g. a
// GitHub Pages deck) than the API; browsers require SameSite=None + Secure.
func cookieSameSite() http.SameSite {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("COOKIE_SAMESITE"))) {
	case "none":
		return http.SameSiteNoneMode
	case "strict":
		return http.SameSiteStrictMode
	default:
		return http.SameSiteLaxMode
	}
}

// cookieSecure reports whether cookies should carry the Secure attribute.
// SameSite=None mandates Secure, so enabling it implies Secure.
func cookieSecure() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("COOKIE_SECURE")), "true") {
		return true
	}
	return cookieSameSite() == http.SameSiteNoneMode
}

func setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	})
}

// AuthMiddleware resolves a session when present and always continues.
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u := sessionUser(r); u != nil {
			r = r.WithContext(withUser(r.Context(), u))
		}
		next.ServeHTTP(w, r)
	})
}

// AdminAuth rejects requests without a valid session.
func AdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := sessionUser(r)
		if u == nil {
			jsonError(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), u)))
	})
}

// participantID resolves the anonymous device cookie for an event, creating a
// participant row and setting the cookie when the device has none yet. Returns
// 0 when identity cannot be established (db failure); callers should still
// render aggregate state in that case.
func participantID(w http.ResponseWriter, r *http.Request, eventID int64) int64 {
	if c, err := r.Cookie(participantCookie); err == nil && c.Value != "" {
		if id, err := db.GetOrCreateParticipant(c.Value, eventID); err == nil {
			return id
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
	id, err := db.GetOrCreateParticipant(token, eventID)
	if err != nil {
		log.Printf("participant: %v", err)
		return 0
	}
	return id
}

// BroadcastEvent wakes every SSE subscriber of the event so they rebuild state.
func BroadcastEvent(eventID int64) {
	ev, err := db.GetEventByID(eventID)
	if err != nil || ev == nil {
		return
	}
	Broker.Broadcast(ev.Code, []byte("{}"))
}

// ── DTO conversion ──

func eventDTO(ev *db.Event, brand string) EventDTO {
	return EventDTO{
		ID:                 ev.ID,
		Code:               ev.Code,
		RoomCode:           ev.RoomCode,
		Name:               ev.Name,
		Description:        ev.Description,
		EventDate:          ev.EventDate,
		Status:             ev.Status,
		FeedbackOpen:       ev.FeedbackOpen,
		ShowPodium:         ev.ShowPodium,
		QASlowModeS:        ev.QASlowModeS,
		ResultsPublished:   ev.ResultsPublished,
		FeatureLive:        ev.FeatureLive,
		FeatureQA:          ev.FeatureQA,
		FeatureSlides:      ev.FeatureSlides,
		FeatureFeedback:    ev.FeatureFeedback,
		FeatureLeaderboard: ev.FeatureLeaderboard,
		Brand:              brand,
		CreatedAt:          ev.CreatedAt.Format(time.RFC3339),
		QuestionCount:      ev.QuestionCount,
		PendingQACount:     ev.PendingQACount,
	}
}

func questionDTO(q db.Question, withResults bool) QuestionDTO {
	dto := QuestionDTO{
		ID:          q.ID,
		EventID:     q.EventID,
		Kind:        q.Kind,
		Mode:        q.Mode,
		Prompt:      q.Prompt,
		Options:     q.Options,
		Position:    q.Position,
		Status:      q.Status,
		ShowResults: q.ShowResults,
		IsFeedback:  q.IsFeedback,
		MediaURL:    q.MediaURL,
		MediaType:   q.MediaType,
		CreatedAt:   q.CreatedAt.Format(time.RFC3339),
		PointsBase:  q.PointsBase,
		TimeLimitS:  q.TimeLimitS,
		DurationSec: q.DurationSec,
		AutoReveal:  q.AutoReveal,
	}
	if q.DurationSec > 0 && q.ActivatedAt != nil {
		exp := *q.ActivatedAt + int64(q.DurationSec)*1000
		dto.ExpiresAt = &exp
		rem := int((exp - time.Now().UnixMilli()) / 1000)
		if rem < 0 {
			rem = 0
		}
		dto.RemainingSec = &rem
	}
	if dto.PointsBase == 0 {
		dto.PointsBase = 100
	}
	if q.ActivatedAt != nil {
		dto.ActivatedAt = q.ActivatedAt
		if q.TimeLimitS > 0 {
			deadline := *q.ActivatedAt + int64(q.TimeLimitS)*1000
			dto.DeadlineAt = &deadline
		}
	}
	if q.ShowResults || q.Status == "revealed" {
		dto.CorrectIndex = q.CorrectIndex
	}
	if dto.Options == nil {
		dto.Options = []string{}
	}
	if withResults {
		st, err := db.GetQuestionStats(q.ID)
		if err != nil {
			log.Printf("question results %d: %v", q.ID, err)
			st = nil
		}
		if st == nil {
			st = &db.QuestionStats{Results: []db.Result{}}
		}
		if st.Results == nil {
			st.Results = []db.Result{}
		}
		dto.Results = st.Results
		dto.Total = st.Total
		dto.Respondents = st.Respondents
		dto.NPS = st.NPS
	} else {
		dto.Results = []db.Result{}
	}
	return dto
}

func qaDTO(q db.QAQuestion) QADTO {
	return QADTO{
		ID:        q.ID,
		Body:      q.Body,
		Author:    q.Author,
		Status:    q.Status,
		Flagged:   q.Flagged,
		Votes:     q.Votes,
		Voted:     q.Voted,
		CreatedAt: q.CreatedAt.Format(time.RFC3339),
	}
}

func moderationAnswerDTO(a db.ModerationAnswer) ModerationAnswerDTO {
	return ModerationAnswerDTO{
		ID:            a.ID,
		QuestionID:    a.QuestionID,
		Prompt:        a.Prompt,
		Kind:          a.Kind,
		Value:         a.Value,
		Status:        a.Status,
		ParticipantID: a.ParticipantID,
		Name:          a.Name,
		Emoji:         a.Emoji,
		Color:         a.Color,
		CreatedAt:     a.CreatedAt.Format(time.RFC3339),
	}
}

func presentationDTO(p db.Presentation, eventCode string) PresentationDTO {
	return PresentationDTO{
		ID:        p.ID,
		Title:     p.Title,
		Speaker:   p.Speaker,
		Filename:  p.Filename,
		Size:      p.Size,
		URL:       "/api/events/" + eventCode + "/presentations/" + strconv.FormatInt(p.ID, 10) + "/download",
		CreatedAt: p.CreatedAt.Format(time.RFC3339),
	}
}

func analyticsDTO(a *db.AnalyticsSettings) AnalyticsDTO {
	if a == nil {
		return AnalyticsDTO{}
	}
	return AnalyticsDTO{
		UmamiScriptURL:  a.UmamiScriptURL,
		UmamiWebsiteID:  a.UmamiWebsiteID,
		TrackingEnabled: a.TrackingEnabled,
	}
}

// ── State assembly ──

// BuildState renders the participant-specific view of an event. It is used by
// GET /state and by every SSE connection, so one audience member's answers and
// votes are never leaked to another.
func BuildState(ev *db.Event, participantID int64) StateDTO {
	brand, _ := db.GetBranding()
	state := StateDTO{
		Event:       eventDTO(ev, brand),
		QA:          []QADTO{},
		Feedback:    FeedbackDTO{Open: ev.FeedbackOpen, Questions: []QuestionDTO{}},
		Leaderboard: []db.LeaderboardEntry{},
		Me:          MeDTO{Name: "Anonymous", Emoji: "🙂", Color: "#6366F1"},
	}

	// Reconcile a timed question whose deadline passed while no timer ran (for
	// example after a server restart) before any client renders state.
	if n, err := db.LockExpiredQuestions(ev.ID, time.Now().UnixMilli()); err == nil && n > 0 {
		BroadcastEvent(ev.ID)
	}

	if q, err := db.GetActiveQuestion(ev.ID); err == nil && q != nil {
		dto := questionDTO(*q, true)
		if participantID > 0 {
			if a, err := db.GetAnswer(q.ID, participantID); err == nil && a != nil {
				dto.Answered = true
				dto.MyAnswer = a.Value
				// Correctness stays hidden until reveal unless results are
				// enabled for the question (legacy instant feedback). Answers
				// withheld by moderation never disclose their verdict.
				if a.Status == "visible" && (q.ShowResults || q.Status == "revealed") {
					dto.MyCorrect = a.IsCorrect
					dto.MyPoints = a.PointsAwarded
				}
			}
		}
		state.ActiveQuestion = &dto
	}

	qaRows, err := db.ListQAForParticipant(ev.ID, participantID)
	if err != nil {
		qaRows, err = db.ListQA(ev.ID, "approved")
	}
	if err == nil {
		for _, q := range qaRows {
			state.QA = append(state.QA, qaDTO(q))
		}
	}

	if fq, err := db.ListFeedbackQuestions(ev.ID); err == nil {
		for _, q := range fq {
			state.Feedback.Questions = append(state.Feedback.Questions, questionDTO(q, false))
		}
	}

	if lb, err := db.GetLeaderboard(ev.ID); err == nil {
		state.Leaderboard = lb
	}
	if participantID > 0 {
		if p, err := db.GetParticipantByID(participantID); err == nil && p != nil {
			if p.DisplayName != "" {
				state.Me.Name = p.DisplayName
			}
			if p.Emoji != "" {
				state.Me.Emoji = p.Emoji
			}
			if p.Color != "" {
				state.Me.Color = p.Color
			}
		}
		if email, ok, err := db.GetRecapSubscription(ev.ID, participantID); err == nil && ok {
			state.Me.RecapSubscribed = true
			state.Me.RecapEmail = email
		}
	}
	if s, ok := Broker.GetSlide(ev.Code); ok {
		cp := s
		state.CurrentSlide = &cp
	}

	return state
}

var errNotFound = errors.New("not found")
