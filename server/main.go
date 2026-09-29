// Package main is the meetup server: audience interaction (live polls, Q&A,
// word clouds), end-of-event feedback, presentation uploads and an admin
// console, all in a single binary with an embedded vanilla-JS frontend.
package main

// @title Meetup API
// @version 1.0
// @description Audience interaction API for meetups: live questions, Q&A board, word clouds, feedback, presentations, QR codes and admin console. Audience requests get an anonymous participant cookie automatically.
// @BasePath /
// @securityDefinitions.apikey CookieAuth
// @in header
// @name Cookie
// @description Admin session cookie (meetup_session) issued by POST /api/auth/login or the OIDC flow.

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	httpSwagger "github.com/swaggo/http-swagger/v2"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"slides/db"
	_ "slides/docs"
	"slides/handlers"
)

//go:embed static/*
var staticFiles embed.FS

// Version is bumped by semantic-release.
var Version = "1.1.0"

func main() {
	port := getEnv("PORT", "6270")
	dbPath := getEnv("DB_PATH", "./slides.db")
	handlers.MediaDir = getEnv("MEDIA_DIR", "./media")
	decksDir := getEnv("DECKS_DIR", "./dist")
	initCORS()

	if err := os.MkdirAll(handlers.MediaDir, 0o755); err != nil {
		log.Fatalf("create media dir: %v", err)
	}
	if err := db.Init(dbPath); err != nil {
		log.Fatalf("init database: %v", err)
	}
	defer db.Close()
	if err := db.DeleteExpiredSessions(); err != nil {
		log.Printf("cleanup sessions: %v", err)
	}

	mux := http.NewServeMux()

	// ── Setup + auth (no session required) ──
	mux.HandleFunc("GET /api/setup/status", handlers.SetupStatus)
	mux.HandleFunc("POST /api/setup", handlers.Setup)
	mux.HandleFunc("POST /api/auth/login", handlers.Login)
	mux.HandleFunc("POST /api/auth/logout", handlers.Logout)
	mux.Handle("GET /api/auth/me", handlers.AuthMiddleware(http.HandlerFunc(handlers.Me)))
	mux.HandleFunc("GET /api/auth/oidc/status", handlers.OIDCStatus)
	mux.HandleFunc("GET /api/auth/oidc/login", handlers.OIDCLogin)
	mux.HandleFunc("GET /api/auth/oidc/callback", handlers.OIDCCallback)
	mux.HandleFunc("GET /api/auth/oidc/logout", handlers.OIDCLogout)

	// ── Health probe (used by the container healthcheck) ──
	mux.HandleFunc("GET /healthz", handlers.Health)

	// ── Public audience API (anonymous participant cookie) ──
	mux.HandleFunc("GET /api/events/{code}", handlers.GetEvent)
	mux.HandleFunc("GET /api/events/{code}/state", handlers.GetEventState)
	mux.HandleFunc("GET /ws/events/{code}", handlers.EventWS)
	mux.HandleFunc("POST /api/events/{code}/answers", handlers.SubmitAnswer)
	mux.HandleFunc("GET /api/events/{code}/qa", handlers.ListPublicQA)
	mux.HandleFunc("POST /api/events/{code}/qa", handlers.CreateQA)
	mux.HandleFunc("POST /api/events/{code}/qa/{id}/vote", handlers.VoteQA)
	mux.HandleFunc("GET /api/events/{code}/presentations", handlers.ListPublicPresentations)
	mux.HandleFunc("GET /api/events/{code}/presentations/{id}/download", handlers.DownloadPresentation)
	mux.HandleFunc("GET /api/events/{code}/qr.png", handlers.EventQR)
	mux.HandleFunc("GET /api/join/{room}", handlers.ResolveRoom)
	mux.HandleFunc("GET /api/settings/analytics", handlers.PublicGetAnalyticsSettings)

	// ── Uploaded question media (public inline, UUID file names) ──
	mux.HandleFunc("GET /media/{name}", handlers.ServeMedia)

	// ── Admin API (session required) ──
	adminMux := http.NewServeMux()
	adminMux.HandleFunc("GET /api/admin/events", handlers.AdminListEvents)
	adminMux.HandleFunc("POST /api/admin/events", handlers.AdminCreateEvent)
	adminMux.HandleFunc("PATCH /api/admin/events/{id}", handlers.AdminUpdateEvent)
	adminMux.HandleFunc("DELETE /api/admin/events/{id}", handlers.AdminDeleteEvent)
	adminMux.HandleFunc("GET /api/admin/events/{id}/questions", handlers.AdminListQuestions)
	adminMux.HandleFunc("POST /api/admin/events/{id}/questions", handlers.AdminCreateQuestion)
	adminMux.HandleFunc("POST /api/admin/events/{id}/questions/media", handlers.AdminUploadQuestionMedia)
	adminMux.HandleFunc("PATCH /api/admin/events/{id}/questions/{qid}", handlers.AdminUpdateQuestion)
	adminMux.HandleFunc("DELETE /api/admin/events/{id}/questions/{qid}", handlers.AdminDeleteQuestion)
	adminMux.HandleFunc("POST /api/admin/events/{id}/questions/{qid}/activate", handlers.AdminActivateQuestion)
	adminMux.HandleFunc("POST /api/admin/events/{id}/questions/{qid}/close", handlers.AdminCloseQuestion)
	adminMux.HandleFunc("GET /api/admin/events/{id}/qa", handlers.AdminListQA)
	adminMux.HandleFunc("PATCH /api/admin/events/{id}/qa/{qid}", handlers.AdminUpdateQA)
	adminMux.HandleFunc("DELETE /api/admin/events/{id}/qa/{qid}", handlers.AdminDeleteQA)
	adminMux.HandleFunc("GET /api/admin/events/{id}/presentations", handlers.AdminListPresentations)
	adminMux.HandleFunc("POST /api/admin/events/{id}/presentations", handlers.AdminUploadPresentation)
	adminMux.HandleFunc("DELETE /api/admin/events/{id}/presentations/{pid}", handlers.AdminDeletePresentation)
	adminMux.HandleFunc("GET /api/admin/events/{id}/export.csv", handlers.AdminExportCSV)
	adminMux.HandleFunc("GET /api/admin/stats", handlers.AdminGetStats)
	adminMux.HandleFunc("GET /api/admin/events/{id}/stats", handlers.AdminGetEventStats)
	adminMux.HandleFunc("GET /api/admin/settings/analytics", handlers.AdminGetAnalyticsSettings)
	adminMux.HandleFunc("PUT /api/admin/settings/analytics", handlers.AdminUpdateAnalyticsSettings)
	adminMux.HandleFunc("GET /api/admin/settings/branding", handlers.AdminGetBranding)
	adminMux.HandleFunc("PUT /api/admin/settings/branding", handlers.AdminUpdateBranding)
	adminMux.HandleFunc("GET /api/admin/otel/status", handlers.AdminOTelStatus)
	adminMux.HandleFunc("GET /api/admin/settings/otel", handlers.AdminGetOTelSettings)
	adminMux.HandleFunc("PUT /api/admin/settings/otel", handlers.AdminUpdateOTelSettings)
	for _, method := range []string{"GET", "POST", "PATCH", "DELETE", "PUT"} {
		mux.Handle(method+" /api/admin/", handlers.AdminAuth(adminMux))
	}
	// Admin live statistics WebSocket (session-protected).
	mux.Handle("GET /ws/admin/events/{id}/stats", handlers.AdminAuth(http.HandlerFunc(handlers.AdminEventStatsWS)))

	// ── Swagger UI (offline, assets embedded in the binary) ──
	mux.Handle("GET /swagger/", httpSwagger.Handler(httpSwagger.URL("/swagger/doc.json")))

	// ── Embedded SPA (admin console, audience page, projector view) ──
	staticSub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("static files: %v", err)
	}
	staticHandler := http.FileServer(http.FS(staticSub))
	page := func(name string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			r.URL.Path = "/" + name
			staticHandler.ServeHTTP(w, r)
		}
	}
	mux.HandleFunc("GET /e/{code}", page("audience.html"))
	mux.HandleFunc("GET /live/{code}", page("live.html"))
	mux.HandleFunc("GET /admin", page("admin.html"))
	mux.HandleFunc("GET /join", page("join.html"))
	// SPA assets live at the site root, next to the built decks.
	for _, asset := range []string{"app.js", "admin.js", "live.js", "join.js", "tailwind.css", "logo.svg"} {
		mux.HandleFunc("GET /"+asset, page(asset))
	}

	// ── Built Slidev decks + overview landing page ──
	// The deck build (npm run build) writes dist/<deck>/ plus dist/index.html.
	// In the container DECKS_DIR points at that output; locally it defaults to
	// ./dist. When absent we fall back to the embedded SPA so `go run` still
	// serves a usable admin/audience app.
	if info, statErr := os.Stat(decksDir); statErr == nil && info.IsDir() {
		log.Printf("serving slide decks from %s", decksDir)
		mux.Handle("GET /", http.FileServer(http.Dir(decksDir)))
	} else {
		log.Printf("decks dir %q not found; serving embedded app only", decksDir)
		mux.Handle("GET /", staticHandler)
	}

	// OpenTelemetry: opt-in via OTEL_* env vars, no-op otherwise. The handler
	// is always wrapped so spans/metrics appear as soon as an endpoint is set.
	shutdownOTel, err := setupOTel(context.Background())
	if err != nil {
		log.Printf("OpenTelemetry setup failed, continuing without it: %v", err)
	}
	defer func() {
		flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdownOTel(flushCtx); err != nil {
			log.Printf("OpenTelemetry shutdown: %v", err)
		}
	}()

	handler := otelhttp.NewHandler(withMiddleware(mux), otelServiceName(),
		otelhttp.WithServerName(otelServiceName()))

	// Drain in-flight requests and flush telemetry on SIGINT/SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{Addr: ":" + port, Handler: handler}
	go func() {
		log.Printf("slides server starting on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server failed: %v", err)
		}
	}()

	<-ctx.Done()
	log.Printf("slides server shutting down")
	handlers.Broker.Close()
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		log.Printf("http server shutdown: %v", err)
	}
}

// CORS configuration. By default any origin may read the public API without
// credentials (so GitHub Pages decks can fetch state and open the WS). Origins
// listed in CORS_ORIGINS additionally get Access-Control-Allow-Credentials so
// the in-slide presenter panel can use the admin API cross-origin. Use "*" in
// CORS_ORIGINS to allow any origin, still without credentials.
var (
	corsAllowAll bool
	corsAllowed  = map[string]bool{}
)

func initCORS() {
	for _, raw := range strings.Split(os.Getenv("CORS_ORIGINS"), ",") {
		origin := strings.TrimSpace(raw)
		if origin == "" {
			continue
		}
		if origin == "*" {
			corsAllowAll = true
			continue
		}
		corsAllowed[strings.TrimRight(origin, "/")] = true
	}
}

func withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		if origin := r.Header.Get("Origin"); origin != "" {
			normalized := strings.TrimRight(origin, "/")
			w.Header().Add("Vary", "Origin")
			switch {
			case corsAllowed[normalized]:
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			case corsAllowAll:
				w.Header().Set("Access-Control-Allow-Origin", "*")
			default:
				// Read-only reflection: any origin may read public data, but
				// cookies are never accepted without an explicit allowlist.
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
