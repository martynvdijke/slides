package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"slides/db"
)

// moderationMux wires the routes the content filter, answer moderation and
// Q&A slow mode rely on.
func moderationMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/setup", Setup)
	mux.HandleFunc("POST /api/auth/login", Login)
	mux.Handle("POST /api/admin/events", AdminAuth(http.HandlerFunc(AdminCreateEvent)))
	mux.Handle("PATCH /api/admin/events/{id}", AdminAuth(http.HandlerFunc(AdminUpdateEvent)))
	mux.Handle("POST /api/admin/events/{id}/questions", AdminAuth(http.HandlerFunc(AdminCreateQuestion)))
	mux.Handle("POST /api/admin/events/{id}/questions/{qid}/activate", AdminAuth(http.HandlerFunc(AdminActivateQuestion)))
	mux.Handle("GET /api/admin/events/{id}/answers", AdminAuth(http.HandlerFunc(AdminListAnswers)))
	mux.Handle("PATCH /api/admin/events/{id}/answers/{aid}", AdminAuth(http.HandlerFunc(AdminUpdateAnswer)))
	mux.Handle("GET /api/admin/settings/filter", AdminAuth(http.HandlerFunc(AdminGetFilterSettings)))
	mux.Handle("PUT /api/admin/settings/filter", AdminAuth(http.HandlerFunc(AdminUpdateFilterSettings)))
	mux.HandleFunc("POST /api/events/{code}/answers", SubmitAnswer)
	mux.HandleFunc("POST /api/events/{code}/qa", CreateQA)
	return mux
}

func putJSON(t *testing.T, client *http.Client, url string, body any) (int, map[string]any) {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal put: %v", err)
	}
	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(data))
	if err != nil {
		t.Fatalf("new put request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("PUT %s: %v", url, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func getJSONList(t *testing.T, client *http.Client, url string) (int, []map[string]any) {
	t.Helper()
	resp, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	var out []map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// newModerationEnv boots a DB + server with a signed-in admin and one event.
func newModerationEnv(t *testing.T) (srv *httptest.Server, admin *http.Client, eventID int64, eventCode string) {
	t.Helper()
	if err := db.Init(filepath.Join(t.TempDir(), "moderation.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	// In-process caches are keyed by ids that restart per test database.
	db.InvalidateAllQuestionStats()

	srv = httptest.NewServer(moderationMux())
	t.Cleanup(srv.Close)

	admin = newJarClient(t)
	if code, _ := postJSON(t, admin, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}
	code, created := postJSON(t, admin, srv.URL+"/api/admin/events", map[string]any{"name": "Moderation"})
	if code != http.StatusOK {
		t.Fatalf("create event = %d (%v)", code, created)
	}
	eventID = int64(created["id"].(float64))
	eventCode = created["code"].(string)
	db.InvalidateLeaderboard(eventID)
	return srv, admin, eventID, eventCode
}

// createModQuestion creates and activates a question, returning its id.
func createModQuestion(t *testing.T, admin *http.Client, srvURL string, eventID int64, kind, prompt string) int64 {
	t.Helper()
	code, q := postJSON(t, admin, srvURL+"/api/admin/events/"+itoa(eventID)+"/questions", map[string]any{"kind": kind, "prompt": prompt})
	if code != http.StatusOK {
		t.Fatalf("create question = %d (%v)", code, q)
	}
	qid := int64(q["id"].(float64))
	if code, _ := postJSON(t, admin, srvURL+"/api/admin/events/"+itoa(eventID)+"/questions/"+itoa(qid)+"/activate", nil); code != http.StatusOK {
		t.Fatalf("activate question = %d", code)
	}
	return qid
}

func TestFilterMatchingEdgeCases(t *testing.T) {
	blocked := parseBlockedWords("badword\nsecret phrase, spam\r\n  BADWORD \n\n")
	f := filterConfig{Enabled: true, Blocked: blocked, Action: "flag"}

	cases := []struct {
		text string
		want bool
	}{
		{"badword", true},
		{"BadWord!", true},
		{"a badword b", true},
		{"badword-ish", true},
		{"badminton", false},
		{"notbadword", false},
		{"xbadwordx", false},
		{"secret phrase", true},
		{"SECRET   PHRASE!", true},
		{"secretphrase", false},
		{"spam spam", true},
		{"", false},
		{"harmless text", false},
	}
	for _, tc := range cases {
		if got := f.matches(tc.text); got != tc.want {
			t.Errorf("matches(%q) = %v, want %v", tc.text, got, tc.want)
		}
	}

	// Digits are tokens too: a blocked digit run matches, a longer token does not.
	digits := filterConfig{Enabled: true, Blocked: parseBlockedWords("123"), Action: "flag"}
	if !digits.matches("score 123 points") || digits.matches("score 1234 points") {
		t.Fatalf("digit token matching failed")
	}

	// Disabled and empty configurations never match.
	off := filterConfig{Enabled: false, Blocked: blocked, Action: "flag"}
	if off.matches("badword") {
		t.Fatalf("disabled filter matched")
	}
	empty := filterConfig{Enabled: true, Action: "flag"}
	if empty.matches("badword") {
		t.Fatalf("empty word list matched")
	}
}

func TestParseBlockedWordsDedupeAndNormalize(t *testing.T) {
	got := parseBlockedWords("Bad\nbad\nBAD , spam")
	if len(got) != 2 {
		t.Fatalf("parseBlockedWords = %v, want 2 entries", got)
	}
	if strings.Join(got[0], " ") != "bad" || strings.Join(got[1], " ") != "spam" {
		t.Fatalf("parseBlockedWords = %v, want [bad] [spam]", got)
	}

	phrase := parseBlockedWords("No   Bad Words")
	if len(phrase) != 1 || strings.Join(phrase[0], " ") != "no bad words" {
		t.Fatalf("phrase normalization = %v, want [no bad words]", phrase)
	}
}

func TestFilterSettingsEndpoints(t *testing.T) {
	srv, admin, _, _ := newModerationEnv(t)
	url := srv.URL + "/api/admin/settings/filter"

	code, body := putJSON(t, admin, url, map[string]any{"enabled": true, "words": "foo\nbar", "action": "reject"})
	if code != http.StatusOK {
		t.Fatalf("PUT filter = %d (%v)", code, body)
	}
	code, got := getJSONMap(t, admin, url)
	if code != http.StatusOK || got["enabled"] != true || got["words"] != "foo\nbar" || got["action"] != "reject" {
		t.Fatalf("GET filter = %d (%v), want enabled/foo\\nbar/reject", code, got)
	}

	if code, body := putJSON(t, admin, url, map[string]any{"enabled": true, "words": "x", "action": "bogus"}); code != http.StatusBadRequest {
		t.Fatalf("invalid action = %d (%v), want 400", code, body)
	}
	// Action defaults to flag when omitted.
	if code, body := putJSON(t, admin, url, map[string]any{"enabled": false}); code != http.StatusOK {
		t.Fatalf("default action = %d (%v), want 200", code, body)
	} else if body["action"] != "flag" {
		t.Fatalf("default action = %v, want flag", body["action"])
	}
}

func getJSONMap(t *testing.T, client *http.Client, url string) (int, map[string]any) {
	t.Helper()
	resp, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestFilterDisabledByDefault(t *testing.T) {
	srv, admin, eventID, eventCode := newModerationEnv(t)
	qid := createModQuestion(t, admin, srv.URL, eventID, "open", "Say something")
	aud := newJarClient(t)
	code, ans := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{"question_id": qid, "value": "badword", "client_uuid": "def-1"})
	if code != http.StatusOK {
		t.Fatalf("answer = %d (%v)", code, ans)
	}
	if _, flagged := ans["flagged"]; flagged {
		t.Fatalf("answer flagged with the filter disabled: %v", ans)
	}
	stats, err := db.GetQuestionStats(qid)
	if err != nil || stats.Total != 1 {
		t.Fatalf("stats after default answer = %+v (%v), want total 1", stats, err)
	}
}

func TestFilterFlagAndModerationFlow(t *testing.T) {
	srv, admin, eventID, eventCode := newModerationEnv(t)
	if err := db.UpdateFilterSettings(true, "badword\nsecret phrase", "flag"); err != nil {
		t.Fatalf("enable filter: %v", err)
	}

	qid := createModQuestion(t, admin, srv.URL, eventID, "open", "Say something")
	answersURL := srv.URL + "/api/events/" + eventCode + "/answers"

	clean := newJarClient(t)
	if code, ans := postJSON(t, clean, answersURL, map[string]any{"question_id": qid, "value": "hello world", "client_uuid": "flag-clean"}); code != http.StatusOK {
		t.Fatalf("clean answer = %d (%v)", code, ans)
	}
	flaggedClient := newJarClient(t)
	code, ans := postJSON(t, flaggedClient, answersURL, map[string]any{"question_id": qid, "value": "this is badword", "client_uuid": "flag-bad"})
	if code != http.StatusOK {
		t.Fatalf("flagged answer = %d (%v)", code, ans)
	}
	if flag, _ := ans["flagged"].(bool); !flag {
		t.Fatalf("answer not flagged: %v", ans)
	}

	// The flagged answer is excluded from aggregates and event stats.
	stats, err := db.GetQuestionStats(qid)
	if err != nil || stats.Total != 1 || stats.Respondents != 1 {
		t.Fatalf("stats with flagged answer = %+v (%v), want total/respondents 1", stats, err)
	}
	if es, err := db.EventStats(eventID); err != nil || es.Answers != 1 {
		t.Fatalf("event stats answers = %+v (%v), want 1", es, err)
	}

	// The moderation queue lists flagged first and never leaks tokens.
	code, list := getJSONList(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/answers?status=flagged")
	if code != http.StatusOK || len(list) != 1 {
		t.Fatalf("flagged list = %d (%v), want 1 entry", code, list)
	}
	entry := list[0]
	if entry["status"] != "flagged" || !strings.Contains(entry["value"].(string), "badword") {
		t.Fatalf("flagged entry = %v", entry)
	}
	if entry["prompt"] != "Say something" || entry["kind"] != "open" {
		t.Fatalf("flagged entry prompt/kind = %v", entry)
	}
	if entry["name"] != "Anonymous" || entry["emoji"] != "🙂" {
		t.Fatalf("flagged entry identity = %v", entry)
	}
	if _, leaked := entry["token"]; leaked {
		t.Fatalf("moderation entry leaked a token: %v", entry)
	}
	aid := int64(entry["id"].(float64))

	// Approving brings it back into every aggregate (cache invalidated).
	code, body := patchJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/answers/"+itoa(aid), map[string]any{"status": "visible"})
	if code != http.StatusOK || body["status"] != "visible" {
		t.Fatalf("approve = %d (%v)", code, body)
	}
	if stats, err := db.GetQuestionStats(qid); err != nil || stats.Total != 2 {
		t.Fatalf("stats after approve = %+v (%v), want total 2", stats, err)
	}

	// Hiding the clean answer removes it again.
	code, list = getJSONList(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/answers")
	if code != http.StatusOK || len(list) != 2 {
		t.Fatalf("all list = %d (%v), want 2 entries", code, list)
	}
	var cleanAid int64
	for _, e := range list {
		if e["status"] == "visible" {
			cleanAid = int64(e["id"].(float64))
		}
	}
	if cleanAid == 0 {
		t.Fatalf("no visible entry found: %v", list)
	}
	if code, body := patchJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/answers/"+itoa(cleanAid), map[string]any{"status": "hidden"}); code != http.StatusOK {
		t.Fatalf("hide = %d (%v)", code, body)
	}
	if stats, err := db.GetQuestionStats(qid); err != nil || stats.Total != 1 {
		t.Fatalf("stats after hide = %+v (%v), want total 1", stats, err)
	}

	// Validation and event scoping.
	if code, _ := getJSONList(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/answers?status=bogus"); code != http.StatusBadRequest {
		t.Fatalf("invalid status filter = %d, want 400", code)
	}
	if code, _ := patchJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/answers/"+itoa(aid), map[string]any{"status": "nonsense"}); code != http.StatusBadRequest {
		t.Fatalf("invalid status patch = %d, want 400", code)
	}
	_, other := postJSON(t, admin, srv.URL+"/api/admin/events", map[string]any{"name": "Other"})
	otherID := int64(other["id"].(float64))
	if code, body := patchJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(otherID)+"/answers/"+itoa(aid), map[string]any{"status": "visible"}); code != http.StatusNotFound {
		t.Fatalf("cross-event patch = %d (%v), want 404", code, body)
	}

	// Q&A bodies are filtered too, but author names are not.
	qaURL := srv.URL + "/api/events/" + eventCode + "/qa"
	code, qa := postJSON(t, flaggedClient, qaURL, map[string]any{"body": "a secret phrase here", "author": "Ana"})
	if code != http.StatusOK {
		t.Fatalf("flagged qa = %d (%v)", code, qa)
	}
	if flag, _ := qa["flagged"].(bool); !flag {
		t.Fatalf("qa not flagged: %v", qa)
	}
	if code, qa := postJSON(t, flaggedClient, qaURL, map[string]any{"body": "clean question", "author": "badword"}); code != http.StatusOK {
		t.Fatalf("author not filtered = %d (%v), want 200", code, qa)
	} else if flag, _ := qa["flagged"].(bool); flag {
		t.Fatalf("author name triggered the filter: %v", qa)
	}
	list2, err := db.ListQA(eventID)
	if err != nil || len(list2) != 2 || !list2[0].Flagged {
		t.Fatalf("ListQA = %+v (%v), want 2 rows with flagged first", list2, err)
	}
}

func TestFilterRejectFlow(t *testing.T) {
	srv, admin, eventID, eventCode := newModerationEnv(t)
	if err := db.UpdateFilterSettings(true, "forbidden", "reject"); err != nil {
		t.Fatalf("enable filter: %v", err)
	}

	qid := createModQuestion(t, admin, srv.URL, eventID, "open", "Say something")
	aud := newJarClient(t)
	code, body := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{"question_id": qid, "value": "this is forbidden", "client_uuid": "reject-1"})
	if code != http.StatusBadRequest || !strings.Contains(asString(body["error"]), "rejected") {
		t.Fatalf("rejected answer = %d (%v), want 400 rejected", code, body)
	}
	if stats, err := db.GetQuestionStats(qid); err != nil || stats.Total != 0 {
		t.Fatalf("stats after rejected answer = %+v (%v), want total 0", stats, err)
	}

	// A clean answer still lands.
	if code, ans := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{"question_id": qid, "value": "hello", "client_uuid": "reject-2"}); code != http.StatusOK {
		t.Fatalf("clean answer = %d (%v)", code, ans)
	}

	// Q&A rejections store nothing either.
	code, body = postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/qa", map[string]any{"body": "a forbidden question", "author": "Ana"})
	if code != http.StatusBadRequest || !strings.Contains(asString(body["error"]), "rejected") {
		t.Fatalf("rejected qa = %d (%v), want 400 rejected", code, body)
	}
	if rows, err := db.ListQA(eventID); err != nil || len(rows) != 0 {
		t.Fatalf("ListQA after reject = %+v (%v), want empty", rows, err)
	}
}

func TestQASlowModeEnforcement(t *testing.T) {
	srv, admin, eventID, eventCode := newModerationEnv(t)
	evURL := srv.URL + "/api/admin/events/" + itoa(eventID)
	qaURL := srv.URL + "/api/events/" + eventCode + "/qa"

	if code, body := patchJSON(t, admin, evURL, map[string]any{"qa_slow_mode_s": -1}); code != http.StatusBadRequest {
		t.Fatalf("negative slow mode = %d (%v), want 400", code, body)
	}
	code, body := patchJSON(t, admin, evURL, map[string]any{"qa_slow_mode_s": 7200})
	if code != http.StatusOK {
		t.Fatalf("slow mode patch = %d (%v)", code, body)
	}
	if got, _ := body["qa_slow_mode_s"].(float64); int(got) != 3600 {
		t.Fatalf("slow mode = %v, want capped at 3600", body["qa_slow_mode_s"])
	}
	if code, body := patchJSON(t, admin, evURL, map[string]any{"qa_slow_mode_s": 60}); code != http.StatusOK {
		t.Fatalf("slow mode 60 = %d (%v)", code, body)
	}

	aud := newJarClient(t)
	if code, qa := postJSON(t, aud, qaURL, map[string]any{"body": "first question", "author": "Ana"}); code != http.StatusOK {
		t.Fatalf("first qa = %d (%v)", code, qa)
	}
	code, body = postJSON(t, aud, qaURL, map[string]any{"body": "second question", "author": "Ana"})
	if code != http.StatusTooManyRequests {
		t.Fatalf("slow-mode qa = %d (%v), want 429", code, body)
	}
	retry, _ := body["retry_after_s"].(float64)
	if retry < 1 || retry > 60 {
		t.Fatalf("retry_after_s = %v, want 1..60", body["retry_after_s"])
	}
	if !strings.Contains(asString(body["error"]), "slow mode") {
		t.Fatalf("slow-mode error = %v", body["error"])
	}
	if rows, err := db.ListQA(eventID); err != nil || len(rows) != 1 {
		t.Fatalf("stored qa after rejection = %d (%v), want 1", len(rows), err)
	}

	// Other participants are unaffected.
	other := newJarClient(t)
	if code, qa := postJSON(t, other, qaURL, map[string]any{"body": "other participant", "author": "Bo"}); code != http.StatusOK {
		t.Fatalf("other participant qa = %d (%v)", code, qa)
	}

	// The interval is measured from stored rows, so it survives reconnects and
	// restarts: backdating the last submission lets the same participant post.
	if _, err := db.DB.Exec("UPDATE qa_questions SET created_at=datetime('now','-120 seconds') WHERE event_id=? AND participant_id=(SELECT participant_id FROM qa_questions WHERE event_id=? AND body='first question')", eventID, eventID); err != nil {
		t.Fatalf("backdate qa: %v", err)
	}
	if code, qa := postJSON(t, aud, qaURL, map[string]any{"body": "third question", "author": "Ana"}); code != http.StatusOK {
		t.Fatalf("qa after interval = %d (%v)", code, qa)
	}

	// 0 disables the interval.
	if code, body := patchJSON(t, admin, evURL, map[string]any{"qa_slow_mode_s": 0}); code != http.StatusOK {
		t.Fatalf("disable slow mode = %d (%v)", code, body)
	}
	if code, qa := postJSON(t, aud, qaURL, map[string]any{"body": "fourth", "author": "Ana"}); code != http.StatusOK {
		t.Fatalf("qa with slow mode off = %d (%v)", code, qa)
	}
	if code, qa := postJSON(t, aud, qaURL, map[string]any{"body": "fifth", "author": "Ana"}); code != http.StatusOK {
		t.Fatalf("rapid qa with slow mode off = %d (%v)", code, qa)
	}
}
