package records

import (
	"context"
	"errors"
	"net"
	"os"
	"syscall"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func winsockDialFailure(code syscall.Errno) error {
	return &net.OpError{Op: "dial", Net: "tcp", Err: os.NewSyscallError("connectex", code)}
}

func TestLocalStartupDialRetryBoundedAndTraced(t *testing.T) {
	cfg, _ := pgxpool.ParseConfig("postgres://127.0.0.1/test?sslmode=disable")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	deadline, _ := ctx.Deadline()
	client, peer := net.Pipe()
	defer peer.Close()
	defer client.Close()
	count := 0
	cfg.ConnConfig.DialFunc = func(call context.Context, network, address string) (net.Conn, error) {
		count++
		got, _ := call.Deadline()
		if got != deadline || network != "tcp" || address != "127.0.0.1:54331" {
			t.Fatal("retry changed original deadline or target")
		}
		if count == 1 {
			return nil, winsockDialFailure(10060)
		}
		return client, nil
	}
	diagnostics := &StartupDiagnostics{}
	diagnostics.configure(cfg)
	stop := configureLocalStartupRetry(cfg, ctx, true)
	got, err := cfg.ConnConfig.DialFunc(context.Background(), "tcp", "127.0.0.1:54331")
	if err != nil || got != client || count != 2 {
		t.Fatal("expected one replacement socket")
	}
	spans := diagnostics.Snapshot()
	if len(spans) != 2 || spans[0].OSCode != 10060 || spans[1].Class != "ok" || spans[1].StartRemainingMS >= spans[0].StartRemainingMS {
		t.Fatalf("attempts were not separately traced under one budget: %+v", spans)
	}
	stop()
	// Later pool connections retain the original dial behavior, with no retry.
	count = 0
	_, err = cfg.ConnConfig.DialFunc(ctx, "tcp", "127.0.0.1:54331")
	if err == nil || count != 1 {
		t.Fatal("retry remained enabled after startup")
	}
}

func TestLocalStartupDialRetryGuards(t *testing.T) {
	for _, tc := range []struct {
		name, network, address string
		err                    error
	}{
		{"permission", "tcp", "127.0.0.1:54331", winsockDialFailure(10013)},
		{"refused", "tcp", "127.0.0.1:54331", winsockDialFailure(10061)},
		{"other-host", "tcp", "192.0.2.1:54331", winsockDialFailure(10060)},
		{"hostname", "tcp", "localhost:54331", winsockDialFailure(10060)},
		{"udp", "udp", "127.0.0.1:54331", winsockDialFailure(10060)},
		{"read", "tcp", "127.0.0.1:54331", &net.OpError{Op: "read", Err: os.NewSyscallError("connectex", syscall.Errno(10060))}},
		{"other-syscall", "tcp", "127.0.0.1:54331", &net.OpError{Op: "dial", Err: os.NewSyscallError("bind", syscall.Errno(10060))}},
		{"untyped", "tcp", "127.0.0.1:54331", errors.New("10060")},
		{"deadline", "tcp", "127.0.0.1:54331", context.DeadlineExceeded},
		{"canceled", "tcp", "127.0.0.1:54331", context.Canceled},
	} {
		t.Run(tc.name, func(t *testing.T) {
			count := 0
			_, err := dialStartupLoopback(context.Background(), tc.network, tc.address, func(context.Context, string, string) (net.Conn, error) {
				count++
				return nil, tc.err
			})
			if count != 1 || err != tc.err {
				t.Fatal("unexpected retry or changed error")
			}
		})
	}
}

func TestLocalStartupDialRetryStopsAtTwoAndCancellation(t *testing.T) {
	count := 0
	want := winsockDialFailure(10060)
	dial := func(context.Context, string, string) (net.Conn, error) { count++; return nil, want }
	_, err := dialStartupLoopback(context.Background(), "tcp6", "[::1]:54331", dial)
	if count != 2 || err != want {
		t.Fatal("second failed dial must remain final")
	}
	count = 0
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()
	_, err = dialStartupLoopback(ctx, "tcp", "127.0.0.1:54331", dial)
	if count != 1 || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("backoff exceeded inherited deadline or attempted another socket")
	}
	count = 0
	ctx, cancel = context.WithCancel(context.Background())
	defer cancel()
	_, err = dialStartupLoopback(ctx, "tcp", "127.0.0.1:54331", func(context.Context, string, string) (net.Conn, error) {
		count++
		cancel()
		return nil, want
	})
	if count != 1 || err != want {
		t.Fatal("canceled dial was retried")
	}
}

func TestLocalStartupRetryDisabledForNonLocalStore(t *testing.T) {
	cfg, _ := pgxpool.ParseConfig("postgres://127.0.0.1/test?sslmode=disable")
	count := 0
	want := winsockDialFailure(10060)
	cfg.ConnConfig.DialFunc = func(context.Context, string, string) (net.Conn, error) { count++; return nil, want }
	stop := configureLocalStartupRetry(cfg, context.Background(), false)
	defer stop()
	_, err := cfg.ConnConfig.DialFunc(context.Background(), "tcp", "127.0.0.1:54331")
	if count != 1 || err != want {
		t.Fatal("non-local store dial behavior changed")
	}
}

func TestLocalStartupDialNeverReplacesReturnedConnection(t *testing.T) {
	client, peer := net.Pipe()
	defer peer.Close()
	defer client.Close()
	count := 0
	want := winsockDialFailure(10060)
	got, err := dialStartupLoopback(context.Background(), "tcp", "127.0.0.1:54331", func(context.Context, string, string) (net.Conn, error) {
		count++
		return client, want
	})
	if count != 1 || got != client || err != want {
		t.Fatal("retry discarded ownership of a returned connection")
	}
}
