package db

import (
	"sync"
	"time"
)

// The answer path is the hottest write in the system: many audience members
// submit at once while every connected client rebuilds state on each change.
// Two mechanisms keep that cheap and correct on a single SQLite file:
//
//  1. A single writer goroutine drains a queue and flushes answers in one
//     transaction, so concurrent HTTP/WebSocket writers never contend for the
//     SQLite write lock themselves.
//  2. A small in-process cache for per-question result sets absorbs the
//     repeated GetQuestionStats calls that fan out to every subscriber.
//
// This is deliberately process-local: it complements WAL + busy_timeout rather
// than replacing SQLite, which remains the source of truth.

const (
	answerQueueSize = 1024
	answerBatchMax  = 512
	statsCacheTTL   = 3 * time.Second
)

const upsertAnswerSQL = "INSERT INTO answers (question_id, participant_id, value) VALUES (?, ?, ?) ON CONFLICT(question_id, participant_id) DO UPDATE SET value=excluded.value, created_at=CURRENT_TIMESTAMP"

// ── result cache ──

var (
	statsCacheMu sync.RWMutex
	statsCache   = map[int64]*statsCacheEntry{}
)

type statsCacheEntry struct {
	stats *QuestionStats
	exp   time.Time
}

// GetQuestionStats returns aggregated results, served from a short-lived
// in-process cache when warm.
func GetQuestionStats(questionID int64) (*QuestionStats, error) {
	statsCacheMu.RLock()
	entry, ok := statsCache[questionID]
	statsCacheMu.RUnlock()
	if ok && time.Now().Before(entry.exp) {
		return cloneStats(entry.stats), nil
	}
	stats, err := computeQuestionStats(questionID)
	if err != nil {
		return nil, err
	}
	statsCacheMu.Lock()
	statsCache[questionID] = &statsCacheEntry{
		stats: cloneStats(stats),
		exp:   time.Now().Add(statsCacheTTL),
	}
	statsCacheMu.Unlock()
	return stats, nil
}

// InvalidateQuestionStats drops a cached result set after a write.
func InvalidateQuestionStats(questionID int64) {
	statsCacheMu.Lock()
	delete(statsCache, questionID)
	statsCacheMu.Unlock()
}

// InvalidateAllQuestionStats drops every cached result set.
func InvalidateAllQuestionStats() {
	statsCacheMu.Lock()
	statsCache = map[int64]*statsCacheEntry{}
	statsCacheMu.Unlock()
}

func cloneStats(s *QuestionStats) *QuestionStats {
	if s == nil {
		return nil
	}
	c := *s
	c.Results = append([]Result(nil), s.Results...)
	if s.NPS != nil {
		n := *s.NPS
		c.NPS = &n
	}
	return &c
}

// ── single serialized answer writer ──

type answerWrite struct {
	questionID    int64
	participantID int64
	value         string
	done          chan error
}

var answerQueue = make(chan answerWrite, answerQueueSize)

func init() { go answerWriter() }

// UpsertAnswer records or replaces a participant's answer to a question. Writes
// are serialized through a single goroutine and flushed in batches; the call
// still blocks until the answer is durable.
func UpsertAnswer(questionID, participantID int64, value string) error {
	done := make(chan error, 1)
	select {
	case answerQueue <- answerWrite{questionID: questionID, participantID: participantID, value: value, done: done}:
	default:
		// Queue exhausted: fall back to a direct write so we never drop data.
		return upsertAnswerOne(answerWrite{questionID: questionID, participantID: participantID, value: value})
	}
	err := <-done
	if err == nil {
		InvalidateQuestionStats(questionID)
	}
	return err
}

func answerWriter() {
	for {
		first, ok := <-answerQueue
		if !ok {
			return
		}
		batch := []answerWrite{first}
	drain:
		for len(batch) < answerBatchMax {
			select {
			case a, ok := <-answerQueue:
				if !ok {
					break drain
				}
				batch = append(batch, a)
			default:
				break drain
			}
		}
		errs := upsertAnswerBatch(batch)
		seen := map[int64]bool{}
		for _, a := range batch {
			if !seen[a.questionID] {
				InvalidateQuestionStats(a.questionID)
				seen[a.questionID] = true
			}
		}
		for i, a := range batch {
			if a.done != nil {
				a.done <- errs[i]
			}
		}
	}
}

func upsertAnswerBatch(batch []answerWrite) []error {
	errs := make([]error, len(batch))
	if len(batch) == 0 {
		return errs
	}
	tx, err := DB.Begin()
	if err != nil {
		for i, a := range batch {
			errs[i] = upsertAnswerOne(a)
		}
		return errs
	}
	failed := false
	for i, a := range batch {
		if _, err := tx.Exec(upsertAnswerSQL, a.questionID, a.participantID, a.value); err != nil {
			errs[i] = err
			failed = true
		}
	}
	if failed {
		_ = tx.Rollback()
		for i, a := range batch {
			errs[i] = upsertAnswerOne(a)
		}
		return errs
	}
	if err := tx.Commit(); err != nil {
		for i, a := range batch {
			errs[i] = upsertAnswerOne(a)
		}
	}
	return errs
}

func upsertAnswerOne(a answerWrite) error {
	_, err := DB.Exec(upsertAnswerSQL, a.questionID, a.participantID, a.value)
	return err
}
