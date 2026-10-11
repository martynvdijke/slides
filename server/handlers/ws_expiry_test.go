package handlers

import (
 "context"
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "path/filepath"
 "strings"
 "testing"
 "time"

 "github.com/coder/websocket"
 "slides/db"
 "slides/live"
)

func TestWSPerMessageExpiry(t *testing.T) {
 if err := db.Init(filepath.Join(t.TempDir(), "wsper.db")); err != nil { t.Fatalf("init %v", err) }
 defer db.Close()
 Broker.Close()
 Broker = live.New()
 ev, _ := db.CreateEvent("E", "wsper-ev", "", "")
 q, _ := db.CreateQuestion(ev.ID, "poll", "live", "Q", []string{"A","B"}, false, true, 0, "", "")
 _ = db.ActivateQuestion(ev.ID, q.ID, nil)
 mux := http.NewServeMux()
 mux.HandleFunc("GET /ws/events/{code}", EventWS)
 mux.HandleFunc("POST /api/events/{code}/answers", SubmitAnswer)
 srv := httptest.NewServer(mux)
 defer srv.Close()
 ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
 defer cancel()
 url := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/events/" + ev.Code
 c, _, err := websocket.Dial(ctx, url, nil)
 if err != nil { t.Fatalf("dial %v", err) }
 // consume state
 _, _, _ = c.Read(ctx)
 // expire join in DB (find participant via cookie不够, get pid via BuildState? instead use db lookup)
 // Dial auto-created participant+join; fetch via DB
 // Extract cookies from dial? Use participant lookup by scanning participants for ev
 // brute force: query participants for ev
 rows, _ := db.DB.Query("SELECT id FROM participants WHERE event_id=?", ev.ID)
 var pid int64
 if rows.Next() { rows.Scan(&pid) }
 rows.Close()
 // expire join
 _, _ = db.DB.Exec("UPDATE join_sessions SET expires_at='2000-01-01 00:00:00' WHERE participant_id=? AND event_id=?", pid, ev.ID)
 // send answer should get session_expired
 payload, _ := json.Marshal(map[string]any{"type":"answer","question_id":q.ID,"value":"A"})
 _ = c.Write(ctx, websocket.MessageText, payload)
 // expect error + session_expired
 foundExpired := false
 deadline := time.Now().Add(3*time.Second)
 for time.Now().Before(deadline) {
   ctx2, cancel2 := context.WithTimeout(context.Background(), 2*time.Second)
   _, data, err := c.Read(ctx2)
   cancel2()
   if err != nil { break }
   if strings.Contains(string(data), "join_expired") { foundExpired = true; break }
 }
 if !foundExpired { t.Fatalf("expected session_expired frame") }
}
