package handlers

import (
	"context"
	"time"

	"slides/db"
)

func StartReaper(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Second
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				now := time.Now().UnixMilli()
				due, err := db.ListDueQuestions(now)
				if err != nil || len(due) == 0 {
					continue
				}
				for _, q := range due {
					_ = db.CloseQuestion(q.EventID, q.ID)
					if q.AutoReveal {
						_ = db.SetQuestionShowResults(q.ID, true)
					}
					BroadcastEvent(q.EventID)
				}
			}
		}
	}()
}
