package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestPlaybackDiagnosticsClassifyWrappedFailuresWithoutPrivateErrors(t *testing.T) {
	cases := []struct {
		err  error
		want string
	}{
		{nil, "none"}, {context.DeadlineExceeded, "deadline"}, {context.Canceled, "canceled"},
		{records.ErrControl, "control_lost"}, {records.ErrUnauthenticated, "unauthenticated"}, {records.ErrAccess, "access_denied"},
		{records.ErrConflict, "stale"}, {records.ErrWorkStale, "stale"}, {ErrBusy, "capacity"}, {records.ErrStorage, "storage"},
		{&playbackWorkStateError{state: "rejected"}, "prepared_rejected"}, {&playbackWorkStateError{state: "canceled"}, "prepared_canceled"},
		{&playbackWorkStateError{state: "PRIVATE_HANDS_SQL"}, "prepared_unavailable"},
		{&transport.LocalError{Code: "LEASE_LOST"}, "service_LEASE_LOST"},
		{&transport.LocalError{Code: "PRIVATE_HANDS_SQL"}, "service_error"},
		{&pgconn.PgError{Code: "57014", Message: "PRIVATE_HANDS_SQL"}, "db_query_canceled"},
		{&pgconn.PgError{Code: "55P03", Message: "PRIVATE_HANDS_SQL"}, "db_lock_timeout"},
		{&pgconn.PgError{Code: "SECRET_CONNECTION", Message: "PRIVATE_HANDS_SQL"}, "db_error"},
		{errors.New("PRIVATE_HANDS_SQL postgres://secret cards:H7 deck"), "internal"},
	}
	for _, c := range cases {
		err := c.err
		if err != nil {
			err = fmt.Errorf("PRIVATE_HANDS_SQL: %w", err)
		}
		if got := playbackFailureClass(err); got != c.want {
			t.Fatalf("class=%q want=%q", got, c.want)
		}
		line := playbackDiagnostic("advance", err, nil, nil, true, 3*time.Second)
		for _, secret := range []string{"PRIVATE_HANDS_SQL", "postgres://", "H7", "deck", "SECRET_CONNECTION"} {
			if strings.Contains(line, secret) {
				t.Fatal("private diagnostics leaked")
			}
		}
	}
}

func TestPlaybackDiagnosticsReportDeadlineAndDurableStopOutcomeWithBounds(t *testing.T) {
	line := playbackDiagnostic("load_game", errors.New("sensitive error"), context.DeadlineExceeded, records.ErrControl, true, 5100*time.Millisecond)
	if line != "cardford_playback_runner_exit stage=load_game class=deadline inspection_ms=5100 durable_stop=failed stop_class=control_lost" {
		t.Fatal(line)
	}
	line = playbackDiagnostic("private_stage\ncredential", errPlaybackStopped, nil, nil, false, time.Hour)
	if line != "cardford_playback_runner_exit stage=unknown class=playback_fence_changed inspection_ms=60000 durable_stop=not_attempted stop_class=none" {
		t.Fatal(line)
	}
	if !strings.Contains(playbackDiagnostic("advance", context.Canceled, nil, nil, true, -time.Second), "inspection_ms=0") {
		t.Fatal("negative duration not bounded")
	}
}
