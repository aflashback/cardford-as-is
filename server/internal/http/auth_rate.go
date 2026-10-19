package http

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type authRateEntry struct {
	until time.Time
	count int
}
type authRateLimiter struct {
	mu      sync.Mutex
	entries map[string]authRateEntry
}

func (l *authRateLimiter) allow(key string, limit int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if l.entries == nil {
		l.entries = make(map[string]authRateEntry)
	}
	entry := l.entries[key]
	if !entry.until.After(now) {
		if len(l.entries) >= 4096 {
			for k, v := range l.entries {
				if !v.until.After(now) {
					delete(l.entries, k)
				}
			}
			if len(l.entries) >= 4096 {
				return false
			}
		}
		entry = authRateEntry{until: now.Add(time.Minute)}
	}
	entry.count++
	l.entries[key] = entry
	return entry.count <= limit
}
func (h *AuthHandler) allowAuthRequest(r *http.Request, token string) bool {
	limit := 60
	if r.URL.Path == "/auth/refresh" {
		limit = 10
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if !h.rate.allow(r.URL.Path+":source:"+host, limit*4) {
		return false
	}
	if token != "" {
		return h.rate.allow(r.URL.Path+":family:"+csrfToken(token), limit)
	}
	return true
}
