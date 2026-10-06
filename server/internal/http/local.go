package http

import (
	"cardford/server/internal/contracts"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Request contains transport credentials, never a browser-supplied owner/actor.
// CommandID is the resource ID for work/decision paths; mutation identity stays
// in its validated Body. Only the backend may resolve credentials to an owner.
type Request struct {
	Token, Tab, Operation string
	Body                  json.RawMessage
	CommandID             string
}
type Response struct {
	Status     int
	Body       json.RawMessage
	SetToken   string
	ClearToken bool
}
type LocalBackend interface {
	Call(context.Context, Request) (Response, error)
}
type LocalError struct {
	Status        int
	Code, Message string
}

func (e *LocalError) Error() string { return e.Code }

type LocalOptions struct {
	Origin         string
	RequestTimeout time.Duration
	MaxInFlight    int
	BodyLimit      int64
}
type LocalHandler struct {
	backend   LocalBackend
	options   LocalOptions
	authority string
	slots     chan struct{}
}

const LocalCookieName = "cf_local_session"
const localMaxResponseBytes = 16 << 20

var localTab = regexp.MustCompile(`^[a-zA-Z0-9_-]{8,80}$`)
var localToken = regexp.MustCompile(`^[a-zA-Z0-9_-]{32,256}$`)

func NewLocal(backend LocalBackend, options LocalOptions) (*LocalHandler, error) {
	if backend == nil {
		return nil, fmt.Errorf("missing local backend")
	}
	u, err := url.Parse(options.Origin)
	if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || u.RawPath != "" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1") || u.Host == "" || options.Origin != "http://"+u.Host {
		return nil, fmt.Errorf("local service requires an exact loopback HTTP origin")
	}
	if options.RequestTimeout == 0 {
		options.RequestTimeout = 5 * time.Second
	}
	if options.MaxInFlight == 0 {
		options.MaxInFlight = 16
	}
	if options.BodyLimit == 0 {
		options.BodyLimit = 32 << 10
	}
	if options.RequestTimeout < time.Millisecond || options.RequestTimeout > 5*time.Second || options.MaxInFlight < 1 || options.MaxInFlight > 16 || options.BodyLimit < 2 || options.BodyLimit > 32<<10 {
		return nil, fmt.Errorf("invalid finite local HTTP limits")
	}
	return &LocalHandler{backend: backend, options: options, authority: u.Host, slots: make(chan struct{}, options.MaxInFlight)}, nil
}

// NewLocalServer applies finite socket limits independently of request/CPU work.
// The caller must bind only a loopback address and shut down workers separately.
func NewLocalServer(address string, h *LocalHandler) (*http.Server, error) {
	host, _, err := net.SplitHostPort(address)
	if err != nil || (host != "127.0.0.1" && host != "::1" && host != "localhost") || h == nil {
		return nil, fmt.Errorf("local listener must bind loopback")
	}
	return &http.Server{Addr: address, Handler: h, ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}, nil
}

type localRoute struct {
	method, path, operation, input, output string
	public                                 bool
}

var localRoutes = []localRoute{
	{"GET", "/api/health", "health", "", "LocalServiceHealthView", true},
	{"POST", "/api/demo/frame", "demo-frame", "DemoFrameRequest", "DemoFrame", true},
	{"POST", "/api/local/session", "local-session", "LocalServiceEmptyRequest", "IdentityView", true},
	{"GET", "/api/identity", "identity", "", "IdentityView", false},
	{"GET", "/api/access/offers", "access-offers", "", "AccessOfferPolicy", false},
	{"POST", "/api/access/resolve", "access-resolve", "LocalServiceAccessRequest", "AccessDecision", false},
	{"POST", "/api/access/trials", "activate-trial", "LocalServiceTrialRequest", "LocalServiceTrialReceipt", false},
	{"POST", "/api/access/unlocks", "unlock-coaching", "LocalServiceUnlockRequest", "LocalServiceUnlockReceipt", false},
	{"GET", "/api/session", "session", "", "LocalServiceSessionView", false},
	{"POST", "/api/sessions", "new-session", "LocalServiceNewSessionRequest", "LocalServiceCommandReceipt", false},
	{"POST", "/api/session/control", "control", "LocalServiceControlRequest", "LocalControlView", false},
	{"POST", "/api/session/actions", "action", "LocalServiceActionRequest", "LocalServiceCommandReceipt", false},
	{"POST", "/api/session/prepare", "prepare", "LocalServicePrepareRequest", "LocalServicePrepareView", false},
	{"POST", "/api/session/advance", "advance", "LocalServiceAdvanceRequest", "LocalServiceCommandReceipt", false},
	{"POST", "/api/session/next-hand", "next-hand", "LocalServiceNextHandRequest", "LocalServiceCommandReceipt", false},
	{"POST", "/api/commands/reconcile", "reconcile", "LocalServiceReconcileRequest", "LocalServiceRecoveredReceipt", false},
	{"POST", "/api/logout", "logout", "LocalServiceEmptyRequest", "AcceptedView", false},
	{"POST", "/api/account/delete", "delete-account", "LocalServiceEmptyRequest", "AccountDeleteView", false},
}

func matchLocalRoute(r *http.Request) (localRoute, string, bool) {
	for _, route := range localRoutes {
		if route.method == r.Method && route.path == r.URL.Path {
			return route, "", true
		}
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "api" || parts[2] == "" || len(parts[2]) > 256 || !localResourceID(parts[2]) {
		return localRoute{}, "", false
	}
	if len(parts) == 3 && r.Method == "GET" {
		switch parts[1] {
		case "sessions":
			return localRoute{operation: "saved-session", output: "LocalServiceSessionView"}, parts[2], true
		case "work":
			return localRoute{operation: "work", output: "LocalServicePrepareView"}, parts[2], true
		case "decisions":
			return localRoute{operation: "decision", output: "LocalServiceDecisionView"}, parts[2], true
		}
	}
	if len(parts) == 4 && r.Method == "POST" && parts[1] == "work" && parts[3] == "retry" {
		return localRoute{operation: "work-retry", input: "LocalServiceWorkRetryRequest", output: "LocalServicePrepareView"}, parts[2], true
	}
	return localRoute{}, "", false
}
func localResourceID(id string) bool {
	for _, c := range id {
		if c <= 32 || c == 127 || c == '/' || c == '\\' {
			return false
		}
	}
	return true
}

func (h *LocalHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
	if r.Host != h.authority || len(r.Header.Values("Origin")) > 1 || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != h.options.Origin) {
		localFailure(w, 403, "FORBIDDEN")
		return
	}
	if r.URL.RawQuery != "" || r.URL.ForceQuery {
		localFailure(w, 400, "INVALID_COMMAND")
		return
	}
	route, id, ok := matchLocalRoute(r)
	if !ok {
		localFailure(w, 404, "NOT_FOUND")
		return
	}
	if r.Method == "POST" {
		if len(r.Header.Values("X-Tricks-Client")) != 1 || r.Header.Get("X-Tricks-Client") != "1" {
			localFailure(w, 403, "FORBIDDEN")
			return
		}
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			localFailure(w, 400, "INVALID_COMMAND")
			return
		}
	} else if r.ContentLength != 0 {
		localFailure(w, 400, "INVALID_COMMAND")
		return
	}
	request := Request{Operation: route.operation, CommandID: id}
	if route.operation != "health" && route.operation != "demo-frame" {
		if len(r.Header.Values("X-Tricks-Tab")) != 1 || !localTab.MatchString(r.Header.Get("X-Tricks-Tab")) {
			localFailure(w, 400, "INVALID_COMMAND")
			return
		}
		request.Tab = r.Header.Get("X-Tricks-Tab")
	}
	count := 0
	for _, cookie := range r.Cookies() {
		// Authored public content is independent of expired or malformed sessions.
		if route.operation == "demo-frame" {
			break
		}
		if cookie.Name == LocalCookieName {
			request.Token = cookie.Value
			count++
		}
	}
	if count > 1 || (request.Token != "" && !localToken.MatchString(request.Token)) {
		localFailure(w, 401, "UNAUTHENTICATED")
		return
	}
	if !route.public && request.Token == "" {
		localFailure(w, 401, "UNAUTHENTICATED")
		return
	}
	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		w.Header().Set("Retry-After", "1")
		localFailure(w, 429, "SERVICE_UNAVAILABLE")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.options.RequestTimeout)
	defer cancel()
	stop := context.AfterFunc(ctx, func() {
		if r.Body != nil {
			_ = r.Body.Close()
		}
	})
	defer stop()
	deadline, _ := ctx.Deadline()
	_ = http.NewResponseController(w).SetReadDeadline(deadline)
	if route.input != "" {
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, h.options.BodyLimit))
		if ctx.Err() != nil {
			localFailure(w, 408, "SERVICE_UNAVAILABLE")
			return
		}
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				localFailure(w, 413, "INVALID_COMMAND")
			} else {
				localFailure(w, 400, "INVALID_COMMAND")
			}
			return
		}
		if contracts.Validate(route.input, raw) != nil {
			localFailure(w, 400, "INVALID_COMMAND")
			return
		}
		request.Body = raw
	}
	if ctx.Err() != nil {
		localFailure(w, 503, "SERVICE_UNAVAILABLE")
		return
	}
	response, err := h.backend.Call(ctx, request)
	if err != nil {
		var failure *LocalError
		if errors.As(err, &failure) && failure.Status >= 400 && failure.Status <= 599 && localErrorCode(failure.Code) {
			localFailure(w, failure.Status, failure.Code)
		} else {
			localFailure(w, 503, "SERVICE_UNAVAILABLE")
		}
		return
	}
	// A timeout cannot undo a published mutation. Its original receipt remains
	// recoverable by the same authenticated command and exact request digest.
	if ctx.Err() != nil {
		localFailure(w, 503, "SERVICE_UNAVAILABLE")
		return
	}
	if response.Status == 0 {
		response.Status = 200
	}
	if (response.Status != 200 && response.Status != 201 && response.Status != 202) || len(response.Body) > localMaxResponseBytes || contracts.Validate(route.output, response.Body) != nil || (response.SetToken != "" && !localToken.MatchString(response.SetToken)) || (response.SetToken != "" && response.ClearToken) {
		localFailure(w, 503, "SERVICE_UNAVAILABLE")
		return
	}
	if response.SetToken != "" {
		http.SetCookie(w, &http.Cookie{Name: LocalCookieName, Value: response.SetToken, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 30 * 86400})
	}
	if response.ClearToken {
		http.SetCookie(w, &http.Cookie{Name: LocalCookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
	}
	w.WriteHeader(response.Status)
	_, _ = w.Write(response.Body)
}
func localErrorCode(code string) bool {
	switch code {
	case "UNAUTHENTICATED", "FORBIDDEN", "STALE_REVISION", "LEASE_LOST", "QUOTA_EXHAUSTED", "INVALID_COMMAND", "IDEMPOTENCY_CONFLICT", "NOT_FOUND", "PAYMENT_PENDING", "SERVICE_UNAVAILABLE":
		return true
	}
	return false
}
func localFailure(w http.ResponseWriter, status int, code string) {
	if code == "UNAUTHENTICATED" {
		http.SetCookie(w, &http.Cookie{Name: LocalCookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
	}
	message := "The request was not completed. Reconcile the original command before retrying a mutation."
	switch code {
	case "UNAUTHENTICATED":
		message = "Start a local fixture session to continue."
	case "FORBIDDEN":
		message = "This request is not allowed."
	case "INVALID_COMMAND":
		message = "Request does not match the public contract."
	case "NOT_FOUND":
		message = "The requested resource is unavailable."
	case "LEASE_LOST":
		message = "Another tab controls this table. Refresh or take control."
	case "STALE_REVISION":
		message = "The table changed. Refresh the confirmed position."
	case "IDEMPOTENCY_CONFLICT":
		message = "This request ID was already used for different input."
	}
	raw, _ := json.Marshal(map[string]string{"code": code, "message": message})
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}
