package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

type User struct {
	ID           int64
	Username     string
	PasswordHash string
	Role         string
	Email        string
	CreatedAt    time.Time
}

type EmailSettings struct {
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	SMTPTLS      string
}

type PasswordResetToken struct {
	TokenHash string
	UserID    int64
	ExpiresAt time.Time
	CreatedAt time.Time
}

type Session struct {
	Token     string
	UserID    int64
	ExpiresAt time.Time
}

type Event struct {
	ID                 int64
	Code               string
	RoomCode           string
	Name               string
	Description        string
	EventDate          string
	Status             string
	FeedbackOpen       bool
	ShowPodium         bool
	QASlowModeS        int
	ResultsPublished   bool
	FeatureLive        bool
	FeatureQA          bool
	FeatureSlides      bool
	FeatureFeedback    bool
	FeatureLeaderboard bool
	CreatedAt          time.Time
	QuestionCount      int
	PendingQACount     int
}

type Presentation struct {
	ID        int64
	EventID   int64
	Title     string
	Speaker   string
	Filename  string
	Size      int64
	CreatedAt time.Time
}

type Result struct {
	Label string `json:"label"`
	Count int    `json:"count"`
	// Score and AvgRank are only set for ranking questions.
	Score   float64 `json:"score,omitempty"`
	AvgRank float64 `json:"avg_rank,omitempty"`
}

// QuestionStats is the aggregate result set for one question.
type QuestionStats struct {
	Results     []Result
	Total       int  // responses (ballots) for multi/ranking, selections for the rest
	Respondents int  // distinct participants who answered
	NPS         *int // set for kind "nps"
}

type SlideState struct {
	Index int    `json:"index"`
	Total int    `json:"total"`
	Title string `json:"title"`
}

type Question struct {
	ID           int64
	EventID      int64
	Kind         string
	Mode         string
	Prompt       string
	Options      []string
	Position     int
	Status       string
	ShowResults  bool
	IsFeedback   bool
	MediaURL     string
	MediaType    string
	CreatedAt    time.Time
	Results      []Result `json:"results"`
	Total        int      `json:"total"`
	Respondents  int      `json:"respondents"`
	NPS          *int     `json:"nps,omitempty"`
	CorrectIndex *int
	PointsBase   int
	ActivatedAt  *int64
	DurationSec  int
	AutoClose    bool
	AutoReveal   bool
	TimeLimitS   int
}

type QAQuestion struct {
	ID            int64
	EventID       int64
	Body          string
	Author        string
	ParticipantID int64
	Flagged       bool
	Status        string
	Votes         int
	Voted         bool
	CreatedAt     time.Time
}

type AnalyticsSettings struct {
	UmamiScriptURL  string
	UmamiWebsiteID  string
	TrackingEnabled bool
}

// OTelSettings is the admin-managed OpenTelemetry configuration. Environment
// variables take precedence over these values.
type OTelSettings struct {
	Endpoint    string
	ServiceName string
	Headers     string
}

// FilterSettings is the global blocked-word content filter configuration.
// Action is "flag" (store the item as flagged for review) or "reject" (refuse
// the submission). Words is the raw, newline/comma separated list.
type FilterSettings struct {
	Enabled bool
	Words   string
	Action  string
}

// RecapSettings is the admin-configured host recipient list for recap emails.
// Emails is the raw, newline/comma separated list.
type RecapSettings struct {
	Emails string
}

// RecapSubscription is one attendee email opt-in for an event, joined with the
// participant's display identity for the admin list.
type RecapSubscription struct {
	ID            int64
	EventID       int64
	ParticipantID int64
	Email         string
	CreatedAt     time.Time
	Name          string
	Emoji         string
	Color         string
}

type Participant struct {
	ID          int64
	EventID     int64
	Token       string
	CreatedAt   time.Time
	DisplayName string
	Emoji       string
	Color       string
	LastSeen    int64
}

type Answer struct {
	ID            int64
	QuestionID    int64
	ParticipantID int64
	Value         string
	Status        string
	CreatedAt     time.Time
	IsCorrect     *bool
	PointsAwarded int
	ElapsedMs     *int
	ClientUUID    *string
}

var DB *sql.DB

func Init(path string) error {
	var err error
	// WAL + per-connection busy_timeout let many readers run concurrently with
	// a single writer; SQLite serialises writers itself.
	dsn := path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(1)"
	DB, err = sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	// Multiple connections: WAL gives concurrent readers + one writer, and
	// modernc applies busy_timeout per connection so writers queue instead of
	// failing with SQLITE_BUSY.
	DB.SetMaxOpenConns(8)
	DB.SetMaxIdleConns(8)
	DB.SetConnMaxIdleTime(5 * time.Minute)
	if err := migrate(); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}

func Close() error {
	if DB == nil {
		return nil
	}
	err := DB.Close()
	DB = nil
	return err
}

func migrate() error {
	_, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'admin',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			expires_at DATETIME NOT NULL
		);
		CREATE TABLE IF NOT EXISTS events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			code TEXT UNIQUE NOT NULL,
			room_code TEXT NOT NULL DEFAULT '',
			name TEXT NOT NULL,
			description TEXT DEFAULT '',
			event_date TEXT DEFAULT '',
			status TEXT NOT NULL DEFAULT 'open',
			feedback_open INTEGER NOT NULL DEFAULT 0,
			show_podium INTEGER NOT NULL DEFAULT 0,
			qa_slow_mode_s INTEGER NOT NULL DEFAULT 0,
			results_published INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS presentations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			speaker TEXT DEFAULT '',
			filename TEXT NOT NULL,
			size INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS questions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			kind TEXT NOT NULL,
			mode TEXT NOT NULL DEFAULT 'live',
			prompt TEXT NOT NULL,
			options TEXT NOT NULL DEFAULT '[]',
			position INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'draft',
			show_results INTEGER NOT NULL DEFAULT 1,
			is_feedback INTEGER NOT NULL DEFAULT 0,
			media_url TEXT NOT NULL DEFAULT '',
			media_type TEXT NOT NULL DEFAULT '',
			time_limit_s INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS participants (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			token TEXT UNIQUE NOT NULL,
			event_id INTEGER NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS answers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			question_id INTEGER NOT NULL,
			participant_id INTEGER NOT NULL,
			value TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'visible',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(question_id, participant_id)
		);
		CREATE TABLE IF NOT EXISTS qa_questions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			body TEXT NOT NULL,
			author TEXT NOT NULL DEFAULT '',
			participant_id INTEGER NOT NULL DEFAULT 0,
			flagged INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS qa_votes (
			qa_id INTEGER NOT NULL,
			participant_id INTEGER NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(qa_id, participant_id)
		);
		CREATE TABLE IF NOT EXISTS recap_subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			participant_id INTEGER NOT NULL,
			email TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(event_id, participant_id)
		);
		CREATE TABLE IF NOT EXISTS settings (
			id INTEGER PRIMARY KEY CHECK(id=1),
			umami_script_url TEXT NOT NULL DEFAULT '',
			umami_website_id TEXT NOT NULL DEFAULT '',
			tracking_enabled INTEGER NOT NULL DEFAULT 0,
			brand TEXT NOT NULL DEFAULT '',
			otel_endpoint TEXT NOT NULL DEFAULT '',
			otel_service_name TEXT NOT NULL DEFAULT '',
			otel_headers TEXT NOT NULL DEFAULT '',
			filter_enabled INTEGER NOT NULL DEFAULT 0,
			filter_words TEXT NOT NULL DEFAULT '',
			filter_action TEXT NOT NULL DEFAULT 'flag',
			recap_emails TEXT NOT NULL DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return err
	}
	_, err = DB.Exec("INSERT OR IGNORE INTO settings(id) VALUES(1)")
	if err != nil {
		return err
	}
	// Additive migrations for databases created before these columns existed.
	if err := ensureColumn("questions", "media_url", "media_url TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn("questions", "media_type", "media_type TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	for _, col := range []struct{ name, ddl string }{
		{"otel_endpoint", "otel_endpoint TEXT NOT NULL DEFAULT ''"},
		{"otel_service_name", "otel_service_name TEXT NOT NULL DEFAULT ''"},
		{"otel_headers", "otel_headers TEXT NOT NULL DEFAULT ''"},
	} {
		if err := ensureColumn("settings", col.name, col.ddl); err != nil {
			return err
		}
	}
	for _, col := range []struct{ name, ddl string }{
		{"smtp_host", "smtp_host TEXT NOT NULL DEFAULT ''"},
		{"smtp_port", "smtp_port INTEGER NOT NULL DEFAULT 0"},
		{"smtp_user", "smtp_user TEXT NOT NULL DEFAULT ''"},
		{"smtp_password", "smtp_password TEXT NOT NULL DEFAULT ''"},
		{"smtp_from", "smtp_from TEXT NOT NULL DEFAULT ''"},
		{"smtp_tls", "smtp_tls TEXT NOT NULL DEFAULT ''"},
	} {
		if err := ensureColumn("settings", col.name, col.ddl); err != nil {
			return err
		}
	}
	if err := ensureColumn("users", "email", "email TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if _, err := DB.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email <> ''"); err != nil {
		return err
	}
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS password_reset_tokens(
			token_hash TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		)`); err != nil {
		return err
	}
	if err := ensureColumn("events", "room_code", "room_code TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn("events", "show_podium", "show_podium INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	// Short, human-friendly join codes are unique when present but optional, so
	// the constraint is a partial index rather than a UNIQUE column.
	if _, err := DB.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_room_code ON events(room_code) WHERE room_code <> ''"); err != nil {
		return err
	}
	if err := backfillRoomCodes(); err != nil {
		return err
	}
	// quiz/identity migrations
	for _, col := range []struct{ name, ddl string }{
		{"correct_index", "correct_index INTEGER"},
		{"points_base", "points_base INTEGER NOT NULL DEFAULT 100"},
		{"activated_at", "activated_at INTEGER"},
		{"time_limit_s", "time_limit_s INTEGER NOT NULL DEFAULT 0"},
	} {
		if err := ensureColumn("questions", col.name, col.ddl); err != nil {
			return err
		}
	}
	for _, col := range []struct{ name, ddl string }{
		{"duration_sec", "duration_sec INTEGER NOT NULL DEFAULT 0"},
		{"auto_close", "auto_close INTEGER NOT NULL DEFAULT 1"},
		{"auto_reveal", "auto_reveal INTEGER NOT NULL DEFAULT 0"},
	} {
		if err := ensureColumn("questions", col.name, col.ddl); err != nil {
			return err
		}
	}
	for _, col := range []struct{ name, ddl string }{
		{"is_correct", "is_correct INTEGER"},
		{"points_awarded", "points_awarded INTEGER NOT NULL DEFAULT 0"},
		{"elapsed_ms", "elapsed_ms INTEGER"},
		{"client_uuid", "client_uuid TEXT"},
	} {
		if err := ensureColumn("answers", col.name, col.ddl); err != nil {
			return err
		}
	}
	for _, col := range []struct{ name, ddl string }{
		{"display_name", "display_name TEXT"},
		{"emoji", "emoji TEXT"},
		{"color", "color TEXT"},
		{"last_seen", "last_seen INTEGER"},
	} {
		if err := ensureColumn("participants", col.name, col.ddl); err != nil {
			return err
		}
	}
	// moderation migrations
	for _, col := range []struct{ name, ddl string }{
		{"status", "status TEXT NOT NULL DEFAULT 'visible'"},
	} {
		if err := ensureColumn("answers", col.name, col.ddl); err != nil {
			return err
		}
	}
	for _, col := range []struct{ name, ddl string }{
		{"participant_id", "participant_id INTEGER NOT NULL DEFAULT 0"},
		{"flagged", "flagged INTEGER NOT NULL DEFAULT 0"},
	} {
		if err := ensureColumn("qa_questions", col.name, col.ddl); err != nil {
			return err
		}
	}
	if err := ensureColumn("events", "qa_slow_mode_s", "qa_slow_mode_s INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	// recap migrations
	if err := ensureColumn("events", "results_published", "results_published INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := ensureColumn("settings", "recap_emails", "recap_emails TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	for _, col := range []struct{ name, ddl string }{
		{"filter_enabled", "filter_enabled INTEGER NOT NULL DEFAULT 0"},
		{"filter_words", "filter_words TEXT NOT NULL DEFAULT ''"},
		{"filter_action", "filter_action TEXT NOT NULL DEFAULT 'flag'"},
	} {
		if err := ensureColumn("settings", col.name, col.ddl); err != nil {
			return err
		}
	}
	if _, err := DB.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_client_uuid ON answers(client_uuid) WHERE client_uuid IS NOT NULL"); err != nil {
		return err
	}
	for _, col := range []struct{ name, ddl string }{
		{"webhook_url", "webhook_url TEXT NOT NULL DEFAULT ''"},
		{"webhook_secret", "webhook_secret TEXT NOT NULL DEFAULT ''"},
		{"webhook_enabled", "webhook_enabled INTEGER NOT NULL DEFAULT 0"},
		{"webhook_events", "webhook_events TEXT NOT NULL DEFAULT ''"},
	} {
		if err := ensureColumn("settings", col.name, col.ddl); err != nil {
			return err
		}
	}
	if err := ensureColumn("questions", "seed_key", "seed_key TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	for _, col := range []struct{ name, ddl string }{
		{"feature_live", "feature_live INTEGER NOT NULL DEFAULT 1"},
		{"feature_qa", "feature_qa INTEGER NOT NULL DEFAULT 1"},
		{"feature_slides", "feature_slides INTEGER NOT NULL DEFAULT 1"},
		{"feature_feedback", "feature_feedback INTEGER NOT NULL DEFAULT 1"},
		{"feature_leaderboard", "feature_leaderboard INTEGER NOT NULL DEFAULT 1"},
	} {
		if err := ensureColumn("events", col.name, col.ddl); err != nil {
			return err
		}
	}
	return nil
}

// roomAlphabet omits visually ambiguous characters (I, O, 0, 1) so codes can be
// read aloud or typed from a slide.
const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// roomCodeLen is the length of a generated room join code.
const roomCodeLen = 5

// GenRoomCode returns a random short, case-insensitive room code.
func GenRoomCode() (string, error) {
	b := make([]byte, roomCodeLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = roomAlphabet[int(b[i])%len(roomAlphabet)]
	}
	return string(b), nil
}

// NormalizeRoomCode upper-cases and trims a user-supplied room code so lookups
// are case-insensitive.
func NormalizeRoomCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

// backfillRoomCodes assigns a room code to any event that predates the feature.
func backfillRoomCodes() error {
	rows, err := DB.Query("SELECT id FROM events WHERE room_code='' OR room_code IS NULL")
	if err != nil {
		return err
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, id := range ids {
		for attempt := 0; attempt < 20; attempt++ {
			rc, err := GenRoomCode()
			if err != nil {
				return err
			}
			exists, err := RoomCodeExists(rc)
			if err != nil {
				return err
			}
			if exists {
				continue
			}
			if _, err := DB.Exec("UPDATE events SET room_code=? WHERE id=?", rc, id); err != nil {
				return err
			}
			break
		}
	}
	return nil
}

// ensureColumn adds a column to an existing table if it is missing. It is
// idempotent and safe to call on every startup.
func ensureColumn(table, column, ddl string) error {
	rows, err := DB.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return err
	}
	defer rows.Close()
	found := false
	for rows.Next() {
		var (
			cid     int
			name    string
			ctype   string
			notnull int
			dflt    sql.NullString
			pk      int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == column {
			found = true
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if found {
		return nil
	}
	_, err = DB.Exec("ALTER TABLE " + table + " ADD COLUMN " + ddl)
	return err
}

// helpers

func btoi(b bool) int {
	if b {
		return 1
	}
	return 0
}

func parseTime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05.999999999Z07:00",
		"2006-01-02 15:04:05.999999999",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse time %q", s)
}

func parseTimePragmatic(s string) time.Time {
	t, _ := parseTime(s)
	return t
}

// users/auth

func CountUsers() (int, error) {
	var n int
	err := DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&n)
	return n, err
}

// ListUserEmails returns the stored emails of all users, newest first,
// skipping empty addresses. Used to resolve recap host recipients.
func ListUserEmails() ([]string, error) {
	rows, err := DB.Query("SELECT email FROM users WHERE email <> '' ORDER BY id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return nil, err
		}
		out = append(out, email)
	}
	return out, rows.Err()
}

func CreateUser(username, passwordHash, role string) (int64, error) {
	if role == "" {
		role = "admin"
	}
	res, err := DB.Exec("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", username, passwordHash, role)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func GetUserByUsername(username string) (*User, error) {
	u := &User{}
	var ca string
	var email sql.NullString
	err := DB.QueryRow("SELECT id, username, password_hash, role, email, created_at FROM users WHERE username=?", username).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &email, &ca)
	if err != nil {
		return nil, err
	}
	if email.Valid {
		u.Email = email.String
	}
	u.CreatedAt = parseTimePragmatic(ca)
	return u, nil
}

func GetUserByID(id int64) (*User, error) {
	u := &User{}
	var ca string
	var email sql.NullString
	err := DB.QueryRow("SELECT id, username, password_hash, role, email, created_at FROM users WHERE id=?", id).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &email, &ca)
	if err != nil {
		return nil, err
	}
	if email.Valid {
		u.Email = email.String
	}
	u.CreatedAt = parseTimePragmatic(ca)
	return u, nil
}

func GetUserByEmail(email string) (*User, error) {
	u := &User{}
	var ca string
	var em sql.NullString
	err := DB.QueryRow("SELECT id, username, password_hash, role, email, created_at FROM users WHERE lower(email)=lower(?) AND email<>'' LIMIT 1", email).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &em, &ca)
	if err != nil {
		return nil, err
	}
	if em.Valid {
		u.Email = em.String
	}
	u.CreatedAt = parseTimePragmatic(ca)
	return u, nil
}

func UpdateUserEmail(id int64, email string) error {
	_, err := DB.Exec("UPDATE users SET email=? WHERE id=?", email, id)
	return err
}

func UpdateUserPassword(id int64, hash string) error {
	_, err := DB.Exec("UPDATE users SET password_hash=? WHERE id=?", hash, id)
	return err
}

func CreateSession(token string, userID int64, expires time.Time) error {
	_, err := DB.Exec("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, userID, expires.UTC().Format("2006-01-02 15:04:05"))
	return err
}

func GetSession(token string) (*Session, error) {
	s := &Session{}
	var ea string
	err := DB.QueryRow("SELECT token, user_id, expires_at FROM sessions WHERE token=?", token).Scan(&s.Token, &s.UserID, &ea)
	if err != nil {
		return nil, err
	}
	s.ExpiresAt = parseTimePragmatic(ea)
	return s, nil
}

func DeleteSession(token string) error {
	_, err := DB.Exec("DELETE FROM sessions WHERE token=?", token)
	return err
}

func DeleteExpiredSessions() error {
	_, err := DB.Exec("DELETE FROM sessions WHERE expires_at <= datetime('now')")
	return err
}

// events

func scanEventRow(row *sql.Row) (*Event, error) {
	if DB == nil {
		return nil, sql.ErrNoRows
	}
	var e Event
	var fo int
	var sp int
	var sm int
	var rp int
	var fl, fq, fs, ff, flb int
	var ca string
	err := row.Scan(&e.ID, &e.Code, &e.RoomCode, &e.Name, &e.Description, &e.EventDate, &e.Status, &fo, &sp, &sm, &rp, &fl, &fq, &fs, &ff, &flb, &ca)
	if err != nil {
		return nil, err
	}
	e.FeedbackOpen = fo == 1
	e.ShowPodium = sp == 1
	e.QASlowModeS = sm
	e.ResultsPublished = rp == 1
	e.FeatureLive = fl == 1
	e.FeatureQA = fq == 1
	e.FeatureSlides = fs == 1
	e.FeatureFeedback = ff == 1
	e.FeatureLeaderboard = flb == 1
	e.CreatedAt = parseTimePragmatic(ca)
	// populate counts
	_ = DB.QueryRow("SELECT COUNT(*) FROM questions WHERE event_id=?", e.ID).Scan(&e.QuestionCount)
	_ = DB.QueryRow("SELECT COUNT(*) FROM qa_questions WHERE event_id=? AND status='pending'", e.ID).Scan(&e.PendingQACount)
	return &e, nil
}

func scanEventRows(rows *sql.Rows) (*Event, error) {
	var e Event
	var fo int
	var sp int
	var sm int
	var rp int
	var fl, fq, fs, ff, flb int
	var ca string
	err := rows.Scan(&e.ID, &e.Code, &e.RoomCode, &e.Name, &e.Description, &e.EventDate, &e.Status, &fo, &sp, &sm, &rp, &fl, &fq, &fs, &ff, &flb, &ca)
	if err != nil {
		return nil, err
	}
	e.FeedbackOpen = fo == 1
	e.ShowPodium = sp == 1
	e.QASlowModeS = sm
	e.ResultsPublished = rp == 1
	e.FeatureLive = fl == 1
	e.FeatureQA = fq == 1
	e.FeatureSlides = fs == 1
	e.FeatureFeedback = ff == 1
	e.FeatureLeaderboard = flb == 1
	e.CreatedAt = parseTimePragmatic(ca)
	_ = DB.QueryRow("SELECT COUNT(*) FROM questions WHERE event_id=?", e.ID).Scan(&e.QuestionCount)
	_ = DB.QueryRow("SELECT COUNT(*) FROM qa_questions WHERE event_id=? AND status='pending'", e.ID).Scan(&e.PendingQACount)
	return &e, nil
}

func CreateEvent(name, code, description, eventDate string) (*Event, error) {
	res, err := DB.Exec("INSERT INTO events (name, code, description, event_date) VALUES (?, ?, ?, ?)", name, code, description, eventDate)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetEventByID(id)
}

func ListEvents() ([]Event, error) {
	rows, err := DB.Query("SELECT id, code, room_code, name, description, event_date, status, feedback_open, show_podium, qa_slow_mode_s, results_published, feature_live, feature_qa, feature_slides, feature_feedback, feature_leaderboard, created_at, (SELECT COUNT(*) FROM questions WHERE event_id=events.id) as qc, (SELECT COUNT(*) FROM qa_questions WHERE event_id=events.id AND status='pending') as pc FROM events ORDER BY created_at DESC, id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		var fo int
		var sp int
		var sm int
		var rp int
		var fl, fq, fs, ff, flb int
		var ca string
		if err := rows.Scan(&e.ID, &e.Code, &e.RoomCode, &e.Name, &e.Description, &e.EventDate, &e.Status, &fo, &sp, &sm, &rp, &fl, &fq, &fs, &ff, &flb, &ca, &e.QuestionCount, &e.PendingQACount); err != nil {
			return nil, err
		}
		e.FeedbackOpen = fo == 1
		e.ShowPodium = sp == 1
		e.QASlowModeS = sm
		e.ResultsPublished = rp == 1
		e.FeatureLive = fl == 1
		e.FeatureQA = fq == 1
		e.FeatureSlides = fs == 1
		e.FeatureFeedback = ff == 1
		e.FeatureLeaderboard = flb == 1
		e.CreatedAt = parseTimePragmatic(ca)
		out = append(out, e)
	}
	return out, rows.Err()
}

func GetEventByID(id int64) (*Event, error) {
	if DB == nil {
		return nil, sql.ErrNoRows
	}
	row := DB.QueryRow("SELECT id, code, room_code, name, description, event_date, status, feedback_open, show_podium, qa_slow_mode_s, results_published, feature_live, feature_qa, feature_slides, feature_feedback, feature_leaderboard, created_at FROM events WHERE id=?", id)
	return scanEventRow(row)
}

func GetEventByCode(code string) (*Event, error) {
	if DB == nil {
		return nil, sql.ErrNoRows
	}
	row := DB.QueryRow("SELECT id, code, room_code, name, description, event_date, status, feedback_open, show_podium, qa_slow_mode_s, results_published, feature_live, feature_qa, feature_slides, feature_feedback, feature_leaderboard, created_at FROM events WHERE code=?", code)
	e, err := scanEventRow(row)
	if err != nil {
		return nil, err
	}
	// populate question results not needed for events
	return e, nil
}

// GetEventByRoomCode looks up an event by its short, case-insensitive join code.
func GetEventByRoomCode(code string) (*Event, error) {
	if DB == nil {
		return nil, sql.ErrNoRows
	}
	rc := NormalizeRoomCode(code)
	if rc == "" {
		return nil, sql.ErrNoRows
	}
	row := DB.QueryRow("SELECT id, code, room_code, name, description, event_date, status, feedback_open, show_podium, qa_slow_mode_s, results_published, feature_live, feature_qa, feature_slides, feature_feedback, feature_leaderboard, created_at FROM events WHERE room_code=?", rc)
	return scanEventRow(row)
}

// RoomCodeExists reports whether a room code is already taken.
func RoomCodeExists(code string) (bool, error) {
	if NormalizeRoomCode(code) == "" {
		return false, nil
	}
	var n int
	err := DB.QueryRow("SELECT COUNT(*) FROM events WHERE room_code=?", NormalizeRoomCode(code)).Scan(&n)
	return n > 0, err
}

// SetEventRoomCode assigns or replaces an event's short join code.
func SetEventRoomCode(id int64, code string) error {
	_, err := DB.Exec("UPDATE events SET room_code=? WHERE id=?", NormalizeRoomCode(code), id)
	return err
}

// EnsureEvent returns the event with the given stable code, creating it (with a
// freshly generated unique room code) when it does not already exist. It is
// idempotent and safe to call on every startup; it is used to seed a
// deterministic event (e.g. the feature-test deck) on demand.
func EnsureEvent(code, name, description string) (*Event, bool, error) {
	if e, err := GetEventByCode(code); err == nil {
		return e, false, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}

	e, err := CreateEvent(name, code, description, "")
	if err != nil {
		// A concurrent startup may have inserted the same code; re-read.
		if existing, getErr := GetEventByCode(code); getErr == nil {
			return existing, false, nil
		}
		return nil, false, err
	}

	for attempt := 0; attempt < 20; attempt++ {
		rc, err := GenRoomCode()
		if err != nil {
			return e, true, err
		}
		exists, err := RoomCodeExists(rc)
		if err != nil {
			return e, true, err
		}
		if exists {
			continue
		}
		if err := SetEventRoomCode(e.ID, rc); err != nil {
			return e, true, err
		}
		e.RoomCode = rc
		return e, true, nil
	}
	return e, true, nil
}

func UpdateEvent(id int64, fields map[string]any) (*Event, error) {
	allowed := map[string]string{
		"name":                "name",
		"description":         "description",
		"event_date":          "event_date",
		"status":              "status",
		"feedback_open":       "feedback_open",
		"show_podium":         "show_podium",
		"qa_slow_mode_s":      "qa_slow_mode_s",
		"results_published":   "results_published",
		"feature_live":        "feature_live",
		"feature_qa":          "feature_qa",
		"feature_slides":      "feature_slides",
		"feature_feedback":    "feature_feedback",
		"feature_leaderboard": "feature_leaderboard",
	}
	var sets []string
	var args []any
	for k, v := range fields {
		col, ok := allowed[k]
		if !ok {
			continue
		}
		sets = append(sets, col+"=?")
		if col == "feedback_open" || col == "show_podium" || col == "results_published" || col == "feature_live" || col == "feature_qa" || col == "feature_slides" || col == "feature_feedback" || col == "feature_leaderboard" {
			switch val := v.(type) {
			case bool:
				args = append(args, btoi(val))
			case int:
				args = append(args, val)
			case int64:
				args = append(args, val)
			default:
				args = append(args, v)
			}
		} else {
			args = append(args, v)
		}
	}
	if len(sets) > 0 {
		args = append(args, id)
		_, err := DB.Exec("UPDATE events SET "+strings.Join(sets, ", ")+" WHERE id=?", args...)
		if err != nil {
			return nil, err
		}
	}
	return GetEventByID(id)
}

// SetResultsPublished toggles the public results page for an event.
func SetResultsPublished(eventID int64, published bool) (*Event, error) {
	return UpdateEvent(eventID, map[string]any{"results_published": published})
}

func DeleteEvent(id int64) error {
	_, err := DB.Exec("DELETE FROM events WHERE id=?", id)
	return err
}

func EventCodeExists(code string) (bool, error) {
	if code == "" {
		return false, nil
	}
	var n int
	err := DB.QueryRow("SELECT COUNT(*) FROM events WHERE code=?", code).Scan(&n)
	return n > 0, err
}

func ListParticipants(eventID int64) ([]Participant, error) {
	rows, err := DB.Query("SELECT id,event_id,token,created_at,display_name,emoji,color,last_seen FROM participants WHERE event_id=? ORDER BY last_seen DESC, id DESC LIMIT 200", eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Participant
	for rows.Next() {
		var p Participant
		var ca string
		var dn, em, cl sql.NullString
		var ls sql.NullInt64
		if err := rows.Scan(&p.ID, &p.EventID, &p.Token, &ca, &dn, &em, &cl, &ls); err != nil {
			return nil, err
		}
		p.CreatedAt = parseTimePragmatic(ca)
		if dn.Valid {
			p.DisplayName = dn.String
		}
		if em.Valid {
			p.Emoji = em.String
		}
		if cl.Valid {
			p.Color = cl.String
		}
		if ls.Valid {
			p.LastSeen = ls.Int64
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// presentations

func CreatePresentation(eventID int64, title, speaker, filename string, size int64) (*Presentation, error) {
	res, err := DB.Exec("INSERT INTO presentations (event_id, title, speaker, filename, size) VALUES (?, ?, ?, ?, ?)", eventID, title, speaker, filename, size)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetPresentation(id)
}

func ListPresentations(eventID int64) ([]Presentation, error) {
	rows, err := DB.Query("SELECT id, event_id, title, speaker, filename, size, created_at FROM presentations WHERE event_id=? ORDER BY created_at ASC, id ASC", eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Presentation
	for rows.Next() {
		var p Presentation
		var ca string
		if err := rows.Scan(&p.ID, &p.EventID, &p.Title, &p.Speaker, &p.Filename, &p.Size, &ca); err != nil {
			return nil, err
		}
		p.CreatedAt = parseTimePragmatic(ca)
		out = append(out, p)
	}
	return out, rows.Err()
}

func GetPresentation(id int64) (*Presentation, error) {
	var p Presentation
	var ca string
	err := DB.QueryRow("SELECT id, event_id, title, speaker, filename, size, created_at FROM presentations WHERE id=?", id).Scan(&p.ID, &p.EventID, &p.Title, &p.Speaker, &p.Filename, &p.Size, &ca)
	if err != nil {
		return nil, err
	}
	p.CreatedAt = parseTimePragmatic(ca)
	return &p, nil
}

func DeletePresentation(id int64) error {
	_, err := DB.Exec("DELETE FROM presentations WHERE id=?", id)
	return err
}

// questions

func scanQuestionRows(rows *sql.Rows) (*Question, error) {
	var q Question
	var opts, ca string
	var sr, fb int
	var ci, aa sql.NullInt64
	var pb sql.NullInt64
	var dur, tl sql.NullInt64
	var ac, ar sql.NullInt64
	err := rows.Scan(&q.ID, &q.EventID, &q.Kind, &q.Mode, &q.Prompt, &opts, &q.Position, &q.Status, &sr, &fb, &q.MediaURL, &q.MediaType, &ca, &ci, &pb, &aa, &dur, &ac, &ar, &tl)
	if err != nil {
		return nil, err
	}
	q.ShowResults = sr == 1
	q.IsFeedback = fb == 1
	q.CreatedAt = parseTimePragmatic(ca)
	_ = json.Unmarshal([]byte(opts), &q.Options)
	if q.Options == nil {
		q.Options = []string{}
	}
	if ci.Valid {
		v := int(ci.Int64)
		q.CorrectIndex = &v
	}
	if pb.Valid {
		q.PointsBase = int(pb.Int64)
	} else {
		q.PointsBase = 100
	}
	if aa.Valid {
		v := aa.Int64
		q.ActivatedAt = &v
	}
	if dur.Valid {
		q.DurationSec = int(dur.Int64)
	}
	if ac.Valid {
		q.AutoClose = ac.Int64 != 0
	} else {
		q.AutoClose = true
	}
	if ar.Valid {
		q.AutoReveal = ar.Int64 != 0
	}
	if tl.Valid {
		q.TimeLimitS = int(tl.Int64)
	}
	return &q, nil
}

func fillQuestionStats(q *Question) {
	st, err := GetQuestionStats(q.ID)
	if err != nil || st == nil {
		q.Results = []Result{}
		return
	}
	q.Results = st.Results
	q.Total = st.Total
	q.Respondents = st.Respondents
	q.NPS = st.NPS
}

func scanQuestionRow(row *sql.Row) (*Question, error) {
	var q Question
	var opts, ca string
	var sr, fb int
	var ci, aa sql.NullInt64
	var pb sql.NullInt64
	var dur, tl sql.NullInt64
	var ac, ar sql.NullInt64
	err := row.Scan(&q.ID, &q.EventID, &q.Kind, &q.Mode, &q.Prompt, &opts, &q.Position, &q.Status, &sr, &fb, &q.MediaURL, &q.MediaType, &ca, &ci, &pb, &aa, &dur, &ac, &ar, &tl)
	if err != nil {
		return nil, err
	}
	q.ShowResults = sr == 1
	q.IsFeedback = fb == 1
	q.CreatedAt = parseTimePragmatic(ca)
	_ = json.Unmarshal([]byte(opts), &q.Options)
	if q.Options == nil {
		q.Options = []string{}
	}
	if ci.Valid {
		v := int(ci.Int64)
		q.CorrectIndex = &v
	}
	if pb.Valid {
		q.PointsBase = int(pb.Int64)
	} else {
		q.PointsBase = 100
	}
	if aa.Valid {
		v := aa.Int64
		q.ActivatedAt = &v
	}
	if dur.Valid {
		q.DurationSec = int(dur.Int64)
	}
	if ac.Valid {
		q.AutoClose = ac.Int64 != 0
	} else {
		q.AutoClose = true
	}
	if ar.Valid {
		q.AutoReveal = ar.Int64 != 0
	}
	if tl.Valid {
		q.TimeLimitS = int(tl.Int64)
	}
	fillQuestionStats(&q)
	return &q, nil
}

func CreateQuestion(eventID int64, kind, mode, prompt string, options []string, isFeedback, showResults bool, position int, mediaURL, mediaType string) (*Question, error) {
	if mode == "" {
		mode = "live"
	}
	b, _ := json.Marshal(options)
	if b == nil {
		b = []byte("[]")
	}
	res, err := DB.Exec("INSERT INTO questions (event_id, kind, mode, prompt, options, position, show_results, is_feedback, media_url, media_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", eventID, kind, mode, prompt, string(b), position, btoi(showResults), btoi(isFeedback), mediaURL, mediaType)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetQuestion(id)
}

func ListQuestions(eventID int64) ([]Question, error) {
	rows, err := DB.Query("SELECT id, event_id, kind, mode, prompt, options, position, status, show_results, is_feedback, media_url, media_type, created_at, correct_index, points_base, activated_at, duration_sec, auto_close, auto_reveal, time_limit_s FROM questions WHERE event_id=? AND is_feedback=0 ORDER BY position ASC, id ASC", eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Question
	for rows.Next() {
		q, err := scanQuestionRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *q)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		fillQuestionStats(&out[i])
	}
	return out, nil
}

func ListFeedbackQuestions(eventID int64) ([]Question, error) {
	rows, err := DB.Query("SELECT id, event_id, kind, mode, prompt, options, position, status, show_results, is_feedback, media_url, media_type, created_at, correct_index, points_base, activated_at, duration_sec, auto_close, auto_reveal, time_limit_s FROM questions WHERE event_id=? AND is_feedback=1 ORDER BY position ASC, id ASC", eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Question
	for rows.Next() {
		q, err := scanQuestionRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *q)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		fillQuestionStats(&out[i])
	}
	return out, nil
}

func GetQuestion(id int64) (*Question, error) {
	row := DB.QueryRow("SELECT id, event_id, kind, mode, prompt, options, position, status, show_results, is_feedback, media_url, media_type, created_at, correct_index, points_base, activated_at, duration_sec, auto_close, auto_reveal, time_limit_s FROM questions WHERE id=?", id)
	return scanQuestionRow(row)
}

func UpdateQuestion(id int64, fields map[string]any) (*Question, error) {
	allowed := map[string]string{
		"prompt":        "prompt",
		"options":       "options",
		"position":      "position",
		"show_results":  "show_results",
		"is_feedback":   "is_feedback",
		"kind":          "kind",
		"mode":          "mode",
		"status":        "status",
		"media_url":     "media_url",
		"media_type":    "media_type",
		"correct_index": "correct_index",
		"points_base":   "points_base",
		"activated_at":  "activated_at",
		"duration_sec":  "duration_sec",
		"auto_close":    "auto_close",
		"auto_reveal":   "auto_reveal",
		"time_limit_s":  "time_limit_s",
	}
	var sets []string
	var args []any
	for k, v := range fields {
		col, ok := allowed[k]
		if !ok {
			continue
		}
		switch col {
		case "options":
			// expect []string
			var s string
			switch val := v.(type) {
			case []string:
				b, _ := json.Marshal(val)
				s = string(b)
			case string:
				s = val
			default:
				b, _ := json.Marshal(v)
				s = string(b)
			}
			sets = append(sets, col+"=?")
			args = append(args, s)
		case "show_results", "is_feedback":
			switch val := v.(type) {
			case bool:
				sets = append(sets, col+"=?")
				args = append(args, btoi(val))
			case int:
				sets = append(sets, col+"=?")
				args = append(args, val)
			default:
				sets = append(sets, col+"=?")
				args = append(args, v)
			}
		default:
			sets = append(sets, col+"=?")
			args = append(args, v)
		}
	}
	if len(sets) > 0 {
		args = append(args, id)
		_, err := DB.Exec("UPDATE questions SET "+strings.Join(sets, ", ")+" WHERE id=?", args...)
		if err != nil {
			return nil, err
		}
		InvalidateQuestionStats(id)
	}
	return GetQuestion(id)
}

func DeleteQuestion(id int64) error {
	_, err := DB.Exec("DELETE FROM questions WHERE id=?", id)
	InvalidateQuestionStats(id)
	return err
}

func ActivateQuestion(eventID, questionID int64, durationOverride *int) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists int
	err = tx.QueryRow("SELECT COUNT(*) FROM questions WHERE id=? AND event_id=?", questionID, eventID).Scan(&exists)
	if err != nil {
		return err
	}
	if exists == 0 {
		return fmt.Errorf("question not found")
	}
	_, err = tx.Exec("UPDATE questions SET status='closed' WHERE event_id=? AND status IN ('live','locked','revealed')", eventID)
	if err != nil {
		return err
	}
	nowMs := time.Now().UnixMilli()
	if durationOverride != nil && *durationOverride > 0 {
		// Timed activation (override): results stay hidden until the timer expires
		// and the reaper auto-reveals them.
		_, err = tx.Exec("UPDATE questions SET status='live', activated_at=?, duration_sec=?, show_results=0 WHERE id=? AND event_id=?", nowMs, *durationOverride, questionID, eventID)
	} else {
		// No override: preserve the question's own timing. Only timed questions
		// hide results until auto-reveal; untimed questions keep their existing
		// show_results value (historical behavior: results visible after answering).
		_, err = tx.Exec("UPDATE questions SET status='live', activated_at=?, show_results=CASE WHEN duration_sec>0 THEN 0 ELSE show_results END WHERE id=? AND event_id=?", nowMs, questionID, eventID)
	}
	if err != nil {
		return err
	}
	// A new question always replaces the podium screen.
	_, err = tx.Exec("UPDATE events SET show_podium=0 WHERE id=?", eventID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func SetQuestionShowResults(qid int64, show bool) error {
	_, err := DB.Exec("UPDATE questions SET show_results=? WHERE id=?", btoi(show), qid)
	return err
}

func ListDueQuestions(nowMs int64) ([]Question, error) {
	rows, err := DB.Query("SELECT id, event_id, kind, mode, prompt, options, position, status, show_results, is_feedback, media_url, media_type, created_at, correct_index, points_base, activated_at, duration_sec, auto_close, auto_reveal, time_limit_s FROM questions WHERE status='live' AND duration_sec>0 AND activated_at IS NOT NULL AND activated_at + duration_sec*1000 <= ?", nowMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Question
	for rows.Next() {
		q, err := scanQuestionRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *q)
	}
	return out, rows.Err()
}

func ReorderQuestions(eventID int64, orderedIDs []int64) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// validate all ids belong to event
	for _, id := range orderedIDs {
		var cnt int
		if err := tx.QueryRow("SELECT COUNT(*) FROM questions WHERE id=? AND event_id=?", id, eventID).Scan(&cnt); err != nil {
			return err
		}
		if cnt == 0 {
			return fmt.Errorf("question %d not found for event", id)
		}
	}
	for idx, id := range orderedIDs {
		if _, err := tx.Exec("UPDATE questions SET position=? WHERE id=? AND event_id=?", idx, id, eventID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func NextQueuedQuestion(eventID int64) (*Question, error) {
	tx, err := DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var qid int64
	err = tx.QueryRow("SELECT id FROM questions WHERE event_id=? AND status='draft' ORDER BY position ASC, id ASC LIMIT 1", eventID).Scan(&qid)
	if err == sql.ErrNoRows {
		_ = tx.Rollback()
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec("UPDATE questions SET status='closed' WHERE event_id=? AND status='live'", eventID)
	if err != nil {
		return nil, err
	}
	nowMs := time.Now().UnixMilli()
	// Only timed questions hide results until auto-reveal; untimed questions
	// preserve their existing show_results (historical behavior).
	_, err = tx.Exec("UPDATE questions SET status='live', activated_at=?, show_results=CASE WHEN duration_sec>0 THEN 0 ELSE show_results END WHERE id=? AND event_id=?", nowMs, qid, eventID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return GetQuestion(qid)
}

func SkipLiveQuestion(eventID int64) error {
	_, err := DB.Exec("UPDATE questions SET status='closed' WHERE event_id=? AND status='live'", eventID)
	return err
}

func CloseQuestion(eventID, questionID int64) error {
	res, err := DB.Exec("UPDATE questions SET status='closed' WHERE id=? AND event_id=?", questionID, eventID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("question not found")
	}
	return nil
}

func GetActiveQuestion(eventID int64) (*Question, error) {
	row := DB.QueryRow("SELECT id, event_id, kind, mode, prompt, options, position, status, show_results, is_feedback, media_url, media_type, created_at, correct_index, points_base, activated_at, duration_sec, auto_close, auto_reveal, time_limit_s FROM questions WHERE event_id=? AND status IN ('live','locked','revealed') ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'locked' THEN 1 ELSE 2 END, activated_at DESC, id DESC LIMIT 1", eventID)
	q, err := scanQuestionRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return q, err
}

// LockExpiredQuestions moves every live, timed question whose deadline has
// passed into the locked phase. It returns how many questions changed so
// callers can broadcast only real transitions.
func LockExpiredQuestions(eventID, nowMs int64) (int64, error) {
	res, err := DB.Exec("UPDATE questions SET status='locked' WHERE event_id=? AND status='live' AND time_limit_s > 0 AND activated_at IS NOT NULL AND activated_at + time_limit_s*1000 <= ?", eventID, nowMs)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// LockQuestionIfExpired locks a single question when its deadline has passed.
// It is idempotent: a second call after the transition reports false.
func LockQuestionIfExpired(eventID, questionID, nowMs int64) (bool, error) {
	res, err := DB.Exec("UPDATE questions SET status='locked' WHERE id=? AND event_id=? AND status='live' AND time_limit_s > 0 AND activated_at IS NOT NULL AND activated_at + time_limit_s*1000 <= ?", questionID, eventID, nowMs)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// RevealQuestion moves a live or locked question into the revealed phase and
// publishes its results. Revealing an already-revealed question is a no-op.
func RevealQuestion(eventID, questionID int64) error {
	res, err := DB.Exec("UPDATE questions SET status='revealed', show_results=1 WHERE id=? AND event_id=? AND status IN ('live','locked','revealed')", questionID, eventID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		var status string
		err := DB.QueryRow("SELECT status FROM questions WHERE id=? AND event_id=?", questionID, eventID).Scan(&status)
		if err == sql.ErrNoRows {
			return fmt.Errorf("question not found")
		}
		if err != nil {
			return err
		}
		return fmt.Errorf("question cannot be revealed from status %q", status)
	}
	return nil
}

// SetQuestionSeedKey stores the stable seed key for a question.
func SetQuestionSeedKey(id int64, key string) error {
	_, err := DB.Exec("UPDATE questions SET seed_key=? WHERE id=?", key, id)
	return err
}

// GetQuestionBySeedKey returns the question with the given seed key for the event.
func GetQuestionBySeedKey(eventID int64, key string) (*Question, error) {
	row := DB.QueryRow("SELECT id, event_id, kind, mode, prompt, options, position, status, show_results, is_feedback, media_url, media_type, created_at, correct_index, points_base, activated_at, duration_sec, auto_close, auto_reveal, time_limit_s FROM questions WHERE event_id=? AND seed_key=?", eventID, key)
	return scanQuestionRow(row)
}

// ValidQuestionKind reports whether kind is a supported question type.
func ValidQuestionKind(kind string) bool {
	switch kind {
	case "poll", "multi", "ranking", "yesno", "rating", "nps", "open", "wordcloud":
		return true
	}
	return false
}

// ValidateAnswer checks and normalizes a raw client answer for a question kind.
// The returned value is the canonical string stored in the answers table.
func ValidateAnswer(kind string, options []string, raw string) (string, error) {
	switch kind {
	case "poll":
		v := strings.TrimSpace(raw)
		for _, o := range options {
			if v == o {
				return o, nil
			}
		}
		return "", fmt.Errorf("answer must be one of the options")
	case "multi":
		vals, err := parseAnswerArray(raw)
		if err != nil {
			return "", fmt.Errorf("answer must be a JSON array of options")
		}
		if len(vals) == 0 {
			return "", fmt.Errorf("select at least one option")
		}
		seen := map[string]bool{}
		out := make([]string, 0, len(vals))
		for _, v := range vals {
			v = strings.TrimSpace(v)
			if seen[v] {
				return "", fmt.Errorf("duplicate option in answer")
			}
			if !containsString(options, v) {
				return "", fmt.Errorf("unknown option in answer")
			}
			seen[v] = true
			out = append(out, v)
		}
		b, _ := json.Marshal(out)
		return string(b), nil
	case "ranking":
		vals, err := parseAnswerArray(raw)
		if err != nil {
			return "", fmt.Errorf("answer must be a JSON array of options")
		}
		if len(vals) != len(options) {
			return "", fmt.Errorf("answer must rank every option")
		}
		seen := map[string]bool{}
		for _, v := range vals {
			if !containsString(options, v) || seen[v] {
				return "", fmt.Errorf("answer must rank every option exactly once")
			}
			seen[v] = true
		}
		b, _ := json.Marshal(vals)
		return string(b), nil
	case "yesno":
		v := strings.ToLower(strings.TrimSpace(raw))
		if v == "yes" || v == "no" {
			return v, nil
		}
		return "", fmt.Errorf("answer must be yes or no")
	case "rating":
		v := strings.TrimSpace(raw)
		if v == "1" || v == "2" || v == "3" || v == "4" || v == "5" {
			return v, nil
		}
		return "", fmt.Errorf("answer must be a rating from 1 to 5")
	case "nps":
		v := strings.TrimSpace(raw)
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 10 {
			return "", fmt.Errorf("answer must be a score from 0 to 10")
		}
		return v, nil
	case "open":
		return validateTextAnswer(raw, 500)
	case "wordcloud":
		return validateTextAnswer(raw, 200)
	}
	return "", fmt.Errorf("unknown question kind")
}

func validateTextAnswer(raw string, max int) (string, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "", fmt.Errorf("answer is required")
	}
	if utf8.RuneCountInString(v) > max {
		return "", fmt.Errorf("answer is too long")
	}
	return v, nil
}

func parseAnswerArray(raw string) ([]string, error) {
	var vals []string
	if err := json.Unmarshal([]byte(raw), &vals); err != nil {
		return nil, err
	}
	return vals, nil
}

func containsString(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// GetQuestionStats aggregates the answers for a single question.
// Results are ordered by option order for choice kinds, by Borda score for
// ranking, by score value for nps and by count for open/wordcloud.
// computeQuestionStats aggregates answers for one question. GetQuestionStats
// wraps it with the in-process result cache.
func computeQuestionStats(questionID int64) (*QuestionStats, error) {
	var optsStr, kind string
	err := DB.QueryRow("SELECT options, kind FROM questions WHERE id=?", questionID).Scan(&optsStr, &kind)
	if err != nil {
		if err == sql.ErrNoRows {
			return &QuestionStats{Results: []Result{}}, nil
		}
		return nil, err
	}
	var opts []string
	_ = json.Unmarshal([]byte(optsStr), &opts)

	stats := &QuestionStats{}
	if err := DB.QueryRow("SELECT COUNT(DISTINCT participant_id) FROM answers WHERE question_id=? AND status='visible'", questionID).Scan(&stats.Respondents); err != nil {
		return nil, err
	}

	switch kind {
	case "multi":
		return multiStats(questionID, opts, stats)
	case "ranking":
		return rankingStats(questionID, opts, stats)
	case "nps":
		return npsStats(questionID, stats)
	}

	rows, err := DB.Query("SELECT value, COUNT(*) as cnt FROM answers WHERE question_id=? AND status='visible' GROUP BY value ORDER BY cnt DESC LIMIT 100", questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	countMap := map[string]int{}
	var raw []Result
	for rows.Next() {
		var val string
		var cnt int
		if err := rows.Scan(&val, &cnt); err != nil {
			return nil, err
		}
		countMap[val] = cnt
		raw = append(raw, Result{Label: val, Count: cnt})
		stats.Total += cnt
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	switch kind {
	case "poll", "rating", "yesno":
		if kind == "yesno" && len(opts) == 0 {
			opts = []string{"yes", "no"}
		}
		ordered := make([]Result, 0, len(opts)+len(raw))
		seen := map[string]bool{}
		for _, o := range opts {
			ordered = append(ordered, Result{Label: o, Count: countMap[o]})
			seen[o] = true
		}
		// Append any legacy values that are not among the options.
		for _, r := range raw {
			if !seen[r.Label] {
				ordered = append(ordered, r)
			}
		}
		stats.Results = ordered
	default:
		if raw == nil {
			raw = []Result{}
		}
		stats.Results = raw
	}
	return stats, nil
}

// multiStats counts how many respondents selected each option. Total is the
// number of ballots, so bar percentages read as "% of respondents".
func multiStats(questionID int64, opts []string, stats *QuestionStats) (*QuestionStats, error) {
	rows, err := DB.Query("SELECT value FROM answers WHERE question_id=? AND status='visible'", questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := map[string]int{}
	ballots := 0
	for rows.Next() {
		var val string
		if err := rows.Scan(&val); err != nil {
			return nil, err
		}
		var chosen []string
		if err := json.Unmarshal([]byte(val), &chosen); err != nil {
			continue
		}
		ballots++
		for _, c := range chosen {
			counts[c]++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	stats.Total = ballots
	stats.Results = orderedResults(opts, counts)
	return stats, nil
}

// rankingStats computes Borda points (n-rank, best rank = 1) and the average
// rank per option, ordered by score descending.
func rankingStats(questionID int64, opts []string, stats *QuestionStats) (*QuestionStats, error) {
	rows, err := DB.Query("SELECT value FROM answers WHERE question_id=? AND status='visible'", questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	n := len(opts)
	type rankAcc struct {
		score   float64
		rankSum float64
		count   int
	}
	accs := map[string]*rankAcc{}
	ballots := 0
	for rows.Next() {
		var val string
		if err := rows.Scan(&val); err != nil {
			return nil, err
		}
		var order []string
		if err := json.Unmarshal([]byte(val), &order); err != nil {
			continue
		}
		ballots++
		for i, label := range order {
			a := accs[label]
			if a == nil {
				a = &rankAcc{}
				accs[label] = a
			}
			a.count++
			a.score += float64(n - (i + 1))
			a.rankSum += float64(i + 1)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Build in option order first so score ties stay deterministic.
	results := make([]Result, 0, len(accs))
	seen := map[string]bool{}
	for _, o := range opts {
		if a := accs[o]; a != nil {
			results = append(results, rankResult(o, a.score, a.rankSum, a.count))
			seen[o] = true
		}
	}
	var extras []string
	for label := range accs {
		if !seen[label] {
			extras = append(extras, label)
		}
	}
	sort.Strings(extras)
	for _, label := range extras {
		a := accs[label]
		results = append(results, rankResult(label, a.score, a.rankSum, a.count))
	}
	sort.SliceStable(results, func(i, j int) bool { return results[i].Score > results[j].Score })
	stats.Total = ballots
	stats.Results = results
	return stats, nil
}

func rankResult(label string, score, rankSum float64, count int) Result {
	r := Result{Label: label, Count: count, Score: score}
	if count > 0 {
		r.AvgRank = rankSum / float64(count)
	}
	return r
}

// npsStats returns the 0..10 distribution plus the net promoter score.
func npsStats(questionID int64, stats *QuestionStats) (*QuestionStats, error) {
	rows, err := DB.Query("SELECT value, COUNT(*) FROM answers WHERE question_id=? AND status='visible' GROUP BY value", questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := [11]int{}
	for rows.Next() {
		var val string
		var cnt int
		if err := rows.Scan(&val, &cnt); err != nil {
			return nil, err
		}
		n, err := strconv.Atoi(strings.TrimSpace(val))
		if err != nil || n < 0 || n > 10 {
			continue
		}
		counts[n] += cnt
		stats.Total += cnt
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	stats.Results = make([]Result, 0, 11)
	for score := 0; score <= 10; score++ {
		stats.Results = append(stats.Results, Result{Label: strconv.Itoa(score), Count: counts[score]})
	}
	if stats.Total > 0 {
		promoters := counts[9] + counts[10]
		detractors := counts[0] + counts[1] + counts[2] + counts[3] + counts[4] + counts[5] + counts[6]
		nps := int(math.Round(100 * float64(promoters-detractors) / float64(stats.Total)))
		stats.NPS = &nps
	}
	return stats, nil
}

// orderedResults lists the given options in order (zero counts included),
// followed by any extra counted values.
func orderedResults(opts []string, counts map[string]int) []Result {
	ordered := make([]Result, 0, len(opts))
	seen := map[string]bool{}
	for _, o := range opts {
		ordered = append(ordered, Result{Label: o, Count: counts[o]})
		seen[o] = true
	}
	var extras []string
	for label := range counts {
		if !seen[label] {
			extras = append(extras, label)
		}
	}
	sort.Strings(extras)
	for _, label := range extras {
		ordered = append(ordered, Result{Label: label, Count: counts[label]})
	}
	return ordered
}

// answers

func GetAnswer(questionID, participantID int64) (*Answer, error) {
	var a Answer
	var ca string
	var ic sql.NullInt64
	var pa sql.NullInt64
	var em sql.NullInt64
	var cu sql.NullString
	err := DB.QueryRow("SELECT id, question_id, participant_id, value, status, created_at, is_correct, points_awarded, elapsed_ms, client_uuid FROM answers WHERE question_id=? AND participant_id=?", questionID, participantID).Scan(&a.ID, &a.QuestionID, &a.ParticipantID, &a.Value, &a.Status, &ca, &ic, &pa, &em, &cu)
	if err != nil {
		return nil, err
	}
	a.CreatedAt = parseTimePragmatic(ca)
	if ic.Valid {
		v := ic.Int64 != 0
		a.IsCorrect = &v
	}
	if pa.Valid {
		a.PointsAwarded = int(pa.Int64)
	}
	if em.Valid {
		v := int(em.Int64)
		a.ElapsedMs = &v
	}
	if cu.Valid {
		v := cu.String
		a.ClientUUID = &v
	}
	return &a, nil
}

func CountAnswers(questionID int64) (int, error) {
	var n int
	err := DB.QueryRow("SELECT COUNT(*) FROM answers WHERE question_id=?", questionID).Scan(&n)
	return n, err
}

// UpsertAnswerWithScoring inserts or updates an answer with scoring and optional client_uuid dedup.
// Returns is_correct, points_awarded, total_points.
func UpsertAnswerWithScoring(questionID, participantID int64, value string, clientUUID string) (bool, int, int, error) {
	return UpsertAnswerWithScoringStatus(questionID, participantID, value, clientUUID, "visible")
}

// UpsertAnswerWithScoringStatus is UpsertAnswerWithScoring with an explicit
// moderation status ("visible", "flagged" or "hidden"). Flagged answers are
// stored and scored but excluded from public aggregates until approved.
func UpsertAnswerWithScoringStatus(questionID, participantID int64, value string, clientUUID, status string) (bool, int, int, error) {
	if status == "" {
		status = "visible"
	}
	if clientUUID != "" {
		var exists int
		err := DB.QueryRow("SELECT COUNT(*) FROM answers WHERE client_uuid=?", clientUUID).Scan(&exists)
		if err == nil && exists > 0 {
			// duplicate, return existing scoring
			var ic sql.NullInt64
			var pa sql.NullInt64
			_ = DB.QueryRow("SELECT is_correct, points_awarded FROM answers WHERE client_uuid=?", clientUUID).Scan(&ic, &pa)
			correct := false
			if ic.Valid && ic.Int64 != 0 {
				correct = true
			}
			pts := 0
			if pa.Valid {
				pts = int(pa.Int64)
			}
			total, _ := GetParticipantTotalPoints(participantID)
			return correct, pts, total, nil
		}
	}
	// fetch question
	q, err := GetQuestion(questionID)
	if err != nil {
		return false, 0, 0, err
	}
	// compute scoring
	isCorrect := false
	points := 0
	elapsed := 0
	if q.CorrectIndex != nil && (q.Kind == "poll" || q.Kind == "yesno") {
		nowMs := time.Now().UnixMilli()
		if q.ActivatedAt != nil {
			elapsed = int(nowMs - *q.ActivatedAt)
			if elapsed < 0 {
				elapsed = 0
			}
			if elapsed > 30000 {
				elapsed = 30000
			}
		} else {
			elapsed = 0
		}
		correctVal := ""
		if q.Kind == "poll" {
			idx := *q.CorrectIndex
			if idx >= 0 && idx < len(q.Options) {
				correctVal = q.Options[idx]
			}
		} else {
			if *q.CorrectIndex == 0 {
				correctVal = "yes"
			} else {
				correctVal = "no"
			}
		}
		isCorrect = value == correctVal
		if isCorrect {
			pb := q.PointsBase
			if pb == 0 {
				pb = 100
			}
			points = int(math.Round(float64(pb) * (1 - float64(elapsed)/30000)))
			minPts := int(math.Round(float64(pb) * 0.1))
			if points < minPts {
				points = minPts
			}
		}
	}
	icVal := sql.NullInt64{Valid: true, Int64: 0}
	if isCorrect {
		icVal.Int64 = 1
	}
	// When correct_index is null, store NULL for is_correct
	var icParam any
	var elapsedParam any
	var pointsParam = points
	if q.CorrectIndex == nil {
		icParam = nil
		elapsedParam = nil
		pointsParam = 0
		isCorrect = false
	} else {
		icParam = icVal.Int64
		elapsedParam = elapsed
	}
	var cuParam any
	if clientUUID != "" {
		cuParam = clientUUID
	} else {
		cuParam = nil
	}
	_, err = DB.Exec(`INSERT INTO answers (question_id, participant_id, value, status, is_correct, points_awarded, elapsed_ms, client_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(question_id, participant_id) DO UPDATE SET value=excluded.value, status=excluded.status, is_correct=excluded.is_correct, points_awarded=excluded.points_awarded, elapsed_ms=excluded.elapsed_ms, client_uuid=COALESCE(excluded.client_uuid, answers.client_uuid), created_at=CURRENT_TIMESTAMP`, questionID, participantID, value, status, icParam, pointsParam, elapsedParam, cuParam)
	if err != nil {
		return false, 0, 0, err
	}
	InvalidateQuestionStats(questionID)
	// leaderboard cache invalidate handled via caller
	total, _ := GetParticipantTotalPoints(participantID)
	return isCorrect, pointsParam, total, nil
}

func GetParticipantTotalPoints(participantID int64) (int, error) {
	var n sql.NullInt64
	err := DB.QueryRow("SELECT SUM(points_awarded) FROM answers WHERE participant_id=? AND status='visible'", participantID).Scan(&n)
	if err != nil {
		return 0, err
	}
	if !n.Valid {
		return 0, nil
	}
	return int(n.Int64), nil
}

// participants

func GetOrCreateParticipant(token string, eventID int64) (int64, error) {
	var id int64
	err := DB.QueryRow("SELECT id FROM participants WHERE token=?", token).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	res, err := DB.Exec("INSERT INTO participants (token, event_id) VALUES (?, ?)", token, eventID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func GetParticipantByToken(token string) (*Participant, error) {
	var p Participant
	var ca string
	var dn, em, cl sql.NullString
	var ls sql.NullInt64
	err := DB.QueryRow("SELECT id, event_id, token, created_at, display_name, emoji, color, last_seen FROM participants WHERE token=?", token).Scan(&p.ID, &p.EventID, &p.Token, &ca, &dn, &em, &cl, &ls)
	if err != nil {
		return nil, err
	}
	p.CreatedAt = parseTimePragmatic(ca)
	if dn.Valid {
		p.DisplayName = dn.String
	}
	if em.Valid {
		p.Emoji = em.String
	}
	if cl.Valid {
		p.Color = cl.String
	}
	if ls.Valid {
		p.LastSeen = ls.Int64
	}
	return &p, nil
}

func UpdateParticipantIdentity(id int64, name, emoji, color string) error {
	_, err := DB.Exec("UPDATE participants SET display_name=?, emoji=?, color=?, last_seen=? WHERE id=?", name, emoji, color, time.Now().UnixMilli(), id)
	return err
}

func GetParticipantByID(id int64) (*Participant, error) {
	var p Participant
	var ca string
	var dn, em, cl sql.NullString
	var ls sql.NullInt64
	err := DB.QueryRow("SELECT id, event_id, token, created_at, display_name, emoji, color, last_seen FROM participants WHERE id=?", id).Scan(&p.ID, &p.EventID, &p.Token, &ca, &dn, &em, &cl, &ls)
	if err != nil {
		return nil, err
	}
	p.CreatedAt = parseTimePragmatic(ca)
	if dn.Valid {
		p.DisplayName = dn.String
	}
	if em.Valid {
		p.Emoji = em.String
	}
	if cl.Valid {
		p.Color = cl.String
	}
	if ls.Valid {
		p.LastSeen = ls.Int64
	}
	return &p, nil
}

// qa

func CreateQA(eventID int64, body, author string) (*QAQuestion, error) {
	return CreateQAWithParticipant(eventID, body, author, 0, false)
}

// CreateQAWithParticipant stores a Q&A question together with the submitting
// participant and the content-filter verdict.
func CreateQAWithParticipant(eventID int64, body, author string, participantID int64, flagged bool) (*QAQuestion, error) {
	res, err := DB.Exec("INSERT INTO qa_questions (event_id, body, author, participant_id, flagged) VALUES (?, ?, ?, ?, ?)", eventID, body, author, participantID, btoi(flagged))
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetQA(id)
}

func ListQA(eventID int64, statuses ...string) ([]QAQuestion, error) {
	var rows *sql.Rows
	var err error
	if len(statuses) == 0 {
		rows, err = DB.Query(`
			SELECT q.id, q.event_id, q.body, q.author, q.participant_id, q.flagged, q.status, q.created_at, COUNT(v.qa_id) as votes
			FROM qa_questions q LEFT JOIN qa_votes v ON v.qa_id=q.id
			WHERE q.event_id=?
			GROUP BY q.id ORDER BY q.flagged DESC, votes DESC, q.created_at ASC`, eventID)
	} else {
		ph := strings.Repeat("?,", len(statuses))
		ph = ph[:len(ph)-1]
		args := []any{eventID}
		for _, s := range statuses {
			args = append(args, s)
		}
		query := fmt.Sprintf(`
			SELECT q.id, q.event_id, q.body, q.author, q.participant_id, q.flagged, q.status, q.created_at, COUNT(v.qa_id) as votes
			FROM qa_questions q LEFT JOIN qa_votes v ON v.qa_id=q.id
			WHERE q.event_id=? AND q.status IN (%s)
			GROUP BY q.id ORDER BY q.flagged DESC, votes DESC, q.created_at ASC`, ph)
		rows, err = DB.Query(query, args...)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QAQuestion
	for rows.Next() {
		var q QAQuestion
		var ca string
		var flagged int
		if err := rows.Scan(&q.ID, &q.EventID, &q.Body, &q.Author, &q.ParticipantID, &flagged, &q.Status, &ca, &q.Votes); err != nil {
			return nil, err
		}
		q.Flagged = flagged == 1
		q.CreatedAt = parseTimePragmatic(ca)
		out = append(out, q)
	}
	return out, rows.Err()
}

func ListQAForParticipant(eventID, participantID int64) ([]QAQuestion, error) {
	rows, err := DB.Query(`
		SELECT q.id, q.event_id, q.body, q.author, q.participant_id, q.flagged, q.status, q.created_at, COUNT(v.qa_id) as votes,
		       CASE WHEN EXISTS(SELECT 1 FROM qa_votes WHERE qa_id=q.id AND participant_id=?) THEN 1 ELSE 0 END as voted
		FROM qa_questions q LEFT JOIN qa_votes v ON v.qa_id=q.id
		WHERE q.event_id=? AND q.status='approved'
		GROUP BY q.id ORDER BY q.flagged DESC, votes DESC, q.created_at ASC`, participantID, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QAQuestion
	for rows.Next() {
		var q QAQuestion
		var ca string
		var voted int
		var flagged int
		if err := rows.Scan(&q.ID, &q.EventID, &q.Body, &q.Author, &q.ParticipantID, &flagged, &q.Status, &ca, &q.Votes, &voted); err != nil {
			return nil, err
		}
		q.Flagged = flagged == 1
		q.CreatedAt = parseTimePragmatic(ca)
		q.Voted = voted == 1
		out = append(out, q)
	}
	return out, rows.Err()
}

func GetQA(id int64) (*QAQuestion, error) {
	var q QAQuestion
	var ca string
	var flagged int
	err := DB.QueryRow(`
		SELECT q.id, q.event_id, q.body, q.author, q.participant_id, q.flagged, q.status, q.created_at, COUNT(v.qa_id) as votes
		FROM qa_questions q LEFT JOIN qa_votes v ON v.qa_id=q.id
		WHERE q.id=? GROUP BY q.id`, id).Scan(&q.ID, &q.EventID, &q.Body, &q.Author, &q.ParticipantID, &flagged, &q.Status, &ca, &q.Votes)
	if err != nil {
		return nil, err
	}
	q.Flagged = flagged == 1
	q.CreatedAt = parseTimePragmatic(ca)
	return &q, nil
}

func UpdateQAStatus(id int64, status string) error {
	_, err := DB.Exec("UPDATE qa_questions SET status=? WHERE id=?", status, id)
	return err
}

func DeleteQA(id int64) error {
	_, err := DB.Exec("DELETE FROM qa_questions WHERE id=?", id)
	return err
}

func ToggleVote(qaID, participantID int64) (int, bool, error) {
	// try insert
	res, err := DB.Exec("INSERT OR IGNORE INTO qa_votes (qa_id, participant_id) VALUES (?, ?)", qaID, participantID)
	if err != nil {
		return 0, false, err
	}
	n, _ := res.RowsAffected()
	var voted bool
	if n == 1 {
		voted = true
	} else {
		// already exists, delete
		_, err = DB.Exec("DELETE FROM qa_votes WHERE qa_id=? AND participant_id=?", qaID, participantID)
		if err != nil {
			return 0, false, err
		}
		voted = false
	}
	var cnt int
	err = DB.QueryRow("SELECT COUNT(*) FROM qa_votes WHERE qa_id=?", qaID).Scan(&cnt)
	return cnt, voted, err
}

func CountPendingQA(eventID int64) (int, error) {
	var n int
	err := DB.QueryRow("SELECT COUNT(*) FROM qa_questions WHERE event_id=? AND status='pending'", eventID).Scan(&n)
	return n, err
}

// LastQASubmissionSeconds returns how many seconds ago the participant last
// submitted a Q&A question for the event. Slow mode uses the stored submission
// time, so reconnects and restarts do not reset the interval.
func LastQASubmissionSeconds(eventID, participantID int64) (int, bool, error) {
	var elapsed sql.NullInt64
	err := DB.QueryRow(`
		SELECT strftime('%s','now') - strftime('%s', created_at)
		FROM qa_questions
		WHERE event_id=? AND participant_id=?
		ORDER BY created_at DESC, id DESC LIMIT 1`, eventID, participantID).Scan(&elapsed)
	if err == sql.ErrNoRows {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return int(elapsed.Int64), true, nil
}

// answer moderation

// ModerationAnswer is one stored answer as shown in the admin moderation queue.
type ModerationAnswer struct {
	ID            int64
	QuestionID    int64
	Prompt        string
	Kind          string
	Value         string
	Status        string
	ParticipantID int64
	Name          string
	Emoji         string
	Color         string
	CreatedAt     time.Time
}

// ListAnswersForModeration returns stored answers for an event, optionally
// filtered by visibility status and question. Flagged answers sort first.
func ListAnswersForModeration(eventID int64, status string, questionID int64) ([]ModerationAnswer, error) {
	query := `SELECT a.id, a.question_id, q.prompt, q.kind, a.value, a.status, a.participant_id,
		COALESCE(NULLIF(p.display_name,''),'Anonymous'), COALESCE(NULLIF(p.emoji,''),'🙂'), COALESCE(NULLIF(p.color,''),'#6366F1'), a.created_at
		FROM answers a
		JOIN questions q ON q.id=a.question_id
		LEFT JOIN participants p ON p.id=a.participant_id
		WHERE q.event_id=?`
	args := []any{eventID}
	if status != "" {
		query += " AND a.status=?"
		args = append(args, status)
	}
	if questionID > 0 {
		query += " AND a.question_id=?"
		args = append(args, questionID)
	}
	query += " ORDER BY CASE a.status WHEN 'flagged' THEN 0 WHEN 'visible' THEN 1 ELSE 2 END, a.created_at DESC, a.id DESC"
	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ModerationAnswer{}
	for rows.Next() {
		var a ModerationAnswer
		var ca string
		if err := rows.Scan(&a.ID, &a.QuestionID, &a.Prompt, &a.Kind, &a.Value, &a.Status, &a.ParticipantID, &a.Name, &a.Emoji, &a.Color, &ca); err != nil {
			return nil, err
		}
		a.CreatedAt = parseTimePragmatic(ca)
		out = append(out, a)
	}
	return out, rows.Err()
}

// UpdateAnswerStatus changes the visibility of an answer, scoped to the event
// so cross-event ids are refused. Returns the owning question id.
func UpdateAnswerStatus(eventID, answerID int64, status string) (int64, error) {
	res, err := DB.Exec(`UPDATE answers SET status=? WHERE id=? AND question_id IN (SELECT id FROM questions WHERE event_id=?)`, status, answerID, eventID)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return 0, sql.ErrNoRows
	}
	var qid int64
	if err := DB.QueryRow("SELECT question_id FROM answers WHERE id=?", answerID).Scan(&qid); err != nil {
		return 0, err
	}
	return qid, nil
}

// leaderboard

type LeaderboardEntry struct {
	Rank   int    `json:"rank"`
	Name   string `json:"name"`
	Emoji  string `json:"emoji"`
	Color  string `json:"color"`
	Points int    `json:"points"`
}

var (
	lbMu    sync.RWMutex
	lbCache = map[int64]*lbCacheEntry{}
)

type lbCacheEntry struct {
	entries []LeaderboardEntry
	exp     time.Time
}

func GetLeaderboard(eventID int64) ([]LeaderboardEntry, error) {
	lbMu.RLock()
	if e, ok := lbCache[eventID]; ok && time.Now().Before(e.exp) {
		cp := append([]LeaderboardEntry(nil), e.entries...)
		lbMu.RUnlock()
		return cp, nil
	}
	lbMu.RUnlock()
	rows, err := DB.Query(`
		SELECT p.id, p.display_name, p.emoji, p.color, SUM(a.points_awarded) as pts
		FROM answers a
		JOIN questions q ON q.id=a.question_id
		JOIN participants p ON p.id=a.participant_id
		WHERE q.event_id=? AND a.participant_id IS NOT NULL AND a.status='visible'
		GROUP BY a.participant_id
		ORDER BY pts DESC, p.id ASC
		LIMIT 10`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LeaderboardEntry
	rank := 1
	for rows.Next() {
		var pid int64
		var dn, em, cl sql.NullString
		var pts sql.NullInt64
		if err := rows.Scan(&pid, &dn, &em, &cl, &pts); err != nil {
			return nil, err
		}
		name := "Anonymous"
		if dn.Valid && strings.TrimSpace(dn.String) != "" {
			name = dn.String
		}
		emoji := "🙂"
		if em.Valid && em.String != "" {
			emoji = em.String
		}
		color := "#6366F1"
		if cl.Valid && cl.String != "" {
			color = cl.String
		}
		points := 0
		if pts.Valid {
			points = int(pts.Int64)
		}
		out = append(out, LeaderboardEntry{Rank: rank, Name: name, Emoji: emoji, Color: color, Points: points})
		rank++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []LeaderboardEntry{}
	}
	lbMu.Lock()
	lbCache[eventID] = &lbCacheEntry{entries: append([]LeaderboardEntry(nil), out...), exp: time.Now().Add(1 * time.Second)}
	lbMu.Unlock()
	return out, nil
}

func InvalidateLeaderboard(eventID int64) {
	lbMu.Lock()
	delete(lbCache, eventID)
	lbMu.Unlock()
}

// settings

func GetAnalyticsSettings() (*AnalyticsSettings, error) {
	var s AnalyticsSettings
	var en int
	err := DB.QueryRow("SELECT umami_script_url, umami_website_id, tracking_enabled FROM settings WHERE id=1").Scan(&s.UmamiScriptURL, &s.UmamiWebsiteID, &en)
	if err != nil {
		return nil, err
	}
	s.TrackingEnabled = en == 1
	return &s, nil
}

func UpdateAnalyticsSettings(url, websiteID string, enabled bool) error {
	_, err := DB.Exec("UPDATE settings SET umami_script_url=?, umami_website_id=?, tracking_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", url, websiteID, btoi(enabled))
	return err
}

// GetOTelSettings returns the admin-managed OpenTelemetry configuration.
func GetOTelSettings() (*OTelSettings, error) {
	var s OTelSettings
	err := DB.QueryRow("SELECT otel_endpoint, otel_service_name, otel_headers FROM settings WHERE id=1").Scan(&s.Endpoint, &s.ServiceName, &s.Headers)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// UpdateOTelSettings stores the OpenTelemetry configuration. The values are
// applied on the next restart; environment variables still take precedence.
func UpdateOTelSettings(endpoint, serviceName, headers string) error {
	_, err := DB.Exec("UPDATE settings SET otel_endpoint=?, otel_service_name=?, otel_headers=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", endpoint, serviceName, headers)
	return err
}

func GetBranding() (string, error) {
	var b string
	err := DB.QueryRow("SELECT brand FROM settings WHERE id=1").Scan(&b)
	return b, err
}

func UpdateBranding(brand string) error {
	_, err := DB.Exec("UPDATE settings SET brand=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", brand)
	return err
}

func GetEmailSettings() (*EmailSettings, error) {
	var s EmailSettings
	err := DB.QueryRow("SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_tls FROM settings WHERE id=1").Scan(&s.SMTPHost, &s.SMTPPort, &s.SMTPUser, &s.SMTPPassword, &s.SMTPFrom, &s.SMTPTLS)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func UpdateEmailSettings(s EmailSettings) error {
	_, err := DB.Exec("UPDATE settings SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_password=?, smtp_from=?, smtp_tls=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", s.SMTPHost, s.SMTPPort, s.SMTPUser, s.SMTPPassword, s.SMTPFrom, s.SMTPTLS)
	return err
}

func GetWebhookSettings() (string, string, bool, []string, error) {
	var url, secret, eventsStr string
	var enabled int
	err := DB.QueryRow("SELECT webhook_url, webhook_secret, webhook_enabled, webhook_events FROM settings WHERE id=1").Scan(&url, &secret, &enabled, &eventsStr)
	if err != nil {
		return "", "", false, nil, err
	}
	var events []string
	if strings.TrimSpace(eventsStr) != "" {
		if err := json.Unmarshal([]byte(eventsStr), &events); err != nil {
			// Fallback: comma-separated
			parts := strings.Split(eventsStr, ",")
			events = nil
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p != "" {
					events = append(events, p)
				}
			}
			if events == nil {
				events = []string{}
			}
		}
	}
	if events == nil {
		events = []string{}
	}
	return url, secret, enabled == 1, events, nil
}

func UpdateWebhookSettings(url, secret string, enabled bool, events []string) error {
	var eventsStr string
	if len(events) > 0 {
		b, _ := json.Marshal(events)
		eventsStr = string(b)
	} else {
		eventsStr = ""
	}
	_, err := DB.Exec("UPDATE settings SET webhook_url=?, webhook_secret=?, webhook_enabled=?, webhook_events=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", url, secret, btoi(enabled), eventsStr)
	return err
}

func CloneEvent(sourceID int64, newCode, newName string) (int64, error) {
	tx, err := DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var src Event
	var fo int
	var ca string
	err = tx.QueryRow("SELECT id, code, room_code, name, description, event_date, status, feedback_open, created_at FROM events WHERE id=?", sourceID).Scan(&src.ID, &src.Code, &src.RoomCode, &src.Name, &src.Description, &src.EventDate, &src.Status, &fo, &ca)
	if err != nil {
		return 0, err
	}
	// Generate unique newCode if needed already handled by caller; ensure fallback here
	if newCode == "" {
		newCode = src.Code + "-copy"
	}
	// Ensure code uniqueness within transaction lookups against DB
	tryCode := newCode
	for i := 1; ; i++ {
		var cnt int
		if err := tx.QueryRow("SELECT COUNT(*) FROM events WHERE code=?", tryCode).Scan(&cnt); err != nil {
			return 0, err
		}
		if cnt == 0 {
			break
		}
		if i == 1 {
			tryCode = src.Code + "-copy2"
		} else {
			tryCode = fmt.Sprintf("%s-copy%d", src.Code, i+1)
		}
		if i > 20 {
			// fallback to random
			rc, _ := GenRoomCode()
			tryCode = src.Code + "-" + strings.ToLower(rc)
			var cnt2 int
			if err := tx.QueryRow("SELECT COUNT(*) FROM events WHERE code=?", tryCode).Scan(&cnt2); err != nil {
				return 0, err
			}
			if cnt2 == 0 {
				break
			}
		}
	}
	newCode = tryCode
	// Generate fresh room_code
	var newRoomCode string
	for attempt := 0; attempt < 30; attempt++ {
		rc, err := GenRoomCode()
		if err != nil {
			return 0, err
		}
		var cnt int
		if err := tx.QueryRow("SELECT COUNT(*) FROM events WHERE room_code=?", rc).Scan(&cnt); err != nil {
			return 0, err
		}
		if cnt == 0 {
			newRoomCode = rc
			break
		}
	}
	if newRoomCode == "" {
		rc, err := GenRoomCode()
		if err != nil {
			return 0, err
		}
		newRoomCode = rc
	}
	name := newName
	if strings.TrimSpace(name) == "" {
		name = src.Name
	}
	res, err := tx.Exec("INSERT INTO events (code, room_code, name, description, event_date, status, feedback_open) VALUES (?, ?, ?, ?, ?, ?, ?)", newCode, newRoomCode, name, src.Description, src.EventDate, src.Status, fo)
	if err != nil {
		return 0, err
	}
	newID, _ := res.LastInsertId()
	_, err = tx.Exec(`INSERT INTO questions (event_id, kind, mode, prompt, options, position, status, show_results, is_feedback, media_url, media_type, correct_index, points_base, duration_sec, auto_close, auto_reveal, time_limit_s, activated_at)
		SELECT ?, kind, mode, prompt, options, position, 'draft', 0, is_feedback, media_url, media_type, correct_index, points_base, duration_sec, auto_close, auto_reveal, time_limit_s, NULL FROM questions WHERE event_id=?`, newID, sourceID)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return newID, nil
}

// GetFilterSettings returns the global content-filter configuration.
func GetFilterSettings() (*FilterSettings, error) {
	var s FilterSettings
	var en int
	err := DB.QueryRow("SELECT filter_enabled, filter_words, filter_action FROM settings WHERE id=1").Scan(&en, &s.Words, &s.Action)
	if err != nil {
		return nil, err
	}
	s.Enabled = en == 1
	if s.Action == "" {
		s.Action = "flag"
	}
	return &s, nil
}

// UpdateFilterSettings stores the global content-filter configuration.
func UpdateFilterSettings(enabled bool, words, action string) error {
	_, err := DB.Exec("UPDATE settings SET filter_enabled=?, filter_words=?, filter_action=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", btoi(enabled), words, action)
	return err
}

// GetRecapSettings returns the admin-configured host recap recipient list.
func GetRecapSettings() (*RecapSettings, error) {
	var s RecapSettings
	err := DB.QueryRow("SELECT recap_emails FROM settings WHERE id=1").Scan(&s.Emails)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// UpdateRecapSettings stores the admin-configured host recap recipient list.
func UpdateRecapSettings(s RecapSettings) error {
	_, err := DB.Exec("UPDATE settings SET recap_emails=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", s.Emails)
	return err
}

// recap subscriptions

// SubscribeRecap stores or updates the recap opt-in for one participant.
func SubscribeRecap(eventID, participantID int64, email string) error {
	_, err := DB.Exec(`INSERT INTO recap_subscriptions (event_id, participant_id, email) VALUES (?, ?, ?)
		ON CONFLICT(event_id, participant_id) DO UPDATE SET email=excluded.email`, eventID, participantID, email)
	return err
}

// UnsubscribeRecap removes a participant's recap opt-in for an event.
func UnsubscribeRecap(eventID, participantID int64) error {
	_, err := DB.Exec("DELETE FROM recap_subscriptions WHERE event_id=? AND participant_id=?", eventID, participantID)
	return err
}

// GetRecapSubscription returns the participant's opted-in email for an event.
func GetRecapSubscription(eventID, participantID int64) (string, bool, error) {
	var email string
	err := DB.QueryRow("SELECT email FROM recap_subscriptions WHERE event_id=? AND participant_id=?", eventID, participantID).Scan(&email)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return email, true, nil
}

// ListRecapEmails returns the opted-in addresses for an event, in opt-in order.
func ListRecapEmails(eventID int64) ([]string, error) {
	rows, err := DB.Query("SELECT email FROM recap_subscriptions WHERE event_id=? ORDER BY created_at ASC, id ASC", eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return nil, err
		}
		out = append(out, email)
	}
	return out, rows.Err()
}

// ListRecapSubscriptions returns an event's opt-ins with participant display
// identity for the admin recap view.
func ListRecapSubscriptions(eventID int64) ([]RecapSubscription, error) {
	rows, err := DB.Query(`SELECT s.id, s.event_id, s.participant_id, s.email, s.created_at,
			COALESCE(p.display_name, 'Anonymous'), COALESCE(p.emoji, '🙂'), COALESCE(p.color, '#6366F1')
		FROM recap_subscriptions s
		LEFT JOIN participants p ON p.id = s.participant_id
		WHERE s.event_id=? ORDER BY s.created_at ASC, s.id ASC`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RecapSubscription
	for rows.Next() {
		var s RecapSubscription
		var ca string
		if err := rows.Scan(&s.ID, &s.EventID, &s.ParticipantID, &s.Email, &ca, &s.Name, &s.Emoji, &s.Color); err != nil {
			return nil, err
		}
		s.CreatedAt = parseTimePragmatic(ca)
		out = append(out, s)
	}
	return out, rows.Err()
}

// DeleteRecapSubscription removes one opt-in by id, scoped to the event.
func DeleteRecapSubscription(eventID, id int64) error {
	res, err := DB.Exec("DELETE FROM recap_subscriptions WHERE id=? AND event_id=?", id, eventID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// password reset tokens

func CreatePasswordResetToken(hash string, userID int64, expiresAt time.Time) error {
	_, err := DB.Exec("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", hash, userID, expiresAt.UTC().Format("2006-01-02 15:04:05"), time.Now().UTC().Format("2006-01-02 15:04:05"))
	return err
}

func GetPasswordResetToken(hash string) (*PasswordResetToken, error) {
	var t PasswordResetToken
	var ea, ca string
	err := DB.QueryRow("SELECT token_hash, user_id, expires_at, created_at FROM password_reset_tokens WHERE token_hash=?", hash).Scan(&t.TokenHash, &t.UserID, &ea, &ca)
	if err != nil {
		return nil, err
	}
	t.ExpiresAt = parseTimePragmatic(ea)
	t.CreatedAt = parseTimePragmatic(ca)
	return &t, nil
}

func DeletePasswordResetToken(hash string) error {
	_, err := DB.Exec("DELETE FROM password_reset_tokens WHERE token_hash=?", hash)
	return err
}

func DeletePasswordResetTokensByUser(userID int64) error {
	_, err := DB.Exec("DELETE FROM password_reset_tokens WHERE user_id=?", userID)
	return err
}

func DeleteExpiredPasswordResetTokens() error {
	_, err := DB.Exec("DELETE FROM password_reset_tokens WHERE expires_at <= datetime('now')")
	return err
}

// func GetWebhookSettings() (string, string, bool, []string, error) { return "", "", false, nil, nil }
