package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"slides/db"
)

var (
	forgotIPMu    sync.Mutex
	forgotIP      = map[string][]time.Time{}
	forgotEmailMu sync.Mutex
	forgotEmail   = map[string][]time.Time{}
)

func rateLimitedIP(ip string) bool {
	forgotIPMu.Lock()
	defer forgotIPMu.Unlock()
	now := time.Now()
	cut := now.Add(-time.Minute)
	ts := forgotIP[ip]
	var keep []time.Time
	for _, t := range ts {
		if t.After(cut) {
			keep = append(keep, t)
		}
	}
	if len(keep) >= 5 {
		forgotIP[ip] = keep
		return true
	}
	keep = append(keep, now)
	forgotIP[ip] = keep
	return false
}

func rateLimitedEmail(email string) bool {
	forgotEmailMu.Lock()
	defer forgotEmailMu.Unlock()
	now := time.Now()
	cut := now.Add(-time.Hour)
	ts := forgotEmail[email]
	var keep []time.Time
	for _, t := range ts {
		if t.After(cut) {
			keep = append(keep, t)
		}
	}
	if len(keep) >= 3 {
		forgotEmail[email] = keep
		return true
	}
	keep = append(keep, now)
	forgotEmail[email] = keep
	return false
}

func baseURL(r *http.Request) string {
	if v := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")); v != "" {
		return strings.TrimRight(v, "/")
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

// ForgotPassword creates a reset token and emails it.
func ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Username string `json:"username"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
		return
	}
	input := strings.TrimSpace(req.Email)
	if input == "" {
		input = strings.TrimSpace(req.Username)
	}
	if input == "" {
		writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
		return
	}
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	if rateLimitedIP(ip) {
		writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
		return
	}
	if rateLimitedEmail(strings.ToLower(input)) {
		writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
		return
	}
	// lookup by email then username
	var user *db.User
	var err error
	user, err = db.GetUserByEmail(input)
	if err != nil || user == nil {
		user, err = db.GetUserByUsername(input)
		if err != nil || user == nil {
			writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
			return
		}
	}
	if strings.TrimSpace(user.Email) == "" {
		// no email on file — still respond 200 but log
		log.Printf("password reset: user %s has no email, skipping send", user.Username)
		writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
		return
	}
	// generate token
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		log.Printf("reset token rand: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
		return
	}
	token := hex.EncodeToString(raw)
	h := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(h[:])
	exp := time.Now().Add(time.Hour)
	if err := db.CreatePasswordResetToken(hash, user.ID, exp); err != nil {
		log.Printf("create reset token: %v", err)
		writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
		return
	}
	link := baseURL(r) + "/reset?token=" + token
	body := "You requested a password reset.\n\nClick the link to reset your password (expires in 1 hour):\n" + link + "\n\nIf you did not request this, ignore this email."
	m := getMailer()
	if err := m.Send(user.Email, "Password reset", body); err != nil {
		log.Printf("send reset email: %v", err)
		// do not expose error to client (enumeration-safe)
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "If that account exists, a reset link has been sent."})
}

func ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
		Password    string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	token := strings.TrimSpace(req.Token)
	pw := req.NewPassword
	if pw == "" {
		pw = req.Password
	}
	if len(pw) < 8 {
		jsonError(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	if token == "" {
		jsonError(w, "token is required", http.StatusBadRequest)
		return
	}
	h := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(h[:])
	rec, err := db.GetPasswordResetToken(hash)
	if err != nil {
		if err == sql.ErrNoRows {
			jsonError(w, "invalid or expired token", http.StatusBadRequest)
			return
		}
		jsonError(w, "invalid token", http.StatusBadRequest)
		return
	}
	if time.Now().After(rec.ExpiresAt) {
		_ = db.DeletePasswordResetToken(hash)
		jsonError(w, "invalid or expired token", http.StatusBadRequest)
		return
	}
	phash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := db.UpdateUserPassword(rec.UserID, string(phash)); err != nil {
		jsonError(w, "failed to update password", http.StatusInternalServerError)
		return
	}
	_ = db.DeletePasswordResetTokensByUser(rec.UserID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
