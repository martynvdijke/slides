package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strconv"
	"strings"

	"slides/db"
	"slides/emailcfg"
)

// recapRecipientCap bounds one send so synchronous delivery stays predictable.
const recapRecipientCap = 200

// normalizeEmail trims, lowercases and validates a single address. It rejects
// display-name forms and header-injection attempts.
func normalizeEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" {
		return "", fmt.Errorf("email is required")
	}
	if len(email) > 254 {
		return "", fmt.Errorf("email is too long")
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email || strings.ContainsAny(email, "\r\n") {
		return "", fmt.Errorf("invalid email address")
	}
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 || !strings.Contains(email[at+1:], ".") {
		return "", fmt.Errorf("invalid email address")
	}
	return email, nil
}

// splitRecipientList splits a raw newline/comma separated recipient list.
func splitRecipientList(raw string) []string {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == '\n' || r == '\r' || r == ','
	})
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if s := strings.TrimSpace(f); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// resolveRecipients unions attendee opt-ins, the configured host list and
// admin user emails, then normalizes and deduplicates them. Invalid entries
// are counted as skipped rather than failing the send.
func resolveRecipients(ev *db.Event) ([]string, int, error) {
	var raw []string
	emails, err := db.ListRecapEmails(ev.ID)
	if err != nil {
		return nil, 0, err
	}
	raw = append(raw, emails...)
	settings, err := db.GetRecapSettings()
	if err != nil {
		return nil, 0, err
	}
	raw = append(raw, splitRecipientList(settings.Emails)...)
	userEmails, err := db.ListUserEmails()
	if err != nil {
		return nil, 0, err
	}
	raw = append(raw, userEmails...)

	seen := map[string]bool{}
	out := make([]string, 0, len(raw))
	skipped := 0
	for _, candidate := range raw {
		email, err := normalizeEmail(candidate)
		if err != nil {
			skipped++
			continue
		}
		if seen[email] {
			continue
		}
		seen[email] = true
		out = append(out, email)
	}
	return out, skipped, nil
}

// composeRecap renders the plain-text recap for an event from the same
// aggregates as the public results page, ending with the results link built
// from the configured public base URL.
func composeRecap(r *http.Request, ev *db.Event) (string, string, error) {
	summary, err := db.EventStats(ev.ID)
	if err != nil {
		return "", "", err
	}
	questions, err := db.ListQuestions(ev.ID)
	if err != nil {
		return "", "", err
	}
	qaRows, err := db.ListQA(ev.ID, "approved", "answered")
	if err != nil {
		return "", "", err
	}
	lb, err := db.GetLeaderboard(ev.ID)
	if err != nil {
		return "", "", err
	}

	name := strings.TrimSpace(ev.Name)
	if name == "" {
		name = "Event"
	}
	subject := "Recap: " + name

	var b strings.Builder
	b.WriteString(name + "\n")
	date := strings.TrimSpace(ev.EventDate)
	if date == "" && !ev.CreatedAt.IsZero() {
		date = ev.CreatedAt.Format("2006-01-02")
	}
	if date != "" {
		b.WriteString(date + "\n")
	}
	if d := strings.TrimSpace(ev.Description); d != "" {
		b.WriteString(d + "\n")
	}

	b.WriteString("\nParticipation\n")
	fmt.Fprintf(&b, "- %d participants\n", summary.Participants)
	fmt.Fprintf(&b, "- %d answers across %d questions\n", summary.Answers, summary.Questions)
	fmt.Fprintf(&b, "- Q&A: %d questions, %d votes\n", summary.QA, summary.Votes)

	if len(questions) > 0 {
		b.WriteString("\nHeadline results\n")
		shown := 0
		for _, q := range questions {
			if q.Status == "draft" {
				continue
			}
			if shown >= 8 {
				break
			}
			shown++
			if q.Kind == "nps" && q.NPS != nil {
				fmt.Fprintf(&b, "- %s: NPS %d (%d responses)\n", q.Prompt, *q.NPS, q.Total)
				continue
			}
			parts := make([]string, 0, 3)
			for i, res := range q.Results {
				if i >= 3 {
					break
				}
				parts = append(parts, fmt.Sprintf("%s (%d)", res.Label, res.Count))
			}
			if len(parts) > 0 {
				fmt.Fprintf(&b, "- %s: %s\n", q.Prompt, strings.Join(parts, ", "))
			} else {
				fmt.Fprintf(&b, "- %s\n", q.Prompt)
			}
		}
	}

	if len(lb) > 0 {
		b.WriteString("\nTop scores\n")
		for i, e := range lb {
			if i >= 5 {
				break
			}
			who := strings.TrimSpace(e.Name)
			if who == "" {
				who = "Anonymous"
			}
			fmt.Fprintf(&b, "%d. %s — %d pts\n", i+1, who, e.Points)
		}
	}

	if len(qaRows) > 0 {
		b.WriteString("\nQ&A highlights\n")
		for i, q := range qaRows {
			if i >= 5 {
				break
			}
			author := strings.TrimSpace(q.Author)
			if author == "" {
				author = "Anonymous"
			}
			fmt.Fprintf(&b, "- %s (%s, %d votes)\n", q.Body, author, q.Votes)
		}
	}

	fmt.Fprintf(&b, "\nFull results: %s/results/%s\n", baseURL(r), ev.Code)
	b.WriteString("You are receiving this recap because you opted in or are a host for this event.\n")
	return subject, b.String(), nil
}

type recapSubscribeRequest struct {
	Email string `json:"email"`
}

// RecapSubscribe stores an attendee email opt-in for an event.
// @Summary  Subscribe to the event recap
// @Tags     public
// @Accept   json
// @Produce  json
// @Param    code path string true "Event code"
// @Success  200 {object} map[string]any
// @Failure  400 {object} map[string]string
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/recap/subscribe [post]
func RecapSubscribe(w http.ResponseWriter, r *http.Request) {
	ev, err := db.GetEventByCode(r.PathValue("code"))
	if err != nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	var req recapSubscribeRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	email, err := normalizeEmail(req.Email)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	pid := participantID(w, r, ev.ID)
	if pid == 0 {
		jsonError(w, "could not identify participant", http.StatusInternalServerError)
		return
	}
	if err := db.SubscribeRecap(ev.ID, pid, email); err != nil {
		jsonError(w, "failed to save subscription", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "subscribed": true, "email": email})
}

// RecapUnsubscribe removes the participant's opt-in for an event.
// @Summary  Unsubscribe from the event recap
// @Tags     public
// @Produce  json
// @Param    code path string true "Event code"
// @Success  200 {object} map[string]any
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/recap/unsubscribe [post]
func RecapUnsubscribe(w http.ResponseWriter, r *http.Request) {
	ev, err := db.GetEventByCode(r.PathValue("code"))
	if err != nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	pid := participantID(w, r, ev.ID)
	if pid == 0 {
		jsonError(w, "could not identify participant", http.StatusInternalServerError)
		return
	}
	if err := db.UnsubscribeRecap(ev.ID, pid); err != nil {
		jsonError(w, "failed to remove subscription", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "subscribed": false})
}

// RecapSubscriptionDTO is one opt-in row in the admin recap view.
type RecapSubscriptionDTO struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Emoji     string `json:"emoji"`
	Color     string `json:"color"`
	CreatedAt string `json:"created_at,omitempty"`
}

func recapSubscriptionDTO(s db.RecapSubscription) RecapSubscriptionDTO {
	return RecapSubscriptionDTO{
		ID:        s.ID,
		Email:     s.Email,
		Name:      s.Name,
		Emoji:     s.Emoji,
		Color:     s.Color,
		CreatedAt: s.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func recapEvent(w http.ResponseWriter, r *http.Request) (*db.Event, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		jsonError(w, "invalid event id", http.StatusBadRequest)
		return nil, false
	}
	ev, err := db.GetEventByID(id)
	if err != nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return nil, false
	}
	return ev, true
}

// AdminListRecapSubscriptions lists an event's attendee opt-ins.
// @Summary  List recap subscriptions
// @Tags     admin
// @Produce  json
// @Security CookieAuth
// @Param    id path int true "Event id"
// @Success  200 {object} map[string]any
// @Failure  404 {object} map[string]string
// @Router   /api/admin/events/{id}/recap [get]
func AdminListRecapSubscriptions(w http.ResponseWriter, r *http.Request) {
	ev, ok := recapEvent(w, r)
	if !ok {
		return
	}
	subs, err := db.ListRecapSubscriptions(ev.ID)
	if err != nil {
		jsonError(w, "failed to load subscriptions", http.StatusInternalServerError)
		return
	}
	out := make([]RecapSubscriptionDTO, 0, len(subs))
	for _, s := range subs {
		out = append(out, recapSubscriptionDTO(s))
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscriptions": out})
}

// AdminDeleteRecapSubscription removes one attendee opt-in.
// @Summary  Remove a recap subscription
// @Tags     admin
// @Produce  json
// @Security CookieAuth
// @Param    id path int true "Event id"
// @Param    sid path int true "Subscription id"
// @Success  200 {object} map[string]any
// @Failure  404 {object} map[string]string
// @Router   /api/admin/events/{id}/recap/{sid} [delete]
func AdminDeleteRecapSubscription(w http.ResponseWriter, r *http.Request) {
	ev, ok := recapEvent(w, r)
	if !ok {
		return
	}
	sid, err := strconv.ParseInt(r.PathValue("sid"), 10, 64)
	if err != nil || sid <= 0 {
		jsonError(w, "invalid subscription id", http.StatusBadRequest)
		return
	}
	if err := db.DeleteRecapSubscription(ev.ID, sid); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			jsonError(w, "subscription not found", http.StatusNotFound)
			return
		}
		jsonError(w, "failed to remove subscription", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// RecapPreviewDTO is the rendered recap plus the resolved recipient list.
type RecapPreviewDTO struct {
	Subject    string   `json:"subject"`
	Body       string   `json:"body"`
	Recipients []string `json:"recipients"`
	Skipped    int      `json:"skipped"`
	Truncated  bool     `json:"truncated"`
	Cap        int      `json:"cap"`
}

// AdminGetRecapPreview renders the recap without sending anything.
// @Summary  Preview the event recap
// @Tags     admin
// @Produce  json
// @Security CookieAuth
// @Param    id path int true "Event id"
// @Success  200 {object} RecapPreviewDTO
// @Failure  404 {object} map[string]string
// @Router   /api/admin/events/{id}/recap/preview [get]
func AdminGetRecapPreview(w http.ResponseWriter, r *http.Request) {
	ev, ok := recapEvent(w, r)
	if !ok {
		return
	}
	subject, body, err := composeRecap(r, ev)
	if err != nil {
		jsonError(w, "failed to compose recap", http.StatusInternalServerError)
		return
	}
	recipients, skipped, err := resolveRecipients(ev)
	if err != nil {
		jsonError(w, "failed to resolve recipients", http.StatusInternalServerError)
		return
	}
	truncated := false
	if len(recipients) > recapRecipientCap {
		recipients = recipients[:recapRecipientCap]
		truncated = true
	}
	writeJSON(w, http.StatusOK, RecapPreviewDTO{
		Subject:    subject,
		Body:       body,
		Recipients: recipients,
		Skipped:    skipped,
		Truncated:  truncated,
		Cap:        recapRecipientCap,
	})
}

type recapSendResultDTO struct {
	Email string `json:"email"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// RecapSendDTO summarizes one send: per-recipient outcomes plus counters.
type RecapSendDTO struct {
	Sent      int                  `json:"sent"`
	Failed    int                  `json:"failed"`
	Skipped   int                  `json:"skipped"`
	Truncated bool                 `json:"truncated"`
	Cap       int                  `json:"cap"`
	Results   []recapSendResultDTO `json:"results"`
}

// AdminSendRecap emails the recap to every resolved recipient.
// @Summary  Send the event recap
// @Tags     admin
// @Produce  json
// @Security CookieAuth
// @Param    id path int true "Event id"
// @Success  200 {object} RecapSendDTO
// @Failure  400 {object} map[string]string
// @Failure  404 {object} map[string]string
// @Router   /api/admin/events/{id}/recap/send [post]
func AdminSendRecap(w http.ResponseWriter, r *http.Request) {
	ev, ok := recapEvent(w, r)
	if !ok {
		return
	}
	if mailer == nil && !emailcfg.Effective().Enabled() {
		jsonError(w, "SMTP is not configured", http.StatusBadRequest)
		return
	}
	recipients, skipped, err := resolveRecipients(ev)
	if err != nil {
		jsonError(w, "failed to resolve recipients", http.StatusInternalServerError)
		return
	}
	if len(recipients) == 0 {
		jsonError(w, "no recipients", http.StatusBadRequest)
		return
	}
	truncated := false
	if len(recipients) > recapRecipientCap {
		recipients = recipients[:recapRecipientCap]
		truncated = true
	}
	subject, body, err := composeRecap(r, ev)
	if err != nil {
		jsonError(w, "failed to compose recap", http.StatusInternalServerError)
		return
	}
	m := getMailer()
	out := RecapSendDTO{
		Cap:       recapRecipientCap,
		Truncated: truncated,
		Skipped:   skipped,
		Results:   make([]recapSendResultDTO, 0, len(recipients)),
	}
	for _, email := range recipients {
		if err := m.Send(email, subject, body); err != nil {
			out.Failed++
			out.Results = append(out.Results, recapSendResultDTO{Email: email, Error: err.Error()})
			continue
		}
		out.Sent++
		out.Results = append(out.Results, recapSendResultDTO{Email: email, OK: true})
	}
	writeJSON(w, http.StatusOK, out)
}

// RecapSettingsDTO is the global host recipient list for recaps.
type RecapSettingsDTO struct {
	Emails string `json:"emails"`
}

// AdminGetRecapSettings returns the configured host recipients.
// @Summary  Get recap settings
// @Tags     admin
// @Produce  json
// @Security CookieAuth
// @Success  200 {object} RecapSettingsDTO
// @Router   /api/admin/settings/recap [get]
func AdminGetRecapSettings(w http.ResponseWriter, r *http.Request) {
	s, err := db.GetRecapSettings()
	if err != nil {
		jsonError(w, "failed to load recap settings", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, RecapSettingsDTO{Emails: s.Emails})
}

// AdminUpdateRecapSettings stores the host recipient list.
// @Summary  Update recap settings
// @Tags     admin
// @Accept   json
// @Produce  json
// @Security CookieAuth
// @Success  200 {object} RecapSettingsDTO
// @Router   /api/admin/settings/recap [put]
func AdminUpdateRecapSettings(w http.ResponseWriter, r *http.Request) {
	var req RecapSettingsDTO
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := db.UpdateRecapSettings(db.RecapSettings{Emails: req.Emails}); err != nil {
		jsonError(w, "failed to save recap settings", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, RecapSettingsDTO{Emails: req.Emails})
}
