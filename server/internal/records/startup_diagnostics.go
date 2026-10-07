package records

import (
	"context"
	"errors"
	"net"
	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StartupDiagnostics is an opt-in, bounded capture for one OpenStore call.
// It never retains addresses, connection configuration, SQL, arguments or error
// text. Its zero value is ready to use. Recording stops when OpenStore returns.
type StartupDiagnostics struct {
	mu     sync.Mutex
	spans  []StartupSpan
	closed bool
}

type StartupSpan struct {
	Stage            string  `json:"stage"`
	StartedAt        string  `json:"startedAt"`
	ElapsedMS        float64 `json:"elapsedMs"`
	StartRemainingMS int64   `json:"startRemainingMs"`
	EndRemainingMS   int64   `json:"endRemainingMs"`
	ContextClass     string  `json:"contextClass"`
	Class            string  `json:"class"`
	OSCode           uint64  `json:"osCode,omitempty"`
	SQLState         string  `json:"sqlState,omitempty"`
}

func (d *StartupDiagnostics) Snapshot() []StartupSpan {
	d.mu.Lock()
	defer d.mu.Unlock()
	return append([]StartupSpan(nil), d.spans...)
}

func (d *StartupDiagnostics) stop() {
	if d == nil {
		return
	}
	d.mu.Lock()
	d.closed = true
	d.mu.Unlock()
}

type startupSpanKey string
type startupSpanStart struct {
	at        time.Time
	remaining int64
}

func remainingStartupMS(ctx context.Context) int64 {
	if deadline, ok := ctx.Deadline(); ok {
		return time.Until(deadline).Milliseconds()
	}
	return -1
}

func (d *StartupDiagnostics) start(ctx context.Context, stage string) context.Context {
	return context.WithValue(ctx, startupSpanKey(stage), startupSpanStart{time.Now(), remainingStartupMS(ctx)})
}

func startupErrorClass(err error) (string, uint64, string) {
	if err == nil {
		return "ok", 0, ""
	}
	var code syscall.Errno
	var network net.Error
	var sql *pgconn.PgError
	_ = errors.As(err, &code)
	switch {
	case errors.Is(err, context.Canceled):
		return "canceled", uint64(code), ""
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline", uint64(code), ""
	case runtime.GOOS == "windows" && code == 10060:
		// Winsock WSAETIMEDOUT is not Go's synthetic syscall.ETIMEDOUT.
		return "winsock-timeout", uint64(code), ""
	case runtime.GOOS == "windows" && code == 10061:
		return "winsock-refused", uint64(code), ""
	case errors.As(err, &network) && network.Timeout():
		return "network-timeout", uint64(code), ""
	case errors.As(err, &sql):
		state := sql.Code
		if len(state) != 5 {
			state = ""
		}
		for _, r := range state {
			if !(r >= '0' && r <= '9' || r >= 'A' && r <= 'Z') {
				state = ""
				break
			}
		}
		return "sql-error", uint64(code), state
	default:
		return "failure", uint64(code), ""
	}
}

func (d *StartupDiagnostics) end(ctx context.Context, stage string, err error) {
	start, ok := ctx.Value(startupSpanKey(stage)).(startupSpanStart)
	if !ok {
		return
	}
	class, code, state := startupErrorClass(err)
	contextClass, _, _ := startupErrorClass(ctx.Err())
	span := StartupSpan{stage, start.at.UTC().Format(time.RFC3339Nano), float64(time.Since(start.at)) / float64(time.Millisecond), start.remaining, remainingStartupMS(ctx), contextClass, class, code, state}
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.closed && len(d.spans) < 32 {
		d.spans = append(d.spans, span)
	}
}

func (d *StartupDiagnostics) configure(cfg *pgxpool.Config) {
	if d == nil {
		return
	}
	dial := cfg.ConnConfig.DialFunc
	cfg.ConnConfig.DialFunc = func(ctx context.Context, network, address string) (net.Conn, error) {
		ctx = d.start(ctx, "startup.dial")
		conn, err := dial(ctx, network, address)
		d.end(ctx, "startup.dial", err)
		return conn, err
	}
	cfg.ConnConfig.Tracer = d
}

func (d *StartupDiagnostics) TraceConnectStart(ctx context.Context, _ pgx.TraceConnectStartData) context.Context {
	return d.start(ctx, "startup.connect")
}
func (d *StartupDiagnostics) TraceConnectEnd(ctx context.Context, data pgx.TraceConnectEndData) {
	d.end(ctx, "startup.connect", data.Err)
}
func (d *StartupDiagnostics) TraceAcquireStart(ctx context.Context, _ *pgxpool.Pool, _ pgxpool.TraceAcquireStartData) context.Context {
	return d.start(ctx, "startup.acquire")
}
func (d *StartupDiagnostics) TraceAcquireEnd(ctx context.Context, _ *pgxpool.Pool, data pgxpool.TraceAcquireEndData) {
	d.end(ctx, "startup.acquire", data.Err)
}
func (d *StartupDiagnostics) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	return d.start(ctx, "startup.query")
}
func (d *StartupDiagnostics) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	d.end(ctx, "startup.query", data.Err)
}
