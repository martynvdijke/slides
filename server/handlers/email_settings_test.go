package handlers

import (
	"path/filepath"
	"testing"

	"slides/db"
)

// TestResolveTestEmailRecipient pins the fallback chain behind the settings
// panel's "Send test email" button. A fresh install has no account email and no
// SMTP user, so without the sender fallback the button could never succeed.
func TestResolveTestEmailRecipient(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "email-recipient.db")); err != nil {
		t.Fatalf("init: %v", err)
	}
	defer db.Close()
	// Isolate from whatever the host environment has configured.
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_PORT", "")
	t.Setenv("SMTP_USER", "")
	t.Setenv("SMTP_PASSWORD", "")
	t.Setenv("SMTP_FROM", "")
	t.Setenv("SMTP_TLS", "")

	if got := resolveTestEmailRecipient("", nil); got != "" {
		t.Fatalf("unconfigured recipient = %q, want empty", got)
	}

	// The configured sender is the last resort.
	if err := db.UpdateEmailSettings(db.EmailSettings{SMTPFrom: "sender@example.test"}); err != nil {
		t.Fatalf("update email settings: %v", err)
	}
	if got := resolveTestEmailRecipient("", nil); got != "sender@example.test" {
		t.Fatalf("sender fallback = %q, want sender@example.test", got)
	}

	// An account address outranks the sender, and an explicit address outranks both.
	user := &db.User{Email: "admin@example.test"}
	if got := resolveTestEmailRecipient("", user); got != "admin@example.test" {
		t.Fatalf("account recipient = %q, want admin@example.test", got)
	}
	if got := resolveTestEmailRecipient("explicit@example.test", user); got != "explicit@example.test" {
		t.Fatalf("explicit recipient = %q, want explicit@example.test", got)
	}

	// An email-shaped SMTP user outranks the sender; a non-address does not.
	if err := db.UpdateEmailSettings(db.EmailSettings{SMTPUser: "ops@example.test", SMTPFrom: "sender@example.test"}); err != nil {
		t.Fatalf("update email settings: %v", err)
	}
	if got := resolveTestEmailRecipient("", nil); got != "ops@example.test" {
		t.Fatalf("smtp user recipient = %q, want ops@example.test", got)
	}
	if err := db.UpdateEmailSettings(db.EmailSettings{SMTPUser: "admin", SMTPFrom: "sender@example.test"}); err != nil {
		t.Fatalf("update email settings: %v", err)
	}
	if got := resolveTestEmailRecipient("", nil); got != "sender@example.test" {
		t.Fatalf("non-address smtp user should fall through to sender, got %q", got)
	}
}
