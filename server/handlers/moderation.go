package handlers

import (
	"strings"
	"unicode"

	"slides/db"
)

// filterConfig is the resolved global content filter: whether it is on, the
// blocked token sequences, and the action to take on a match.
type filterConfig struct {
	Enabled bool
	Blocked [][]string
	Action  string
}

// loadFilterConfig reads the filter settings and normalizes them for matching.
// A disabled filter or an unreadable row yields a zero config (no-op).
func loadFilterConfig() filterConfig {
	s, err := db.GetFilterSettings()
	if err != nil || !s.Enabled {
		return filterConfig{}
	}
	action := s.Action
	if action != "reject" {
		action = "flag"
	}
	return filterConfig{Enabled: true, Blocked: parseBlockedWords(s.Words), Action: action}
}

// parseBlockedWords splits a newline/comma separated word list into normalized
// token sequences. Entries may be single words or short phrases; duplicates and
// empty entries are dropped.
func parseBlockedWords(raw string) [][]string {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == '\n' || r == '\r' || r == ','
	})
	out := [][]string{}
	seen := map[string]bool{}
	for _, f := range fields {
		tokens := normalizeTokens(f)
		if len(tokens) == 0 {
			continue
		}
		key := strings.Join(tokens, " ")
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, tokens)
	}
	return out
}

// normalizeTokens lowercases text and splits it into alphanumeric tokens.
func normalizeTokens(s string) []string {
	var out []string
	var b strings.Builder
	flush := func() {
		if b.Len() > 0 {
			out = append(out, strings.ToLower(b.String()))
			b.Reset()
		}
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return out
}

// matches reports whether the text contains any blocked token sequence as
// whole tokens, case-insensitively. "class" does not match "ass", while
// "you ass" does.
func (f filterConfig) matches(text string) bool {
	if !f.Enabled || len(f.Blocked) == 0 {
		return false
	}
	padded := " " + strings.Join(normalizeTokens(text), " ") + " "
	for _, entry := range f.Blocked {
		if strings.Contains(padded, " "+strings.Join(entry, " ")+" ") {
			return true
		}
	}
	return false
}

// slowModeError signals a Q&A submission refused by slow mode, carrying the
// number of seconds the participant must wait before retrying.
type slowModeError struct{ RetryAfterS int }

func (e *slowModeError) Error() string { return "slow mode is active" }

// slowModeWait returns the remaining per-participant slow-mode seconds for the
// event, based on the stored submission time so reconnects do not reset it.
func slowModeWait(ev *db.Event, participantID int64) int {
	if ev == nil || ev.QASlowModeS <= 0 || participantID <= 0 {
		return 0
	}
	elapsed, ok, err := db.LastQASubmissionSeconds(ev.ID, participantID)
	if err != nil || !ok {
		return 0
	}
	remaining := ev.QASlowModeS - elapsed
	if remaining < 0 {
		return 0
	}
	return remaining
}
