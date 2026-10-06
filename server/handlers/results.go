package handlers

import (
	"net/http"

	"slides/db"
)

// resultsEventDTO is the public event shape on the results page: no internal
// ids, no participant data.
type resultsEventDTO struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	EventDate   string `json:"event_date"`
	Status      string `json:"status"`
}

// ResultsDTO is the public, participant-free results payload. Questions use the
// same DTO as the live views (aggregates only, correctness gated by the
// question's own reveal settings); Q&A is limited to approved and answered
// entries.
type ResultsDTO struct {
	Event       resultsEventDTO       `json:"event"`
	Stats       EventStatsSummaryDTO  `json:"stats"`
	Questions   []QuestionDTO         `json:"questions"`
	QA          []QADTO               `json:"qa"`
	Leaderboard []db.LeaderboardEntry `json:"leaderboard"`
}

// GetEventResults serves the public results payload for a published event.
// @Summary  Public event results
// @Tags     public
// @Produce  json
// @Param    code path string true "Event code"
// @Success  200 {object} ResultsDTO
// @Failure  404 {object} map[string]string
// @Router   /api/events/{code}/results [get]
func GetEventResults(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	ev, err := db.GetEventByCode(code)
	if err != nil {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	if !ev.ResultsPublished {
		jsonError(w, "results not published", http.StatusNotFound)
		return
	}

	w.Header().Set("X-Robots-Tag", "noindex")

	summary, err := db.EventStats(ev.ID)
	if err != nil {
		jsonError(w, "failed to load results", http.StatusInternalServerError)
		return
	}
	questions, err := db.ListQuestions(ev.ID)
	if err != nil {
		jsonError(w, "failed to load results", http.StatusInternalServerError)
		return
	}
	qaRows, err := db.ListQA(ev.ID, "approved", "answered")
	if err != nil {
		jsonError(w, "failed to load results", http.StatusInternalServerError)
		return
	}
	lb, err := db.GetLeaderboard(ev.ID)
	if err != nil {
		jsonError(w, "failed to load results", http.StatusInternalServerError)
		return
	}

	dto := ResultsDTO{
		Event: resultsEventDTO{
			Code:        ev.Code,
			Name:        ev.Name,
			Description: ev.Description,
			EventDate:   ev.EventDate,
			Status:      ev.Status,
		},
		Stats:       eventStatsSummaryDTO(*ev, *summary),
		Questions:   make([]QuestionDTO, 0, len(questions)),
		QA:          make([]QADTO, 0, len(qaRows)),
		Leaderboard: lb,
	}
	for _, q := range questions {
		if q.Status == "draft" {
			continue
		}
		dto.Questions = append(dto.Questions, questionDTO(q, true))
	}
	for _, q := range qaRows {
		dto.QA = append(dto.QA, qaDTO(q))
	}
	writeJSON(w, http.StatusOK, dto)
}
