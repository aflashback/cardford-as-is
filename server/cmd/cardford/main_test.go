package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"cardford/server/internal/records"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestStartupDatabaseDiagnosticsNeverEchoDriverData(t *testing.T) {
	for _, tc := range []struct {
		err  error
		want string
	}{
		{&records.StageError{Stage: "store.ping", Err: fmt.Errorf("private-password: %w", context.DeadlineExceeded)}, "stage=store.ping, class=deadline"},
		{&records.StageError{Stage: "private-password", Err: errors.New("private-password")}, "stage=database, class=failure"},
		{&pgconn.PgError{Message: "private-password", Detail: "private-password"}, "stage=database, class=sql-error"},
		{&records.StageError{Stage: "migrations.body", Err: &records.StageError{Stage: "migrations.apply-008", Err: context.DeadlineExceeded}}, "stage=migrations.apply-008, class=deadline"},
	} {
		got := databaseFailure("database initialization failed", tc.err).Error()
		if strings.Contains(got, "private-password") || !strings.Contains(got, tc.want) {
			t.Fatalf("unsafe or unhelpful diagnostic: %s", got)
		}
	}
}
