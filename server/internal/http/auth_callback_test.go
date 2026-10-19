package http

import (
	"cardford/server/internal/records"
	"net/http/httptest"
	"strings"
	"testing"
)

// AUTH-LOCAL-009: an expired or cross-browser callback stays rejected, but a
// browser gets a safe, explicit route to create a new bound login attempt.
func TestAuthCallbackRecovery(t *testing.T) {
	for _, tc := range []struct {
		name, path, accept string
		status             int
		html               bool
	}{
		{"missing browser binding", "/auth/callback?state=private-state&code=private-code", "text/html,application/xhtml+xml", 401, true},
		{"malformed callback", "/auth/callback?state=private-state", "text/html", 400, true},
		{"JSON caller", "/auth/callback?state=private-state&code=private-code", "application/json", 401, false},
		{"API request", "/api/session", "text/html", 401, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			backend := &authTestBackend{}
			h, err := NewAuthLocal(backend, &records.Store{}, authTestProvider{}, "https://localhost:4443", "https://issuer.example")
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest("GET", "https://localhost:4443"+tc.path, nil)
			r.Header.Set("Accept", tc.accept)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			body := w.Body.String()
			if w.Code != tc.status || backend.calls != 0 {
				t.Fatalf("status=%d backend calls=%d", w.Code, backend.calls)
			}
			if tc.html {
				if !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") || !strings.Contains(body, `href="/auth/login"`) || !strings.Contains(body, "Start sign-in again") {
					t.Fatal("missing browser recovery page")
				}
			} else if !strings.Contains(body, `"code":"UNAUTHENTICATED"`) {
				t.Fatal("JSON API contract changed")
			}
			if strings.Contains(body, "private-state") || strings.Contains(body, "private-code") || w.Header().Get("Location") != "" {
				t.Fatal("callback data reflected or automatic redirect")
			}
			if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Referrer-Policy") != "no-referrer" {
				t.Fatal("unsafe callback cache/referrer policy")
			}
			for _, c := range w.Result().Cookies() {
				if c.Name == AuthCookieName {
					t.Fatal("failed callback modified app session")
				}
			}
		})
	}
}
