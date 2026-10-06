package records

import (
	"os"
	"path/filepath"
	"testing"
)

func TestM03CanonicalMigrationPins(t *testing.T) {
	migrations, err := ReadCanonicalMigrations(filepath.Join("..", "..", "..", "web", "server", "records", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	if len(migrations) != 9 {
		t.Fatalf("want nine canonical migrations, got %d", len(migrations))
	}
	mutated := t.TempDir()
	for _, m := range migrations {
		if err := os.WriteFile(filepath.Join(mutated, m.Name), m.SQL, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(mutated, migrations[0].Name), append(migrations[0].SQL, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadCanonicalMigrations(mutated); err == nil {
		t.Fatal("edited frozen migration accepted")
	}
}
