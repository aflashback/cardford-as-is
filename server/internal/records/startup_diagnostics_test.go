package records

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestStartupDiagnosticsSanitizedDialFailure(t *testing.T) {
	cfg, err := pgxpool.ParseConfig("postgres://secret-user:secret-password@127.0.0.1/private_test?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	wantErr := &net.OpError{Op: "dial", Net: "tcp", Err: os.NewSyscallError("connectex", syscall.Errno(10060))}
	var sawDeadline time.Time
	cfg.ConnConfig.DialFunc = func(ctx context.Context, _, _ string) (net.Conn, error) {
		sawDeadline, _ = ctx.Deadline()
		return nil, wantErr
	}
	d := &StartupDiagnostics{}
	d.configure(cfg)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	deadline, _ := ctx.Deadline()
	_, err = cfg.ConnConfig.DialFunc(ctx, "tcp", "private-address")
	if !errors.Is(err, wantErr) || sawDeadline != deadline {
		t.Fatal("diagnostic changed the error or inherited deadline")
	}
	connect := d.TraceConnectStart(ctx, pgx.TraceConnectStartData{ConnConfig: cfg.ConnConfig})
	d.TraceConnectEnd(connect, pgx.TraceConnectEndData{Err: fmt.Errorf("secret-password: %w", wantErr)})
	query := d.TraceQueryStart(ctx, nil, pgx.TraceQueryStartData{SQL: "secret-query", Args: []any{"secret-value"}})
	d.TraceQueryEnd(query, nil, pgx.TraceQueryEndData{Err: &pgconn.PgError{Code: "28P01", Message: "secret-message"}})
	spans := d.Snapshot()
	if len(spans) != 3 || spans[0].OSCode != 10060 || spans[0].StartRemainingMS <= 0 || spans[0].ContextClass != "ok" || spans[2].SQLState != "28P01" {
		t.Fatalf("unexpected sanitized spans: %+v", spans)
	}
	if runtime.GOOS == "windows" && spans[0].Class != "winsock-timeout" {
		t.Fatal("Winsock timeout misclassified")
	}
	raw, _ := json.Marshal(spans)
	for _, forbidden := range []string{"secret", "private", "connectex", "ConnConfig", "Args"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("diagnostic leaked forbidden field %q", forbidden)
		}
	}
	spans[0].Stage = "changed-copy"
	d.stop()
	d.TraceQueryEnd(query, nil, pgx.TraceQueryEndData{})
	if got := d.Snapshot(); len(got) != 3 || got[0].Stage != "startup.dial" {
		t.Fatal("snapshot aliases capture or capture continued after stop")
	}
}

// Three predeclared cold production-pool openings; no schema or data mutation.
// Stop at the first failure and retain its spans, rather than retrying a sample.
func TestStartupDiagnosticsWindowsProbe(t *testing.T) {
	if os.Getenv("CARDFORD_DB_STARTUP_PROBE") != "1" {
		t.Skip("opt-in native diagnostic")
	}
	url := os.Getenv("TEST_DATABASE_URL")
	cfg, err := pgx.ParseConfig(url)
	if runtime.GOOS != "windows" || url == "" || url == os.Getenv("DATABASE_URL") || err != nil || cfg.Host != "127.0.0.1" || cfg.Port != 54331 || cfg.Database != "cardford_windows_test" || cfg.TLSConfig != nil || len(cfg.Fallbacks) != 0 {
		t.Fatal("native isolated diagnostic target required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	for i := 1; i <= 3; i++ {
		d := &StartupDiagnostics{}
		store, openErr := OpenStore(ctx, url, StoreOptions{LocalService: true, Schema: "cardford_go_local", Codec: NewDocumentCodec(), StartupDiagnostics: d})
		if store != nil {
			store.Close()
		}
		raw, _ := json.Marshal(struct {
			Sample int           `json:"sample"`
			Spans  []StartupSpan `json:"spans"`
		}{i, d.Snapshot()})
		t.Log(string(raw))
		if openErr != nil {
			t.Fatal("cold production-pool opening failed; see sanitized spans")
		}
	}
}
