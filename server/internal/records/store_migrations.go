package records

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Migration SQL is read directly from the sole canonical source directory.
// Packaging must explicitly copy that directory; generated copies are not sources.
type Migration struct {
	Name, SHA256 string
	SQL          []byte
}

var canonicalMigrationPins = map[string]string{
	"001-local-platform.sql":             "1306a673d8c1f00972f7cb3e410f3489a7c40d3aa5a20d87f8cd5913c6f752c2",
	"002-billing-family.sql":             "5e1268ddcc97c34635d580641b5cdc768cc9c47690c0735db1be8e9b8d64042f",
	"003-account-data.sql":               "75d80528f474bdc4f92c20494c46a146fd3d3147adcd0fc05764b8472abb8fae",
	"004-analysis-jobs.sql":              "3ec418d08f1c4f89a8bcb72ee13bb2f4346861afac491aec95306849cf0cae43",
	"005-analysis-attempt-fence.sql":     "485165d34bf550e39fba00891556bc85f1fc0868853e6793c85e98c505b2701c",
	"006-preparation-attempts.sql":       "c68c498df78096f777e286e0173a6ad884589158a34503312fc6c547d0e54e1e",
	"007-versioned-platform-records.sql": "cae296b33b5c8b09169e7636b6116d6a60fd72ac9cd78661b4900b3b2873208a",
}

func ReadCanonicalMigrations(directory string) ([]Migration, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	if len(names) < 7 {
		return nil, fmt.Errorf("M03 requires all seven canonical migrations")
	}
	out := make([]Migration, 0, len(names))
	for i, name := range names {
		if !strings.HasPrefix(name, fmt.Sprintf("%03d-", i+1)) {
			return nil, fmt.Errorf("noncontiguous migration sequence: %s", name)
		}
		raw, err := os.ReadFile(filepath.Join(directory, name))
		if err != nil {
			return nil, err
		}
		sum := sha256.Sum256(raw)
		digest := hex.EncodeToString(sum[:])
		if i < 7 && canonicalMigrationPins[name] != digest {
			return nil, fmt.Errorf("frozen migration checksum mismatch: %s", name)
		}
		out = append(out, Migration{Name: name, SHA256: digest, SQL: raw})
	}
	return out, nil
}

// ApplyMigrations installs the canonical sequence under the Store's explicit
// isolated schema. Every applied hash is checked, including forward migrations.
// It never inspects or rewrites existing Node application records.
func (s *Store) ApplyMigrations(ctx context.Context, directory string) error {
	migrations, err := ReadCanonicalMigrations(directory)
	if err != nil {
		return stageError("migrations.read-canonical", err)
	}
	return s.withTx(databaseStage(ctx, "migrations"), func(ctx context.Context, tx pgx.Tx) error {
		// This is the same ledger and lock used by web/server/records/migrations.ts.
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(972701)"); err != nil {
			return stageError("migrations.advisory-lock", err)
		}
		if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
			return stageError("migrations.ledger-create", err)
		}
		rows, err := tx.Query(ctx, `SELECT name,checksum FROM schema_migrations ORDER BY name`)
		if err != nil {
			return stageError("migrations.ledger-query", err)
		}
		applied := map[string]string{}
		for rows.Next() {
			var name, hash string
			if err = rows.Scan(&name, &hash); err != nil {
				rows.Close()
				return stageError("migrations.ledger-scan", err)
			}
			applied[name] = hash
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return stageError("migrations.ledger-stream", err)
		}
		if len(applied) > len(migrations) {
			return fmt.Errorf("database migrations are newer than this package")
		}
		for i, m := range migrations {
			if hash, ok := applied[m.Name]; ok {
				if hash != m.SHA256 {
					return fmt.Errorf("applied migration checksum mismatch: %s", m.Name)
				}
				continue
			}
			if i < len(applied) {
				return fmt.Errorf("migration ledger is not a canonical prefix")
			}
			if _, err = tx.Exec(ctx, string(m.SQL)); err != nil {
				return stageError(fmt.Sprintf("migrations.apply-%03d", i+1), err)
			}
			if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)`, m.Name, m.SHA256); err != nil {
				return stageError(fmt.Sprintf("migrations.ledger-insert-%03d", i+1), err)
			}
		}
		return nil
	})
}
