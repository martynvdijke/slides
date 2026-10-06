package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"slides/db"
)

// quizMux wires the routes the quiz game loop relies on: the admin lifecycle
// (create/update/activate/close/reveal/podium) and the audience surfaces.
func quizMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/setup", Setup)
	mux.HandleFunc("POST /api/auth/login", Login)
	mux.Handle("POST /api/admin/events", AdminAuth(http.HandlerFunc(AdminCreateEvent)))
	mux.Handle("POST /api/admin/events/{id}/questions", AdminAuth(http.HandlerFunc(AdminCreateQuestion)))
	mux.Handle("PATCH /api/admin/events/{id}/questions/{qid}", AdminAuth(http.HandlerFunc(AdminUpdateQuestion)))
	mux.Handle("POST /api/admin/events/{id}/questions/{qid}/activate", AdminAuth(http.HandlerFunc(AdminActivateQuestion)))
	mux.Handle("POST /api/admin/events/{id}/questions/{qid}/close", AdminAuth(http.HandlerFunc(AdminCloseQuestion)))
	mux.Handle("POST /api/admin/events/{id}/questions/{qid}/reveal", AdminAuth(http.HandlerFunc(AdminRevealQuestion)))
	mux.Handle("POST /api/admin/events/{id}/podium", AdminAuth(http.HandlerFunc(AdminSetPodium)))
	mux.HandleFunc("GET /api/events/{code}/state", GetEventState)
	mux.HandleFunc("POST /api/events/{code}/answers", SubmitAnswer)
	return mux
}

func patchJSON(t *testing.T, client *http.Client, url string, body any) (int, map[string]any) {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal patch: %v", err)
	}
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(data))
	if err != nil {
		t.Fatalf("new patch request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("PATCH %s: %v", url, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// quizState is the subset of the audience state the tests assert on.
type quizState struct {
	Event struct {
		ShowPodium bool `json:"show_podium"`
	} `json:"event"`
	ActiveQuestion *struct {
		ID          int64  `json:"id"`
		Status      string `json:"status"`
		TimeLimitS  int    `json:"time_limit_s"`
		ActivatedAt *int64 `json:"activated_at"`
		DeadlineAt  *int64 `json:"deadline_at"`
		CorrectIdx  *int   `json:"correct_index"`
		Answered    bool   `json:"answered"`
		MyAnswer    string `json:"my_answer"`
		MyCorrect   *bool  `json:"my_correct"`
		MyPoints    *int   `json:"my_points"`
	} `json:"active_question"`
}

func getQuizState(t *testing.T, client *http.Client, srvURL, eventCode string) quizState {
	t.Helper()
	resp, err := client.Get(srvURL + "/api/events/" + eventCode + "/state")
	if err != nil {
		t.Fatalf("get state: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("state status = %d", resp.StatusCode)
	}
	var st quizState
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		t.Fatalf("decode state: %v", err)
	}
	return st
}

// newQuizEnv boots a DB + server with a signed-in admin and one event.
func newQuizEnv(t *testing.T) (srv *httptest.Server, client *http.Client, eventID int64, eventCode string) {
	t.Helper()
	if err := db.Init(filepath.Join(t.TempDir(), "quiz_loop.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	srv = httptest.NewServer(quizMux())
	t.Cleanup(srv.Close)

	client = newJarClient(t)
	if code, _ := postJSON(t, client, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}
	code, created := postJSON(t, client, srv.URL+"/api/admin/events", map[string]any{"name": "Quiz Loop"})
	if code != http.StatusOK {
		t.Fatalf("create event = %d (%v)", code, created)
	}
	return srv, client, int64(created["id"].(float64)), created["code"].(string)
}

func createQuizQuestion(t *testing.T, client *http.Client, srvURL string, eventID int64, body map[string]any) int64 {
	t.Helper()
	code, q := postJSON(t, client, srvURL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions", body)
	if code != http.StatusOK {
		t.Fatalf("create question = %d (%v)", code, q)
	}
	return int64(q["id"].(float64))
}

func TestQuizTimeLimitValidationAndStateFields(t *testing.T) {
	srv, client, eventID, eventCode := newQuizEnv(t)

	base := map[string]any{"kind": "poll", "prompt": "Pick", "options": []string{"A", "B"}}

	// Negative limits are rejected at create time.
	bad := map[string]any{}
	for k, v := range base {
		bad[k] = v
	}
	bad["time_limit_s"] = -5
	if code, body := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions", bad); code != http.StatusBadRequest {
		t.Fatalf("negative time_limit_s create = %d (%v), want 400", code, body)
	}

	// A valid limit round-trips.
	timed := map[string]any{}
	for k, v := range base {
		timed[k] = v
	}
	timed["time_limit_s"] = 20
	qid := createQuizQuestion(t, client, srv.URL, eventID, timed)
	qURL := srv.URL + "/api/admin/events/" + strconv.FormatInt(eventID, 10) + "/questions/" + strconv.FormatInt(qid, 10)

	// Invalid updates are rejected: negative limit and unknown status.
	if code, body := patchJSON(t, client, qURL, map[string]any{"time_limit_s": -1}); code != http.StatusBadRequest {
		t.Fatalf("negative time_limit_s patch = %d (%v), want 400", code, body)
	}
	if code, body := patchJSON(t, client, qURL, map[string]any{"status": "bogus"}); code != http.StatusBadRequest {
		t.Fatalf("invalid status patch = %d (%v), want 400", code, body)
	}
	if code, body := patchJSON(t, client, qURL, map[string]any{"time_limit_s": 15}); code != http.StatusOK {
		t.Fatalf("time_limit_s patch = %d (%v), want 200", code, body)
	} else if got, _ := body["time_limit_s"].(float64); int(got) != 15 {
		t.Fatalf("patched time_limit_s = %v, want 15", body["time_limit_s"])
	}

	// Activate and verify the state exposes a computed deadline.
	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(qid, 10)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate = %d", code)
	}
	st := getQuizState(t, client, srv.URL, eventCode)
	aq := st.ActiveQuestion
	if aq == nil || aq.Status != "live" || aq.ID != qid {
		t.Fatalf("active question = %+v, want live %d", aq, qid)
	}
	if aq.TimeLimitS != 15 || aq.ActivatedAt == nil || aq.DeadlineAt == nil {
		t.Fatalf("timed state fields = %+v, want limit 15 with activated_at/deadline_at", aq)
	}
	if want := *aq.ActivatedAt + 15_000; *aq.DeadlineAt != want {
		t.Fatalf("deadline_at = %d, want %d", *aq.DeadlineAt, want)
	}

	// Untimed questions keep the legacy shape: no deadline is emitted.
	untimed := map[string]any{}
	for k, v := range base {
		untimed[k] = v
	}
	untimed["prompt"] = "Untimed"
	q2 := createQuizQuestion(t, client, srv.URL, eventID, untimed)
	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(q2, 10)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate untimed = %d", code)
	}
	st = getQuizState(t, client, srv.URL, eventCode)
	if st.ActiveQuestion == nil || st.ActiveQuestion.TimeLimitS != 0 || st.ActiveQuestion.DeadlineAt != nil {
		t.Fatalf("untimed state = %+v, want no deadline", st.ActiveQuestion)
	}
}

func TestDeferredDisclosureLockRevealFlow(t *testing.T) {
	srv, client, eventID, eventCode := newQuizEnv(t)

	// A scored poll with show_results off defers correctness until reveal.
	qid := createQuizQuestion(t, client, srv.URL, eventID, map[string]any{
		"kind": "poll", "prompt": "Which cloud?", "options": []string{"AWS", "GCP"},
		"correct_index": 1, "show_results": false, "time_limit_s": 60,
	})
	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(qid, 10)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate = %d", code)
	}

	aud := newJarClient(t)
	st := getQuizState(t, aud, srv.URL, eventCode)
	if st.ActiveQuestion == nil || st.ActiveQuestion.CorrectIdx != nil {
		t.Fatalf("correct_index visible before reveal: %+v", st.ActiveQuestion)
	}

	// Answer correctly while live: score is counted, correctness is withheld.
	code, ans := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{
		"question_id": qid, "value": "GCP", "client_uuid": "quiz-u1",
	})
	if code != http.StatusOK {
		t.Fatalf("answer = %d (%v)", code, ans)
	}
	if _, ok := ans["is_correct"]; ok {
		t.Fatalf("live answer disclosed is_correct: %v", ans)
	}
	if tp, _ := ans["total_points"].(float64); tp <= 0 {
		t.Fatalf("live answer total_points = %v, want >0", ans["total_points"])
	}

	// Simulate a missed auto-lock timer: the deadline is in the past. The next
	// state build reconciles the phase, hiding results and rejecting answers.
	if _, err := db.UpdateQuestion(qid, map[string]any{"activated_at": time.Now().UnixMilli() - 70_000}); err != nil {
		t.Fatalf("backdate activation: %v", err)
	}
	st = getQuizState(t, aud, srv.URL, eventCode)
	if st.ActiveQuestion == nil || st.ActiveQuestion.Status != "locked" {
		t.Fatalf("state after deadline = %+v, want locked", st.ActiveQuestion)
	}
	if st.ActiveQuestion.CorrectIdx != nil || st.ActiveQuestion.MyCorrect != nil {
		t.Fatalf("locked state leaked correctness: %+v", st.ActiveQuestion)
	}
	if !st.ActiveQuestion.Answered || st.ActiveQuestion.MyAnswer != "GCP" {
		t.Fatalf("answered/my_answer not preserved: %+v", st.ActiveQuestion)
	}

	code, late := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{
		"question_id": qid, "value": "AWS", "client_uuid": "quiz-u2",
	})
	if code != http.StatusBadRequest || !strings.Contains(asString(late["error"]), "locked") {
		t.Fatalf("locked answer = %d (%v), want 400 locked", code, late)
	}

	// Revealing publishes the correct answer and the participant's result.
	if code, body := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(qid, 10)+"/reveal", nil); code != http.StatusOK {
		t.Fatalf("reveal = %d (%v)", code, body)
	}
	st = getQuizState(t, aud, srv.URL, eventCode)
	aq := st.ActiveQuestion
	if aq == nil || aq.Status != "revealed" {
		t.Fatalf("state after reveal = %+v, want revealed", aq)
	}
	if aq.CorrectIdx == nil || *aq.CorrectIdx != 1 {
		t.Fatalf("revealed correct_index = %v, want 1", aq.CorrectIdx)
	}
	if aq.MyCorrect == nil || !*aq.MyCorrect {
		t.Fatalf("revealed my_correct = %v, want true", aq.MyCorrect)
	}
	if aq.MyPoints == nil || *aq.MyPoints <= 0 {
		t.Fatalf("revealed my_points = %v, want >0", aq.MyPoints)
	}

	// A revealed question accepts no further answers.
	code, closed := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{
		"question_id": qid, "value": "AWS", "client_uuid": "quiz-u3",
	})
	if code != http.StatusBadRequest || !strings.Contains(asString(closed["error"]), "closed") {
		t.Fatalf("revealed answer = %d (%v), want 400 closed", code, closed)
	}
}

func TestUntimedCompatibilityKeepsInstantFeedback(t *testing.T) {
	srv, client, eventID, eventCode := newQuizEnv(t)

	// show_results defaults to true, matching the pre-timer behavior.
	qid := createQuizQuestion(t, client, srv.URL, eventID, map[string]any{
		"kind": "poll", "prompt": "Pick", "options": []string{"A", "B"},
		"correct_index": 0, "points_base": 100,
	})
	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(qid, 10)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate = %d", code)
	}

	aud := newJarClient(t)
	st := getQuizState(t, aud, srv.URL, eventCode)
	if st.ActiveQuestion == nil || st.ActiveQuestion.DeadlineAt != nil {
		t.Fatalf("untimed active question = %+v, want no deadline", st.ActiveQuestion)
	}
	if st.ActiveQuestion.CorrectIdx == nil || *st.ActiveQuestion.CorrectIdx != 0 {
		t.Fatalf("show_results question should expose correct_index, got %+v", st.ActiveQuestion.CorrectIdx)
	}

	code, ans := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{
		"question_id": qid, "value": "A", "client_uuid": "legacy-u1",
	})
	if code != http.StatusOK {
		t.Fatalf("answer = %d (%v)", code, ans)
	}
	if ok, _ := ans["is_correct"].(bool); !ok {
		t.Fatalf("untimed answer is_correct = %v, want true (instant feedback)", ans["is_correct"])
	}
	if pts, _ := ans["points_awarded"].(float64); pts <= 0 {
		t.Fatalf("untimed answer points_awarded = %v, want >0", ans["points_awarded"])
	}
}

func TestPodiumToggleAndClearOnActivation(t *testing.T) {
	srv, client, eventID, eventCode := newQuizEnv(t)

	podiumURL := srv.URL + "/api/admin/events/" + strconv.FormatInt(eventID, 10) + "/podium"
	if code, body := postJSON(t, client, podiumURL, map[string]any{}); code != http.StatusBadRequest {
		t.Fatalf("podium without show = %d (%v), want 400", code, body)
	}
	code, body := postJSON(t, client, podiumURL, map[string]any{"show": true})
	if code != http.StatusOK {
		t.Fatalf("podium show = %d (%v)", code, body)
	}
	if sp, _ := body["show_podium"].(bool); !sp {
		t.Fatalf("podium response show_podium = %v, want true", body["show_podium"])
	}
	if st := getQuizState(t, client, srv.URL, eventCode); !st.Event.ShowPodium {
		t.Fatalf("public state show_podium = false, want true")
	}

	// Activating a question switches the podium screen off.
	qid := createQuizQuestion(t, client, srv.URL, eventID, map[string]any{
		"kind": "poll", "prompt": "Pick", "options": []string{"A", "B"},
	})
	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+strconv.FormatInt(eventID, 10)+"/questions/"+strconv.FormatInt(qid, 10)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate = %d", code)
	}
	if st := getQuizState(t, client, srv.URL, eventCode); st.Event.ShowPodium {
		t.Fatalf("podium stayed on after activation")
	}

	code, body = postJSON(t, client, podiumURL, map[string]any{"show": false})
	if code != http.StatusOK {
		t.Fatalf("podium hide = %d (%v)", code, body)
	}
	if sp, _ := body["show_podium"].(bool); sp {
		t.Fatalf("podium response show_podium = %v, want false", body["show_podium"])
	}
}

// TestAutoLockTimerFiresAndIsIdempotent exercises the scheduled timer plus the
// callback bookkeeping: timed questions lock, untimed/locked questions never
// arm a timer, and cancel is safe on unknown ids.
func TestAutoLockTimerFiresAndIsIdempotent(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "quiz_timer.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	ev, err := db.CreateEvent("Timer", "timer-1", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	q, err := db.CreateQuestion(ev.ID, "poll", "live", "Timed", []string{"A", "B"}, false, true, 1, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion: %v", err)
	}
	past := time.Now().UnixMilli() - 5_000
	if _, err := db.UpdateQuestion(q.ID, map[string]any{"status": "live", "time_limit_s": 1, "activated_at": past}); err != nil {
		t.Fatalf("arm question: %v", err)
	}

	live, err := db.GetQuestion(q.ID)
	if err != nil {
		t.Fatalf("GetQuestion: %v", err)
	}
	scheduleAutoLock(live)

	deadline := time.Now().Add(2 * time.Second)
	for {
		got, err := db.GetQuestion(q.ID)
		if err != nil {
			t.Fatalf("GetQuestion during wait: %v", err)
		}
		if got.Status == "locked" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("auto-lock timer did not lock the question (status %q)", got.Status)
		}
		time.Sleep(20 * time.Millisecond)
	}

	autolockMu.Lock()
	_, armed := autolockTimers[q.ID]
	autolockMu.Unlock()
	if armed {
		t.Fatalf("autolockTimers still holds a fired timer")
	}

	// Locked questions and untimed questions never arm a timer.
	locked, _ := db.GetQuestion(q.ID)
	scheduleAutoLock(locked)
	autolockMu.Lock()
	_, armed = autolockTimers[q.ID]
	autolockMu.Unlock()
	if armed {
		t.Fatalf("scheduleAutoLock armed a timer for a locked question")
	}

	q2, err := db.CreateQuestion(ev.ID, "poll", "live", "Untimed", []string{"A", "B"}, false, true, 2, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion untimed: %v", err)
	}
	if _, err := db.UpdateQuestion(q2.ID, map[string]any{"status": "live", "time_limit_s": 0, "activated_at": past}); err != nil {
		t.Fatalf("untimed arm: %v", err)
	}
	untimed, _ := db.GetQuestion(q2.ID)
	scheduleAutoLock(untimed)
	autolockMu.Lock()
	_, armed = autolockTimers[q2.ID]
	autolockMu.Unlock()
	if armed {
		t.Fatalf("scheduleAutoLock armed a timer for an untimed question")
	}

	// Nil and unknown ids are safe.
	scheduleAutoLock(nil)
	cancelAutoLock(999_999)

	// Recovery path: a live timed question with a passed deadline and no timer
	// is locked by BuildState reconciliation.
	q3, err := db.CreateQuestion(ev.ID, "poll", "live", "Recovered", []string{"A", "B"}, false, true, 3, "", "")
	if err != nil {
		t.Fatalf("CreateQuestion q3: %v", err)
	}
	if _, err := db.UpdateQuestion(q3.ID, map[string]any{"status": "live", "time_limit_s": 5, "activated_at": time.Now().UnixMilli() - 30_000}); err != nil {
		t.Fatalf("expire q3: %v", err)
	}
	BuildState(ev, 0)
	recovered, _ := db.GetQuestion(q3.ID)
	if recovered.Status != "locked" {
		t.Fatalf("BuildState left question %d in %q, want locked", q3.ID, recovered.Status)
	}
}

// asString normalizes a decoded JSON error field for message assertions.
func asString(v any) string {
	s, _ := v.(string)
	return s
}
