package webhookcfg

import (
	"os"
	"strings"

	"slides/db"
)

// Config holds the resolved webhook configuration.
type Config struct {
	URL     string
	Secret  string
	Enabled bool
	Events  []string
}

// Resolve applies environment overrides on top of stored settings.
// Non-empty env vars win over stored values, mirroring emailcfg.Resolve.
func Resolve(stored Config) Config {
	c := stored
	if v := strings.TrimSpace(os.Getenv("WEBHOOK_URL")); v != "" {
		c.URL = v
	}
	if v := os.Getenv("WEBHOOK_SECRET"); v != "" {
		c.Secret = v
	}
	if v := strings.TrimSpace(os.Getenv("WEBHOOK_ENABLED")); v != "" {
		c.Enabled = isTruthy(v)
	}
	if v := strings.TrimSpace(os.Getenv("WEBHOOK_EVENTS")); v != "" {
		c.Events = parseEvents(v)
	}
	return c
}

// Load reads DB settings then applies env overrides.
func Load() (Config, error) {
	u, s, enabled, events, err := db.GetWebhookSettings()
	if err != nil {
		return Config{}, err
	}
	stored := Config{
		URL:     u,
		Secret:  s,
		Enabled: enabled,
		Events:  events,
	}
	return Resolve(stored), nil
}

func isTruthy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off", "":
		return false
	default:
		return false
	}
}

func parseEvents(s string) []string {
	parts := strings.Split(s, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
