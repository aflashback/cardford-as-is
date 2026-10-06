// cardford is the explicit local fixture Go service. It serves only the M04C
// API; the preserved React application's current startup remains separate.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"time"

	"cardford/server/internal/access"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"cardford/server/internal/service"
	"github.com/jackc/pgx/v5/pgconn"
)

func main() {
	migrations := flag.String("migrations", os.Getenv("CARDFORD_MIGRATIONS_DIR"), "canonical web/server/records/migrations directory (required)")
	web := flag.String("web", "", "optional public web/dist directory for same-origin demo acceptance")
	policy := flag.String("access-policy", "", "explicit validated offer policy JSON; omit for the M04C fixture harness")
	flag.Parse()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := run(ctx, *migrations, *web, *policy); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run(ctx context.Context, migrations, web, policyPath string) error {
	var policy *access.Policy
	if policyPath != "" {
		value, err := readPolicy(policyPath)
		if err != nil {
			return err
		}
		policy = &value
	}
	cfg, err := transport.ReadLocalConfig(func(name string) string {
		if name == "CARDFORD_MIGRATIONS_DIR" {
			return migrations
		}
		return os.Getenv(name)
	})
	if err != nil {
		return err
	}
	codec, err := records.NewServiceCodec()
	if err != nil {
		return fmt.Errorf("local policy initialization failed")
	}
	store, err := records.OpenStore(ctx, cfg.DatabaseURL, records.StoreOptions{LocalService: true, Schema: "cardford_go_local", CreateSchema: true, Codec: codec})
	if err != nil {
		return databaseFailure("local database initialization failed", err)
	}
	defer store.Close()
	if err = store.ApplyMigrations(ctx, cfg.MigrationsDirectory); err != nil {
		return databaseFailure("canonical database migration validation failed", err)
	}
	var backend *service.Service
	if policy == nil {
		backend, err = service.New(store, codec)
	} else {
		backend, err = service.NewConfigured(store, codec, *policy)
	}
	if err != nil {
		return fmt.Errorf("local service initialization failed")
	}
	defer backend.Close()
	handler, err := transport.NewLocal(backend, transport.LocalOptions{Origin: cfg.Origin})
	if err != nil {
		return err
	}
	server, err := transport.NewLocalServer(cfg.Address, handler)
	if err != nil {
		return err
	}
	if web != "" {
		server.Handler, err = transport.NewDemoWeb(handler, web, cfg.Origin)
		if err != nil {
			return fmt.Errorf("public demo build could not be loaded")
		}
	}
	listener, err := net.Listen("tcp", cfg.Address)
	if err != nil {
		return fmt.Errorf("local listener could not bind its configured address")
	}
	finished := make(chan error, 1)
	go func() { finished <- server.Serve(listener) }()
	accessMode := "fixture"
	if policy != nil {
		accessMode = "configured"
	}
	fmt.Printf("CardFord Go local API: %s (identity=local-test, payments=fixture, provider=off, access=%s)\n", cfg.Origin, accessMode)
	select {
	case err = <-finished:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("local HTTP listener stopped unexpectedly")
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err = server.Shutdown(shutdown); err != nil {
			_ = server.Close()
			return fmt.Errorf("local HTTP shutdown exceeded its deadline")
		}
		<-finished
		return nil
	}
}

func readPolicy(path string) (access.Policy, error) {
	f, err := os.Open(path)
	if err != nil {
		return access.Policy{}, fmt.Errorf("access policy could not be opened")
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, (1<<20)+1))
	if err != nil || len(raw) > 1<<20 {
		return access.Policy{}, fmt.Errorf("access policy exceeds its file limit")
	}
	p, err := access.DecodePolicy(raw)
	if err != nil {
		return access.Policy{}, fmt.Errorf("access policy is invalid or uses unsupported terms")
	}
	return p, nil
}

// Driver errors may embed credentials, SQL values or private data. Report only
// a known operation stage and error class, preserving useful timeout evidence.
var migrationStage = regexp.MustCompile(`^migrations\.(apply|ledger-insert)-[0-9]{3}$`)

func databaseFailure(operation string, err error) error {
	stage := "database"
	for current := err; current != nil; current = errors.Unwrap(current) {
		tagged, ok := current.(*records.StageError)
		if !ok {
			continue
		}
		switch tagged.Stage {
		case "store.create-schema", "store.ping", "transaction.begin", "transaction.body", "transaction.commit",
			"migrations.read-canonical", "migrations.begin", "migrations.body", "migrations.commit", "migrations.advisory-lock",
			"migrations.ledger-create", "migrations.ledger-query", "migrations.ledger-scan", "migrations.ledger-stream":
			stage = tagged.Stage
		default:
			if migrationStage.MatchString(tagged.Stage) {
				stage = tagged.Stage
			}
		}
	}
	kind := "failure"
	var network net.Error
	var sql *pgconn.PgError
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		kind = "deadline"
	case errors.Is(err, context.Canceled):
		kind = "canceled"
	case errors.As(err, &network) && network.Timeout():
		kind = "network-timeout"
	case errors.As(err, &sql):
		kind = "sql-error"
	}
	return fmt.Errorf("%s (stage=%s, class=%s)", operation, stage, kind)
}
