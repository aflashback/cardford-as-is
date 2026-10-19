package http

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"cardford/server/internal/contracts"
	"github.com/coder/websocket"
)

// Realtime transports only server-projected messages. HTTP commands remain the
// sole browser mutation path, including playback pause/resume.
type RealtimeSubscription interface {
	Next(context.Context) (json.RawMessage, error)
	Authorize(context.Context) error
	Done() <-chan struct{}
	Close()
}

type RealtimeBackend interface {
	OpenRealtime(context.Context, string, string) (RealtimeSubscription, error)
}

const realtimeMaxMessageBytes = 2 << 20

// Opt-in local troubleshooting. Never log an error's text: transport errors may
// contain request or peer-controlled values.
func realtimeCloseDiagnostic() func(string, error) {
	enabled := os.Getenv("CARDFORD_REALTIME_DIAGNOSTICS") == "1"
	started := time.Now()
	var once sync.Once
	return func(stage string, err error) {
		if !enabled {
			return
		}
		once.Do(func() {
			class := "transport_error"
			switch {
			case err == nil:
				class = "rejected"
			case errors.Is(err, context.DeadlineExceeded):
				class = "deadline"
			case errors.Is(err, context.Canceled):
				class = "canceled"
			case websocket.CloseStatus(err) != -1:
				class = "peer_close"
			}
			log.Printf("cardford_realtime_close stage=%s class=%s age_ms=%d", stage, class, time.Since(started).Milliseconds())
		})
	}
}

func realtimeID(id string) bool {
	return len(id) > 0 && len(id) <= 256 && localResourceID(id)
}

func snapshotQuery(raw string) (json.RawMessage, error) {
	q, err := url.ParseQuery(raw)
	if err != nil {
		return nil, err
	}
	for key := range q {
		if key != "streamId" && key != "workId" {
			return nil, errors.New("unknown snapshot query")
		}
	}
	var stream any
	if ids, exists := q["streamId"]; exists {
		if len(ids) != 1 || !realtimeID(ids[0]) {
			return nil, errors.New("invalid stream identity")
		}
		stream = ids[0]
	}
	works := []string{}
	seen := map[string]bool{}
	for _, id := range q["workId"] {
		if !realtimeID(id) || seen[id] || len(works) == 4 {
			return nil, errors.New("invalid work identities")
		}
		seen[id] = true
		works = append(works, id)
	}
	body, err := json.Marshal(map[string]any{"streamId": stream, "workIds": works})
	if err == nil {
		err = contracts.Validate("RealtimeSnapshotRequest", body)
	}
	return body, err
}

func (h *LocalHandler) serveRealtime(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		localFailure(w, 404, "NOT_FOUND")
		return
	}
	// Browsers cannot set the normal tab/CSRF headers on a WebSocket upgrade.
	// The one-use negotiated identity binds the authenticated tab instead.
	if len(r.Header.Values("Origin")) != 1 || r.Header.Get("Origin") != h.options.Origin || r.Host != h.authority {
		localFailure(w, 403, "FORBIDDEN")
		return
	}
	q, err := url.ParseQuery(r.URL.RawQuery)
	ids := q["streamId"]
	if err != nil || len(q) != 1 || len(ids) != 1 || !realtimeID(ids[0]) || r.ContentLength != 0 || len(r.TransferEncoding) != 0 {
		localFailure(w, 400, "INVALID_COMMAND")
		return
	}
	var token string
	count := 0
	for _, cookie := range r.Cookies() {
		if cookie.Name == LocalCookieName {
			token, count = cookie.Value, count+1
		}
	}
	if count != 1 || !localToken.MatchString(token) {
		localFailure(w, 401, "UNAUTHENTICATED")
		return
	}
	backend, ok := h.backend.(RealtimeBackend)
	if !ok {
		localFailure(w, 503, "SERVICE_UNAVAILABLE")
		return
	}
	openCtx, cancelOpen := context.WithTimeout(r.Context(), h.options.RequestTimeout)
	sub, err := backend.OpenRealtime(openCtx, token, ids[0])
	cancelOpen()
	if err != nil {
		var failure *LocalError
		if errors.As(err, &failure) && failure.Status >= 400 && failure.Status <= 599 && localErrorCode(failure.Code) {
			if failure.Status == http.StatusTooManyRequests {
				w.Header().Set("Retry-After", "1")
			}
			localFailure(w, failure.Status, failure.Code)
		} else {
			localFailure(w, 503, "SERVICE_UNAVAILABLE")
		}
		return
	}
	defer sub.Close()
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()
	closed := realtimeCloseDiagnostic()
	conn.SetReadLimit(1024)
	// The stream lifetime is independent of the finite HTTP admission deadline.
	// A single Reader handles ping/pong/close and rejects client data without
	// consuming it. In coder/websocket v1.8.15, CloseRead calls Close from its own
	// goroutine and waits for that same goroutine; cancellation here avoids the
	// resulting 15-second cleanup delay on an unexpected application message.
	streamCtx, cancel := context.WithCancel(context.WithoutCancel(r.Context()))
	defer cancel()
	// Cancellation must interrupt an in-flight write or ping as well as Next.
	// This watcher exists only for the admitted active-play connection.
	subscriptionDone := make(chan struct{})
	go func() {
		defer close(subscriptionDone)
		select {
		case <-sub.Done():
			cancel()
		case <-streamCtx.Done():
		}
	}()
	defer func() { cancel(); <-subscriptionDone }()
	readerDone := make(chan struct{})
	go func() {
		defer close(readerDone)
		defer cancel()
		_, _, err := conn.Reader(streamCtx)
		closed("read", err)
	}()
	defer func() { cancel(); <-readerDone }()
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-streamCtx.Done():
				return
			case <-ticker.C:
				pingCtx, done := context.WithTimeout(streamCtx, 5*time.Second)
				err := sub.Authorize(pingCtx)
				stage := "heartbeat_authorize"
				if err == nil {
					stage = "heartbeat_ping"
					err = conn.Ping(pingCtx)
				}
				done()
				if err != nil {
					closed(stage, err)
					cancel()
					return
				}
			}
		}
	}()
	defer func() { cancel(); <-heartbeatDone }()
	for {
		message, err := sub.Next(streamCtx)
		if err != nil {
			closed("next", err)
			return
		}
		if len(message) > realtimeMaxMessageBytes || contracts.Validate("RealtimeMessage", message) != nil {
			closed("invalid_payload", nil)
			return
		}
		writeCtx, done := context.WithTimeout(streamCtx, 5*time.Second)
		err = sub.Authorize(writeCtx)
		stage := "write_authorize"
		if err == nil {
			stage = "write"
			err = conn.Write(writeCtx, websocket.MessageText, message)
		}
		done()
		if err != nil {
			closed(stage, err)
			return
		}
	}
}
