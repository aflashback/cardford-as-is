package records

import (
	"context"
	"errors"
	"fmt"
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
	Schema       string
	CreateSchema bool
	QueryTimeout time.Duration
	LockTimeout  time.Duration
	MaxConns     int32
	Codec        *DocumentCodec
}

// Store is the unexposed M03 adapter. It requires an explicitly named schema in
// an isolated test database; M04 must provide a reviewed activation path.
type Store struct {
	pool         *pgxpool.Pool
	schema       string
	codec        *DocumentCodec
	queryTimeout time.Duration
	lockTimeout  time.Duration
}

var schemaName = regexp.MustCompile(`^m03_[a-z0-9_]{1,48}$`)

func OpenStore(ctx context.Context, url string, options StoreOptions) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("invalid M03 database configuration")
	}
	if !strings.HasSuffix(cfg.ConnConfig.Database, "_test") || !schemaName.MatchString(options.Schema) {
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
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = fmt.Sprint(options.QueryTimeout.Milliseconds())
	cfg.ConnConfig.RuntimeParams["lock_timeout"] = fmt.Sprint(options.LockTimeout.Milliseconds())
	cfg.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = fmt.Sprint(options.QueryTimeout.Milliseconds())
	bounded, cancel := context.WithTimeout(ctx, options.QueryTimeout)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(bounded, cfg)
	if err != nil {
		return nil, fmt.Errorf("open M03 database: %w", err)
	}
	s := &Store{pool: pool, schema: options.Schema, codec: options.Codec, queryTimeout: options.QueryTimeout, lockTimeout: options.LockTimeout}
	if options.CreateSchema {
		_, err = pool.Exec(bounded, "CREATE SCHEMA IF NOT EXISTS "+pgx.Identifier{options.Schema}.Sanitize())
	} else {
		err = pool.Ping(bounded)
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
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		rollback, cancel := context.WithTimeout(context.Background(), s.queryTimeout)
		defer cancel()
		_ = tx.Rollback(rollback)
	}()
	if err = fn(ctx, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
