package handlers

import "net/http"

// Health is a liveness probe for container orchestrators and the compose
// healthcheck. It reports that the HTTP server is up and intentionally does
// not touch the database.
func Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
