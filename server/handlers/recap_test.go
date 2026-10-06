package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"slides/db"
)

// recapMux wires the results page, recap subscription, recap settings and
// admin recap endpoints used by these tests.
func recapMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/setup", Setup)
	mux.HandleFunc("POST /api/auth/login", Login)
	mux.Handle("POST /api/admin/events", AdminAuth(http.HandlerFunc(AdminCreateEvent)))
	mux.Handle("PATCH /api/admin/events/{id}", AdminAuth(http.HandlerFunc(AdminUpdateEvent)))
	mux.Handle("POST /api/admin/events/{id}/questions", AdminAuth(http.HandlerFunc(AdminCreateQuestion)))
	mux.Handle("POST /api/admin/events/{id}/questions/{qid}/activate", AdminAuth(http.HandlerFunc(AdminActivateQuestion)))
	mux.HandleFunc("GET /api/events/{code}/state", GetEventState)
	mux.HandleFunc("POST /api/events/{code}/answers", SubmitAnswer)
	mux.HandleFunc("POST /api/events/{code}/qa", CreateQA)
	mux.HandleFunc("GET /api/events/{code}/results", GetEventResults)
	mux.HandleFunc("POST /api/events/{code}/recap/subscribe", RecapSubscribe)
	mux.HandleFunc("POST /api/events/{code}/recap/unsubscribe", RecapUnsubscribe)
	mux.Handle("GET /api/admin/events/{id}/recap", AdminAuth(http.HandlerFunc(AdminListRecapSubscriptions)))
	mux.Handle("DELETE /api/admin/events/{id}/recap/{sid}", AdminAuth(http.HandlerFunc(AdminDeleteRecapSubscription)))
	mux.Handle("GET /api/admin/events/{id}/recap/preview", AdminAuth(http.HandlerFunc(AdminGetRecapPreview)))
	mux.Handle("POST /api/admin/events/{id}/recap/send", AdminAuth(http.HandlerFunc(AdminSendRecap)))
	mux.Handle("GET /api/admin/settings/recap", AdminAuth(http.HandlerFunc(AdminGetRecapSettings)))
	mux.Handle("PUT /api/admin/settings/recap", AdminAuth(http.HandlerFunc(AdminUpdateRecapSettings)))
	return mux
}

func newRecapEnv(t *testing.T) (srv *httptest.Server, admin *http.Client, eventID int64, eventCode string) {
	t.Helper()
	if err := db.Init(filepath.Join(t.TempDir(), "recap.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	// In-process caches are keyed by ids that restart per test database.
	db.InvalidateAllQuestionStats()

	srv = httptest.NewServer(recapMux())
	t.Cleanup(srv.Close)

	admin = newJarClient(t)
	if code, _ := postJSON(t, admin, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}
	code, created := postJSON(t, admin, srv.URL+"/api/admin/events", map[string]any{"name": "Recap Event", "event_date": "2026-10-01"})
	if code != http.StatusOK {
		t.Fatalf("create event = %d (%v)", code, created)
	}
	eventID = int64(created["id"].(float64))
	eventCode = created["code"].(string)
	db.InvalidateLeaderboard(eventID)
	return srv, admin, eventID, eventCode
}

func deleteJSON(t *testing.T, client *http.Client, url string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		t.Fatalf("new delete request: %v", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("DELETE %s: %v", url, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestNormalizeEmailEdgeCases(t *testing.T) {
	valid := map[string]string{
		"alice@example.com":      "alice@example.com",
		"  Alice@Example.COM  ":  "alice@example.com",
		"a@b.co":                 "a@b.co",
		"first.last+tag@sub.org": "first.last+tag@sub.org",
		"UPPER@EXAMPLE.COM":      "upper@example.com",
	}
	for raw, want := range valid {
		got, err := normalizeEmail(raw)
		if err != nil || got != want {
			t.Fatalf("normalizeEmail(%q) = (%q, %v), want (%q, nil)", raw, got, err, want)
		}
	}
	invalid := []string{
		"", "   ", "notanemail", "a@b", "@example.com", "alice@",
		"Name <alice@example.com>", "alice@example.com\nBcc: x@y.z",
		strings.Repeat("a", 250) + "@example.com",
	}
	for _, raw := range invalid {
		if got, err := normalizeEmail(raw); err == nil {
			t.Fatalf("normalizeEmail(%q) = %q, want error", raw, got)
		}
	}
}

func TestResultsPublishGateAndShape(t *testing.T) {
	srv, admin, eventID, eventCode := newRecapEnv(t)

	// A live question with one answer, plus a draft question and pending Q&A
	// that must stay off the published page.
	qid := createModQuestion(t, admin, srv.URL, eventID, "open", "Best cloud?")
	if code, _ := postJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/questions", map[string]any{"kind": "open", "prompt": "Draft only"}); code != http.StatusOK {
		t.Fatalf("draft question = %d", code)
	}

	aud := newJarClient(t)
	if code, body := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/qa", map[string]any{"body": "Pending question", "author": "Ann"}); code != http.StatusOK {
		t.Fatalf("pending qa = %d (%v)", code, body)
	}
	if code, body := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/answers", map[string]any{"question_id": qid, "value": "AWS", "client_uuid": "recap-a1"}); code != http.StatusOK {
		t.Fatalf("answer = %d (%v)", code, body)
	}

	// Hidden until published.
	if code, body := getJSONMap(t, aud, srv.URL+"/api/events/"+eventCode+"/results"); code != http.StatusNotFound || asString(body["error"]) != "results not published" {
		t.Fatalf("unpublished results = %d (%v), want 404 results not published", code, body)
	}

	// Invalid publish flag is rejected.
	if code, body := patchJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID), map[string]any{"results_published": "nope"}); code != http.StatusBadRequest {
		t.Fatalf("invalid results_published = %d (%v), want 400", code, body)
	}

	// Publish and fetch the payload.
	if code, body := patchJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID), map[string]any{"results_published": true}); code != http.StatusOK {
		t.Fatalf("publish = %d (%v)", code, body)
	}

	resp, err := aud.Get(srv.URL + "/api/events/" + eventCode + "/results")
	if err != nil {
		t.Fatalf("get results: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("published results = %d", resp.StatusCode)
	}
	if got := resp.Header.Get("X-Robots-Tag"); got != "noindex" {
		t.Fatalf("X-Robots-Tag = %q, want noindex", got)
	}
	var res map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("decode results: %v", err)
	}

	ev := res["event"].(map[string]any)
	if ev["code"] != eventCode || ev["name"] != "Recap Event" {
		t.Fatalf("results event = %v", ev)
	}
	stats := res["stats"].(map[string]any)
	if stats["participants"].(float64) < 1 {
		t.Fatalf("results stats = %v, want at least one participant", stats)
	}
	questions := res["questions"].([]any)
	if len(questions) != 1 {
		t.Fatalf("results questions = %d, want 1 (draft excluded)", len(questions))
	}
	if questions[0].(map[string]any)["prompt"] != "Best cloud?" {
		t.Fatalf("results question = %v", questions[0])
	}
	qa := res["qa"].([]any)
	if len(qa) != 0 {
		t.Fatalf("results qa = %v, want empty (nothing approved)", qa)
	}

	raw, _ := json.Marshal(res)
	if strings.Contains(string(raw), "participant_id") || strings.Contains(string(raw), "participant_token") {
		t.Fatalf("results payload leaks participant identifiers: %s", raw)
	}

	// Unpublishing hides the page again.
	if code, _ := patchJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID), map[string]any{"results_published": false}); code != http.StatusOK {
		t.Fatalf("unpublish = %d", code)
	}
	if code, _ := getJSONMap(t, aud, srv.URL+"/api/events/"+eventCode+"/results"); code != http.StatusNotFound {
		t.Fatalf("republished-off results = %d, want 404", code)
	}
}

func TestRecapSubscriptionFlowAndState(t *testing.T) {
	srv, admin, eventID, eventCode := newRecapEnv(t)
	aud := newJarClient(t)

	subURL := srv.URL + "/api/events/" + eventCode + "/recap/subscribe"

	if code, body := postJSON(t, aud, subURL, map[string]any{"email": "not-an-email"}); code != http.StatusBadRequest {
		t.Fatalf("invalid subscribe = %d (%v), want 400", code, body)
	}

	code, body := postJSON(t, aud, subURL, map[string]any{"email": "  Alice@Example.COM "})
	if code != http.StatusOK || body["email"] != "alice@example.com" || body["subscribed"] != true {
		t.Fatalf("subscribe = %d (%v)", code, body)
	}

	st := getRecapState(t, aud, srv.URL, eventCode)
	if st.Me.RecapSubscribed != true || st.Me.RecapEmail != "alice@example.com" {
		t.Fatalf("state recap fields = %+v, want subscribed alice@example.com", st)
	}

	// Re-subscribing updates the stored address rather than duplicating.
	if code, _ := postJSON(t, aud, subURL, map[string]any{"email": "other@example.com"}); code != http.StatusOK {
		t.Fatalf("re-subscribe = %d", code)
	}
	code, list := getJSONMap(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/recap")
	if code != http.StatusOK {
		t.Fatalf("admin recap list = %d", code)
	}
	subs := list["subscriptions"].([]any)
	if len(subs) != 1 || subs[0].(map[string]any)["email"] != "other@example.com" {
		t.Fatalf("subscriptions = %v, want one updated row", subs)
	}
	sid := int64(subs[0].(map[string]any)["id"].(float64))

	// Unsubscribe clears the state flag.
	if code, _ := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/recap/unsubscribe", nil); code != http.StatusOK {
		t.Fatalf("unsubscribe = %d", code)
	}
	if st := getRecapState(t, aud, srv.URL, eventCode); st.Me.RecapSubscribed {
		t.Fatalf("state still subscribed after unsubscribe: %+v", st)
	}

	// Re-subscribe so the admin delete path can run, including scoping.
	if code, _ := postJSON(t, aud, subURL, map[string]any{"email": "third@example.com"}); code != http.StatusOK {
		t.Fatalf("re-subscribe = %d", code)
	}
	if code, _ := getJSONMap(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/recap"); code != http.StatusOK {
		t.Fatalf("list after re-subscribe = %d", code)
	}
	code, list = getJSONMap(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/recap")
	sid = int64(list["subscriptions"].([]any)[0].(map[string]any)["id"].(float64))

	otherCode, other := postJSON(t, admin, srv.URL+"/api/admin/events", map[string]any{"name": "Other"})
	if otherCode != http.StatusOK {
		t.Fatalf("other event = %d", otherCode)
	}
	otherID := int64(other["id"].(float64))
	if code, _ := deleteJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(otherID)+"/recap/"+itoa(sid)); code != http.StatusNotFound {
		t.Fatalf("cross-event delete = %d, want 404", code)
	}
	if code, _ := deleteJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/recap/"+itoa(sid)); code != http.StatusOK {
		t.Fatalf("delete = %d", code)
	}
	if code, _ := deleteJSON(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/recap/"+itoa(sid)); code != http.StatusNotFound {
		t.Fatalf("second delete = %d, want 404", code)
	}
}

type recapState struct {
	Me struct {
		RecapSubscribed bool   `json:"recap_subscribed"`
		RecapEmail      string `json:"recap_email"`
	} `json:"me"`
}

func getRecapState(t *testing.T, client *http.Client, srvURL, eventCode string) recapState {
	t.Helper()
	resp, err := client.Get(srvURL + "/api/events/" + eventCode + "/state")
	if err != nil {
		t.Fatalf("get state: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("state status = %d", resp.StatusCode)
	}
	var st recapState
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		t.Fatalf("decode state: %v", err)
	}
	return st
}

// selectiveMailer fails for a configured subset of recipients.
type selectiveMailer struct {
	fail map[string]bool
	sent []string
}

func (m *selectiveMailer) Send(to, subject, body string) error {
	if m.fail[to] {
		return fmt.Errorf("delivery failed")
	}
	m.sent = append(m.sent, to)
	return nil
}

func TestRecipientsResolutionPreviewAndDedupe(t *testing.T) {
	srv, admin, eventID, eventCode := newRecapEnv(t)
	mm := &mockMailer{}
	old := mailer
	mailer = mm
	t.Cleanup(func() { mailer = old })

	// Host list with a duplicate and an invalid entry.
	if code, body := putJSON(t, admin, srv.URL+"/api/admin/settings/recap", map[string]any{
		"emails": "Host@Example.com\nbad@@example.com, host@example.com",
	}); code != http.StatusOK {
		t.Fatalf("save recap settings = %d (%v)", code, body)
	}

	// Attendee opt-in, normalized on the way in.
	aud := newJarClient(t)
	if code, _ := postJSON(t, aud, srv.URL+"/api/events/"+eventCode+"/recap/subscribe", map[string]any{"email": "Attendee@Example.com"}); code != http.StatusOK {
		t.Fatalf("attendee subscribe = %d", code)
	}

	// Admin user email joins the union.
	uid, err := db.CreateUser("host2", "", "admin")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := db.UpdateUserEmail(uid, "admin2@example.com"); err != nil {
		t.Fatalf("UpdateUserEmail: %v", err)
	}

	code, pv := getJSONMap(t, admin, srv.URL+"/api/admin/events/"+itoa(eventID)+"/recap/preview")
	if code != http.StatusOK {
		t.Fatalf("preview = %d", code)
	}
	if pv["subject"] != "Recap: Recap Event" {
		t.Fatalf("preview subject = %v", pv["subject"])
	}
	recipients := pv["recipients"].([]any)
	want := map[string]bool{"attendee@example.com": true, "host@example.com": true, "admin2@example.com": true}
	if len(recipients) != len(want) {
		t.Fatalf("preview recipients = %v, want %d unique", recipients, len(want))
	}
	for _, r := range recipients {
		if !want[r.(string)] {
			t.Fatalf("unexpected recipient %q", r)
		}
	}
	if pv["skipped"].(float64) != 1 {
		t.Fatalf("preview skipped = %v, want 1", pv["skipped"])
	}
	body := pv["body"].(string)
	if !strings.Contains(body, "Participation") || !strings.Contains(body, "Full results: ") || !strings.Contains(body, "/results/"+eventCode) {
		t.Fatalf("preview body missing sections/link:\n%s", body)
	}
	if len(mm.sent) != 0 {
		t.Fatalf("preview sent %d emails, want 0", len(mm.sent))
	}
}

func TestRecapSendGuardsAndReporting(t *testing.T) {
	srv, admin, eventID, _ := newRecapEnv(t)
	t.Setenv("SMTP_HOST", "")
	old := mailer
	mailer = nil
	t.Cleanup(func() { mailer = old })

	sendURL := srv.URL + "/api/admin/events/" + itoa(eventID) + "/recap/send"

	// SMTP must be configured before sending.
	if code, body := postJSON(t, admin, sendURL, nil); code != http.StatusBadRequest || asString(body["error"]) != "SMTP is not configured" {
		t.Fatalf("send without SMTP = %d (%v), want 400 SMTP is not configured", code, body)
	}

	// With SMTP available but no recipients the send is refused.
	mailer = &mockMailer{}
	if code, body := postJSON(t, admin, sendURL, nil); code != http.StatusBadRequest || asString(body["error"]) != "no recipients" {
		t.Fatalf("send without recipients = %d (%v), want 400 no recipients", code, body)
	}

	// One good, one failing recipient: per-recipient reporting.
	if code, _ := putJSON(t, admin, srv.URL+"/api/admin/settings/recap", map[string]any{"emails": "good@example.com\nbad@example.com"}); code != http.StatusOK {
		t.Fatalf("save settings = %d", code)
	}
	sel := &selectiveMailer{fail: map[string]bool{"bad@example.com": true}}
	mailer = sel
	code, out := postJSON(t, admin, sendURL, nil)
	if code != http.StatusOK {
		t.Fatalf("send = %d (%v)", code, out)
	}
	if out["sent"].(float64) != 1 || out["failed"].(float64) != 1 || out["skipped"].(float64) != 0 {
		t.Fatalf("send summary = %v, want sent 1 failed 1", out)
	}
	if len(sel.sent) != 1 || sel.sent[0] != "good@example.com" {
		t.Fatalf("mailer sent = %v, want good@example.com only", sel.sent)
	}
	results := out["results"].([]any)
	if len(results) != 2 {
		t.Fatalf("send results = %v, want 2", results)
	}
	var okCount, failCount int
	for _, r := range results {
		entry := r.(map[string]any)
		if entry["ok"] == true {
			okCount++
		} else if entry["error"] != nil {
			failCount++
		}
	}
	if okCount != 1 || failCount != 1 {
		t.Fatalf("send results ok=%d fail=%d, want 1/1", okCount, failCount)
	}

	// The batch cap truncates with a report.
	emails := make([]string, 0, 205)
	for i := 0; i < 205; i++ {
		emails = append(emails, fmt.Sprintf("user%d@example.com", i))
	}
	if code, _ := putJSON(t, admin, srv.URL+"/api/admin/settings/recap", map[string]any{"emails": strings.Join(emails, "\n")}); code != http.StatusOK {
		t.Fatalf("save big settings = %d", code)
	}
	mailer = &mockMailer{}
	code, out = postJSON(t, admin, sendURL, nil)
	if code != http.StatusOK {
		t.Fatalf("capped send = %d (%v)", code, out)
	}
	if out["truncated"] != true || out["cap"].(float64) != 200 || out["sent"].(float64) != 200 {
		t.Fatalf("capped send summary = %v, want truncated 200 sent", out)
	}
	if len(out["results"].([]any)) != 200 {
		t.Fatalf("capped results = %d, want 200", len(out["results"].([]any)))
	}
}
