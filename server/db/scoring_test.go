package db

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

// scoringEvent creates an event with one participant so scoring can be exercised.
func scoringFixtures(t *testing.T) (eventID, participantID int64) {
	t.Helper()
	tmpDB(t)
	ev, err := CreateEvent("Scoring", "score-1", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	pid, err := GetOrCreateParticipant("tok-1", ev.ID)
	if err != nil {
		t.Fatalf("GetOrCreateParticipant: %v", err)
	}
	return ev.ID, pid
}

// setActivated sets a question's activation timestamp to a controlled age so
// the speed-scaled score is deterministic without sleeping.
func setActivated(t *testing.T, questionID int64, ageMs int64) {
	t.Helper()
	if _, err := DB.Exec("UPDATE questions SET activated_at=? WHERE id=?", time.Now().UnixMilli()-ageMs, questionID); err != nil {
		t.Fatalf("set activated_at: %v", err)
	}
}

func TestUpsertAnswerWithScoringCorrectFastAndSlow(t *testing.T) {
	eventID, pid := scoringFixtures(t)

	q, err := CreateQuestion(eventID, "poll", "live", "Which cloud?", []string{"AWS", "GCP", "Azure"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if _, err := UpdateQuestion(q.ID, map[string]any{"correct_index": 1, "points_base": 100}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}

	// Fast answer: essentially no elapsed time -> full points (100).
	setActivated(t, q.ID, 0)
	correct, pts, total, err := UpsertAnswerWithScoring(q.ID, pid, "GCP", "uuid-fast")
	if err != nil {
		t.Fatalf("fast scoring: %v", err)
	}
	if !correct {
		t.Fatalf("fast answer should be correct")
	}
	if pts != 100 {
		t.Fatalf("fast answer points = %d, want 100", pts)
	}
	if total != 100 {
		t.Fatalf("fast answer total = %d, want 100", total)
	}

	// Slow answer (25s of a 30s window): floor is round(pb*0.1)=10, so 17 is expected
	// only if formula were applied; but this is a second participant to avoid the
	// upsert-overwrites-same-row effect.
	pid2, err := GetOrCreateParticipant("tok-2", eventID)
	if err != nil {
		t.Fatalf("participant 2: %v", err)
	}
	setActivated(t, q.ID, 25000)
	_, slowPts, _, err := UpsertAnswerWithScoring(q.ID, pid2, "GCP", "uuid-slow")
	if err != nil {
		t.Fatalf("slow scoring: %v", err)
	}
	// points = max(round(pb*(1-elapsed/30000)), round(pb*0.1))
	// elapsed clamped to 25000 -> 100*(1-25/30)=16.67 -> 17; floor 10. Expect 17.
	if slowPts != 17 {
		t.Fatalf("slow answer points = %d, want 17", slowPts)
	}

	// Extremely slow (beyond window) clamps elapsed to 30000 -> floor 10.
	pid3, err := GetOrCreateParticipant("tok-3", eventID)
	if err != nil {
		t.Fatalf("participant 3: %v", err)
	}
	setActivated(t, q.ID, 999999)
	_, floorPts, _, err := UpsertAnswerWithScoring(q.ID, pid3, "GCP", "uuid-floor")
	if err != nil {
		t.Fatalf("floor scoring: %v", err)
	}
	if floorPts != 10 {
		t.Fatalf("clamped answer points = %d, want floor 10", floorPts)
	}
}

func TestUpsertAnswerWithScoringWrongAndUnscored(t *testing.T) {
	eventID, pid := scoringFixtures(t)

	q, err := CreateQuestion(eventID, "poll", "live", "Which cloud?", []string{"AWS", "GCP"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if _, err := UpdateQuestion(q.ID, map[string]any{"correct_index": 1, "points_base": 100}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	setActivated(t, q.ID, 0)

	correct, pts, total, err := UpsertAnswerWithScoring(q.ID, pid, "AWS", "wrong-1")
	if err != nil {
		t.Fatalf("wrong scoring: %v", err)
	}
	if correct {
		t.Fatalf("wrong answer must not be correct")
	}
	if pts != 0 || total != 0 {
		t.Fatalf("wrong answer points=%d total=%d, want 0/0", pts, total)
	}

	// A question with no correct_index scores nothing and stores NULL is_correct.
	q2, err := CreateQuestion(eventID, "poll", "live", "Favorite?", []string{"A", "B"}, false, true, 2, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion2: %v", err)
	}
	pid2, err := GetOrCreateParticipant("tok-unscored", eventID)
	if err != nil {
		t.Fatalf("participant: %v", err)
	}
	correct, pts, _, err = UpsertAnswerWithScoring(q2.ID, pid2, "A", "unscored-1")
	if err != nil {
		t.Fatalf("unscored: %v", err)
	}
	if correct || pts != 0 {
		t.Fatalf("unscored question should give 0/false, got correct=%v pts=%d", correct, pts)
	}
	var isCorrect sql.NullInt64
	if err := DB.QueryRow("SELECT is_correct FROM answers WHERE client_uuid=?", "unscored-1").Scan(&isCorrect); err != nil {
		t.Fatalf("query is_correct: %v", err)
	}
	if isCorrect.Valid {
		t.Fatalf("unscored answer is_correct should be NULL, got %d", isCorrect.Int64)
	}
}

func TestYesNoScoring(t *testing.T) {
	eventID, pid := scoringFixtures(t)

	q, err := CreateQuestion(eventID, "yesno", "live", "Agree?", []string{"Yes", "No"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if _, err := UpdateQuestion(q.ID, map[string]any{"correct_index": 0, "points_base": 100}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	setActivated(t, q.ID, 0)

	// correct_index 0 => "yes".
	correct, pts, _, err := UpsertAnswerWithScoring(q.ID, pid, "no", "yesno-wrong")
	if err != nil {
		t.Fatalf("yesno wrong: %v", err)
	}
	if correct || pts != 0 {
		t.Fatalf("yesno 'no' should be wrong, got correct=%v pts=%d", correct, pts)
	}

	pid2, err := GetOrCreateParticipant("tok-yes", eventID)
	if err != nil {
		t.Fatalf("participant: %v", err)
	}
	correct, pts, _, err = UpsertAnswerWithScoring(q.ID, pid2, "yes", "yesno-right")
	if err != nil {
		t.Fatalf("yesno right: %v", err)
	}
	if !correct || pts != 100 {
		t.Fatalf("yesno 'yes' should be correct 100, got correct=%v pts=%d", correct, pts)
	}
}

func TestUpsertAnswerClientUUIDDedup(t *testing.T) {
	eventID, pid := scoringFixtures(t)

	q, err := CreateQuestion(eventID, "poll", "live", "Which cloud?", []string{"AWS", "GCP"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if _, err := UpdateQuestion(q.ID, map[string]any{"correct_index": 1, "points_base": 100}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	setActivated(t, q.ID, 0)

	_, pts, total, err := UpsertAnswerWithScoring(q.ID, pid, "GCP", "dup-uuid")
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	if total != 100 {
		t.Fatalf("first total = %d, want 100", total)
	}

	// Same client_uuid replayed: must not double-count.
	correct, replayPts, replayTotal, err := UpsertAnswerWithScoring(q.ID, pid, "GCP", "dup-uuid")
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	if !correct || replayPts != pts {
		t.Fatalf("replay should return same scoring, got correct=%v pts=%d want %d", correct, replayPts, pts)
	}
	if replayTotal != 100 {
		t.Fatalf("replay total = %d, want 100 (no double count)", replayTotal)
	}

	// Confirm only one row exists for this client_uuid.
	var n int
	if err := DB.QueryRow("SELECT COUNT(*) FROM answers WHERE client_uuid=?", "dup-uuid").Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("rows for client_uuid = %d, want 1", n)
	}
}

func TestLeaderboardRankingAndLimit(t *testing.T) {
	eventID, _ := scoringFixtures(t)
	ev, err := GetEventByID(eventID)
	if err != nil {
		t.Fatalf("GetEventByID: %v", err)
	}

	q, err := CreateQuestion(eventID, "poll", "live", "Pick", []string{"A", "B"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	if _, err := UpdateQuestion(q.ID, map[string]any{"correct_index": 0, "points_base": 100}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	setActivated(t, q.ID, 0)

	// Two participants: alice (fast, 100) and bob (fast, 100). Give alice a second
	// correct answer to make a clear ranking. Both must appear.
	alice, _ := GetOrCreateParticipant("lb-alice", eventID)
	bob, _ := GetOrCreateParticipant("lb-bob", eventID)
	_ = UpdateParticipantIdentity(alice, "Alice", "🔥", "#EC4899")
	_ = UpdateParticipantIdentity(bob, "Bob", "👍", "#10B981")

	if _, _, _, err := UpsertAnswerWithScoring(q.ID, alice, "A", "lb-a1"); err != nil {
		t.Fatalf("alice answer: %v", err)
	}
	if _, _, _, err := UpsertAnswerWithScoring(q.ID, bob, "B", "lb-b1"); err != nil {
		t.Fatalf("bob answer: %v", err)
	}

	// Second question for alice only.
	q2, err := CreateQuestion(eventID, "poll", "live", "Pick2", []string{"A", "B"}, false, true, 2, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion2: %v", err)
	}
	if _, err := UpdateQuestion(q2.ID, map[string]any{"correct_index": 0, "points_base": 100}); err != nil {
		t.Fatalf("UpdateQuestion2: %v", err)
	}
	setActivated(t, q2.ID, 0)
	if _, _, _, err := UpsertAnswerWithScoring(q2.ID, alice, "A", "lb-a2"); err != nil {
		t.Fatalf("alice answer2: %v", err)
	}

	InvalidateLeaderboard(ev.ID)
	entries, err := GetLeaderboard(ev.ID)
	if err != nil {
		t.Fatalf("GetLeaderboard: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("leaderboard entries = %d, want 2 (%+v)", len(entries), entries)
	}
	if entries[0].Name != "Alice" {
		t.Fatalf("rank 1 = %q, want Alice (%+v)", entries[0].Name, entries)
	}
	if entries[0].Rank != 1 || entries[1].Rank != 2 {
		t.Fatalf("ranks = %d,%d want 1,2", entries[0].Rank, entries[1].Rank)
	}
	if entries[0].Points <= entries[1].Points {
		t.Fatalf("points not descending: %+v", entries)
	}
	if entries[0].Emoji != "🔥" || entries[0].Color != "#EC4899" {
		t.Fatalf("identity not surfaced: %+v", entries[0])
	}
}

func TestParticipantIdentityRoundTrip(t *testing.T) {
	tmpDB(t)
	ev, err := CreateEvent("Identity", "id-1", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	pid, err := GetOrCreateParticipant("id-tok", ev.ID)
	if err != nil {
		t.Fatalf("GetOrCreateParticipant: %v", err)
	}
	if err := UpdateParticipantIdentity(pid, "Carol", "😂", "#F59E0B"); err != nil {
		t.Fatalf("UpdateParticipantIdentity: %v", err)
	}
	p, err := GetParticipantByID(pid)
	if err != nil {
		t.Fatalf("GetParticipantByID: %v", err)
	}
	if p.DisplayName != "Carol" || p.Emoji != "😂" || p.Color != "#F59E0B" {
		t.Fatalf("identity not persisted: %+v", p)
	}
	// Token lookup returns the same identity.
	p2, err := GetParticipantByToken("id-tok")
	if err != nil {
		t.Fatalf("GetParticipantByToken: %v", err)
	}
	if p2.ID != pid || p2.DisplayName != "Carol" {
		t.Fatalf("token lookup mismatch: %+v", p2)
	}
}

// TestMigrationIdempotencyQuizColumns ensures the additive columns survive a
// second migrate and are usable.
func TestMigrationIdempotencyQuizColumns(t *testing.T) {
	p := filepath.Join(t.TempDir(), "mig.db")
	if err := Init(p); err != nil {
		t.Fatalf("Init1: %v", err)
	}
	if err := migrate(); err != nil {
		t.Fatalf("migrate again: %v", err)
	}
	Close()

	// Re-open and verify the new columns exist by using them.
	if err := Init(p); err != nil {
		t.Fatalf("Init2: %v", err)
	}
	defer Close()

	for _, tc := range []struct{ table, col string }{
		{"questions", "correct_index"},
		{"questions", "points_base"},
		{"questions", "activated_at"},
		{"answers", "is_correct"},
		{"answers", "points_awarded"},
		{"answers", "elapsed_ms"},
		{"answers", "client_uuid"},
		{"participants", "display_name"},
		{"participants", "emoji"},
		{"participants", "color"},
	} {
		var n int
		err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?", tc.table, tc.col).Scan(&n)
		if err != nil {
			t.Fatalf("pragma_table_info(%s.%s): %v", tc.table, tc.col, err)
		}
		if n != 1 {
			t.Fatalf("column %s.%s missing after re-migrate", tc.table, tc.col)
		}
	}
}
