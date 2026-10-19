package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestRealtimeCloseDiagnosticIsOptInAndPrivate(t *testing.T) {
	var output bytes.Buffer
	prior := log.Writer()
	log.SetOutput(&output)
	t.Cleanup(func() { log.SetOutput(prior) })
	t.Setenv("CARDFORD_REALTIME_DIAGNOSTICS", "")
	realtimeCloseDiagnostic()("read", errors.New("private-token-and-payload"))
	if output.Len() != 0 {
		t.Fatal("diagnostic emitted without explicit opt-in")
	}
	t.Setenv("CARDFORD_REALTIME_DIAGNOSTICS", "1")
	closed := realtimeCloseDiagnostic()
	closed("heartbeat_ping", context.DeadlineExceeded)
	closed("read", errors.New("private-token-and-payload"))
	if strings.Count(output.String(), "cardford_realtime_close") != 1 || !strings.Contains(output.String(), "stage=heartbeat_ping class=deadline age_ms=") || strings.Contains(output.String(), "private-token-and-payload") {
		t.Fatalf("unexpected diagnostic: %s", output.String())
	}
}

type realtimeTestBackend struct {
	opens    atomic.Int32
	commands atomic.Int32
	sub      *realtimeTestSubscription
}

func (b *realtimeTestBackend) Call(context.Context, Request) (Response, error) {
	b.commands.Add(1)
	return Response{}, errors.New("unexpected command")
}

func (b *realtimeTestBackend) OpenRealtime(_ context.Context, token, stream string) (RealtimeSubscription, error) {
	b.opens.Add(1)
	if token != strings.Repeat("a", 43) || stream != "test-stream" {
		return nil, &LocalError{Status: 403, Code: "FORBIDDEN"}
	}
	return b.sub, nil
}

type realtimeTestSubscription struct {
	messages chan json.RawMessage
	revoked  atomic.Bool
	closed   chan struct{}
	once     sync.Once
}

func (s *realtimeTestSubscription) Next(ctx context.Context) (json.RawMessage, error) {
	select {
	case message := <-s.messages:
		return message, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *realtimeTestSubscription) Authorize(context.Context) error {
	if s.revoked.Load() {
		return errors.New("revoked")
	}
	return nil
}

func (s *realtimeTestSubscription) Close()                { s.once.Do(func() { close(s.closed) }) }
func (s *realtimeTestSubscription) Done() <-chan struct{} { return s.closed }

func realtimeBackend() *realtimeTestBackend {
	return &realtimeTestBackend{sub: &realtimeTestSubscription{messages: make(chan json.RawMessage, 4), closed: make(chan struct{})}}
}

func TestRealtimeTransportUpgradeRejectsInvalidAuthorityAndQuery(t *testing.T) {
	backend := realtimeBackend()
	handler, err := NewLocal(backend, LocalOptions{Origin: "http://127.0.0.1:4190"})
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name   string
		modify func(*http.Request)
		status int
	}{
		{"missing origin", func(r *http.Request) { r.Header.Del("Origin") }, 403},
		{"wrong origin", func(r *http.Request) { r.Header.Set("Origin", "http://localhost:4190") }, 403},
		{"duplicate origin", func(r *http.Request) { r.Header.Add("Origin", r.Header.Get("Origin")) }, 403},
		{"wrong host", func(r *http.Request) { r.Host = "evil.example" }, 403},
		{"no cookie", func(r *http.Request) { r.Header.Del("Cookie") }, 401},
		{"duplicate cookie", func(r *http.Request) {
			r.AddCookie(&http.Cookie{Name: LocalCookieName, Value: strings.Repeat("a", 43)})
		}, 401},
		{"empty stream", func(r *http.Request) { r.URL.RawQuery = "streamId=" }, 400},
		{"duplicate stream", func(r *http.Request) { r.URL.RawQuery += "&streamId=another" }, 400},
		{"extra owner", func(r *http.Request) { r.URL.RawQuery += "&owner=another" }, 400},
		{"escaped slash", func(r *http.Request) { r.URL.RawQuery = "streamId=a%2Fb" }, 400},
		{"bad encoding", func(r *http.Request) { r.URL.RawQuery = "streamId=%XX" }, 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := localRequest("GET", "/api/realtime/connect?streamId=test-stream", "")
			test.modify(r)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != test.status {
				t.Fatalf("status %d want %d: %s", w.Code, test.status, w.Body.String())
			}
		})
	}
	if backend.opens.Load() != 0 || backend.commands.Load() != 0 {
		t.Fatal("invalid upgrade reached application")
	}
}

func realtimeConnection(t *testing.T, backend *realtimeTestBackend) *websocket.Conn {
	t.Helper()
	server := httptest.NewUnstartedServer(nil)
	origin := "http://" + server.Listener.Addr().String()
	handler, err := NewLocal(backend, LocalOptions{Origin: origin})
	if err != nil {
		t.Fatal(err)
	}
	server.Config.Handler = handler
	server.Start()
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, response, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(origin, "http")+"/api/realtime/connect?streamId=test-stream", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{origin}, "Cookie": []string{LocalCookieName + "=" + strings.Repeat("a", 43)}}})
	if err != nil {
		t.Fatalf("upgrade: %v response %v", err, response)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	return conn
}

var realtimeTestMessage = json.RawMessage(`{"schemaVersion":"1.0.0","messageId":"message-one","streamId":"test-stream","sequence":1,"type":"control.changed","controlGeneration":2}`)

func TestRealtimeTransportReceiveOnlyAndRechecksBeforeWrite(t *testing.T) {
	for _, mode := range []string{"client-command", "revoked", "invalid-projection"} {
		t.Run(mode, func(t *testing.T) {
			backend := realtimeBackend()
			conn := realtimeConnection(t, backend)
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			backend.sub.messages <- realtimeTestMessage
			kind, message, err := conn.Read(ctx)
			if err != nil || kind != websocket.MessageText || string(message) != string(realtimeTestMessage) {
				t.Fatalf("server message not delivered: %s %v", message, err)
			}
			switch mode {
			case "client-command":
				if err = conn.Write(ctx, websocket.MessageText, []byte(`{"operation":"advance"}`)); err != nil {
					t.Fatal(err)
				}
			case "revoked":
				backend.sub.revoked.Store(true)
				backend.sub.messages <- realtimeTestMessage
			case "invalid-projection":
				backend.sub.messages <- json.RawMessage(`{"hiddenHand":["AS"]}`)
			}
			_, message, err = conn.Read(ctx)
			if err == nil {
				t.Fatalf("forbidden message delivered: %s", message)
			}
			select {
			case <-backend.sub.closed:
			case <-ctx.Done():
				t.Fatal("subscription was not released")
			}
			if backend.commands.Load() != 0 || backend.opens.Load() != 1 {
				t.Fatal("socket unexpectedly invoked command handler")
			}
		})
	}
}

func TestRealtimeTransportSnapshotQueryIsBoundedAndAllowlisted(t *testing.T) {
	for _, query := range []string{"owner=another", "streamId=", "streamId=a&streamId=b", "workId=a&workId=a", "workId=a&workId=b&workId=c&workId=d&workId=e", "workId=a%2Fb", "streamId=%XX"} {
		if _, err := snapshotQuery(query); err == nil {
			t.Errorf("invalid query accepted: %s", query)
		}
	}
	for _, query := range []string{"", "streamId=test-stream&workId=one&workId=two"} {
		raw, err := snapshotQuery(query)
		if err != nil {
			t.Fatalf("valid query %q: %v", query, err)
		}
		var parsed struct {
			StreamID *string  `json:"streamId"`
			WorkIDs  []string `json:"workIds"`
		}
		if err := json.Unmarshal(raw, &parsed); err != nil || parsed.WorkIDs == nil {
			t.Fatalf("snapshot query lost normalized body: %s %v", raw, err)
		}
	}
}

func TestAuthRealtimeTransportCancelsQuietSocketWithSubscription(t *testing.T) {
	backend := realtimeBackend()
	conn := realtimeConnection(t, backend)
	backend.sub.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 700*time.Millisecond)
	defer cancel()
	if _, _, err := conn.Read(ctx); err == nil {
		t.Fatal("revoked subscription left socket readable")
	}
	if ctx.Err() != nil {
		t.Fatal("quiet socket waited for heartbeat instead of subscription cancellation")
	}
}
