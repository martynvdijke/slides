package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// SeedQuestion is one entry in the per-deck questions.json manifest.
type SeedQuestion struct {
	ID           string   `json:"id"`
	Kind         string   `json:"kind"`
	Mode         string   `json:"mode"`
	Prompt       string   `json:"prompt"`
	Options      []string `json:"options"`
	CorrectIndex *int     `json:"correct_index"`
	PointsBase   int      `json:"points_base"`
	ShowResults  *bool    `json:"show_results"`
	TimeLimitS   int      `json:"time_limit_s"`
	DurationSec  int      `json:"duration_sec"`
	MediaURL     string   `json:"media_url"`
	MediaType    string   `json:"media_type"`
}

// SeedManifest is the frozen shape produced by scripts/extract-questions.mjs.
type SeedManifest struct {
	Deck      string         `json:"deck"`
	EventCode string         `json:"event_code"`
	EventName string         `json:"event_name"`
	Questions []SeedQuestion `json:"questions"`
}

// SeedDeckQuestionsFromDir iterates immediate subdirectories of decksDir; for
// each that contains questions.json, it decodes the manifest and syncs the
// questions into the DB idempotently.
func SeedDeckQuestionsFromDir(decksDir string) error {
	entries, err := os.ReadDir(decksDir)
	if err != nil {
		return fmt.Errorf("read decks dir %q: %w", decksDir, err)
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		qPath := filepath.Join(decksDir, e.Name(), "questions.json")
		data, err := os.ReadFile(qPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			log.Printf("seed deck %s: read questions.json: %v", e.Name(), err)
			continue
		}
		var m SeedManifest
		if err := json.Unmarshal(data, &m); err != nil {
			log.Printf("seed deck %s: decode questions.json: %v", e.Name(), err)
			continue
		}
		if len(m.Questions) == 0 {
			continue
		}
		code := m.EventCode
		if code == "" {
			code = e.Name()
		}
		name := m.EventName
		if name == "" {
			name = code
		}
		ev, _, err := EnsureEvent(code, name, "Seeded from deck markdown")
		if err != nil {
			log.Printf("seed deck %s: EnsureEvent: %v", e.Name(), err)
			continue
		}
		created, updated, err := SyncEventQuestions(ev.ID, m.Questions)
		if err != nil {
			log.Printf("seed deck %s: SyncEventQuestions: %v", e.Name(), err)
			continue
		}
		log.Printf("seed deck %s: event=%s created=%d updated=%d", e.Name(), code, created, updated)
	}
	return nil
}

// SyncEventQuestions idempotently creates or updates questions for an event.
// It keys by SeedQuestion.ID (falling back to q<N>) via the questions.seed_key column.
func SyncEventQuestions(eventID int64, qs []SeedQuestion) (created, updated int, err error) {
	for i, q := range qs {
		key := q.ID
		if key == "" {
			key = fmt.Sprintf("q%d", i+1)
		}
		// Validate kind.
		if !ValidQuestionKind(q.Kind) {
			log.Printf("seed skip %q: invalid kind %q", key, q.Kind)
			continue
		}
		// poll/multi/ranking require >=2 options.
		if (q.Kind == "poll" || q.Kind == "multi" || q.Kind == "ranking") && len(q.Options) < 2 {
			log.Printf("seed skip %q: kind %q requires >=2 options", key, q.Kind)
			continue
		}

		// Default show_results to true when omitted.
		showResults := true
		if q.ShowResults != nil {
			showResults = *q.ShowResults
		}

		mode := q.Mode
		if mode == "" {
			mode = "live"
		}

		existing, err := GetQuestionBySeedKey(eventID, key)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return created, updated, err
		}
		if errors.Is(err, sql.ErrNoRows) {
			// Create new question.
			createdQ, cErr := CreateQuestion(eventID, q.Kind, mode, q.Prompt, q.Options, false, showResults, i+1, q.MediaURL, q.MediaType)
			if cErr != nil {
				log.Printf("seed create %q: %v", key, cErr)
				continue
			}
			if sErr := SetQuestionSeedKey(createdQ.ID, key); sErr != nil {
				log.Printf("seed set key %q: %v", key, sErr)
			}
			// Update extra fields (correct_index, points_base, time_limit_s, duration_sec).
			fields := map[string]any{
				"correct_index": q.CorrectIndex,
				"points_base":   q.PointsBase,
				"time_limit_s":  q.TimeLimitS,
				"duration_sec":  q.DurationSec,
			}
			// If correct_index is nil, we still pass nil to clear any stale value (no-op on new row anyway).
			if _, uErr := UpdateQuestion(createdQ.ID, fields); uErr != nil {
				log.Printf("seed update extras %q: %v", key, uErr)
			}
			created++
		} else {
			// Update existing in place.
			fields := map[string]any{
				"kind":          q.Kind,
				"mode":          mode,
				"prompt":        q.Prompt,
				"options":       q.Options,
				"show_results":  showResults,
				"media_url":     q.MediaURL,
				"media_type":    q.MediaType,
				"correct_index": q.CorrectIndex,
				"points_base":   q.PointsBase,
				"time_limit_s":  q.TimeLimitS,
				"duration_sec":  q.DurationSec,
				"position":      i + 1,
			}
			if _, uErr := UpdateQuestion(existing.ID, fields); uErr != nil {
				log.Printf("seed update %q: %v", key, uErr)
				continue
			}
			updated++
		}
	}
	return created, updated, nil
}
