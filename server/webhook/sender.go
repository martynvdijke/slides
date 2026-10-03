package webhook

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"slides/webhookcfg"
)

// httpClient is injectable for tests.
var httpClient = &http.Client{Timeout: 5 * time.Second}

// Sign returns the X-Signature header value for a given secret and body.
func Sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// HostAllowed reports whether the host is allowed per SSRF rules.
// When WEBHOOK_ALLOW_PRIVATE=1 all hosts are allowed.
func HostAllowed(host string) bool {
	if isTruthy(os.Getenv("WEBHOOK_ALLOW_PRIVATE")) {
		return true
	}
	// Strip port if present.
	h := host
	if strings.Contains(h, ":") {
		if hh, _, err := net.SplitHostPort(h); err == nil {
			h = hh
		}
	}
	// Try to parse as IP directly.
	if ip := net.ParseIP(h); ip != nil {
		return isPublicIP(ip)
	}
	// DNS lookup.
	ips, err := net.LookupIP(h)
	if err != nil || len(ips) == 0 {
		// If lookup fails, allow? No, deny to be safe.
		// But for hostnames that don't resolve yet (test), we treat as allowed
		// only if not obviously private. Fall back to deny if we cannot verify.
		// To keep tests deterministic, deny on lookup failure.
		return false
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return false
		}
	}
	return true
}

func isPublicIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return false
	}
	// Check private ranges.
	if ip4 := ip.To4(); ip4 != nil {
		// 10.0.0.0/8
		if ip4[0] == 10 {
			return false
		}
		// 172.16.0.0/12
		if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
			return false
		}
		// 192.168.0.0/16
		if ip4[0] == 192 && ip4[1] == 168 {
			return false
		}
		// 169.254.0.0/16 link-local already covered but explicit.
		if ip4[0] == 169 && ip4[1] == 254 {
			return false
		}
		// 127.0.0.0/8 already covered
	}
	// IPv6 unique local fc00::/7
	if len(ip) == net.IPv6len {
		if ip[0]&0xfe == 0xfc {
			return false
		}
	}
	return true
}

func isTruthy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// Notify sends a webhook notification fire-and-forget.
func Notify(event string, payloadType string, data map[string]any) {
	cfg, err := webhookcfg.Load()
	if err != nil {
		log.Printf("webhook: load config: %v", err)
		return
	}
	if cfg.URL == "" || !cfg.Enabled {
		return
	}
	if len(cfg.Events) > 0 {
		found := false
		for _, e := range cfg.Events {
			if e == payloadType {
				found = true
				break
			}
		}
		if !found {
			return
		}
	}
	// SSRF guard: validate URL.
	u, err := url.Parse(cfg.URL)
	if err != nil {
		log.Printf("webhook: invalid URL: %v", err)
		return
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		log.Printf("webhook: rejected scheme %q", u.Scheme)
		return
	}
	if !HostAllowed(u.Host) {
		log.Printf("webhook: host %q blocked by SSRF guard", u.Host)
		return
	}

	envelope := map[string]any{
		"event":     event,
		"type":      payloadType,
		"data":      data,
		"timestamp": time.Now().UnixMilli(),
	}
	body, err := json.Marshal(envelope)
	if err != nil {
		log.Printf("webhook: marshal: %v", err)
		return
	}

	// Fire-and-forget in goroutine.
	go func(cfg webhookcfg.Config, body []byte, payloadType string) {
		req, err := http.NewRequest(http.MethodPost, cfg.URL, bytes.NewReader(body))
		if err != nil {
			log.Printf("webhook: new request: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Webhook-Event", payloadType)
		if cfg.Secret != "" {
			req.Header.Set("X-Signature", Sign(cfg.Secret, body))
		}
		resp, err := httpClient.Do(req)
		if err != nil {
			log.Printf("webhook: do: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Printf("webhook: non-2xx status %d", resp.StatusCode)
		}
	}(cfg, body, payloadType)
}
