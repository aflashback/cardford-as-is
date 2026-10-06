package http

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type localBackendFunc func(context.Context, Request) (Response, error)

func (f localBackendFunc) Call(ctx context.Context, r Request) (Response, error) { return f(ctx, r) }
func localRequest(method, path, body string) *http.Request {
	r := httptest.NewRequest(method, "http://127.0.0.1:4190"+path, strings.NewReader(body))
	r.Header.Set("Origin", "http://127.0.0.1:4190")
	r.Header.Set("X-Tricks-Client", "1")
	r.Header.Set("X-Tricks-Tab", "test-tab-1234")
	r.Header.Set("Content-Type", "application/json")
	r.AddCookie(&http.Cookie{Name: "cf_local_session", Value: strings.Repeat("a", 43)})
	return r
}
func localHandler(t *testing.T, f localBackendFunc, options LocalOptions) *LocalHandler {
	t.Helper()
	if options.Origin == "" {
		options.Origin = "http://127.0.0.1:4190"
	}
	h, err := NewLocal(f, options)
	if err != nil {
		t.Fatal(err)
	}
	return h
}
func TestLocalTransportAuthOriginAndStrictInput(t *testing.T) {
	var called atomic.Int32
	h := localHandler(t, func(_ context.Context, r Request) (Response, error) {
		called.Add(1)
		return Response{Body: json.RawMessage(`{"playerId":"owner"}`)}, nil
	}, LocalOptions{})
	for _, test := range []struct {
		name   string
		change func(*http.Request)
		status int
	}{
		{"missing auth", func(r *http.Request) { r.Header.Del("Cookie") }, 401},
		{"foreign origin", func(r *http.Request) { r.Header.Set("Origin", "http://evil.example") }, 403},
		{"null origin", func(r *http.Request) { r.Header.Set("Origin", "null") }, 403},
		{"foreign host", func(r *http.Request) { r.Host = "evil.example" }, 403},
		{"invalid tab", func(r *http.Request) { r.Header.Set("X-Tricks-Tab", "x") }, 400},
		{"query", func(r *http.Request) { r.URL.RawQuery = "owner=foreign" }, 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := localRequest("GET", "/api/identity", "")
			test.change(r)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != test.status {
				t.Fatalf("status %d body %s", w.Code, w.Body.String())
			}
		})
	}
	if called.Load() != 0 {
		t.Fatal("invalid input reached backend")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("GET", "/api/identity", ""))
	if w.Code != 200 || called.Load() != 1 {
		t.Fatalf("valid request rejected: %d %s", w.Code, w.Body.String())
	}
}
func TestLocalTransportMutationValidationAndCookie(t *testing.T) {
	var called atomic.Int32
	h := localHandler(t, func(_ context.Context, r Request) (Response, error) {
		called.Add(1)
		if r.Operation != "local-session" {
			t.Fatalf("wrong operation %s", r.Operation)
		}
		return Response{Body: json.RawMessage(`{"playerId":"owner"}`), SetToken: strings.Repeat("b", 43)}, nil
	}, LocalOptions{})
	for _, body := range []string{`{"ownerId":"forged"}`, `{"a":1,"a":2}`, `{} {}`, strings.Repeat(" ", 32769)} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, localRequest("POST", "/api/local/session", body))
		if w.Code != 400 && w.Code != 413 {
			t.Fatalf("bad body accepted: %d", w.Code)
		}
	}
	r := localRequest("POST", "/api/local/session", `{}`)
	r.Header.Del("X-Tricks-Client")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("missing CSRF marker: %d", w.Code)
	}
	if called.Load() != 0 {
		t.Fatal("bad mutation reached backend")
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("POST", "/api/local/session", `{}`))
	if w.Code != 200 {
		t.Fatalf("bootstrap %d %s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || cookies[0].Path != "/" || cookies[0].MaxAge != 30*86400 {
		t.Fatalf("unsafe cookie %+v", cookies)
	}
}
func TestLocalTransportOutputAndErrorAllowlist(t *testing.T) {
	for _, response := range []Response{{Body: json.RawMessage(`{"playerId":"owner","privateState":{}}`)}, {Status: 302, Body: json.RawMessage(`{"playerId":"owner"}`)}} {
		h := localHandler(t, func(context.Context, Request) (Response, error) { return response, nil }, LocalOptions{})
		w := httptest.NewRecorder()
		h.ServeHTTP(w, localRequest("GET", "/api/identity", ""))
		if w.Code != 503 || strings.Contains(w.Body.String(), "privateState") {
			t.Fatalf("unsafe response %d %s", w.Code, w.Body.String())
		}
	}
	h := localHandler(t, func(context.Context, Request) (Response, error) {
		return Response{}, &LocalError{Status: 409, Code: "LEASE_LOST"}
	}, LocalOptions{})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("GET", "/api/identity", ""))
	if w.Code != 409 || !strings.Contains(w.Body.String(), "LEASE_LOST") {
		t.Fatalf("typed failure %d %s", w.Code, w.Body.String())
	}
}

func TestLocalTransportExpiredOrDeletedCookieCanRestart(t *testing.T) {
	// This models a cookie left behind after expiry or a lost deletion response.
	// A denial must clear it; the next explicit local-session request can then
	// create a fresh identity instead of repeatedly authenticating the dead one.
	h := localHandler(t, func(_ context.Context, r Request) (Response, error) {
		if r.Token != "" {
			return Response{}, &LocalError{Status: 401, Code: "UNAUTHENTICATED"}
		}
		return Response{Body: json.RawMessage(`{"playerId":"fresh-owner"}`), SetToken: strings.Repeat("c", 43)}, nil
	}, LocalOptions{})
	for _, token := range []string{strings.Repeat("a", 43), "invalid"} {
		r := localRequest("POST", "/api/local/session", `{}`)
		r.Header.Set("Cookie", LocalCookieName+"="+token)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		cookies := w.Result().Cookies()
		if w.Code != 401 || len(cookies) != 1 || cookies[0].Name != LocalCookieName || cookies[0].MaxAge != -1 {
			t.Fatalf("dead cookie was not cleared: %d %+v", w.Code, cookies)
		}
	}
	r := localRequest("POST", "/api/local/session", `{}`)
	r.Header.Del("Cookie")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || len(w.Result().Cookies()) != 1 || w.Result().Cookies()[0].MaxAge <= 0 {
		t.Fatalf("fresh explicit entry failed: %d %s", w.Code, w.Body.String())
	}
}
func TestLocalTransportAdmissionAndCancellation(t *testing.T) {
	entered := make(chan struct{})
	h := localHandler(t, func(ctx context.Context, r Request) (Response, error) {
		close(entered)
		<-ctx.Done()
		return Response{}, ctx.Err()
	}, LocalOptions{MaxInFlight: 1, RequestTimeout: 50 * time.Millisecond})
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, localRequest("GET", "/api/identity", ""))
		done <- w
	}()
	<-entered
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("GET", "/api/identity", ""))
	if w.Code != 429 {
		t.Fatalf("saturation %d", w.Code)
	}
	select {
	case w = <-done:
		if w.Code != 503 {
			t.Fatalf("timeout %d", w.Code)
		}
	case <-time.After(time.Second):
		t.Fatal("deadline did not cancel backend")
	}
}
func TestLocalTransportStalledBodySettles(t *testing.T) {
	var calls atomic.Int32
	h := localHandler(t, func(context.Context, Request) (Response, error) { calls.Add(1); return Response{}, nil }, LocalOptions{RequestTimeout: 30 * time.Millisecond})
	reader, writer := io.Pipe()
	defer writer.Close()
	r := localRequest("POST", "/api/local/session", "")
	r.Body = reader
	r.ContentLength = -1
	done := make(chan struct{})
	w := httptest.NewRecorder()
	go func() { h.ServeHTTP(w, r); close(done) }()
	select {
	case <-done:
		if calls.Load() != 0 || w.Code != 408 {
			t.Fatalf("stalled body %d calls %d", w.Code, calls.Load())
		}
	case <-time.After(time.Second):
		t.Fatal("stalled request did not settle")
	}
}

func TestLocalListenerBoundsSlowHeadersAndServesHealth(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	origin := "http://" + listener.Addr().String()
	h := localHandler(t, func(ctx context.Context, r Request) (Response, error) {
		if r.Operation != "health" {
			t.Errorf("unexpected operation %s", r.Operation)
		}
		return Response{Body: json.RawMessage(`{"status":"ready","mode":"local","identity":"local-test","provider":"off","payments":"fixture"}`)}, nil
	}, LocalOptions{Origin: origin})
	s, err := NewLocalServer(listener.Addr().String(), h)
	if err != nil {
		t.Fatal(err)
	}
	// Exercise the real net/http header deadline with a shorter test duration.
	s.ReadHeaderTimeout = 30 * time.Millisecond
	done := make(chan error, 1)
	go func() { done <- s.Serve(listener) }()
	defer func() { _ = s.Close(); <-done }()
	conn, err := net.Dial("tcp", listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(time.Second))
	_, err = io.WriteString(conn, "GET /api/health HTTP/1.1\r\nHost: ")
	if err != nil {
		t.Fatal(err)
	}
	_, err = bufio.NewReader(conn).ReadByte()
	if err == nil {
		t.Fatal("incomplete headers should close or reject")
	}
	client := &http.Client{Timeout: time.Second}
	r, err := client.Get(origin + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 200 || r.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("health after stalled peer: %d", r.StatusCode)
	}
}
