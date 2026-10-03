package db

import "testing"

func TestEmailSettingsRoundTrip(t *testing.T) {
	tmpDB(t)
	s, err := GetEmailSettings()
	if err != nil {
		t.Fatal(err)
	}
	if s.SMTPHost != "" || s.SMTPPort != 0 {
		t.Fatalf("defaults %+v", s)
	}
	exp := EmailSettings{SMTPHost: "smtp.example.com", SMTPPort: 587, SMTPUser: "u", SMTPPassword: "p", SMTPFrom: "from@example.com", SMTPTLS: "starttls"}
	if err := UpdateEmailSettings(exp); err != nil {
		t.Fatal(err)
	}
	got, _ := GetEmailSettings()
	if got.SMTPHost != exp.SMTPHost || got.SMTPPort != exp.SMTPPort || got.SMTPUser != exp.SMTPUser || got.SMTPPassword != exp.SMTPPassword || got.SMTPFrom != exp.SMTPFrom || got.SMTPTLS != exp.SMTPTLS {
		t.Fatalf("round trip %+v", got)
	}
}

func TestPasswordResetTokens(t *testing.T) {
	tmpDB(t)
	id, _ := CreateUser("alice", "hash", "admin")
	UpdateUserEmail(id, "alice@example.com")
	h := "abc123"
	if err := CreatePasswordResetToken(h, id, parseTimePragmatic("2099-01-01 00:00:00")); err != nil {
		t.Fatal(err)
	}
	rec, err := GetPasswordResetToken(h)
	if err != nil || rec.UserID != id {
		t.Fatalf("get %+v %v", rec, err)
	}
	if err := DeletePasswordResetToken(h); err != nil {
		t.Fatal(err)
	}
	if _, err := GetPasswordResetToken(h); err == nil {
		t.Fatal("should be deleted")
	}
}

func TestGetUserByEmail(t *testing.T) {
	tmpDB(t)
	id, _ := CreateUser("alice", "hash", "admin")
	UpdateUserEmail(id, "Alice@Example.COM")
	u, err := GetUserByEmail("alice@example.com")
	if err != nil || u.ID != id {
		t.Fatalf("case insensitive lookup failed %v %+v", err, u)
	}
	if _, err := GetUserByEmail("nope@example.com"); err == nil {
		t.Fatal("should not find")
	}
}
