package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func workFixture(t *testing.T, dealer int, coach bool) (*Store, *Store, *Loaded, Grant, AccessAdmission) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	id, _ := freshID()
	schema := "m03_work_" + id[:16]
	policy := PolicyPin{ID: "m03-fixture", Version: "1.0.0", BudgetVersion: "bounded-1", Components: []ComponentVersion{{ID: "recorded-fixture", Version: "1"}}}
	codec := NewDocumentCodec()
	if err := codec.RegisterPolicy(PolicyRegistration{Module: OriginalPin("spades-solo"), Policy: policy, PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}); err != nil {
		t.Fatal(err)
	}
	s, err := OpenStore(context.Background(), url, StoreOptions{Schema: schema, CreateSchema: true, Codec: codec})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		s.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		admin, err := pgx.Connect(ctx, url)
		if err != nil {
			t.Error(err)
			return
		}
		defer admin.Close(ctx)
		if _, err = admin.Exec(ctx, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE"); err != nil {
			t.Error(err)
		}
	})
	if err = s.ApplyMigrations(context.Background(), filepath.Join("..", "..", "..", "web", "server", "records", "migrations")); err != nil {
		t.Fatal(err)
	}
	s2, err := OpenStore(context.Background(), url, StoreOptions{Schema: schema, Codec: codec})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s2.Close)
	ctx := context.Background()
	if err = s.CreateAccess(ctx, "owner"); err != nil {
		t.Fatal(err)
	}
	g := Grant{ID: "grant", OwnerID: "owner", OfferID: "fixture-offer", OfferVersion: "1", SourceKind: "free", SourceID: "fixture", ValidFrom: time.Now().Add(-time.Hour), Terms: GrantTerms{Version: RecordVersion, Game: "spades", Variant: "solo", CanPlay: true, CanCoach: coach, Tools: []string{}, BucketID: "stable-coaching", Period: "day", Timezone: "UTC", Limit: 1, ExpiryRule: "pause-at-expiry"}}
	if coach {
		g.Terms.Tools = []string{"advice", "review-alternative"}
	}
	if err = s.PutGrant(ctx, g); err != nil {
		t.Fatal(err)
	}
	a, err := s.ReadAccess(ctx, "owner")
	if err != nil {
		t.Fatal(err)
	}
	a, err = s.ChangeAccess(ctx, "owner", a.Generation, AccessChange{CanRead: true, CanPlay: true, CanCoach: coach})
	if err != nil {
		t.Fatal(err)
	}
	admission := AccessAdmission{OwnerID: "owner", Generation: a.Generation, ControlRevision: a.ControlGeneration, GrantID: g.ID, UnitID: "hand-1"}
	var deck []string
	for _, suit := range []string{"C", "D", "H", "S"} {
		for _, rank := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, suit+rank)
		}
	}
	config, _ := json.Marshal(map[string]any{"id": "game", "mode": "spades-solo", "dealer": dealer})
	doc, anchor, events, err := codec.Start(PracticeMetadata("spades-solo", "game", "owner", policy), config, deck)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Create(ctx, doc, anchor, events, admission, "v1:0:bid"); err != nil {
		t.Fatal(err)
	}
	a, err = s.ReadAccess(ctx, "owner")
	if err != nil {
		t.Fatal(err)
	}
	admission.Generation = a.Generation
	admission.ControlRevision = a.ControlGeneration
	loaded, err := s.Load(ctx, "owner", "game")
	if err != nil {
		t.Fatal(err)
	}
	return s, s2, loaded, g, admission
}

func workRequest(t *testing.T, s *Store, loaded *Loaded, a AccessAdmission, actor int, purpose string) WorkRequest {
	t.Helper()
	_, digest, window, err := s.codec.PermittedInput(loaded.Document, loaded.Snapshot, actor)
	if err != nil {
		t.Fatal(err)
	}
	return WorkRequest{GameID: loaded.Document.Metadata.GameID, Revision: loaded.Document.Revision, Actor: actor, WindowID: window, Purpose: purpose, InputDigest: digest, Policy: loaded.Document.Metadata.Policy, Admission: a, Lifetime: time.Minute}
}
func workDecision(t *testing.T, w PreparedWork, lease WorkLease, marker string) DecisionRecord {
	t.Helper()
	r := w.Request
	analysis := []byte(`{ "publicSchemaVersion":"2.0.0","gameId":"spades","variantId":"solo","origin":"demo","selectedCandidateId":"bid:1","objective":{"id":"fixture","version":"1","metric":"points","direction":"higher"},"horizon":{"id":"fixture","version":"1","scope":"hand"},"facts":[],"estimates":[],"scenarios":[],"assumptions":["` + marker + `"] }`)
	advice := []byte(`{ "focus":"Fixture","notice":"Original","reason":"Recorded fixture","suggestion":"Bid one","bid":1,"source":"code","decisionId":"decision-` + w.ID + `","requestedLevel":1,"policyVersion":"1.0.0" }`)
	return DecisionRecord{RecordVersion: RecordVersion, ID: "decision-" + w.ID, OwnerID: r.Admission.OwnerID, GameID: r.GameID, Revision: r.Revision, Actor: r.Actor, WindowID: r.WindowID, Purpose: r.Purpose, PacketVersion: "1.0.0", InputDigest: r.InputDigest, Policy: r.Policy, SelectedCandidateID: "bid:1", AnalysisSchema: "RegisteredAnalysis", Analysis: analysis, AdviceSchema: "AdviceView", Advice: advice, Access: r.Admission, ReceiptID: "receipt-" + w.ID, AttemptID: lease.WorkID, AttemptFence: lease.Fence}
}

func TestM03WorkTwoInstancesReclaimAndImmutableReceipt(t *testing.T) {
	s, s2, loaded, _, admission := workFixture(t, 3, true)
	ctx := context.Background()
	request := workRequest(t, s, loaded, admission, 0, "human-analysis")
	var works [2]PreparedWork
	var errs [2]error
	var wg sync.WaitGroup
	for i, store := range []*Store{s, s2} {
		wg.Add(1)
		go func(i int, store *Store) { defer wg.Done(); works[i], errs[i] = store.QueueWork(ctx, request) }(i, store)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if works[0].ID != works[1].ID {
		t.Fatal("duplicate logical work dispatched")
	}
	first, err := s.ClaimWork(ctx, "owner", works[0].ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s2.ClaimWork(ctx, "owner", works[0].ID, time.Second); !errors.Is(err, ErrWorkBusy) {
		t.Fatalf("live duplicate: %v", err)
	}
	if s.pool.Stat().AcquiredConns() != 0 || s2.pool.Stat().AcquiredConns() != 0 {
		t.Fatal("connection retained for expensive work")
	}
	if _, err = s.pool.Exec(ctx, "UPDATE m03_work SET lease_until=clock_timestamp()-interval '1 second' WHERE work_id=$1", works[0].ID); err != nil {
		t.Fatal(err)
	}
	second, err := s2.ClaimWork(ctx, "owner", works[0].ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	if second.Fence != first.Fence+1 {
		t.Fatal("attempt not fenced")
	}
	if _, err = s.PublishWork(ctx, "owner", first, workDecision(t, works[0], first, "old")); !errors.Is(err, ErrWorkStale) {
		t.Fatalf("old crashed attempt published: %v", err)
	}
	original := workDecision(t, works[0], second, "first-issued")
	issued, err := s2.PublishWork(ctx, "owner", second, original)
	if err != nil {
		t.Fatal(err)
	}
	retried, err := s.PublishWork(ctx, "owner", first, workDecision(t, works[0], first, "replacement"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(issued.Analysis, original.Analysis) || !SamePreparedBytes(issued, retried) {
		t.Fatal("original receipt replaced or reformatted")
	}
	var count int
	if err = s.pool.QueryRow(ctx, "SELECT count(*) FROM m03_decisions").Scan(&count); err != nil || count != 1 {
		t.Fatalf("decision bytes duplicated: %d %v", count, err)
	}
	access, _ := s.ReadAccess(ctx, "owner")
	if _, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, ActiveGameID: "other-game", ChangeControl: true}); err != nil {
		t.Fatal(err)
	}
	saved, err := s2.ReadPrepared(ctx, "owner", works[0].ID)
	if err != nil || !SamePreparedBytes(saved, original) {
		t.Fatalf("owned original not retained after access change: %v", err)
	}
	if _, err = s.ReadPrepared(ctx, "outsider", works[0].ID); !errors.Is(err, ErrReadDenied) {
		t.Fatal("other owner read result")
	}
}

func TestM03WorkAdmissionFences(t *testing.T) {
	for _, change := range []string{"revoke-regrant", "control", "window", "revision"} {
		t.Run(change, func(t *testing.T) {
			s, s2, loaded, _, a := workFixture(t, 3, true)
			ctx := context.Background()
			w, err := s.QueueWork(ctx, workRequest(t, s, loaded, a, 0, "human-analysis"))
			if err != nil {
				t.Fatal(err)
			}
			lease, err := s.ClaimWork(ctx, "owner", w.ID, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			switch change {
			case "revoke-regrant":
				access, _ := s.ReadAccess(ctx, "owner")
				access, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, ActiveGameID: "game"})
				if err == nil {
					_, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, CanPlay: true, CanCoach: true, ActiveGameID: "game"})
				}
			case "control":
				access, _ := s.ReadAccess(ctx, "owner")
				_, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, CanPlay: true, CanCoach: true, ActiveGameID: "game", ChangeControl: true})
			case "window":
				_, err = s.pool.Exec(ctx, "UPDATE m03_games SET window_id='changed' WHERE game_id='game'")
			case "revision":
				_, err = s.pool.Exec(ctx, "UPDATE m03_games SET revision=revision+1 WHERE game_id='game'")
			}
			if err != nil {
				t.Fatal(err)
			}
			if _, err = s2.PublishWork(ctx, "owner", lease, workDecision(t, w, lease, "stale")); err == nil {
				t.Fatal("stale work published")
			}
			var n int
			if err = s.pool.QueryRow(ctx, "SELECT count(*) FROM m03_decisions").Scan(&n); err != nil || n != 0 {
				t.Fatalf("stale audit persisted: %d %v", n, err)
			}
		})
	}
}

func TestM03WorkPlayOnlyBaselineAndToolFence(t *testing.T) {
	for _, tc := range []struct {
		dealer, actor int
		purpose       string
	}{{3, 0, "human-analysis"}, {0, 1, "bot-action"}} {
		t.Run(tc.purpose, func(t *testing.T) {
			s, _, loaded, _, a := workFixture(t, tc.dealer, false)
			ctx := context.Background()
			r := workRequest(t, s, loaded, a, tc.actor, tc.purpose)
			w, err := s.QueueWork(ctx, r)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = s.ClaimWork(ctx, "owner", w.ID, time.Second); err != nil {
				t.Fatal(err)
			}
			r.Purpose = "coach-advice"
			if _, err = s.QueueWork(ctx, r); err == nil {
				t.Fatal("play-only advice work admitted")
			}
		})
	}
	s, _, loaded, g, a := workFixture(t, 3, true)
	wrongUnit := a
	wrongUnit.UnitID = "hand-999"
	if _, err := s.QueueWork(context.Background(), workRequest(t, s, loaded, wrongUnit, 0, "human-analysis")); !errors.Is(err, ErrAccess) {
		t.Fatalf("work admitted invented unit: %v", err)
	}
	g.ID = "without-tool"
	g.Terms.Tools = []string{}
	if err := s.PutGrant(context.Background(), g); err != nil {
		t.Fatal(err)
	}
	access, _ := s.ReadAccess(context.Background(), "owner")
	a.Generation = access.Generation
	a.GrantID = g.ID
	if _, err := s.QueueWork(context.Background(), workRequest(t, s, loaded, a, 0, "coach-advice")); !errors.Is(err, ErrAccess) {
		t.Fatalf("wrong tool admitted: %v", err)
	}
	g.ID = "coach-only"
	g.Terms.CanPlay = false
	g.Terms.Tools = []string{"advice"}
	if err := s.PutGrant(context.Background(), g); err != nil {
		t.Fatal(err)
	}
	access, _ = s.ReadAccess(context.Background(), "owner")
	a.Generation = access.Generation
	a.GrantID = g.ID
	if _, err := s.QueueWork(context.Background(), workRequest(t, s, loaded, a, 0, "coach-advice")); err != nil {
		t.Fatalf("independent coaching grant denied despite current play permission: %v", err)
	}
	if _, err := s.QueueWork(context.Background(), workRequest(t, s, loaded, a, 0, "human-analysis")); !errors.Is(err, ErrAccess) {
		t.Fatalf("coaching grant silently broadened to play: %v", err)
	}
}

func TestM03WorkFiniteExpiryRequeueAndCancel(t *testing.T) {
	s, s2, loaded, _, a := workFixture(t, 3, true)
	ctx := context.Background()
	r := workRequest(t, s, loaded, a, 0, "human-analysis")
	r.Lifetime = MaxWorkLifetime + time.Second
	if _, err := s.QueueWork(ctx, r); !errors.Is(err, ErrWorkStale) {
		t.Fatal("unbounded work accepted")
	}
	r.Lifetime = time.Minute
	w, err := s.QueueWork(ctx, r)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.FinishWork(ctx, "owner", WorkLease{WorkID: w.ID, Fence: w.Attempt}, "canceled"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.RequeueWork(ctx, "owner", w.ID, time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ClaimWork(ctx, "owner", w.ID, MaxWorkLease+time.Second); !errors.Is(err, ErrWorkStale) {
		t.Fatal("unbounded lease accepted")
	}
	lease, err := s.ClaimWork(ctx, "owner", w.ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s2.RequeueWork(ctx, "owner", w.ID, time.Minute); !errors.Is(err, ErrWorkBusy) {
		t.Fatal("live attempt restarted")
	}
	if _, err = s.pool.Exec(ctx, "UPDATE m03_work SET expires_at=clock_timestamp()-interval '1 second' WHERE work_id=$1", w.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s2.ClaimWork(ctx, "owner", w.ID, MaxWorkLease); !errors.Is(err, ErrWorkStale) {
		t.Fatal("expired work claimed")
	}
	retried, err := s2.RequeueWork(ctx, "owner", w.ID, time.Minute)
	if err != nil || retried.ID != w.ID || retried.Status != "queued" {
		t.Fatalf("same durable identity not recoverable: %v", err)
	}
	next, err := s2.ClaimWork(ctx, "owner", w.ID, MaxWorkLease)
	if err != nil || next.Fence != lease.Fence+1 {
		t.Fatalf("retry fence mismatch: %v", err)
	}
	if err = s.FinishWork(ctx, "owner", lease, "canceled"); !errors.Is(err, ErrWorkStale) {
		t.Fatal("old attempt canceled new work")
	}
	if err = s2.FinishWork(ctx, "owner", next, "canceled"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.PublishWork(ctx, "owner", next, workDecision(t, w, next, "canceled")); !errors.Is(err, ErrWorkStale) {
		t.Fatalf("canceled work published: %v", err)
	}
	if _, err = s.RequeueWork(ctx, "owner", w.ID, time.Minute); err != nil {
		t.Fatal(err)
	}
	final, err := s.ClaimWork(ctx, "owner", w.ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.PublishWork(ctx, "owner", final, workDecision(t, w, final, "final")); err != nil {
		t.Fatal(err)
	}
	if _, err = s.RequeueWork(ctx, "owner", w.ID, time.Minute); !errors.Is(err, ErrWorkStale) {
		t.Fatal("issued receipt reopened")
	}
}

func TestM03ExpiredIssuedWorkCannotAcceptNewCommand(t *testing.T) {
	s, s2, loaded, _, a := workFixture(t, 3, true)
	ctx := context.Background()
	r := workRequest(t, s, loaded, a, 0, "human-analysis")
	r.Lifetime = 2 * time.Second
	w, err := s.QueueWork(ctx, r)
	if err != nil {
		t.Fatal(err)
	}
	lease, err := s.ClaimWork(ctx, "owner", w.ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	d := workDecision(t, w, lease, "issued-expiring")
	if _, err = s.PublishWork(ctx, "owner", lease, d); err != nil {
		t.Fatal(err)
	}
	if _, err = s.RetryExpiredResult(ctx, "owner", w.ID, time.Minute); !errors.Is(err, ErrWorkStale) {
		t.Fatal("unexpired receipt renewed")
	}
	arbitrary := r
	arbitrary.PredecessorID = "nonce"
	if _, err = s.QueueWork(ctx, arbitrary); !errors.Is(err, ErrWorkStale) {
		t.Fatal("queue accepted arbitrary predecessor nonce")
	}
	if delay := time.Until(w.ExpiresAt) + 20*time.Millisecond; delay > 0 {
		time.Sleep(delay)
	}
	if _, err = workBidCommit(t, s, loaded, a, "expired-commit", 0, nil, d); !errors.Is(err, ErrWorkStale) {
		t.Fatalf("expired issued work accepted: %v", err)
	}
	current, err := s.Load(ctx, "owner", "game")
	if err != nil || current.Document.Revision != 0 {
		t.Fatal("expired receipt mutated current revision")
	}
	original, err := s.ReadPrepared(ctx, "owner", w.ID)
	if err != nil || !SamePreparedBytes(original, d) {
		t.Fatalf("expired original result no longer readable: %v", err)
	}
	var successors [2]PreparedWork
	var errs [2]error
	var wg sync.WaitGroup
	for i, store := range []*Store{s, s2} {
		wg.Add(1)
		go func(i int, store *Store) {
			defer wg.Done()
			successors[i], errs[i] = store.RetryExpiredResult(ctx, "owner", w.ID, time.Minute)
		}(i, store)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	child := successors[0]
	if child.ID == w.ID || child.ID != successors[1].ID || child.Request.PredecessorID != w.ID {
		t.Fatal("concurrent renewal duplicated or replaced original identity")
	}
	newLease, err := s.ClaimWork(ctx, "owner", child.ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	fresh := workDecision(t, child, newLease, "new-issued-result")
	if _, err = s.PublishWork(ctx, "owner", newLease, fresh); err != nil {
		t.Fatal(err)
	}
	old, err := s.ReadPrepared(ctx, "owner", w.ID)
	if err != nil || !SamePreparedBytes(old, d) {
		t.Fatal("renewal overwrote old receipt")
	}
	access, _ := s.ReadAccess(ctx, "owner")
	if _, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, CanPlay: true, CanCoach: true, ActiveGameID: "game", ChangeControl: true}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.RetryExpiredResult(ctx, "owner", w.ID, time.Minute); !errors.Is(err, ErrAccess) {
		t.Fatalf("expired retry bypassed changed admission: %v", err)
	}
}
