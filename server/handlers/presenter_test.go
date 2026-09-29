package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"slides/db"
)

// presenterMux wires just the routes the presenter panel and audience use.
func presenterMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/setup", Setup)
	mux.HandleFunc("POST /api/auth/login", Login)
	mux.Handle("GET /api/auth/me", AuthMiddleware(http.HandlerFunc(Me)))
	mux.Handle("POST /api/admin/events", AdminAuth(http.HandlerFunc(AdminCreateEvent)))
	mux.Handle("POST /api/admin/events/{id}/questions", AdminAuth(http.HandlerFunc(AdminCreateQuestion)))
	mux.Handle("POST /api/admin/events/{id}/questions/media", AdminAuth(http.HandlerFunc(AdminUploadQuestionMedia)))
	mux.Handle("POST /api/admin/events/{id}/questions/{qid}/activate", AdminAuth(http.HandlerFunc(AdminActivateQuestion)))
	mux.HandleFunc("GET /api/events/{code}/state", GetEventState)
	mux.HandleFunc("GET /api/join/{room}", ResolveRoom)
	mux.HandleFunc("GET /ws/events/{code}", EventWS)
	return mux
}

func newJarClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar: %v", err)
	}
	return &http.Client{Jar: jar, Timeout: 15 * time.Second}
}

func postJSON(t *testing.T, client *http.Client, url string, body any) (int, map[string]any) {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	resp, err := client.Post(url, "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// tinyPNG encodes a 1x1 PNG so the media endpoint receives a real image.
func tinyPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 50, G: 108, B: 229, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png encode: %v", err)
	}
	return buf.Bytes()
}

// TestPresenterFlowWithMediaQuestion exercises the whole presenter path over
// HTTP + WebSocket: sign in, create an event, upload a photo, create and
// activate a question carrying that photo, and confirm the audience state and
// live socket see prompt + media.
func TestPresenterFlowWithMediaQuestion(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "presenter.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	oldMediaDir := MediaDir
	MediaDir = t.TempDir()
	t.Cleanup(func() { MediaDir = oldMediaDir })

	srv := httptest.NewServer(presenterMux())
	defer srv.Close()

	client := newJarClient(t)

	// Bootstrap the first admin and sign in.
	if code, _ := postJSON(t, client, srv.URL+"/api/setup", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("setup status = %d", code)
	}
	if code, _ := postJSON(t, client, srv.URL+"/api/auth/login", map[string]any{"username": "admin", "password": "password123"}); code != http.StatusOK {
		t.Fatalf("login status = %d", code)
	}
	resp, err := client.Get(srv.URL + "/api/auth/me")
	if err != nil {
		t.Fatalf("me: %v", err)
	}
	var me struct {
		User *struct {
			Username string `json:"username"`
		} `json:"user"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&me)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || me.User == nil || me.User.Username != "admin" {
		t.Fatalf("me = %d %+v, want 200 admin", resp.StatusCode, me.User)
	}

	// Create an event (server assigns the short room code).
	code, created := postJSON(t, client, srv.URL+"/api/admin/events", map[string]any{"name": "Presenter Demo"})
	if code != http.StatusOK {
		t.Fatalf("create event status = %d (%v)", code, created)
	}
	eventID := int64(created["id"].(float64))
	eventCode, _ := created["code"].(string)
	roomCode, _ := created["room_code"].(string)
	if eventCode == "" || len(roomCode) != 5 {
		t.Fatalf("event code=%q room_code=%q, want a generated code and 5-char room", eventCode, roomCode)
	}

	// The room code resolves back to the event.
	resp, err = client.Get(srv.URL + "/api/join/" + strings.ToLower(roomCode))
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	var resolved struct {
		Code string `json:"code"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&resolved)
	resp.Body.Close()
	if resolved.Code != eventCode {
		t.Fatalf("join resolved code=%q, want %q", resolved.Code, eventCode)
	}

	// Upload a photo as question media.
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "dot.png")
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := fw.Write(tinyPNG(t)); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}
	upReq, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/admin/events/"+itoa(eventID)+"/questions/media", &buf)
	upReq.Header.Set("Content-Type", mw.FormDataContentType())
	upResp, err := client.Do(upReq)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	var media struct {
		URL       string `json:"url"`
		MediaType string `json:"media_type"`
	}
	_ = json.NewDecoder(upResp.Body).Decode(&media)
	upResp.Body.Close()
	if upResp.StatusCode != http.StatusOK || media.URL == "" || media.MediaType != "image" {
		t.Fatalf("upload = %d %+v, want 200 image url", upResp.StatusCode, media)
	}

	// Create the question with the photo and activate it.
	code, q := postJSON(t, client, srv.URL+"/api/admin/events/"+itoa(eventID)+"/questions", map[string]any{
		"kind":       "poll",
		"prompt":     "Which logo is this?",
		"options":    []string{"A", "B"},
		"media_url":  media.URL,
		"media_type": media.MediaType,
	})
	if code != http.StatusOK {
		t.Fatalf("create question status = %d (%v)", code, q)
	}
	qID := int64(q["id"].(float64))
	if code, _ := postJSON(t, client, srv.URL+"/api/admin/events/"+itoa(eventID)+"/questions/"+itoa(qID)+"/activate", map[string]any{}); code != http.StatusOK {
		t.Fatalf("activate status = %d", code)
	}

	// Public state carries prompt + media.
	resp, err = client.Get(srv.URL + "/api/events/" + eventCode + "/state")
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	var state struct {
		ActiveQuestion *struct {
			Prompt    string `json:"prompt"`
			MediaURL  string `json:"media_url"`
			MediaType string `json:"media_type"`
		} `json:"active_question"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&state)
	resp.Body.Close()
	if state.ActiveQuestion == nil || state.ActiveQuestion.Prompt != "Which logo is this?" {
		t.Fatalf("public state active_question = %+v", state.ActiveQuestion)
	}
	if state.ActiveQuestion.MediaURL != media.URL || state.ActiveQuestion.MediaType != "image" {
		t.Fatalf("public state media = %q/%q, want %q/image", state.ActiveQuestion.MediaURL, state.ActiveQuestion.MediaType, media.URL)
	}

	// Live socket also reports the active media question.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	wsURL := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/events/" + eventCode
	c, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.CloseNow()
	_, data, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("ws read: %v", err)
	}
	var frame struct {
		Type string `json:"type"`
		Data struct {
			ActiveQuestion *struct {
				ID       int64  `json:"id"`
				MediaURL string `json:"media_url"`
			} `json:"active_question"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &frame); err != nil {
		t.Fatalf("ws unmarshal: %v", err)
	}
	if frame.Type != "state" || frame.Data.ActiveQuestion == nil || frame.Data.ActiveQuestion.ID != qID {
		t.Fatalf("ws frame = %s %+v, want state with question %d", frame.Type, frame.Data.ActiveQuestion, qID)
	}
	if frame.Data.ActiveQuestion.MediaURL != media.URL {
		t.Fatalf("ws media_url = %q, want %q", frame.Data.ActiveQuestion.MediaURL, media.URL)
	}
}

// TestAdminEndpointsRequireAuth confirms the presenter routes reject anonymous
// clients.
func TestAdminEndpointsRequireAuth(t *testing.T) {
	if err := db.Init(filepath.Join(t.TempDir(), "presenter-auth.db")); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.Close()

	srv := httptest.NewServer(presenterMux())
	defer srv.Close()

	anon := newJarClient(t)
	if code, _ := postJSON(t, anon, srv.URL+"/api/admin/events", map[string]any{"name": "Nope"}); code != http.StatusUnauthorized {
		t.Fatalf("anonymous create event status = %d, want 401", code)
	}
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
