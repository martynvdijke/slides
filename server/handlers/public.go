package handlers

import (
	"errors"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"slides/db"
	"slides/qr"
	"slides/webhook"
)

// httpErr carries an HTTP status for a service-layer failure so the same logic
// can back both the REST handlers and the WebSocket channel.
type httpErr struct {
	status int
	msg    string
}

func (e *httpErr) Error() string { return e.msg }

func badRequest(m string) *httpErr { return &httpErr{http.StatusBadRequest, m} }
func notFound(m string) *httpErr   { return &httpErr{http.StatusNotFound, m} }
func internal(m string) *httpErr   { return &httpErr{http.StatusInternalServerError, m} }

func writeServiceErr(w http.ResponseWriter, err error) {
	var he *httpErr
	if errors.As(err, &he) {
		jsonError(w, he.msg, he.status)
		return
	}
	var se *slowModeError
	if errors.As(err, &se) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": se.Error(), "retry_after_s": se.RetryAfterS})
		return
	}
	jsonError(w, err.Error(), http.StatusInternalServerError)
}

// submitAnswer validates and stores an answer, then notifies live subscribers.
func submitAnswer(ev *db.Event, pid, questionID int64, raw string) error {
	_, err := submitAnswerWithMeta(ev, pid, questionID, raw, "")
	return err
}

// answerMeta carries the outcome of an answer submission. Disclose reports
// whether correctness and awarded points may be revealed to the participant;
// scoring itself always happens at submit time so speed still matters. Status
// is the stored visibility: "visible" or "flagged" by the content filter.
type answerMeta struct {
	IsCorrect bool
	Points    int
	Total     int
	Disclose  bool
	Status    string
}

func submitAnswerWithMeta(ev *db.Event, pid, questionID int64, raw string, clientUUID string) (answerMeta, error) {
	var out answerMeta
	if questionID == 0 {
		return out, badRequest("question_id is required")
	}
	q, err := db.GetQuestion(questionID)
	if err != nil || q == nil {
		return out, notFound("question not found")
	}
	if q.EventID != ev.ID {
		return out, notFound("question not found")
	}
	if q.Status != "live" && !q.IsFeedback {
		switch q.Status {
		case "locked":
			return out, badRequest("question is locked")
		case "revealed":
			return out, badRequest("question is closed")
		default:
			return out, badRequest("question is not live")
		}
	}
	if q.Status == "live" && q.TimeLimitS > 0 && q.ActivatedAt != nil {
		nowMs := time.Now().UnixMilli()
		if nowMs >= *q.ActivatedAt+int64(q.TimeLimitS)*1000 {
			// Lazy fallback when the scheduled auto-lock did not run: reconcile
			// the phase, then reject the late answer.
			if locked, err := db.LockQuestionIfExpired(ev.ID, q.ID, nowMs); err == nil && locked {
				BroadcastEvent(ev.ID)
			}
			return out, badRequest("time is up")
		}
	}
	val, err := db.ValidateAnswer(q.Kind, q.Options, raw)
	if err != nil {
		return out, badRequest(err.Error())
	}
	if pid == 0 {
		return out, badRequest("could not identify participant")
	}
	// Content filter: flagged answers are stored but excluded from public
	// aggregates until a host approves them; rejected ones are not stored.
	status := "visible"
	if fc := loadFilterConfig(); fc.matches(val) {
		if fc.Action == "reject" {
			return out, badRequest("answer rejected by the content filter")
		}
		status = "flagged"
	}
	isCorrect, pts, total, err := db.UpsertAnswerWithScoringStatus(q.ID, pid, val, clientUUID, status)
	if err != nil {
		return out, internal("could not save answer")
	}
	db.InvalidateLeaderboard(ev.ID)
	BroadcastEvent(ev.ID)
	return answerMeta{
		IsCorrect: isCorrect,
		Points:    pts,
		Total:     total,
		Disclose:  status == "visible" && (q.ShowResults || q.Status == "revealed"),
		Status:    status,
	}, nil
}

// createQA trims and stores a moderated Q&A question, enforcing the per-event
// per-participant slow mode and applying the content filter.
func createQA(ev *db.Event, body, author string, participantID int64) (*db.QAQuestion, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, badRequest("body is required")
	}
	if len([]rune(body)) > 500 {
		body = string([]rune(body)[:500])
	}
	author = strings.TrimSpace(author)
	if len([]rune(author)) > 80 {
		author = string([]rune(author)[:80])
	}
	if wait := slowModeWait(ev, participantID); wait > 0 {
		return nil, &slowModeError{RetryAfterS: wait}
	}
	flagged := false
	if fc := loadFilterConfig(); fc.matches(body) {
		if fc.Action == "reject" {
			return nil, badRequest("question rejected by the content filter")
		}
		flagged = true
	}
	qa, err := db.CreateQAWithParticipant(ev.ID, body, author, participantID, flagged)
	if err != nil {
		return nil, internal("could not create question")
	}
	return qa, nil
}

// toggleVote toggles a participant's vote on a Q&A question and notifies
// live subscribers.
func toggleVote(ev *db.Event, pid, qaID int64) (int, bool, error) {
	if qaID == 0 {
		return 0, false, badRequest("invalid qa id")
	}
	qa, err := db.GetQA(qaID)
	if err != nil || qa == nil {
		return 0, false, notFound("question not found")
	}
	if qa.EventID != ev.ID {
		return 0, false, notFound("question not found")
	}
	if pid == 0 {
		return 0, false, badRequest("could not identify participant")
	}
	votes, voted, err := db.ToggleVote(qaID, pid)
	if err != nil {
		return 0, false, internal("could not vote")
	}
	BroadcastEvent(ev.ID)
	return votes, voted, nil
}

// AnswerRequest is the body for SubmitAnswer.
type AnswerRequest struct {
	QuestionID int64  `json:"question_id"`
	Value      string `json:"value"`
	ClientUUID string `json:"client_uuid,omitempty"`
}

// QARequest is the body for CreateQA.
type QARequest struct {
	Body   string `json:"body"`
	Author string `json:"author"`
}

// GetEvent returns the public event metadata.
// @Summary  Get event
// @Tags     public
// @Produce  json
// @Param    code path string true "Event code"
// @Success  200 {object} EventDTO
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code} [get]
func GetEvent(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	brand, _ := db.GetBranding()
	writeJSON(w, http.StatusOK, eventDTO(ev, brand))
}

// GetEventState returns the personalized event state.
// @Summary  Get event state
// @Tags     public
// @Produce  json
// @Param    code path string true "Event code"
// @Success  200 {object} StateDTO
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/state [get]
func GetEventState(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	pid := participantID(w, r, ev.ID)
	writeJSON(w, http.StatusOK, BuildState(ev, pid))
}

// SubmitAnswer records an answer for a live or feedback question.
// @Summary  Submit answer
// @Tags     public
// @Accept   json
// @Produce  json
// @Param    code path string true "Event code"
// @Param    body body AnswerRequest true "answer"
// @Success  200 {object} map[string]bool
// @Failure  400 {object} map[string]string
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/answers [post]
func SubmitAnswer(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	var req AnswerRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	pid := participantID(w, r, ev.ID)
	meta, err := submitAnswerWithMeta(ev, pid, req.QuestionID, req.Value, req.ClientUUID)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	resp := map[string]any{"ok": true, "total_points": meta.Total}
	if meta.Disclose {
		resp["is_correct"] = meta.IsCorrect
		resp["points_awarded"] = meta.Points
	}
	if meta.Status == "flagged" {
		resp["flagged"] = true
	}
	writeJSON(w, http.StatusOK, resp)
}

// ListPublicQA lists approved Q&A for the event.
// @Summary  List public Q&A
// @Tags     public
// @Produce  json
// @Param    code path string true "Event code"
// @Success  200 {array} QADTO
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/qa [get]
func ListPublicQA(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	pid := participantID(w, r, ev.ID)
	var rows []db.QAQuestion
	if pid != 0 {
		r2, err := db.ListQAForParticipant(ev.ID, pid)
		if err == nil {
			rows = r2
		} else {
			r2, _ := db.ListQA(ev.ID, "approved")
			rows = r2
		}
	} else {
		r2, _ := db.ListQA(ev.ID, "approved")
		rows = r2
	}
	if rows == nil {
		rows = []db.QAQuestion{}
	}
	out := make([]QADTO, 0, len(rows))
	for _, q := range rows {
		out = append(out, qaDTO(q))
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateQA submits a new Q&A question for moderation.
// @Summary  Create Q&A question
// @Tags     public
// @Accept   json
// @Produce  json
// @Param    code path string true "Event code"
// @Param    body body QARequest true "question"
// @Success  200 {object} map[string]any
// @Failure  400 {object} map[string]string
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/qa [post]
func CreateQA(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	var req QARequest
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	pid := participantID(w, r, ev.ID)
	qa, err := createQA(ev, req.Body, req.Author, pid)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	body := qa.Body
	if len([]rune(body)) > 200 {
		body = string([]rune(body)[:200])
	}
	webhook.Notify(ev.Code, "qa.created", map[string]any{"event_code": ev.Code, "event_name": ev.Name, "qa_id": qa.ID, "body": body})
	resp := map[string]any{"id": qa.ID, "status": "pending"}
	if qa.Flagged {
		resp["flagged"] = true
	}
	writeJSON(w, http.StatusOK, resp)
}

// VoteQA toggles a vote for a Q&A question.
// @Summary  Vote Q&A
// @Tags     public
// @Produce  json
// @Param    code path string true "Event code"
// @Param    id path int true "Q&A ID"
// @Success  200 {object} map[string]any
// @Failure  400 {object} map[string]string
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/qa/{id}/vote [post]
func VoteQA(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	pid := participantID(w, r, ev.ID)
	votes, voted, err := toggleVote(ev, pid, pathID(r, "id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "votes": votes, "voted": voted})
}

// ListPublicPresentations lists presentations for the event.
// @Summary  List presentations
// @Tags     public
// @Produce  json
// @Param    code path string true "Event code"
// @Success  200 {array} PresentationDTO
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/presentations [get]
func ListPublicPresentations(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	rows, err := db.ListPresentations(ev.ID)
	if err != nil {
		writeJSON(w, http.StatusOK, []PresentationDTO{})
		return
	}
	if rows == nil {
		rows = []db.Presentation{}
	}
	out := make([]PresentationDTO, 0, len(rows))
	for _, p := range rows {
		out = append(out, presentationDTO(p, ev.Code))
	}
	writeJSON(w, http.StatusOK, out)
}

// DownloadPresentation serves a presentation file as attachment.
// @Summary  Download presentation
// @Tags     public
// @Produce  octet-stream
// @Param    code path string true "Event code"
// @Param    id path int true "Presentation ID"
// @Success  200 {file} file
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/presentations/{id}/download [get]
func DownloadPresentation(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	pid := pathID(r, "id")
	if pid == 0 {
		jsonError(w, "presentation not found", http.StatusNotFound)
		return
	}
	p, err := db.GetPresentation(pid)
	if err != nil || p == nil {
		jsonError(w, "presentation not found", http.StatusNotFound)
		return
	}
	if p.EventID != ev.ID {
		jsonError(w, "presentation not found", http.StatusNotFound)
		return
	}
	fpath := filepath.Join(MediaDir, p.Filename)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": p.Filename}))
	http.ServeFile(w, r, fpath)
}

// ServeMedia serves uploaded question media inline from the media directory.
// @Summary  Get uploaded media
// @Tags     public
// @Param    name path string true "stored media file name"
// @Success  200 {file} file
// @Failure  404 {object} map[string]string
// @Router   /media/{name} [get]
func ServeMedia(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" || name != filepath.Base(name) || strings.Contains(name, "..") {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	fpath := filepath.Join(MediaDir, name)
	info, err := os.Stat(fpath)
	if err != nil || info.IsDir() {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	ctype := mime.TypeByExtension(filepath.Ext(name))
	if ctype == "" {
		f, err := os.Open(fpath)
		if err == nil {
			head := make([]byte, 512)
			n, _ := f.Read(head)
			f.Close()
			ctype = http.DetectContentType(head[:n])
		}
	}
	if ctype != "" {
		w.Header().Set("Content-Type", ctype)
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, fpath)
}

// EventQR returns a QR code PNG for the event join URL.
// @Summary  Get event QR code
// @Tags     public
// @Produce  png
// @Param    code path string true "Event code"
// @Success  200 {file} file
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/qr.png [get]
func EventQR(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	base := os.Getenv("PUBLIC_BASE_URL")
	if base == "" {
		base = "http://localhost:6270"
	}
	base = strings.TrimRight(base, "/")
	payload := base + "/e/" + ev.Code
	png, err := qr.PNG(payload, 512)
	if err != nil {
		jsonError(w, "could not generate qr", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(png)
}

// ResolveRoom maps a short, case-insensitive room code to the event's stable
// event code so /join can redirect typed codes.
// @Summary  Resolve room code
// @Tags     public
// @Produce  json
// @Param    room path string true "Room code"
// @Success  200 {object} map[string]any
// @Failure  404 {object} map[string]string
// @Router   /api/join/{room} [get]
func ResolveRoom(w http.ResponseWriter, r *http.Request) {
	ev, err := db.GetEventByRoomCode(r.PathValue("room"))
	if err != nil || ev == nil {
		jsonError(w, "room not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"code":      ev.Code,
		"name":      ev.Name,
		"room_code": ev.RoomCode,
	})
}

func PublicGetLeaderboard(w http.ResponseWriter, r *http.Request) {
	ev, err := eventByCode(r)
	if err != nil || ev == nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	entries, err := db.GetLeaderboard(ev.ID)
	if err != nil {
		jsonError(w, "failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func AdminGetLeaderboard(w http.ResponseWriter, r *http.Request) {
	eid := pathID(r, "id")
	entries, err := db.GetLeaderboard(eid)
	if err != nil {
		jsonError(w, "failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

// PublicGetAnalyticsSettings returns public analytics settings.
// @Summary  Get analytics settings
// @Tags     public
// @Produce  json
// @Success  200 {object} AnalyticsDTO
// @Router   /api/settings/analytics [get]
func PublicGetAnalyticsSettings(w http.ResponseWriter, r *http.Request) {
	a, err := db.GetAnalyticsSettings()
	if err != nil {
		writeJSON(w, http.StatusOK, analyticsDTO(nil))
		return
	}
	writeJSON(w, http.StatusOK, analyticsDTO(a))
}
