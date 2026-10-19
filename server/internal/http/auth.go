package http

import (
	"cardford/server/internal/authn"
	"cardford/server/internal/authsession"
	"cardford/server/internal/records"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const AuthCookieName = "__Host-cf_session"
const authBindingCookie = "__Host-cf_login"

type AuthProvider interface {
	LoginURL(string, string, string) string
	Verify(context.Context, string, string, string) (authn.Identity, error)
}
type AuthHandler struct {
	rate                      authRateLimiter
	sessions                  *authsession.Service
	store                     *records.Store
	provider                  AuthProvider
	api                       *LocalHandler
	origin, issuer, authority string
}

// NewAuthLocal accepts an HTTPS browser origin while retaining the native
// loopback listener behind the local TLS proxy. No forwarded header is trusted.
func NewAuthLocal(backend LocalBackend, store *records.Store, provider AuthProvider, origin, issuer string, sessions ...*authsession.Service) (*AuthHandler, error) {
	u, e := url.Parse(origin)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil || store == nil || provider == nil {
		return nil, errors.New("invalid auth transport configuration")
	}
	api := &LocalHandler{backend: backend, options: LocalOptions{Origin: origin, RequestTimeout: 5 * time.Second, MaxInFlight: 16, BodyLimit: 32 << 10}, authority: u.Host, slots: make(chan struct{}, 16)}
	h := &AuthHandler{store: store, provider: provider, api: api, origin: origin, issuer: issuer, authority: u.Host}
	if len(sessions) > 0 {
		h.sessions = sessions[0]
	}
	return h, nil
}
func authCookie(w http.ResponseWriter, name, value string, age int) {
	sameSite := http.SameSiteLaxMode
	if name == AuthCookieName {
		sameSite = http.SameSiteStrictMode
	}
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", Secure: true, HttpOnly: true, SameSite: sameSite, MaxAge: age})
}
func uniqueCookie(r *http.Request, name string) string {
	var value string
	count := 0
	for _, c := range r.Cookies() {
		if c.Name == name {
			value = c.Value
			count++
		}
	}
	if count != 1 || !localToken.MatchString(value) {
		return ""
	}
	return value
}
func csrfToken(token string) string {
	sum := sha256.Sum256([]byte("cardford-csrf-v1:" + token))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
func authFailure(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": "Sign in again to continue."})
}
func (h *AuthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Host != h.authority || len(r.Header.Values("Origin")) > 1 || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != h.origin) {
		authFailure(w, 403, "FORBIDDEN")
		return
	}
	token := uniqueCookie(r, AuthCookieName)
	if (r.URL.Path == "/auth/refresh" || r.URL.Path == "/api/auth/status" || r.URL.Path == "/auth/login") && !h.allowAuthRequest(r, token) {
		authFailure(w, 429, "RATE_LIMITED")
		return
	}
	if r.URL.Path == "/auth/backchannel-logout" && h.sessions != nil {
		if r.Method != "POST" || len(r.Cookies()) != 0 {
			authFailure(w, 400, "INVALID_COMMAND")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
		if r.ParseForm() != nil || len(r.PostForm["logout_token"]) != 1 || h.sessions.Backchannel(r.Context(), r.PostForm.Get("logout_token")) != nil {
			authFailure(w, 400, "INVALID_COMMAND")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method == "POST" {
		publicDemo := r.URL.Path == "/api/demo/frame"
		anonymousLogout := r.URL.Path == "/auth/logout" && token == "" && h.sessions != nil
		if r.Header.Get("Origin") != h.origin || (!publicDemo && !anonymousLogout && (len(r.Header.Values("X-CSRF-Token")) != 1 || token == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(csrfToken(token))) != 1)) {
			authFailure(w, 403, "FORBIDDEN")
			return
		}
	}
	switch r.URL.Path {
	case "/api/health":
		if r.Method != "GET" {
			authFailure(w, 404, "NOT_FOUND")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ready", "mode": "auth-local", "identity": "keycloak", "payments": "disabled", "provider": "off"})
		return
	case "/api/auth/status":
		if r.Method != "GET" {
			authFailure(w, 404, "NOT_FOUND")
			return
		}
		if h.sessions != nil {
			h.sessionStatus(w, r, token)
			return
		}
		out := map[string]any{"mode": "keycloak", "state": "signed-out", "authenticated": false, "loginUrl": "/auth/login", "logoutUrl": "/auth/logout", "refreshUrl": "/auth/refresh", "accountUrl": h.issuer + "/account/"}
		p, err := h.store.Authenticate(r.Context(), token)
		if err == nil {
			name, nameErr := h.store.AuthDisplayName(r.Context(), p)
			plan, planErr := h.store.AuthPlan(r.Context(), p)
			if nameErr != nil || planErr != nil {
				authFailure(w, 503, "SERVICE_UNAVAILABLE")
				return
			}
			out["authenticated"] = true
			out["state"] = "authenticated"
			out["csrfToken"] = csrfToken(token)
			out["account"] = map[string]string{"id": p.OwnerID, "displayName": name, "plan": plan}
		} else if !errors.Is(err, records.ErrUnauthenticated) {
			authFailure(w, 503, "SERVICE_UNAVAILABLE")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
		return
	case "/auth/login":
		if r.Method != "GET" || r.URL.RawQuery != "" {
			authFailure(w, 400, "INVALID_COMMAND")
			return
		}
		a := records.LoginAttempt{State: authn.Random(), Binding: authn.Random(), Verifier: authn.Random(), Nonce: authn.Random()}
		if h.store.SaveLoginAttempt(r.Context(), a) != nil {
			authFailure(w, 503, "SERVICE_UNAVAILABLE")
			return
		}
		authCookie(w, authBindingCookie, a.Binding, 300)
		http.Redirect(w, r, h.provider.LoginURL(a.State, a.Nonce, a.Verifier), http.StatusFound)
		return
	case "/auth/callback":
		if r.Method != "GET" {
			authFailure(w, 400, "INVALID_COMMAND")
			return
		}
		q, err := url.ParseQuery(r.URL.RawQuery)
		if err != nil || len(q["state"]) != 1 || len(q["code"]) != 1 || len(q.Get("code")) > 8192 {
			authCallbackFailure(w, r, 400, "INVALID_COMMAND")
			return
		}
		a, err := h.store.ConsumeLoginAttempt(r.Context(), q.Get("state"), uniqueCookie(r, authBindingCookie))
		authCookie(w, authBindingCookie, "", -1)
		if err != nil {
			authCallbackFailure(w, r, 401, "UNAUTHENTICATED")
			return
		}
		id, err := h.provider.Verify(r.Context(), q.Get("code"), a.Verifier, a.Nonce)
		if err != nil {
			authCallbackFailure(w, r, 401, "UNAUTHENTICATED")
			return
		}
		var session records.Identity
		if h.sessions != nil {
			session, err = h.sessions.Login(r.Context(), id)
		} else {
			session, err = h.store.LoginExternal(r.Context(), id.Issuer, id.Subject, id.Name)
		}
		if err != nil {
			authCallbackFailure(w, r, 503, "SERVICE_UNAVAILABLE")
			return
		}
		age := 12 * 3600
		if h.sessions != nil {
			age = int(records.AbsoluteLifetime / time.Second)
		}
		authCookie(w, AuthCookieName, session.Token, age)
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	case "/auth/refresh":
		if r.Method != "POST" || h.sessions == nil {
			authFailure(w, 404, "NOT_FOUND")
			return
		}
		if err := h.sessions.Refresh(r.Context(), token); err != nil {
			if !errors.Is(err, records.ErrUnauthenticated) && !errors.Is(err, authn.ErrRefreshRejected) && !errors.Is(err, authn.ErrRefreshUncertain) {
				authFailure(w, 503, "SERVICE_UNAVAILABLE")
				return
			}
			authFailure(w, 401, "reauthentication_required")
			return
		}
		h.sessionStatus(w, r, token)
		return
	case "/auth/logout":
		if r.Method != "POST" {
			authFailure(w, 404, "NOT_FOUND")
			return
		}
		if h.sessions != nil {
			if _, err := h.sessions.Logout(r.Context(), token); err != nil {
				authFailure(w, 503, "SERVICE_UNAVAILABLE")
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		p, err := h.store.Authenticate(r.Context(), token)
		if err == nil {
			err = h.store.LogoutExternal(records.WithPrincipal(r.Context(), p))
		}
		if err != nil {
			authFailure(w, 401, "UNAUTHENTICATED")
			return
		}
		authCookie(w, AuthCookieName, "", -1)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	route, _, ok := matchLocalRoute(r)
	if r.URL.Path != "/api/realtime/connect" && (!ok || forbiddenAuthOperation(route.operation)) {
		authFailure(w, 404, "NOT_FOUND")
		return
	}
	if token == "" && route.operation != "demo-frame" {
		authFailure(w, 401, "UNAUTHENTICATED")
		return
	}
	if h.sessions != nil && route.operation != "demo-frame" {
		_, state, err := h.sessions.Status(r.Context(), token)
		if err != nil {
			authFailure(w, 503, "SERVICE_UNAVAILABLE")
			return
		}
		if state == "renewal-required" {
			authFailure(w, 401, "session_renewal_required")
			return
		}
		if state != "authenticated" {
			authFailure(w, 401, "UNAUTHENTICATED")
			return
		}
	}
	// Only the verified app cookie is adapted to the shared transport. Browser
	// fixture cookies are discarded and cannot establish identity here.
	copy := r.Clone(r.Context())
	copy.Header = r.Header.Clone()
	copy.Header.Del("Cookie")
	if token != "" {
		copy.AddCookie(&http.Cookie{Name: LocalCookieName, Value: token})
	}
	h.api.ServeHTTP(w, copy)
}
func (h *AuthHandler) sessionStatus(w http.ResponseWriter, r *http.Request, token string) {
	f, state, err := h.sessions.Status(r.Context(), token)
	if err != nil {
		authFailure(w, 503, "SERVICE_UNAVAILABLE")
		return
	}
	out := map[string]any{"mode": "keycloak", "state": state, "authenticated": state == "authenticated", "loginUrl": "/auth/login", "logoutUrl": "/auth/logout", "refreshUrl": "/auth/refresh", "accountUrl": h.issuer + "/account/"}
	if state == "authenticated" || state == "renewal-required" {
		out["csrfToken"] = csrfToken(token)
		out["session"] = map[string]any{"id": f.ID, "serverTime": f.ServerTime, "accessExpiresAt": f.AccessExpiresAt, "idleExpiresAt": f.IdleExpiresAt, "absoluteExpiresAt": f.AbsoluteExpiresAt}
	}
	if state == "authenticated" {
		name, e := h.store.AuthDisplayName(r.Context(), f.Principal)
		plan, e2 := h.store.AuthPlan(r.Context(), f.Principal)
		if e != nil || e2 != nil {
			authFailure(w, 503, "SERVICE_UNAVAILABLE")
			return
		}
		out["account"] = map[string]string{"id": f.Principal.OwnerID, "displayName": name, "plan": plan}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
func forbiddenAuthOperation(op string) bool {
	return op == "delete-account" || op == "platform-delete-account" || op == "local-session" || op == "logout" || op == "activate-trial" || op == "platform-review-trial" || strings.HasPrefix(op, "platform-billing") || strings.HasPrefix(op, "platform-family")
}
