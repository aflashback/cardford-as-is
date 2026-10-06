// Package records contains a throwaway M02A PostgreSQL seam, not production
// migrations or platform records. Constructor enforces an isolated _test DB.
package records

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
	"time"
)

var ErrConflict = errors.New("not owned, missing or stale revision")

type Row struct {
	ID, Owner, Mode string
	Revision        int64
	State           json.RawMessage
}
type TestStore struct {
	pool          *pgxpool.Pool
	schema, table string
}

func NewTestStore(ctx context.Context, url string) (*TestStore, error) {
	cfg, e := pgxpool.ParseConfig(url)
	if e != nil {
		return nil, fmt.Errorf("invalid test database configuration")
	}
	if !strings.HasSuffix(cfg.ConnConfig.Database, "_test") {
		return nil, fmt.Errorf("requires separate database ending _test")
	}
	cfg.MaxConns = 2
	cfg.MinConns = 0
	cfg.ConnConfig.ConnectTimeout = 2 * time.Second
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "2000"
	cfg.ConnConfig.RuntimeParams["lock_timeout"] = "1000"
	p, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		return nil, e
	}
	b := make([]byte, 12)
	if _, e = rand.Read(b); e != nil {
		p.Close()
		return nil, e
	}
	schema := "m02a_" + hex.EncodeToString(b)
	s := &TestStore{pool: p, schema: pgx.Identifier{schema}.Sanitize(), table: pgx.Identifier{schema, "games"}.Sanitize()}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	tx, e := p.Begin(ctx)
	if e != nil {
		p.Close()
		return nil, e
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(ctx, "CREATE SCHEMA "+s.schema); e == nil {
		_, e = tx.Exec(ctx, "CREATE TABLE "+s.table+" (id text PRIMARY KEY, owner_id text NOT NULL, mode text NOT NULL, revision bigint NOT NULL CHECK(revision>=0), state bytea NOT NULL)")
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		p.Close()
		return nil, e
	}
	return s, nil
}
func (s *TestStore) Close(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, e := s.pool.Exec(ctx, "DROP SCHEMA "+s.schema+" CASCADE")
	s.pool.Close()
	return e
}
func (s *TestStore) Insert(ctx context.Context, r Row) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if r.Revision != 0 || len(r.State) > 256<<10 {
		return fmt.Errorf("invalid opening row")
	}
	_, e := s.pool.Exec(ctx, "INSERT INTO "+s.table+" (id,owner_id,mode,revision,state) VALUES ($1,$2,$3,$4,$5)", r.ID, r.Owner, r.Mode, r.Revision, []byte(r.State))
	return e
}
func (s *TestStore) Load(ctx context.Context, id, owner string) (Row, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	r := Row{}
	e := s.pool.QueryRow(ctx, "SELECT id,owner_id,mode,revision,state FROM "+s.table+" WHERE id=$1 AND owner_id=$2", id, owner).Scan(&r.ID, &r.Owner, &r.Mode, &r.Revision, &r.State)
	if errors.Is(e, pgx.ErrNoRows) {
		e = ErrConflict
	}
	return r, e
}

// Publish performs one fenced write. Game computation has already completed;
// no connection is retained between Load and Publish. This is not a receipt.
func (s *TestStore) Publish(ctx context.Context, r Row, next json.RawMessage) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if e := ctx.Err(); e != nil {
		return e
	}
	if len(next) > 256<<10 || r.Revision < 0 || r.Revision >= 9007199254740991 {
		return fmt.Errorf("invalid publication bounds")
	}
	result, e := s.pool.Exec(ctx, "UPDATE "+s.table+" SET state=$1,revision=revision+1 WHERE id=$2 AND owner_id=$3 AND mode=$4 AND revision=$5", []byte(next), r.ID, r.Owner, r.Mode, r.Revision)
	if e == nil && result.RowsAffected() != 1 {
		return ErrConflict
	}
	return e
}
