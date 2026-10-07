package records

import (
	"context"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrReadDenied    = errors.New("record read denied")
	ErrCommandDigest = errors.New("command identity already used for different input")
	ErrStorage       = errors.New("invalid stored record")
)

type StoreOptions struct {
	// LocalService activates only the separate loopback development schema.
	LocalService       bool
	Schema             string
	CreateSchema       bool
	QueryTimeout       time.Duration
	LockTimeout        time.Duration
	MaxConns           int32
	Codec              *DocumentCodec
	StartupDiagnostics *StartupDiagnostics
}

// Store defaults to an isolated M03 test schema. Explicit local-service mode
// permits only the separate loopback schema with an installed service codec.
type Store struct {
	pool           *pgxpool.Pool
	schema         string
	codec          *DocumentCodec
	queryTimeout   time.Duration
	lockTimeout    time.Duration
	localService   bool
	statsDecisions statsDecisionCache
}

var schemaName = regexp.MustCompile(`^m03_[a-z0-9_]{1,48}$`)

func OpenStore(ctx context.Context, url string, options StoreOptions) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("invalid M03 database configuration")
	}
	if options.LocalService {
		ip := net.ParseIP(cfg.ConnConfig.Host)
		if (ip == nil || !ip.IsLoopback()) || options.Schema != "cardford_go_local" || options.Codec == nil {
			return nil, fmt.Errorf("local service requires loopback PostgreSQL, cardford_go_local schema and an explicit codec")
		}
		for _, fallback := range cfg.ConnConfig.Fallbacks {
			ip := net.ParseIP(fallback.Host)
			if ip == nil || !ip.IsLoopback() {
				return nil, fmt.Errorf("local service database fallbacks must also be loopback")
			}
		}
	} else if !strings.HasSuffix(cfg.ConnConfig.Database, "_test") || !schemaName.MatchString(options.Schema) {
		return nil, fmt.Errorf("M03 requires separate _test database and explicit m03_ schema")
	}
	if options.QueryTimeout == 0 {
		options.QueryTimeout = 5 * time.Second
	}
	if options.LockTimeout == 0 {
		options.LockTimeout = time.Second
	}
	if options.MaxConns == 0 {
		options.MaxConns = 4
	}
	if options.QueryTimeout < time.Millisecond || options.QueryTimeout > 10*time.Second || options.LockTimeout < time.Millisecond || options.LockTimeout > options.QueryTimeout || options.MaxConns < 1 || options.MaxConns > 16 {
		return nil, fmt.Errorf("invalid finite M03 database limits")
	}
	if options.Codec == nil {
		options.Codec = NewDocumentCodec()
	}
	cfg.MaxConns = options.MaxConns
	cfg.MinConns = 0
	cfg.ConnConfig.ConnectTimeout = options.QueryTimeout
	cfg.ConnConfig.RuntimeParams["search_path"] = pgx.Identifier{options.Schema}.Sanitize()
	cfg.ConnConfig.RuntimeParams["application_name"] = "cardford:" + options.Schema
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = fmt.Sprint(options.QueryTimeout.Milliseconds())
	cfg.ConnConfig.RuntimeParams["lock_timeout"] = fmt.Sprint(options.LockTimeout.Milliseconds())
	cfg.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = fmt.Sprint(options.QueryTimeout.Milliseconds())
	options.StartupDiagnostics.configure(cfg)
	defer options.StartupDiagnostics.stop()
	bounded, cancel := context.WithTimeout(ctx, options.QueryTimeout)
	defer cancel()
	stopStartupRetry := configureLocalStartupRetry(cfg, bounded, options.LocalService)
	defer stopStartupRetry()
	pool, err := pgxpool.NewWithConfig(bounded, cfg)
	if err != nil {
		return nil, fmt.Errorf("open M03 database: %w", err)
	}
	s := &Store{pool: pool, schema: options.Schema, codec: options.Codec, queryTimeout: options.QueryTimeout, lockTimeout: options.LockTimeout, localService: options.LocalService}
	if options.CreateSchema {
		_, err = pool.Exec(bounded, "CREATE SCHEMA IF NOT EXISTS "+pgx.Identifier{options.Schema}.Sanitize())
		err = stageError("store.create-schema", err)
	} else {
		err = pool.Ping(bounded)
		err = stageError("store.ping", err)
	}
	if err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() { s.pool.Close() }
func (s *Store) bounded(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, s.queryTimeout)
}
func (s *Store) table(name string) string { return pgx.Identifier{s.schema, name}.Sanitize() }

// withTx is only for bounded SQL and already-validated immutable records.
// Game/policy/provider callbacks are never invoked while it owns a connection.
func (s *Store) withTx(ctx context.Context, fn func(context.Context, pgx.Tx) error) error {
	stage, _ := ctx.Value(databaseStageKey{}).(string)
	if stage == "" {
		stage = "transaction"
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return stageError(stage+".begin", err)
	}
	defer func() {
		rollback, cancel := context.WithTimeout(context.Background(), s.queryTimeout)
		defer cancel()
		_ = tx.Rollback(rollback)
	}()
	if err = fn(ctx, tx); err != nil {
		return stageError(stage+".body", err)
	}
	return stageError(stage+".commit", tx.Commit(ctx))
}

type databaseStageKey struct{}

func databaseStage(ctx context.Context, stage string) context.Context {
	return context.WithValue(ctx, databaseStageKey{}, stage)
}

// StageError retains the original error for errors.Is/As while identifying the
// failed bounded database stage. It never contains credentials or query values.
type StageError struct {
	Stage string
	Err   error
}

func (e *StageError) Error() string { return e.Stage + ": " + e.Err.Error() }
func (e *StageError) Unwrap() error { return e.Err }
func stageError(stage string, err error) error {
	if err == nil {
		return nil
	}
	return &StageError{stage, err}
}
