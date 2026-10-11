package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"slides/db"
)

type deckSyncRequest struct {
	DeckSlug string          `json:"deck_slug"`
	Slides   []db.DeckSlide `json:"slides"`
}

func AdminDeckSync(w http.ResponseWriter, r *http.Request) {
	eid := pathID(r, "id")
	if eid == 0 {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	if _, err := db.GetEventByID(eid); err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	var req deckSyncRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "invalid json", http.StatusBadRequest)
		return
	}
	req.DeckSlug = strings.TrimSpace(req.DeckSlug)
	if req.DeckSlug == "" {
		jsonError(w, "deck_slug is required", http.StatusBadRequest)
		return
	}
	if req.Slides == nil {
		req.Slides = []db.DeckSlide{}
	}
	// normalize slides: trim prompt, kind
	for i := range req.Slides {
		req.Slides[i].SlideID = strings.TrimSpace(req.Slides[i].SlideID)
		req.Slides[i].Prompt = strings.TrimSpace(req.Slides[i].Prompt)
		req.Slides[i].Kind = strings.TrimSpace(req.Slides[i].Kind)
		if req.Slides[i].Kind == "" {
			req.Slides[i].Kind = "poll"
		}
		req.Slides[i].Activate = strings.TrimSpace(req.Slides[i].Activate)
		if req.Slides[i].Options == nil {
			req.Slides[i].Options = []string{}
		}
		if req.Slides[i].PointsBase == 0 {
			req.Slides[i].PointsBase = 100
		}
	}
	// validate duplicate slide_id
	seen := map[string]bool{}
	for _, s := range req.Slides {
		if s.SlideID == "" {
			jsonError(w, "slide_id is required", http.StatusBadRequest)
			return
		}
		if seen[s.SlideID] {
			jsonError(w, "duplicate slide_id "+s.SlideID, http.StatusBadRequest)
			return
		}
		seen[s.SlideID] = true
		if !db.ValidQuestionKind(s.Kind) {
			jsonError(w, "unknown question kind "+s.Kind, http.StatusBadRequest)
			return
		}
	}
	c, u, a, err := db.SyncDeckQuestions(eid, req.DeckSlug, req.Slides)
	if err != nil {
		// validation error
		if strings.Contains(err.Error(), "unknown question kind") || strings.Contains(err.Error(), "requires at least") {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		jsonError(w, "failed to sync", http.StatusInternalServerError)
		return
	}
	BroadcastEvent(eid)
	// also ensure json import used
	_ = json.Marshal
	writeJSON(w, http.StatusOK, map[string]int{"synced": len(req.Slides), "created": c, "updated": u, "archived": a})
}
