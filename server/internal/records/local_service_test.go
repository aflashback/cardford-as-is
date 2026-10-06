package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func localCommand(ctx context.Context, id string) context.Context {
	return WithServiceCommand(ctx, ServiceCommand{ID: id, Digest: tokenHash(id), Kind: "test"})
}

func TestM04LocalActivationRejectsSharedOrRemoteConfiguration(t *testing.T) {
	for _, test := range []struct {
		url, schema string
		local       bool
		codec       *DocumentCodec
	}{
		{"postgres://fixture@127.0.0.1/cardford_windows", "m03_default", false, nil},
		{"postgres://fixture@127.0.0.1/cardford_windows", "public", true, storeTestCodec()},
		{"postgres://fixture@203.0.113.1/cardford_windows", "cardford_go_local", true, storeTestCodec()},
		{"postgres://fixture@127.0.0.1/cardford_windows", "cardford_go_local", true, nil},
		{"host=127.0.0.1,203.0.113.1 dbname=cardford_windows user=fixture sslmode=disable", "cardford_go_local", true, storeTestCodec()},
	} {
		store, err := OpenStore(context.Background(), test.url, StoreOptions{Schema: test.schema, LocalService: test.local, Codec: test.codec})
		if err == nil {
			store.Close()
			t.Fatal("unsafe activation configuration accepted")
		}
	}
}
func localOpening(t *testing.T, s *Store, identity Identity, id string) (CreateTransition, context.Context) {
	t.Helper()
	ctx := WithPrincipal(context.Background(), identity.Principal)
	meta := PracticeMetadata("spades-partners", id, identity.Principal.OwnerID, storeTestPolicy())
	config, _ := json.Marshal(map[string]any{"id": id, "mode": "spades-partners", "dealer": 0})
	doc, anchor, events, err := s.codec.Start(meta, config, storeTestDeal())
	if err != nil {
		t.Fatal(err)
	}
	lease, err := freshID()
	if err != nil {
		t.Fatal(err)
	}
	return CreateTransition{Document: doc, Anchor: anchor, Events: events, Admission: AccessAdmission{OwnerID: identity.Principal.OwnerID, Generation: 1, ControlRevision: 1, GrantID: LocalGrantID(identity.Principal.OwnerID, "spades", "partners"), UnitID: "hand-1"}, TabID: "tab-a", NewControlToken: lease, ReceiptSchema: "AcceptedView", Receipt: []byte("{\n\"accepted\":true\n}")}, ctx
}

func TestM04LocalIdentityBootstrapControlReceiptAndErasure(t *testing.T) {
	s, other := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewLocalIdentity(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := s.NewLocalIdentity(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	s.localService = true
	other.localService = true
	principal, err := other.Authenticate(context.Background(), identity.Token)
	if err != nil || principal.OwnerID != identity.Principal.OwnerID {
		t.Fatalf("durable identity: %v", err)
	}
	if _, err = s.ReadAccess(context.Background(), principal.OwnerID); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("missing authentication: %v", err)
	}
	opening, ctx := localOpening(t, s, identity, "m04-local-game")
	created, err := s.CreateAccepted(localCommand(ctx, "bootstrap"), opening)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(created.Receipt, opening.Receipt) {
		t.Fatal("opening receipt changed")
	}
	again, err := other.CreateAccepted(localCommand(ctx, "bootstrap"), opening)
	if err != nil || !again.Reconciled || !bytes.Equal(again.Receipt, created.Receipt) {
		t.Fatalf("bootstrap recovery: %v", err)
	}
	if _, err = other.ReconcileService(WithPrincipal(context.Background(), foreign.Principal), "bootstrap", tokenHash("bootstrap")); !errors.Is(err, ErrConflict) {
		t.Fatalf("foreign receipt: %v", err)
	}
	if _, err = s.ReconcileService(ctx, "bootstrap", tokenHash("different")); !errors.Is(err, ErrCommandDigest) {
		t.Fatalf("different public intent accepted: %v", err)
	}
	if _, err = s.Load(WithPrincipal(context.Background(), foreign.Principal), principal.OwnerID, "m04-local-game"); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("foreign game: %v", err)
	}
	mutationCtx := WithControl(ctx, "tab-a", opening.NewControlToken)
	access, err := s.ReadAccess(ctx, principal.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	if access.Generation != 2 || access.ControlGeneration != 2 {
		t.Fatalf("bootstrap generations: %+v", access)
	}
	a := opening.Admission
	a.Generation = access.Generation
	a.ControlRevision = access.ControlGeneration
	loaded, err := s.Load(ctx, principal.OwnerID, "m04-local-game")
	if err != nil {
		t.Fatal(err)
	}
	d := storeTestDecision(t, s, loaded, a)
	work, err := s.QueueWork(mutationCtx, WorkRequest{GameID: d.GameID, Revision: d.Revision, Actor: d.Actor, WindowID: d.WindowID, Purpose: d.Purpose, InputDigest: d.InputDigest, Policy: d.Policy, Admission: a, Lifetime: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	lease, err := s.ClaimWork(mutationCtx, principal.OwnerID, work.ID, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	d.AttemptID = lease.WorkID
	d.AttemptFence = lease.Fence
	prepared, err := s.PublishWork(mutationCtx, principal.OwnerID, lease, d)
	if err != nil {
		t.Fatal(err)
	}
	req := storeTestBid(t, loaded, a, "bid")
	req.Decisions = []DecisionRecord{prepared}
	accepted, err := s.Commit(localCommand(mutationCtx, "bid"), req)
	if err != nil {
		t.Fatal(err)
	}
	taken, err := other.AcquireControl(localCommand(ctx, "takeover"), ControlRequest{ExpectedGameID: d.GameID, ExpectedRevision: 1, ExpectedControlGeneration: 2, TabID: "tab-b"})
	if err != nil {
		t.Fatal(err)
	}
	repeated, err := s.AcquireControl(localCommand(ctx, "takeover"), ControlRequest{ExpectedGameID: d.GameID, ExpectedRevision: 0, ExpectedControlGeneration: 1, TabID: "tab-b"})
	if err != nil || taken != repeated {
		t.Fatalf("takeover recovery: %v", err)
	}
	refreshed, err := s.Load(ctx, principal.OwnerID, d.GameID)
	if err != nil {
		t.Fatal(err)
	}
	stale := storeTestRequest(t, refreshed, a, "stale", []byte(`{"type":"action","action":{"kind":"bid","seat":2,"bid":3}}`))
	if _, err = s.Commit(localCommand(mutationCtx, "stale"), stale); !errors.Is(err, ErrControl) {
		t.Fatalf("old control accepted: %v", err)
	}
	replacement, _ := localOpening(t, s, identity, "m04-replacement")
	replacement.ExpectedActiveGameID = d.GameID
	oldRevision := int64(0)
	replacement.ExpectedRevision = &oldRevision
	replacement.Admission.Generation = taken.AccessGeneration
	replacement.Admission.ControlRevision = taken.ControlGeneration
	newControl := WithControl(ctx, "tab-b", taken.Token)
	if _, err = s.CreateAccepted(localCommand(newControl, "stale-replace"), replacement); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale replacement accepted: %v", err)
	}
	oldRevision = 1
	if _, err = s.CreateAccepted(localCommand(newControl, "replace"), replacement); err != nil {
		t.Fatal(err)
	}
	recovered, err := s.ReconcileService(mutationCtx, "bid", tokenHash("bid"))
	if err != nil || !bytes.Equal(recovered.Receipt, accepted.Receipt) {
		t.Fatalf("receipt after control loss: %v", err)
	}
	if _, err = s.pool.Exec(context.Background(), "DELETE FROM m03_decisions WHERE owner_id=$1", principal.OwnerID); err == nil {
		t.Fatal("ordinary immutable delete allowed")
	}
	if err = s.EraseOwner(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Authenticate(context.Background(), identity.Token); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("erased token remains: %v", err)
	}
	if _, err = s.Authenticate(context.Background(), foreign.Token); err != nil {
		t.Fatalf("foreign owner erased: %v", err)
	}
	for _, table := range []string{"m03_access", "m03_games", "m03_commands", "m03_decisions", "m03_work", "m03_grants", "m04_sessions", "m04_controls", "m04_service_commands"} {
		var count int
		if err = s.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+s.table(table)+" WHERE owner_id=$1", principal.OwnerID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("erasure %s: %d %v", table, count, err)
		}
	}
}

func TestM04RevocationAndLeaseExpiryFencePublication(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewLocalIdentity(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	r, ctx := localOpening(t, s, identity, "m04-revocation")
	if _, err = s.CreateAccepted(localCommand(ctx, "open"), r); err != nil {
		t.Fatal(err)
	}
	controlCtx := WithControl(ctx, "tab-a", r.NewControlToken)
	loaded, err := s.Load(ctx, identity.Principal.OwnerID, r.Document.Metadata.GameID)
	if err != nil {
		t.Fatal(err)
	}
	a := r.Admission
	a.Generation++
	a.ControlRevision++
	if err = s.RevokeGrant(ctx, a.OwnerID, a.GrantID); err != nil {
		t.Fatal(err)
	}
	taken, err := s.AcquireControl(localCommand(ctx, "diverged-control"), ControlRequest{ExpectedGameID: r.Document.Metadata.GameID, ExpectedRevision: 0, ExpectedControlGeneration: a.ControlRevision, TabID: "tab-b"})
	if err != nil || taken.AccessGeneration != 4 || taken.ControlGeneration != 3 {
		t.Fatalf("control/access generation divergence: %+v %v", taken, err)
	}
	a.Generation = taken.AccessGeneration
	a.ControlRevision = taken.ControlGeneration
	controlCtx = WithControl(ctx, "tab-b", taken.Token)
	if _, err = s.pool.Exec(context.Background(), "UPDATE m04_controls SET expires_at=clock_timestamp()-interval '1 second' WHERE owner_id=$1", a.OwnerID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Commit(localCommand(controlCtx, "expired"), storeTestBid(t, loaded, a, "expired")); !errors.Is(err, ErrControl) {
		t.Fatalf("expired lease accepted: %v", err)
	}
	if err = s.RevokeSession(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ReconcileService(ctx, "open", tokenHash("open")); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("revoked receipt read: %v", err)
	}
	if _, err = s.Commit(localCommand(controlCtx, "revoked"), storeTestBid(t, loaded, a, "revoked")); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("revoked mutation: %v", err)
	}
}

func TestM04CancellationStageAndPoolRecovery(t *testing.T) {
	s, other := storeTestOpen(t, storeTestCodec())
	loaded, a := storeTestGame(t, s, "m04-cancellation")
	blocker, err := other.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Rollback(context.Background())
	if _, err = blocker.Exec(context.Background(), "SELECT 1 FROM m03_access WHERE owner_id=$1 FOR UPDATE", a.OwnerID); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 350*time.Millisecond)
	request := storeTestBid(t, loaded, a, "canceled")
	result := make(chan error, 1)
	go func() { _, e := s.Commit(ctx, request); result <- e }()
	observed := false
	for ctx.Err() == nil {
		var pid int
		var waitType, blockers string
		e := other.pool.QueryRow(context.Background(), "SELECT pid,wait_event_type,pg_blocking_pids(pid)::text FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' LIMIT 1", "cardford:"+s.schema).Scan(&pid, &waitType, &blockers)
		if e == nil {
			t.Logf("cancellation blocker snapshot: pid=%d wait=%s blockers=%s", pid, waitType, blockers)
			observed = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	err = <-result
	cancel()
	if !observed {
		t.Fatal("did not observe controlled lock wait before cancellation")
	}
	var stage *StageError
	if !errors.Is(err, context.DeadlineExceeded) || !errors.As(err, &stage) || !strings.Contains(stage.Stage, "reconcile") {
		t.Fatalf("missing cancellation stage: %v", err)
	}
	if err = blocker.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for s.pool.Stat().AcquiredConns() != 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if s.pool.Stat().AcquiredConns() != 0 {
		t.Fatal("canceled transaction retained a pooled connection")
	}
	fresh, err := s.Load(context.Background(), a.OwnerID, loaded.Document.Metadata.GameID)
	if err != nil || fresh.Document.Revision != 0 {
		t.Fatalf("post-cancel read: %v", err)
	}
	if _, err = s.Commit(context.Background(), storeTestBid(t, fresh, a, "recovered")); err != nil {
		t.Fatal(err)
	}
	// The cleanup helper closes both pools before dropping the isolated schema.
	var held int
	if err = other.pool.QueryRow(context.Background(), "SELECT count(*) FROM pg_stat_activity WHERE application_name=$1 AND state='idle in transaction' AND pid<>pg_backend_pid()", "cardford:"+s.schema).Scan(&held); err != nil {
		t.Fatal(err)
	}
	if held != 0 {
		t.Fatalf("idle transactions after cancellation: %d", held)
	}
}

func TestM04AdviceDeliveryExposureAndFinalAuthentication(t *testing.T) {
	s, _, loaded, _, a := workFixture(t, 3, true)
	w, err := s.QueueWork(context.Background(), workRequest(t, s, loaded, a, 0, "coach-advice"))
	if err != nil {
		t.Fatal(err)
	}
	lease, err := s.ClaimWork(context.Background(), a.OwnerID, w.ID, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	d, err := s.PublishWork(context.Background(), a.OwnerID, lease, workDecision(t, w, lease, "delivery"))
	if err != nil {
		t.Fatal(err)
	}
	token, err := freshID()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.pool.Exec(context.Background(), "INSERT INTO m04_sessions(token_hash,owner_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')", tokenHash(token), a.OwnerID); err != nil {
		t.Fatal(err)
	}
	p, err := s.Authenticate(context.Background(), token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithPrincipal(context.Background(), p)
	access, err := s.ReadAccess(ctx, a.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	access, err = s.ChangeAccess(ctx, a.OwnerID, access.Generation, AccessChange{ActiveGameID: d.GameID, CanRead: true, CanPlay: true, CanCoach: false})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ReadDecisionForDelivery(ctx, a.OwnerID, d.ID); !errors.Is(err, ErrAccess) {
		t.Fatalf("unexposed advice bypassed coaching revocation: %v", err)
	}
	var deniedExposures int
	if err = s.pool.QueryRow(ctx, "SELECT count(*) FROM m03_exposures WHERE decision_id=$1", d.ID).Scan(&deniedExposures); err != nil || deniedExposures != 0 {
		t.Fatalf("denied advice recorded as delivered: %d %v", deniedExposures, err)
	}
	access, err = s.ChangeAccess(ctx, a.OwnerID, access.Generation, AccessChange{ActiveGameID: d.GameID, CanRead: true, CanPlay: true, CanCoach: true})
	if err != nil {
		t.Fatal(err)
	}
	delivered, err := s.ReadDecisionForDelivery(ctx, a.OwnerID, d.ID)
	if err != nil || !SamePreparedBytes(delivered, d) {
		t.Fatalf("original delivery: %v", err)
	}
	var count int
	if err = s.pool.QueryRow(ctx, "SELECT count(*) FROM m03_exposures WHERE decision_id=$1", d.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("delivery exposure: %d %v", count, err)
	}
	var raw []byte
	if err = s.pool.QueryRow(ctx, "SELECT record FROM m03_exposures WHERE decision_id=$1", d.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var exposure ExposureRecord
	if err = json.Unmarshal(raw, &exposure); err != nil {
		t.Fatal(err)
	}
	if err = ValidateExposure(exposure, d); err != nil {
		t.Fatal(err)
	}
	if err = s.RevokeGrant(ctx, a.OwnerID, a.GrantID); err != nil {
		t.Fatal(err)
	}
	access, err = s.ReadAccess(ctx, a.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ChangeAccess(ctx, a.OwnerID, access.Generation, AccessChange{ActiveGameID: d.GameID, CanRead: true, CanPlay: false, CanCoach: false}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadDecisionForDelivery(ctx, a.OwnerID, d.ID); !errors.Is(err, ErrAccess) {
		t.Fatalf("security grant revocation failed to fence saved delivery: %v", err)
	}
	if err = s.RevokeSession(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.appendValidatedExposure(ctx, exposure, d); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("final exposure authentication missing: %v", err)
	}
}
