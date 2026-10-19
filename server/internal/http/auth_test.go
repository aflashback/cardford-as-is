package http

import (
	"cardford/server/internal/authn"
	"cardford/server/internal/authsession"
	"cardford/server/internal/demo"
	"cardford/server/internal/records"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type authTestBackend struct{ calls int }

func (b *authTestBackend) Call(_ context.Context, r Request) (Response, error) {
	b.calls++
	if r.Operation == "demo-frame" {
		frame, err := demo.GetFrameJSON(r.Body)
		if err != nil {
			return Response{}, err
		}
		raw, err := json.Marshal(frame)
		return Response{Body: raw}, err
	}
	return Response{}, nil
}

type authTestProvider struct{}

func (authTestProvider) LoginURL(string, string, string) string { return "https://issuer.example" }
func (authTestProvider) Verify(context.Context, string, string, string) (authn.Identity, error) {
	panic("must not verify invalid callback")
}
func TestAuthRejectsFixtureAndCrossOrigin(t *testing.T) {
	b := &authTestBackend{}
	h, e := NewAuthLocal(b, &records.Store{}, authTestProvider{}, "https://localhost:4443", "https://issuer.example")
	if e != nil {
		t.Fatal(e)
	}
	token := strings.Repeat("a", 43)
	for _, tc := range []struct {
		path, origin string
		status       int
	}{{"/api/local/session", "https://localhost:4443", 404}, {"/api/subscription/change", "https://localhost:4443", 404}, {"/api/session/actions", "https://evil.example", 403}, {"/api/session/actions", "", 403}} {
		r := httptest.NewRequest("POST", "https://localhost:4443"+tc.path, strings.NewReader("{}"))
		r.Host = "localhost:4443"
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("X-CSRF-Token", csrfToken(token))
		r.AddCookie(&http.Cookie{Name: AuthCookieName, Value: token})
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%s: %d", tc.path, w.Code)
		}
	}
	if b.calls != 0 {
		t.Fatal("unauthorized backend call")
	}
	r := httptest.NewRequest("GET", "https://localhost:4443/api/session", nil)
	r.AddCookie(&http.Cookie{Name: LocalCookieName, Value: token})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal("fixture cookie accepted", w.Code)
	}
}
func TestAuthCookieFlags(t *testing.T) {
	w := httptest.NewRecorder()
	authCookie(w, AuthCookieName, "abc", 3600)
	c := w.Result().Cookies()[0]
	if !c.Secure || !c.HttpOnly || c.Domain != "" || c.Path != "/" || c.SameSite != http.SameSiteStrictMode {
		t.Fatal("unsafe cookie", c)
	}
}

func TestAuthPublicDemoRequiresOriginButNotSession(t *testing.T) {
	b := &authTestBackend{}
	h, e := NewAuthLocal(b, &records.Store{}, authTestProvider{}, "https://localhost:4443", "https://issuer.example")
	if e != nil {
		t.Fatal(e)
	}
	for _, tc := range []struct {
		origin string
		status int
	}{{"https://localhost:4443", 200}, {"https://foreign.example", 403}, {"", 403}} {
		r := httptest.NewRequest("POST", "https://localhost:4443/api/demo/frame", strings.NewReader(`{"kind":"open","contentVersion":"spades-example-1.0.0"}`))
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Tricks-Client", "1")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("demo status=%d want=%d", w.Code, tc.status)
		}
	}
	if b.calls != 1 {
		t.Fatal("unauthorized demo reached backend", b.calls)
	}
}

type renewableHTTPRecords struct {
	authsession.Records
	family      records.SessionFamily
	logoutCalls int
}

func (r *renewableHTTPRecords) RememberedSession(context.Context, string) (records.SessionFamily, error) {
	return r.family, nil
}
func (r *renewableHTTPRecords) RevokeRemembered(context.Context, string) (records.Principal, error) {
	r.logoutCalls++
	return records.Principal{}, nil
}
func TestAuthRenewalBootstrapAndExpiredLogout(t *testing.T) {
	now := time.Now()
	db := &renewableHTTPRecords{family: records.SessionFamily{ID: "stable-family", KeyID: "test", ServerTime: now, AccessExpiresAt: now.Add(-time.Second), IdleExpiresAt: now.Add(24 * time.Hour), AbsoluteExpiresAt: now.Add(48 * time.Hour), Ciphertext: []byte("never-json")}}
	lifecycle, err := authsession.New(db, nil, base64.RawURLEncoding.EncodeToString(make([]byte, 32)), "test")
	if err != nil {
		t.Fatal(err)
	}
	backend := &authTestBackend{}
	h, err := NewAuthLocal(backend, &records.Store{}, authTestProvider{}, "https://localhost:4443", "https://issuer.example", lifecycle)
	if err != nil {
		t.Fatal(err)
	}
	token := strings.Repeat("a", 43)
	r := httptest.NewRequest("GET", "https://localhost:4443/api/auth/status", nil)
	r.AddCookie(&http.Cookie{Name: AuthCookieName, Value: token})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	var body map[string]any
	if err = json.Unmarshal(w.Body.Bytes(), &body); err != nil || w.Code != 200 || body["state"] != "renewal-required" || body["csrfToken"] != csrfToken(token) || body["account"] != nil || strings.Contains(w.Body.String(), "never-json") {
		t.Fatal("unsafe renewal bootstrap", w.Code, err)
	}
	private := httptest.NewRequest("GET", "https://localhost:4443/api/session", nil)
	private.AddCookie(&http.Cookie{Name: AuthCookieName, Value: token})
	out := httptest.NewRecorder()
	h.ServeHTTP(out, private)
	if out.Code != 401 || !strings.Contains(out.Body.String(), "session_renewal_required") || backend.calls != 0 {
		t.Fatal("expired private request admitted", out.Code)
	}
	for _, withCookie := range []bool{true, false} {
		logout := httptest.NewRequest("POST", "https://localhost:4443/auth/logout", nil)
		logout.Header.Set("Origin", "https://localhost:4443")
		if withCookie {
			logout.AddCookie(&http.Cookie{Name: AuthCookieName, Value: token})
			logout.Header.Set("X-CSRF-Token", csrfToken(token))
		}
		response := httptest.NewRecorder()
		h.ServeHTTP(response, logout)
		if response.Code != 204 || len(response.Result().Cookies()) != 0 {
			t.Fatal("remembered logout failed", response.Code)
		}
	}
	if db.logoutCalls != 2 {
		t.Fatal("logout was tied to short access lease")
	}
}
func TestAuthRefreshRequiresExactOriginAndCSRF(t *testing.T) {
	db := &renewableHTTPRecords{}
	lifecycle, _ := authsession.New(db, nil, base64.RawURLEncoding.EncodeToString(make([]byte, 32)), "test")
	h, _ := NewAuthLocal(&authTestBackend{}, &records.Store{}, authTestProvider{}, "https://localhost:4443", "https://issuer.example", lifecycle)
	for _, origin := range []string{"", "https://evil.example", "https://localhost:4443"} {
		r := httptest.NewRequest("POST", "https://localhost:4443/auth/refresh", nil)
		r.Header.Set("Origin", origin)
		r.AddCookie(&http.Cookie{Name: AuthCookieName, Value: strings.Repeat("a", 43)})
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatal("unprotected refresh", w.Code)
		}
	}
}

type raceAuthRecords struct {
	authsession.Records
	mu                           sync.Mutex
	family                       records.SessionFamily
	logoutEntered, logoutRelease chan struct{}
}

func (r *raceAuthRecords) LoginRenewable(_ context.Context, in records.RenewableLogin) (records.Identity, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.family = records.SessionFamily{ID: records.SessionID(in.Token), KeyID: in.KeyID, Ciphertext: in.Ciphertext, Issuer: in.Issuer, Subject: in.Subject, ProviderSID: in.ProviderSID}
	return records.Identity{Token: in.Token}, nil
}
func (r *raceAuthRecords) ClaimRefresh(_ context.Context, token, operation string) (records.SessionFamily, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	f := r.family
	if f.ID != records.SessionID(token) {
		return f, false, records.ErrUnauthenticated
	}
	f.Operation = operation
	return f, true, nil
}
func (r *raceAuthRecords) CompleteRefresh(_ context.Context, f records.SessionFamily, _ string, _ []byte, _, _ time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if f.ID != r.family.ID {
		return records.ErrUnauthenticated
	}
	return nil
}
func (r *raceAuthRecords) MarkRefreshUncertain(context.Context, records.SessionFamily) error {
	return nil
}
func (r *raceAuthRecords) RevokeRemembered(context.Context, string) (records.Principal, error) {
	close(r.logoutEntered)
	<-r.logoutRelease
	return records.Principal{}, nil
}

type raceAuthProvider struct {
	authsession.Provider
	entered, release chan struct{}
}

func (p raceAuthProvider) Refresh(context.Context, authn.Identity, authn.TokenBundle) (authn.TokenBundle, error) {
	close(p.entered)
	<-p.release
	return authn.TokenBundle{RefreshToken: "rotated", AccessExpiresAt: time.Now().Add(time.Minute)}, nil
}
func TestAuthStaleRefreshAndLogoutCannotDeleteNewLoginCookie(t *testing.T) {
	for _, operation := range []string{"refresh", "logout"} {
		t.Run(operation, func(t *testing.T) {
			entered, release := make(chan struct{}), make(chan struct{})
			db := &raceAuthRecords{logoutEntered: entered, logoutRelease: release}
			provider := raceAuthProvider{entered: entered, release: release}
			lifecycle, err := authsession.New(db, provider, base64.RawURLEncoding.EncodeToString(make([]byte, 32)), "test")
			if err != nil {
				t.Fatal(err)
			}
			identity := authn.Identity{Issuer: "issuer", Subject: "subject", SID: "sid", Tokens: authn.TokenBundle{RefreshToken: "before", AccessExpiresAt: time.Now().Add(time.Minute)}}
			first, err := lifecycle.Login(context.Background(), identity)
			if err != nil {
				t.Fatal(err)
			}
			h, _ := NewAuthLocal(&authTestBackend{}, &records.Store{}, authTestProvider{}, "https://localhost:4443", "https://issuer.example", lifecycle)
			request := httptest.NewRequest("POST", "https://localhost:4443/auth/"+operation, nil)
			request.Header.Set("Origin", "https://localhost:4443")
			request.Header.Set("X-CSRF-Token", csrfToken(first.Token))
			request.AddCookie(&http.Cookie{Name: AuthCookieName, Value: first.Token})
			response := httptest.NewRecorder()
			done := make(chan struct{})
			go func() { h.ServeHTTP(response, request); close(done) }()
			select {
			case <-entered:
			case <-time.After(time.Second):
				t.Fatal("operation never reached provider/records")
			}
			second, err := lifecycle.Login(context.Background(), identity)
			if err != nil || second.Token == first.Token {
				t.Fatal("replacement did not issue new cookie", err)
			}
			close(release)
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("old operation failed to complete")
			}
			expected := 401
			if operation == "logout" {
				expected = 204
			}
			if response.Code != expected || response.Header().Get("Set-Cookie") != "" {
				t.Fatal("stale response mutated replacement browser cookie", response.Code)
			}
		})
	}
}
