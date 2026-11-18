package handlers

import (
	"net/http"
	"strings"

	"slides/db"
	"slides/emailcfg"
)

type EmailSettingsDTO struct {
	Host            string      `json:"host"`
	Port            int         `json:"port"`
	User            string      `json:"user"`
	From            string      `json:"from"`
	TLS             string      `json:"tls"`
	HasPass         bool        `json:"has_password"`
	Stored          EmailValues `json:"stored"`
	Effective       EmailValues `json:"effective"`
	Source          EmailValues `json:"source"`
	Enabled         bool        `json:"enabled"`
	RestartRequired bool        `json:"restart_required"`
}

type EmailValues struct {
	Host string `json:"host"`
	Port int    `json:"port"`
	User string `json:"user"`
	From string `json:"from"`
	TLS  string `json:"tls"`
}

func emailDTO() EmailSettingsDTO {
	stored := emailcfg.LoadStored()
	applied := emailcfg.Applied()
	eff := emailcfg.Effective()
	// password not exposed
	return EmailSettingsDTO{
		Host:            eff.Host,
		Port:            eff.Port,
		User:            eff.User,
		From:            eff.From,
		TLS:             eff.TLS,
		HasPass:         eff.Password != "",
		Stored:          EmailValues{Host: stored.Host, Port: stored.Port, User: stored.User, From: stored.From, TLS: stored.TLS},
		Effective:       EmailValues{Host: eff.Host, Port: eff.Port, User: eff.User, From: eff.From, TLS: eff.TLS},
		Source:          EmailValues{Host: eff.HostSource, Port: 0, User: eff.UserSource, From: eff.FromSource, TLS: eff.TLSSource},
		Enabled:         eff.Enabled(),
		RestartRequired: emailcfg.RestartRequired(stored, applied),
	}
}

func AdminGetEmailSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, emailDTO())
}

func AdminUpdateEmailSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
		From     string `json:"from"`
		TLS      string `json:"tls"`
	}
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.Host = strings.TrimSpace(req.Host)
	req.User = strings.TrimSpace(req.User)
	req.From = strings.TrimSpace(req.From)
	req.TLS = strings.ToLower(strings.TrimSpace(req.TLS))
	if req.TLS != "" && req.TLS != "starttls" && req.TLS != "ssl" && req.TLS != "none" {
		jsonError(w, "tls must be starttls, ssl or none", http.StatusBadRequest)
		return
	}
	if req.TLS == "" {
		req.TLS = "starttls"
	}
	if req.Port < 0 || req.Port > 65535 {
		jsonError(w, "invalid port", http.StatusBadRequest)
		return
	}
	// preserve password if not provided
	existing, _ := db.GetEmailSettings()
	pw := req.Password
	if pw == "" && existing != nil {
		pw = existing.SMTPPassword
	}
	if err := db.UpdateEmailSettings(db.EmailSettings{
		SMTPHost: req.Host, SMTPPort: req.Port, SMTPUser: req.User, SMTPPassword: pw, SMTPFrom: req.From, SMTPTLS: req.TLS,
	}); err != nil {
		jsonError(w, "could not save settings", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, emailDTO())
}

// resolveTestEmailRecipient picks where a "send test email" goes: an explicit
// address, then the signed-in user's address, then an email-shaped SMTP user,
// then the configured sender. The last fallback is what makes the settings
// panel's button work on a fresh install, where neither an account email nor an
// SMTP user exists yet.
func resolveTestEmailRecipient(explicit string, user *db.User) string {
	if to := strings.TrimSpace(explicit); to != "" {
		return to
	}
	if user != nil {
		if to := strings.TrimSpace(user.Email); to != "" {
			return to
		}
	}
	if es, _ := db.GetEmailSettings(); es != nil {
		if to := strings.TrimSpace(es.SMTPUser); strings.Contains(to, "@") {
			return to
		}
	}
	if cfg := emailcfg.Effective(); strings.TrimSpace(cfg.From) != "" {
		return strings.TrimSpace(cfg.From)
	}
	return ""
}

func AdminTestEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		To string `json:"to"`
	}
	_ = decodeJSON(r, &req)
	to := resolveTestEmailRecipient(req.To, currentUser(r))
	if to == "" {
		jsonError(w, "recipient required", http.StatusBadRequest)
		return
	}
	m := getMailer()
	if err := m.Send(to, "Test email from Slides", "This is a test email — SMTP is configured correctly."); err != nil {
		jsonError(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
