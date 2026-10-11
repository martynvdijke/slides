package db

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestGrid2x2Stats(t *testing.T) {
	tmpDB(t)
	InvalidateAllQuestionStats()
	ev, _ := CreateEvent("E", "C1", "", "")
	q, _ := CreateQuestion(ev.ID, "grid2x2", "live", "Grid?", nil, false, true, 1, "", "")

	p1, _ := GetOrCreateParticipant("g1", ev.ID)
	p2, _ := GetOrCreateParticipant("g2", ev.ID)
	p3, _ := GetOrCreateParticipant("g3", ev.ID)
	p4, _ := GetOrCreateParticipant("g4", ev.ID)
	p5, _ := GetOrCreateParticipant("g5", ev.ID)

	// Insert valid answers directly (via ValidateAnswer path uses status visible)
	mustAnswer := func(pid int64, raw string) {
		t.Helper()
		v, err := ValidateAnswer("grid2x2", nil, raw)
		if err != nil {
			t.Fatalf("validate %q: %v", raw, err)
		}
		if err := UpsertAnswer(q.ID, pid, v); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}
	mustAnswer(p1, `{"x":0.3,"y":0.7}`)
	mustAnswer(p2, `{"x":0.301,"y":0.701}`) // rounds to same as p1 -> merge
	mustAnswer(p3, `{"x":0.5,"y":0.5}`)
	// p4 valid as well
	mustAnswer(p4, `{"x":0.9,"y":0.1}`)

	// Insert malformed directly bypassing validation
	DB.Exec("INSERT INTO answers (question_id, participant_id, value, status) VALUES (?,?,?, 'visible')", q.ID, p5, "not-json")

	st, err := GetQuestionStats(q.ID)
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	// p5 malformed should be skipped, so total =4, respondents 5 but only 4 valid counted?
	// Respondents is distinct participants from DB regardless of validity (4+1=5). Our grid2x2Stats Total sums valid only.
	if st.Total != 4 {
		t.Fatalf("total %d want 4", st.Total)
	}
	if st.Respondents != 5 {
		t.Fatalf("respondents %d want 5", st.Respondents)
	}
	if len(st.Results) != 3 {
		t.Fatalf("results len %d want 3, got %+v", len(st.Results), st.Results)
	}
	// Check merged point
	found := false
	for _, r := range st.Results {
		if r.X == nil || r.Y == nil {
			t.Fatalf("missing x/y in %+v", r)
		}
		if fmt.Sprintf("%.2f", *r.X) == "0.30" && fmt.Sprintf("%.2f", *r.Y) == "0.70" {
			if r.Count != 2 {
				t.Fatalf("merged count %d want 2", r.Count)
			}
			if r.Label != "0.30, 0.70" {
				t.Fatalf("label %q", r.Label)
			}
			found = true
		}
		// Validate JSON shape emits x/y
		b, _ := json.Marshal(r)
		var m map[string]any
		json.Unmarshal(b, &m)
		if _, ok := m["x"]; !ok {
			t.Fatalf("json missing x in %s", string(b))
		}
		if _, ok := m["y"]; !ok {
			t.Fatalf("json missing y in %s", string(b))
		}
	}
	if !found {
		t.Fatalf("merged point not found in %+v", st.Results)
	}
}

func TestGrid2x2StatsInvalidSkipped(t *testing.T) {
	tmpDB(t)
	InvalidateAllQuestionStats()
	ev, _ := CreateEvent("E", "C1", "", "")
	q, _ := CreateQuestion(ev.ID, "grid2x2", "live", "Grid?", nil, false, true, 1, "", "")
	p1, _ := GetOrCreateParticipant("g1", ev.ID)
	DB.Exec("INSERT INTO answers (question_id, participant_id, value, status) VALUES (?,?,?, 'visible')", q.ID, p1, `{"x":2,"y":0}`)
	st, err := GetQuestionStats(q.ID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Total != 0 || len(st.Results) != 0 {
		t.Fatalf("should skip invalid, got %+v", st)
	}
}
