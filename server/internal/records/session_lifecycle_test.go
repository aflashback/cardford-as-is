package records

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"sync"
	"testing"
	"time"
)

func TestSessionLifecycleLateRenewalNeverRevives(t *testing.T) {
	s, _, ctx, owner, game := realtimeFixture(t)
	state, err := s.SetPlaybackIntent(localCommand(ctx, "resume-lease"), game, 2, 0, "resume", "", "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	if state.Phase != "running" || state.ForegroundLeaseUntil == nil {
		t.Fatalf("missing running lease: %+v", state)
	}
	deadline := time.Now().Add(-time.Second).UTC().Truncate(time.Microsecond)
	if _, err = s.pool.Exec(ctx, `UPDATE m05_playback SET foreground_lease_until=$2 WHERE game_id=$1`, game, deadline); err != nil {
		t.Fatal(err)
	}
	state, err = s.RenewForeground(ctx, game, 2, state.Generation, 1, "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	if state.Running || state.Phase != "paused" || state.PauseReason == nil || *state.PauseReason != "lease_expired" || !state.PausedAt.Equal(deadline) || !state.ExpiresAt.Equal(deadline.Add(300*time.Second)) {
		t.Fatalf("late renewal revived or changed deadline: %+v", state)
	}
	first := *state.ExpiresAt
	state, err = s.SetPlaybackIntent(localCommand(ctx, "repeat-stop"), game, 2, state.Generation, "pause", "away", "instance-one")
	if err != nil || !state.ExpiresAt.Equal(first) {
		t.Fatal("repeat pause moved deadline", state, err)
	}
	read, err := s.ReadPlayback(ctx, owner, game, "instance-one")
	if err != nil || !read.ExpiresAt.Equal(first) {
		t.Fatal("read moved deadline", read, err)
	}
}

func TestSessionLifecyclePaidPolicyPinsAtResume(t *testing.T) {
	s, _, ctx, owner, game := realtimeFixture(t)
	state, err := s.SetPlaybackIntent(localCommand(ctx, "free-resume"), game, 2, 0, "resume", "", "instance-one")
	if err != nil || state.RetentionSeconds != 300 {
		t.Fatal(state, err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "free-pause"), game, 2, state.Generation, "pause", "manual", "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	first := *state.ExpiresAt
	grant, err := s.ReadGrant(ctx, owner, LocalGrantID(owner, "spades", "partners"))
	if err != nil {
		t.Fatal(err)
	}
	grant.ID = "paid-test-grant"
	grant.OfferID = "paid-test-offer"
	grant.SourceID = "verified-paid-test"
	grant.SourceKind = "purchase"
	grant.Terms.BucketID = "paid-test-bucket"
	if err = s.PutGrant(ctx, grant); err != nil {
		t.Fatal(err)
	}
	state, err = s.ReadPlayback(ctx, owner, game, "instance-one")
	if err != nil || state.RetentionSeconds != 300 || !state.ExpiresAt.Equal(first) {
		t.Fatal("upgrade extended paused game", state, err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "paid-resume"), game, 2, state.Generation, "resume", "", "instance-one")
	if err != nil || state.RetentionSeconds != 3600 {
		t.Fatal("paid provenance ignored", state, err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "paid-pause"), game, 2, state.Generation, "pause", "manual", "instance-one")
	if err != nil || state.ExpiresAt.Sub(*state.PausedAt) != time.Hour {
		t.Fatal(state, err)
	}
	if err = s.RevokeGrant(ctx, owner, grant.ID); err != nil {
		t.Fatal(err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "downgrade-resume"), game, 2, state.Generation, "resume", "", "instance-one")
	if err != nil || state.RetentionSeconds != 300 {
		t.Fatal("revoked paid grant kept future tier", state, err)
	}
}

func TestSessionLifecycleSweepResumeRaceAndHistory(t *testing.T) {
	s, other, ctx, owner, game := realtimeFixture(t)
	state, err := s.SetPlaybackIntent(localCommand(ctx, "race-resume"), game, 2, 0, "resume", "", "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	// Simulate service outage beyond both original deadlines. Sweeping must not
	// manufacture an extra five-minute window at recovery time.
	if _, err = s.pool.Exec(ctx, `UPDATE m05_playback SET foreground_lease_until=clock_timestamp()-interval '301 seconds' WHERE game_id=$1`, game); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	wg.Add(2)
	var resume PlaybackState
	var errs [2]error
	go func() {
		defer wg.Done()
		resume, errs[0] = other.SetPlaybackIntent(localCommand(ctx, "late-race-resume"), game, 2, state.Generation, "resume", "", "instance-two")
	}()
	go func() { defer wg.Done(); _, errs[1] = s.SweepSessionLifecycle(context.Background(), 1) }()
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if resume.Phase != "expired" {
		t.Fatal("expired game resurrected", resume)
	}
	read, err := other.ReadPlayback(ctx, owner, game, "instance-two")
	if err != nil || read.Phase != "expired" {
		t.Fatal("expired read unavailable", read, err)
	}
	if _, err = s.Load(ctx, owner, game); err != nil {
		t.Fatal("original history lost", err)
	}
	// The creation receipt's exact digest is asserted separately by the existing
	// idempotency suite; expiration must leave its immutable row intact.
	var count int
	if err = s.pool.QueryRow(ctx, `SELECT count(*) FROM m04_service_commands WHERE owner_id=$1 AND command_id='create-realtime'`, owner).Scan(&count); err != nil || count != 1 {
		t.Fatal("creation receipt lost", count, err)
	}
}

func TestSessionLifecycleMutationChecksTimeAfterOwnerLock(t *testing.T) {
	s, other, ctx, owner, game := realtimeFixture(t)
	state, err := s.SetPlaybackIntent(localCommand(ctx, "lock-resume"), game, 2, 0, "resume", "", "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	request, command := realtimeBid(t, s, ctx, owner, game, "waiting-action")
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT owner_id FROM m03_access WHERE owner_id=$1 FOR UPDATE`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `UPDATE m05_playback SET foreground_lease_until=clock_timestamp()-interval '1 millisecond' WHERE game_id=$1`, game); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, e := other.Commit(WithPlayback(command, game, state.Generation, "instance-one"), request)
		done <- e
	}()
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err = <-done; !errors.Is(err, ErrControl) {
		t.Fatal("blocked mutation used stale clock", err)
	}
	loaded, err := s.Load(ctx, owner, game)
	if err != nil || loaded.Document.Revision != 0 {
		t.Fatal("rejected mutation changed history", err)
	}
}

func TestSessionLifecycleLegacyAndCompletionPreserveHistory(t *testing.T) {
	s, _, ctx, owner, game := realtimeFixture(t)
	state, err := s.SetPlaybackIntent(localCommand(ctx, "legacy-stop"), game, 2, 0, "pause", "away", "instance-one")
	if err != nil || state.PolicyVersion != "legacy" || state.ExpiresAt != nil {
		t.Fatal("stop migrated legacy", state, err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "adopt-policy"), game, 2, state.Generation, "resume", "", "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	p, err := s.ReadRealtimeProjection(ctx, owner, game)
	if err != nil {
		t.Fatal(err)
	}
	p.Node.Kind = "session-complete"
	raw, _ := json.Marshal(p)
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, e := tx.Exec(ctx, `SELECT 1 FROM m03_access WHERE owner_id=$1 FOR UPDATE`, owner); e != nil {
			return e
		}
		return s.saveRealtimeProjectionTx(ctx, tx, owner, game, p.Revision, raw)
	})
	if err != nil {
		t.Fatal(err)
	}
	state, err = s.ReadPlayback(ctx, owner, game, "instance-one")
	if err != nil || state.Phase != "completed" || state.ExpiresAt != nil || state.Running {
		t.Fatal("completed game retained active TTL", state, err)
	}
}

func TestSessionLifecycleHoldAndExpiryFence(t *testing.T) {
	s, _, ctx, owner, game := realtimeFixture(t)
	state, err := s.SetPlaybackIntent(localCommand(ctx, "resume-held"), game, 2, 0, "resume", "", "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "hold"), game, 2, state.Generation, "hold", "", "instance-one")
	if err != nil || state.Phase != "held" || state.PausedAt != nil {
		t.Fatal(state, err)
	}
	renewed, err := s.RenewForeground(ctx, game, 2, state.Generation, 1, "instance-one")
	if err != nil || renewed.Phase != "held" || renewed.ExpiresAt != nil {
		t.Fatal(renewed, err)
	}
	duplicate, err := s.RenewForeground(ctx, game, 2, state.Generation, 1, "instance-one")
	if err != nil || !duplicate.ForegroundLeaseUntil.Equal(*renewed.ForegroundLeaseUntil) {
		t.Fatal("duplicate extended lease", duplicate, err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "pause-held"), game, 2, state.Generation, "pause", "away", "instance-one")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.pool.Exec(ctx, `UPDATE m05_playback SET paused_at=clock_timestamp()-interval '301 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE game_id=$1`, game); err != nil {
		t.Fatal(err)
	}
	state, err = s.SetPlaybackIntent(localCommand(ctx, "resume-expired"), game, 2, state.Generation, "resume", "", "instance-one")
	if err != nil || state.Phase != "expired" || state.Running {
		t.Fatal("expired revived", state, err)
	}
	access, err := s.ReadAccess(ctx, owner)
	if err != nil || access.ActiveGameID != "" {
		t.Fatal("expired active pointer survived", access, err)
	}
	if _, err = s.Load(ctx, owner, game); err != nil {
		t.Fatal("history removed", err)
	}
	request, command := realtimeBid(t, s, ctx, owner, game, "expired-action")
	if _, err = s.Commit(command, request); !errors.Is(err, ErrAccess) {
		t.Fatal("expired mutation accepted", err)
	}
}
