package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"slides/db"
)

func tmpDBHandlers(t *testing.T) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "test.db")
	if err := db.Init(p); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
}

type mockMailer struct {
	sent []string
	err  error
}

func (m *mockMailer) Send(to, subject, body string) error {
	if m.err != nil {
		return m.err
	}
	m.sent = append(m.sent, to+"|"+body)
	return nil
}

func TestForgotAndReset(t *testing.T) {
	tmpDBHandlers(t)
	// create user with email
	h, _ := bcrypt.GenerateFromPassword([]byte("oldpass123"), bcrypt.DefaultCost)
	id, _ := db.CreateUser("alice", string(h), "admin")
	db.UpdateUserEmail(id, "alice@example.com")
	mm := &mockMailer{}
	old := mailer
	mailer = mm
	t.Cleanup(func() { mailer = old })

	// forgot
	body := `{"email":"alice@example.com"}`
	req := httptest.NewRequest("POST", "/api/auth/forgot-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ForgotPassword(w, req)
	if w.Code != 200 {
		t.Fatalf("forgot %d %s", w.Code, w.Body.String())
	}
	if len(mm.sent) != 1 {
		t.Fatalf("not sent %+v", mm.sent)
	}
	// extract token from body
	sent := mm.sent[0]
	idx := strings.Index(sent, "/reset?token=")
	if idx == -1 {
		t.Fatalf("no token in %q", sent)
	}
	token := strings.TrimSpace(sent[idx+len("/reset?token="):])
	// split on newline
	if nl := strings.Index(token, "\n"); nl != -1 {
		token = token[:nl]
	}
	token = strings.TrimSpace(token)
	if token == "" {
		t.Fatal("empty token")
	}
	// verify hash exists
	hs := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(hs[:])
	if _, err := db.GetPasswordResetToken(hash); err != nil {
		t.Fatalf("token not in db %v", err)
	}
	// reset with new password
	body2 := `{"token":"` + token + `","new_password":"newpass123"}`
	req2 := httptest.NewRequest("POST", "/api/auth/reset-password", strings.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	ResetPassword(w2, req2)
	if w2.Code != 200 {
		t.Fatalf("reset %d %s", w2.Code, w2.Body.String())
	}
	// login with new password
	req3 := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"alice","password":"newpass123"}`))
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	Login(w3, req3)
	if w3.Code != 200 {
		t.Fatalf("login new %d %s", w3.Code, w3.Body.String())
	}
	// token reuse should fail
	req4 := httptest.NewRequest("POST", "/api/auth/reset-password", strings.NewReader(body2))
	req4.Header.Set("Content-Type", "application/json")
	w4 := httptest.NewRecorder()
	ResetPassword(w4, req4)
	if w4.Code == 200 {
		t.Fatal("reuse should fail")
	}
}

func TestResetInvalidAndExpired(t *testing.T) {
	tmpDBHandlers(t)
	h, _ := bcrypt.GenerateFromPassword([]byte("oldpass123"), bcrypt.DefaultCost)
	id, _ := db.CreateUser("bob", string(h), "admin")
	db.UpdateUserEmail(id, "bob@example.com")
	// invalid token
	req := httptest.NewRequest("POST", "/api/auth/reset-password", strings.NewReader(`{"token":"bad","new_password":"newpass123"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ResetPassword(w, req)
	if w.Code == 200 {
		t.Fatal("bad token should fail")
	}
	// expired token
	raw := "expiredtoken123"
	hs := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(hs[:])
	db.CreatePasswordResetToken(hash, id, time.Now().Add(-time.Hour))
	req2 := httptest.NewRequest("POST", "/api/auth/reset-password", strings.NewReader(`{"token":"`+raw+`","new_password":"newpass123"}`))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	ResetPassword(w2, req2)
	if w2.Code == 200 {
		t.Fatal("expired should fail")
	}
	// short password
	req3 := httptest.NewRequest("POST", "/api/auth/reset-password", strings.NewReader(`{"token":"`+raw+`","new_password":"short"}`))
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	ResetPassword(w3, req3)
	if w3.Code == 200 {
		t.Fatal("short pw should fail")
	}
}

func TestForgotEnumerationSafe(t *testing.T) {
	tmpDBHandlers(t)
	body := `{"email":"nonexistent@example.com"}`
	req := httptest.NewRequest("POST", "/api/auth/forgot-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ForgotPassword(w, req)
	if w.Code != 200 {
		t.Fatalf("should be 200 got %d", w.Code)
	}
}
