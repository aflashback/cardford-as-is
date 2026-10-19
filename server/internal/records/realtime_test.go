package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"cardford/server/internal/sessions"
	"github.com/jackc/pgx/v5"
)

func realtimeFixture(t *testing.T) (*Store, *Store, context.Context, string, string) {
	t.Helper()
	codec, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	s, other := storeTestOpen(t, codec)
	identity, err := s.NewLocalIdentity(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	owner := identity.Principal.OwnerID
	ctx := WithPrincipal(context.Background(), identity.Principal)
	game := "realtime-game"
	meta, err := ServiceMetadata(serviceSelector("spades-partners"), game, owner)
	if err != nil {
		t.Fatal(err)
	}
	doc, anchor, events, err := codec.Start(meta, []byte(`{"id":"realtime-game","dealer":0}`), storeTestDeal())
	if err != nil {
		t.Fatal(err)
	}
	token, err := freshID()
	if err != nil {
		t.Fatal(err)
	}
	unit, err := codec.UnitID(doc)
	if err != nil {
		t.Fatal(err)
	}
	r := CreateTransition{Document: doc, Anchor: anchor, Events: events, Admission: AccessAdmission{OwnerID: owner, Generation: 1, ControlRevision: 1, GrantID: LocalGrantID(owner, "spades", "partners"), UnitID: unit}, NewControlToken: token, TabID: "tab-a", ReceiptSchema: "AcceptedView", Receipt: []byte(`{"accepted":true}`)}
	if _, err = s.CreateAccepted(localCommand(ctx, "create-realtime"), r); err != nil {
		t.Fatal(err)
	}
	return s, other, WithControl(ctx, "tab-a", token), owner, game
}

func realtimeBid(t *testing.T, s *Store, ctx context.Context, owner, game, id string) (AcceptedTransition, context.Context) {
	t.Helper()
	loaded, err := s.Load(ctx, owner, game)
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.codec.Session(loaded.Document, loaded.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	n, err := b.Node()
	if err != nil || n.Seat == nil {
		t.Fatal("missing bid actor", err)
	}
	raw, err := sessions.EncodeOperation(sessions.ActorOperation{Kind: "actor", Seat: *n.Seat, CandidateID: "bid:1"})
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	command := CommandRecord{RecordVersion: RecordVersion, GameID: game, Revision: loaded.Document.Revision + 1, CommandID: id, Digest: tokenHash(id), Command: raw}
	command.Digest, err = CommandDigest(game, command.Revision, raw)
	if err != nil {
		t.Fatal(err)
	}
	unit, err := s.codec.CurrentUnitID(loaded.Document, loaded.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	return AcceptedTransition{Before: loaded, Command: command, Admission: AccessAdmission{OwnerID: owner, Generation: a.Generation, ControlRevision: a.ControlGeneration, GrantID: LocalGrantID(owner, "spades", "partners"), UnitID: unit}, ReceiptSchema: "AcceptedView", Receipt: []byte(`{"accepted":true}`)}, localCommand(ctx, id)
}

func TestRealtimeProjectionAtomicRevisionsAndFastRead(t *testing.T) {
	s, _, ctx, owner, game := realtimeFixture(t)
	first, err := s.ReadRealtimeProjection(ctx, owner, game)
	if err != nil {
		t.Fatal(err)
	}
	if first.Revision != 0 || first.Node.Request != nil || len(first.View) == 0 {
		t.Fatal("invalid opening projection")
	}
	request, commandCtx := realtimeBid(t, s, ctx, owner, game, "bid-one")
	if _, err = s.Commit(commandCtx, request); err != nil {
		t.Fatal(err)
	}
	cursor, err := s.RealtimeCursor(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Commit(commandCtx, request); err != nil {
		t.Fatal(err)
	}
	again, err := s.RealtimeCursor(ctx, owner)
	if err != nil || again != cursor {
		t.Fatal("idempotent command appended duplicate event", err)
	}
	events, err := s.ReadRealtimeEvents(ctx, owner, 0, MaxRealtimeBatch)
	if err != nil {
		t.Fatal(err)
	}
	var revisions []int64
	for _, event := range events {
		if event.Kind != "session" {
			continue
		}
		p, err := decodeRealtimeProjection(event.Projection, game, event.Revision)
		if err != nil {
			t.Fatal(err)
		}
		if event.Revision == 0 && !bytes.Equal(p.View, first.View) {
			t.Fatal("opening outbox projection was replaced by latest state")
		}
		revisions = append(revisions, event.Revision)
	}
	if fmt.Sprint(revisions) != "[0 1]" {
		t.Fatalf("lost revision sequence %v", revisions)
	}
	// This deliberately invalidates the private document in an isolated fixture:
	// the fast safe read must not import/replay it, while strict Load still fails.
	if _, err = s.pool.Exec(ctx, `UPDATE m03_games SET document=$2 WHERE game_id=$1`, game, []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Load(ctx, owner, game); err == nil {
		t.Fatal("fixture private document was not invalidated")
	}
	latest, err := s.ReadRealtimeProjection(ctx, owner, game)
	if err != nil || latest.Revision != 1 {
		t.Fatal("fast projection depended on private replay", err)
	}
	foreign, err := s.NewLocalIdentity(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ReadRealtimeProjection(WithPrincipal(context.Background(), foreign.Principal), owner, game); !errors.Is(err, ErrReadDenied) && !errors.Is(err, ErrUnauthenticated) {
		t.Fatal("foreign projection read", err)
	}
}

func TestRealtimeLazyProjectionAndErasure(t *testing.T) {
	s, _, ctx, owner, game := realtimeFixture(t)
	if _, err := s.pool.Exec(ctx, `DELETE FROM m05_realtime_projections WHERE game_id=$1`, game); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadRealtimeProjection(ctx, owner, game); err != nil {
		t.Fatal("lazy projection", err)
	}
	deliveries, err := s.ClaimRealtimeEvents(context.Background(), 1, time.Second)
	if err != nil || len(deliveries) != 1 {
		t.Fatal(err)
	}
	if err = s.EraseOwner(ctx); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"m05_realtime_projections", "m05_playback", "m05_realtime_outbox", "m05_realtime_streams"} {
		var count int
		if err = s.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table+" WHERE owner_id=$1", owner).Scan(&count); err != nil || count != 0 {
			t.Fatal(table, "survived erasure", count, err)
		}
	}
	if err = s.AckRealtimeEvent(context.Background(), deliveries[0]); !errors.Is(err, ErrConflict) {
		t.Fatal("erased delivery could be acknowledged", err)
	}
	if _, err = s.ReadRealtimeEvents(ctx, owner, 0, 1); err == nil {
		t.Fatal("erased credential can replay")
	}
}

func TestRealtimePublisherLeaseOrderRetryAndGap(t *testing.T) {
	s, other, ctx, owner, _ := realtimeFixture(t)
	first, err := s.ClaimRealtimeEvents(context.Background(), MaxRealtimeBatch, time.Second)
	if err != nil || len(first) != 1 {
		t.Fatalf("first claim: %d %v", len(first), err)
	}
	next, err := other.ClaimRealtimeEvents(context.Background(), MaxRealtimeBatch, time.Second)
	if err != nil || len(next) != 0 {
		t.Fatal("publisher overtook owner stream", err)
	}
	if _, err = s.pool.Exec(ctx, `UPDATE m05_realtime_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE owner_id=$1 AND sequence=$2`, owner, first[0].Sequence); err != nil {
		t.Fatal(err)
	}
	reclaimed, err := other.ClaimRealtimeEvents(context.Background(), 1, time.Second)
	if err != nil || len(reclaimed) != 1 || reclaimed[0].Sequence != first[0].Sequence || reclaimed[0].Attempt != first[0].Attempt+1 {
		t.Fatal("lease reclaim", err)
	}
	if err = s.AckRealtimeEvent(context.Background(), first[0]); !errors.Is(err, ErrConflict) {
		t.Fatal("stale publisher ack", err)
	}
	if err = other.RetryRealtimeEvent(context.Background(), reclaimed[0], 0); err != nil {
		t.Fatal(err)
	}
	retry, err := s.ClaimRealtimeEvents(context.Background(), 1, time.Second)
	if err != nil || len(retry) != 1 {
		t.Fatal(err)
	}
	if err = s.AckRealtimeEvent(context.Background(), retry[0]); err != nil {
		t.Fatal(err)
	}
	next, err = other.ClaimRealtimeEvents(context.Background(), 1, time.Second)
	if err != nil || len(next) != 1 || next[0].Sequence != first[0].Sequence+1 {
		t.Fatal("ordered next claim", err)
	}
	if _, err = s.pool.Exec(ctx, `UPDATE m05_realtime_outbox SET created_at=clock_timestamp()-interval '2 hours'`); err != nil {
		t.Fatal(err)
	}
	count, err := s.PurgeRealtimeEvents(context.Background(), time.Hour, 4096)
	if err != nil || count == 0 {
		t.Fatal("bounded purge", err)
	}
	if _, err = s.ReadRealtimeEvents(ctx, owner, 0, 1); !errors.Is(err, ErrRealtimeGap) {
		t.Fatal("expired cursor did not recover", err)
	}
	cursor, err := s.RealtimeCursor(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ReadRealtimeEvents(ctx, owner, cursor, 1); err != nil {
		t.Fatal("current cursor rejected", err)
	}
}

func TestRealtimeWorkTerminalIsDurable(t *testing.T) {
	s, _, loaded, _, a := workFixture(t, 3, true)
	ctx := context.Background()
	w, err := s.QueueWork(ctx, workRequest(t, s, loaded, a, 0, "human-analysis"))
	if err != nil {
		t.Fatal(err)
	}
	lease, err := s.ClaimWork(ctx, a.OwnerID, w.ID, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	before, err := s.RealtimeCursor(ctx, a.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.FinishWork(ctx, a.OwnerID, lease, "rejected"); err != nil {
		t.Fatal(err)
	}
	events, err := s.ReadRealtimeEvents(ctx, a.OwnerID, before, 5)
	if err != nil || len(events) != 1 {
		t.Fatal("terminal event", err)
	}
	if events[0].Kind != "work" || events[0].WorkID != w.ID || events[0].Status != "rejected" || len(events[0].Projection) != 0 {
		t.Fatal("unsafe or missing terminal identity")
	}
	if err = s.FinishWork(ctx, a.OwnerID, lease, "canceled"); !errors.Is(err, ErrWorkStale) {
		t.Fatal("terminal changed", err)
	}
}

func TestRealtimeOutboxRollbackWakeAndBoundedPrefix(t *testing.T) {
	s, _, ctx, owner, _ := realtimeFixture(t)
	for {
		select {
		case <-s.RealtimeWake():
			continue
		default:
		}
		break
	}
	before, err := s.RealtimeCursor(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT m05_realtime_append($1,'access')`, owner); err != nil {
			return err
		}
		return ErrConflict
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatal(err)
	}
	after, err := s.RealtimeCursor(ctx, owner)
	if err != nil || after != before {
		t.Fatal("rolled-back transaction leaked cursor", err)
	}
	select {
	case <-s.RealtimeWake():
		t.Fatal("rollback woke publisher")
	default:
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT m05_realtime_append($1,'access') FROM generate_series(1,520)`, owner)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-s.RealtimeWake():
	default:
		t.Fatal("committed outbox did not wake publisher")
	}
	var count int
	if err = s.pool.QueryRow(ctx, `SELECT count(*) FROM m05_realtime_outbox WHERE owner_id=$1`, owner).Scan(&count); err != nil || count != 512 {
		t.Fatal("unbounded retained events", count, err)
	}
	if _, err = s.ReadRealtimeEvents(ctx, owner, before, 1); !errors.Is(err, ErrRealtimeGap) {
		t.Fatal("overflow silently lost prefix", err)
	}
	head, err := s.RealtimeCursor(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	events, err := s.ReadRealtimeEvents(ctx, owner, head-512, MaxRealtimeBatch)
	if err != nil || len(events) != MaxRealtimeBatch || events[0].Sequence != head-511 {
		t.Fatal("retained prefix boundary", err)
	}
}

func TestRealtimePlaybackPauseFencesInFlightCommit(t *testing.T) {
	s, other, ctx, owner, game := realtimeFixture(t)
	a, err := s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	resumeCtx := localCommand(ctx, "resume")
	resume, err := s.SetPlayback(resumeCtx, game, a.ControlGeneration, 0, true, "process-a")
	if err != nil {
		t.Fatal(err)
	}
	if !resume.Running || resume.Generation != 1 {
		t.Fatal(resume)
	}
	request, commandCtx := realtimeBid(t, s, ctx, owner, game, "paused-bid")
	commandCtx = WithPlayback(commandCtx, game, resume.Generation, "process-a")
	paused, err := other.SetPlayback(localCommand(ctx, "pause"), game, a.ControlGeneration, resume.Generation, false, "process-a")
	if err != nil {
		t.Fatal(err)
	}
	if paused.Running || paused.Generation != 2 {
		t.Fatal(paused)
	}
	if _, err = s.Commit(commandCtx, request); !errors.Is(err, ErrControl) {
		t.Fatal("paused bot committed", err)
	}
	again, err := s.SetPlayback(resumeCtx, game, a.ControlGeneration, 0, true, "process-a")
	resumeBytes, _ := json.Marshal(resume)
	againBytes, _ := json.Marshal(again)
	if err != nil || !bytes.Equal(resumeBytes, againBytes) {
		t.Fatal("resume receipt changed", err)
	}
	current, err := s.ReadPlayback(ctx, owner, game, "process-a")
	if err != nil || current.Running || current.Generation != paused.Generation || current.ExpiresAt == nil || !current.ExpiresAt.Equal(*paused.ExpiresAt) {
		t.Fatal("reconciled resume restarted playback", err)
	}
	resumed, err := s.SetPlayback(localCommand(ctx, "resume-2"), game, a.ControlGeneration, paused.Generation, true, "process-a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Commit(WithPlayback(commandCtx, game, resumed.Generation, "process-a"), request); err != nil {
		t.Fatal(err)
	}
	restarted, err := s.ReadPlayback(ctx, owner, game, "process-b")
	if err != nil || !restarted.Running || restarted.Generation != resumed.Generation {
		t.Fatal("foreign replica changed live permission", err)
	}
	if _, err = s.RenewForeground(ctx, game, a.ControlGeneration, resumed.Generation, 1, "process-b"); !errors.Is(err, ErrControl) {
		t.Fatal("new instance renewed old run without explicit resume", err)
	}
	if err = s.StopPlayback(ctx, owner, game, resume.Generation, "process-a"); err != nil {
		t.Fatal(err)
	}
	current, err = s.ReadPlayback(ctx, owner, game, "process-a")
	if err != nil || !current.Running {
		t.Fatal("old failure stopped newer run", err)
	}
	if err = s.StopPlayback(ctx, owner, game, resumed.Generation, "process-a"); err != nil {
		t.Fatal(err)
	}
	current, err = s.ReadPlayback(ctx, owner, game, "process-a")
	if err != nil || current.Running || current.Generation != resumed.Generation+1 {
		t.Fatal("failure stop not persisted", err)
	}
	raw, _ := json.Marshal(current)
	if current.Phase != "paused" || current.PausedAt == nil || current.ExpiresAt == nil || current.PauseReason == nil || *current.PauseReason != "service_unavailable" {
		t.Fatal(string(raw))
	}
}
