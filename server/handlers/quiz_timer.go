package handlers

import (
	"sync"
	"time"

	"slides/db"
)

// autolock tracks the scheduled auto-lock timer for each active timed
// question. Timers are keyed by question ID and are replaced or stopped
// whenever the question lifecycle changes.
var (
	autolockMu     sync.Mutex
	autolockTimers = map[int64]*time.Timer{}
)

// scheduleAutoLock arms (or re-arms) the auto-lock for a live timed question.
// Untimed or non-live questions simply cancel any existing timer. The timer is
// a best-effort convenience: answer submission and state building also check
// the deadline, so a missed timer or restart cannot leave a question
// answerable.
func scheduleAutoLock(q *db.Question) {
	if q == nil {
		return
	}
	cancelAutoLock(q.ID)
	if q.Status != "live" || q.TimeLimitS <= 0 || q.ActivatedAt == nil {
		return
	}
	deadline := *q.ActivatedAt + int64(q.TimeLimitS)*1000
	delay := time.Until(time.UnixMilli(deadline))
	if delay < 0 {
		delay = 0
	}
	eventID, questionID := q.EventID, q.ID
	var t *time.Timer
	t = time.AfterFunc(delay, func() {
		locked, err := db.LockQuestionIfExpired(eventID, questionID, time.Now().UnixMilli())
		if err == nil && locked {
			BroadcastEvent(eventID)
		}
		autolockMu.Lock()
		if cur, ok := autolockTimers[questionID]; ok && cur == t {
			delete(autolockTimers, questionID)
		}
		autolockMu.Unlock()
	})
	autolockMu.Lock()
	autolockTimers[questionID] = t
	autolockMu.Unlock()
}

// cancelAutoLock stops a pending auto-lock for a question, if any.
func cancelAutoLock(questionID int64) {
	autolockMu.Lock()
	if t, ok := autolockTimers[questionID]; ok {
		t.Stop()
		delete(autolockTimers, questionID)
	}
	autolockMu.Unlock()
}
