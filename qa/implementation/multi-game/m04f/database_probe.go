// An opt-in, synthetic raw-pgx diagnostic. It does not exercise Store pooling,
// game histories, prepared work or the product's complete command path.
package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const operationLimit = 5 * time.Second

type failure struct {
	Class    string `json:"class"`
	SQLState string `json:"sqlState,omitempty"`
}
type span struct {
	Stage       string   `json:"stage"`
	At          string   `json:"at"`
	ElapsedMS   float64  `json:"elapsedMs"`
	RemainingMS int64    `json:"remainingMs"`
	Failure     *failure `json:"failure,omitempty"`
}
type activity struct {
	PID         int     `json:"pid"`
	Application string  `json:"application"`
	State       string  `json:"state"`
	WaitType    string  `json:"waitType"`
	WaitEvent   string  `json:"waitEvent"`
	Blockers    []int32 `json:"blockers"`
}
type snapshot struct {
	At              string          `json:"at"`
	ElapsedMS       float64         `json:"elapsedMs"`
	Activity        []activity      `json:"activity"`
	DatabaseFailure *failure        `json:"databaseFailure,omitempty"`
	SocketCounts    json.RawMessage `json:"socketCounts,omitempty"`
	SocketFailure   *failure        `json:"socketFailure,omitempty"`
}
type iteration struct {
	Number          int       `json:"number"`
	Schema          string    `json:"schema"`
	Spans           []span    `json:"spans"`
	Passed          bool      `json:"passed"`
	CleanupOK       bool      `json:"cleanupOK"`
	FailureSnapshot *snapshot `json:"failureSnapshot,omitempty"`
}
type migration struct {
	name, digest string
	sql          []byte
}
type report struct {
	Scope           string            `json:"scope"`
	StartedAt       string            `json:"startedAt"`
	Iterations      []iteration       `json:"iterations"`
	MigrationHashes map[string]string `json:"migrationHashes"`
	Failure         *failure          `json:"failure,omitempty"`
	Passed          bool              `json:"passed"`
	Limits          map[string]int    `json:"limits"`
}

func classify(err error) *failure {
	if err == nil {
		return nil
	}
	out := &failure{Class: "failure"}
	var network net.Error
	var sql *pgconn.PgError
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		out.Class = "deadline"
	case errors.Is(err, context.Canceled):
		out.Class = "canceled"
	case errors.As(err, &network) && network.Timeout():
		out.Class = "network-timeout"
	case errors.As(err, &sql):
		out.Class = "sql-error"
		out.SQLState = sql.Code
	}
	return out
}
func step(i *iteration, ctx context.Context, name string, fn func() error) error {
	started := time.Now()
	remaining := int64(-1)
	if deadline, ok := ctx.Deadline(); ok {
		remaining = time.Until(deadline).Milliseconds()
	}
	err := fn()
	i.Spans = append(i.Spans, span{name, started.UTC().Format(time.RFC3339Nano), float64(time.Since(started)) / float64(time.Millisecond), remaining, classify(err)})
	return err
}
func operation(i *iteration, name string, fn func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), operationLimit)
	defer cancel()
	return step(i, ctx, name, func() error { return fn(ctx) })
}
func target() (*pgx.ConnConfig, error) {
	url := os.Getenv("TEST_DATABASE_URL")
	if runtime.GOOS != "windows" || url == "" || url == os.Getenv("DATABASE_URL") {
		return nil, errors.New("target validation")
	}
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return nil, errors.New("target validation")
	}
	if cfg.Host != "127.0.0.1" || cfg.Port != 54331 || cfg.Database != "cardford_windows_test" || cfg.User != "cardford_local" || cfg.TLSConfig != nil || len(cfg.Fallbacks) != 0 {
		return nil, errors.New("target validation")
	}
	cfg.ConnectTimeout = operationLimit
	cfg.RuntimeParams["statement_timeout"] = "5000"
	cfg.RuntimeParams["lock_timeout"] = "1000"
	cfg.RuntimeParams["idle_in_transaction_session_timeout"] = "5000"
	return cfg, nil
}
func connect(i *iteration, base *pgx.ConnConfig, name string) (*pgx.Conn, error) {
	cfg := base.Copy()
	dial := cfg.DialFunc
	cfg.DialFunc = func(ctx context.Context, network, address string) (conn net.Conn, err error) {
		err = step(i, ctx, name+".dial", func() error { conn, err = dial(ctx, network, address); return err })
		return
	}
	var conn *pgx.Conn
	err := operation(i, name, func(ctx context.Context) (err error) { conn, err = pgx.ConnectConfig(ctx, cfg); return })
	return conn, err
}
func sqlStep(i *iteration, ctx context.Context, c interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}, name, sql string, args ...any) error {
	return step(i, ctx, name, func() error { _, err := c.Exec(ctx, sql, args...); return err })
}
func transaction(i *iteration, c *pgx.Conn, name string, body func(context.Context, pgx.Tx) error) error {
	return operation(i, name, func(ctx context.Context) error {
		var tx pgx.Tx
		if err := step(i, ctx, name+".begin", func() (err error) { tx, err = c.Begin(ctx); return }); err != nil {
			return err
		}
		defer operation(i, name+".rollback", func(cleanup context.Context) error {
			err := tx.Rollback(cleanup)
			if errors.Is(err, pgx.ErrTxClosed) {
				return nil
			}
			return err
		})
		if err := body(ctx, tx); err != nil {
			return err
		}
		return step(i, ctx, name+".commit", func() error { return tx.Commit(ctx) })
	})
}
func closeConn(i *iteration, c *pgx.Conn, name string) error {
	if c == nil {
		return nil
	}
	return operation(i, name, func(ctx context.Context) error { return c.Close(ctx) })
}
func migrations() ([]migration, error) {
	dir := filepath.Join("web", "server", "records", "migrations")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	if len(names) != 10 {
		return nil, errors.New("migration inventory")
	}
	out := make([]migration, 0, len(names))
	for n, name := range names {
		if !strings.HasPrefix(name, fmt.Sprintf("%03d-", n+1)) {
			return nil, errors.New("migration order")
		}
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		sum := sha256.Sum256(raw)
		out = append(out, migration{name, hex.EncodeToString(sum[:]), raw})
	}
	return out, nil
}

// The observer is independent of the failed connection and has one shared
// three-second deadline. Only fixed fields are emitted; SQL/args/config/error
// messages are never included.
func observe(base *pgx.ConnConfig) *snapshot {
	started := time.Now()
	s := &snapshot{At: started.UTC().Format(time.RFC3339Nano), Activity: []activity{}}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		cfg := base.Copy()
		cfg.ConnectTimeout = 3 * time.Second
		cfg.RuntimeParams["application_name"] = "m04f-probe:observer"
		cfg.RuntimeParams["statement_timeout"] = "2000"
		c, err := pgx.ConnectConfig(ctx, cfg)
		if err != nil {
			s.DatabaseFailure = classify(err)
			return
		}
		defer c.Close(ctx)
		rows, err := c.Query(ctx, `SELECT pid,application_name,COALESCE(state,''),COALESCE(wait_event_type,''),COALESCE(wait_event,''),pg_blocking_pids(pid) FROM pg_stat_activity WHERE datname=current_database() AND (application_name LIKE 'cardford:%' OR application_name LIKE 'm04f-probe:%') ORDER BY pid LIMIT 64`)
		if err != nil {
			s.DatabaseFailure = classify(err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var a activity
			if err = rows.Scan(&a.PID, &a.Application, &a.State, &a.WaitType, &a.WaitEvent, &a.Blockers); err != nil {
				s.DatabaseFailure = classify(err)
				return
			}
			s.Activity = append(s.Activity, a)
		}
		s.DatabaseFailure = classify(rows.Err())
	}()
	go func() {
		defer wg.Done()
		command := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-Command", "Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 54331 -or $_.RemotePort -eq 54331 } | Group-Object State | Select-Object Name,Count | ConvertTo-Json -Compress")
		command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		raw, err := command.Output()
		if err != nil {
			s.SocketFailure = classify(err)
			return
		}
		if len(strings.TrimSpace(string(raw))) == 0 {
			s.SocketCounts = json.RawMessage("[]")
			return
		}
		if !json.Valid(raw) {
			s.SocketFailure = &failure{Class: "invalid-counts"}
			return
		}
		s.SocketCounts = raw
	}()
	wg.Wait()
	s.ElapsedMS = float64(time.Since(started)) / float64(time.Millisecond)
	return s
}

func cleanup(i *iteration, base *pgx.ConnConfig, nonce string) (ok bool) {
	c, err := connect(i, base, "cleanup.connect")
	if err != nil {
		if i.FailureSnapshot == nil {
			i.FailureSnapshot = observe(base)
		}
		return false
	}
	defer func() {
		if closeConn(i, c, "cleanup.close") != nil {
			ok = false
			if i.FailureSnapshot == nil {
				i.FailureSnapshot = observe(base)
			}
		}
	}()
	err = operation(i, "cleanup", func(ctx context.Context) error {
		var present bool
		if err := step(i, ctx, "cleanup.schema-check", func() error {
			return c.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1)", i.Schema).Scan(&present)
		}); err != nil {
			return err
		}
		if !present {
			return nil
		}
		var owner bool
		if err := step(i, ctx, "cleanup.owner-check", func() error {
			return c.QueryRow(ctx, "SELECT pg_get_userbyid(nspowner)=current_user FROM pg_namespace WHERE nspname=$1", i.Schema).Scan(&owner)
		}); err != nil {
			return err
		}
		if !owner {
			return errors.New("schema ownership")
		}
		var count int
		marker := pgx.Identifier{i.Schema, "__m04f_owner"}.Sanitize()
		if err := step(i, ctx, "cleanup.marker-check", func() error {
			return c.QueryRow(ctx, "SELECT count(*) FROM "+marker+" WHERE run_id=$1", nonce).Scan(&count)
		}); err != nil {
			return err
		}
		if count != 1 {
			return errors.New("schema ownership")
		}
		return sqlStep(i, ctx, c, "cleanup.drop", "DROP SCHEMA "+pgx.Identifier{i.Schema}.Sanitize()+" CASCADE")
	})
	if err != nil && i.FailureSnapshot == nil {
		i.FailureSnapshot = observe(base)
	}
	return err == nil
}
func run(i *iteration, base *pgx.ConnConfig, ms []migration) error {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return err
	}
	nonce := hex.EncodeToString(random[:])
	i.Schema = "m03_probe_" + nonce
	cfg := base.Copy()
	cfg.RuntimeParams["search_path"] = pgx.Identifier{i.Schema}.Sanitize()
	cfg.RuntimeParams["application_name"] = "m04f-probe:" + nonce
	c, err := connect(i, cfg, "cold.connect")
	if err == nil {
		err = transaction(i, c, "schema", func(ctx context.Context, tx pgx.Tx) error {
			if err := sqlStep(i, ctx, tx, "schema.create", "CREATE SCHEMA "+pgx.Identifier{i.Schema}.Sanitize()); err != nil {
				return err
			}
			if err := sqlStep(i, ctx, tx, "schema.marker-create", "CREATE TABLE __m04f_owner(run_id text PRIMARY KEY)"); err != nil {
				return err
			}
			return sqlStep(i, ctx, tx, "schema.marker-insert", "INSERT INTO __m04f_owner VALUES($1)", nonce)
		})
	}
	if err == nil {
		err = transaction(i, c, "migrations", func(ctx context.Context, tx pgx.Tx) error {
			if err := sqlStep(i, ctx, tx, "migrations.advisory-lock", "SELECT pg_advisory_xact_lock(972701)"); err != nil {
				return err
			}
			if err := sqlStep(i, ctx, tx, "migrations.ledger-create", "CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
				return err
			}
			for n, m := range ms {
				if err := sqlStep(i, ctx, tx, fmt.Sprintf("migrations.apply-%03d", n+1), string(m.sql)); err != nil {
					return err
				}
				if err := sqlStep(i, ctx, tx, fmt.Sprintf("migrations.ledger-insert-%03d", n+1), "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", m.name, m.digest); err != nil {
					return err
				}
			}
			return nil
		})
	}
	if err == nil {
		err = transaction(i, c, "tiny", func(ctx context.Context, tx pgx.Tx) error {
			if err := sqlStep(i, ctx, tx, "tiny.table", "CREATE TABLE m04f_probe(value integer PRIMARY KEY)"); err != nil {
				return err
			}
			return sqlStep(i, ctx, tx, "tiny.insert", "INSERT INTO m04f_probe VALUES(1)")
		})
	}
	if err != nil {
		i.FailureSnapshot = observe(base)
	}
	closeErr := closeConn(i, c, "cold.close")
	c = nil
	if err == nil {
		err = closeErr
	}
	if err == nil {
		c, err = connect(i, cfg, "reopen.connect")
	}
	if err == nil {
		err = operation(i, "reopen.read", func(ctx context.Context) error {
			var value, count int
			if e := c.QueryRow(ctx, "SELECT value,(SELECT count(*) FROM schema_migrations) FROM m04f_probe").Scan(&value, &count); e != nil {
				return e
			}
			if value != 1 || count != len(ms) {
				return errors.New("fixture binding")
			}
			return nil
		})
	}
	if err != nil && i.FailureSnapshot == nil {
		i.FailureSnapshot = observe(base)
	}
	closeErr = closeConn(i, c, "reopen.close")
	if err == nil {
		err = closeErr
	}
	if err != nil && i.FailureSnapshot == nil {
		i.FailureSnapshot = observe(base)
	}
	i.CleanupOK = cleanup(i, base, nonce)
	if err == nil && !i.CleanupOK {
		err = errors.New("fixture cleanup")
	}
	return err
}
func main() {
	r := report{Scope: "synthetic raw-pgx staged native probe; production pool/history/runtime comparison excluded; a pass does not resolve archived failures", StartedAt: time.Now().UTC().Format(time.RFC3339Nano), Iterations: []iteration{}, MigrationHashes: map[string]string{}, Limits: map[string]int{"operationMS": 5000, "wholeMigrationTransactionMS": 5000, "statementMS": 5000, "lockMS": 1000, "idleTransactionMS": 5000, "failureObserverMS": 3000, "iterations": 3}}
	cfg, err := target()
	var ms []migration
	if err == nil {
		ms, err = migrations()
	}
	for _, m := range ms {
		r.MigrationHashes[m.name] = m.digest
	}
	if err == nil {
		for n := 1; n <= 3; n++ {
			i := iteration{Number: n, Spans: []span{}}
			err = run(&i, cfg, ms)
			i.Passed = err == nil
			r.Iterations = append(r.Iterations, i)
			if err != nil {
				break
			}
		}
	}
	r.Failure = classify(err)
	r.Passed = err == nil && len(r.Iterations) == 3
	_ = json.NewEncoder(os.Stdout).Encode(r)
	if !r.Passed {
		os.Exit(1)
	}
}
