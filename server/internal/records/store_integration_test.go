package records

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"cardford/server/internal/contracts"
	"github.com/jackc/pgx/v5"
)

func storeTestPolicy() PolicyPin {
	return PolicyPin{ID: "m03-fixture", Version: "1.0.0", BudgetVersion: "fixture-1", Components: []ComponentVersion{{ID: "fixture", Version: "1"}}}
}
func storeTestCodec() *DocumentCodec {
	codec := NewDocumentCodec()
	if err := codec.RegisterPolicy(PolicyRegistration{Module: OriginalPin("spades-partners"), Policy: storeTestPolicy(), PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}); err != nil {
		panic(err)
	}
	return codec
}
func storeTestDeal() []string {
	var deal []string
	for _, suit := range []string{"C", "D", "H", "S"} {
		for _, rank := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deal = append(deal, suit+rank)
		}
	}
	return deal
}
func storeMigrationDirectory() string {
	return filepath.Join("..", "..", "..", "web", "server", "records", "migrations")
}

func storeTestOpen(t *testing.T, codec *DocumentCodec) (*Store, *Store) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("native TEST_DATABASE_URL required")
	}
	if url == os.Getenv("DATABASE_URL") {
		t.Fatal("test and application databases must differ")
	}
	var random [8]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	schema := "m03_store_" + hex.EncodeToString(random[:])
	first, err := OpenStore(context.Background(), url, StoreOptions{Schema: schema, CreateSchema: true, Codec: codec})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := first.pool.Exec(ctx, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE")
		first.Close()
		if err != nil {
			t.Error(err)
		}
	})
	if err = first.ApplyMigrations(context.Background(), storeMigrationDirectory()); err != nil {
		t.Fatal(err)
	}
	second, err := OpenStore(context.Background(), url, StoreOptions{Schema: schema, Codec: codec})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(second.Close)
	return first, second
}

func storeTestGame(t *testing.T, s *Store, id string) (*Loaded, AccessAdmission) {
	t.Helper()
	ctx := context.Background()
	owner := "owner-" + id
	if err := s.CreateAccess(ctx, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ChangeAccess(ctx, owner, 1, AccessChange{CanRead: true, CanPlay: true, CanCoach: true}); err != nil {
		t.Fatal(err)
	}
	g := Grant{ID: "grant-" + id, OwnerID: owner, OfferID: "fixture-offer", OfferVersion: "1", SourceKind: "free", SourceID: "fixture", ValidFrom: time.Now().Add(-time.Hour), Terms: GrantTerms{Version: RecordVersion, Game: "spades", Variant: "partners", CanPlay: true, CanCoach: true, Tools: []string{"coach-advice", "review-alternative"}, BucketID: "stable", Period: "lifetime", Timezone: "UTC", Limit: 100, ExpiryRule: "pause-at-expiry"}}
	if err := s.PutGrant(ctx, g); err != nil {
		t.Fatal(err)
	}
	access, err := s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	a := AccessAdmission{OwnerID: owner, Generation: access.Generation, ControlRevision: access.ControlGeneration, GrantID: g.ID, UnitID: "hand-1"}
	meta := PracticeMetadata("spades-partners", id, owner, storeTestPolicy())
	config, _ := json.Marshal(map[string]any{"id": id, "mode": "spades-partners", "dealer": 0})
	doc, anchor, events, err := s.codec.Start(meta, config, storeTestDeal())
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Create(ctx, doc, anchor, events, a, "v1:0:bid"); err != nil {
		t.Fatal(err)
	}
	refreshed, err := s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	a.Generation = refreshed.Generation
	loaded, err := s.Load(ctx, owner, id)
	if err != nil {
		t.Fatal(err)
	}
	return loaded, a
}

func storeTestRequest(t *testing.T, loaded *Loaded, a AccessAdmission, id string, command []byte) AcceptedTransition {
	t.Helper()
	digest, err := CommandDigest(loaded.Document.Metadata.GameID, loaded.Document.Revision+1, command)
	if err != nil {
		t.Fatal(err)
	}
	return AcceptedTransition{Before: loaded, Admission: a, Command: CommandRecord{RecordVersion: RecordVersion, GameID: loaded.Document.Metadata.GameID, Revision: loaded.Document.Revision + 1, CommandID: id, Digest: digest, Command: command}, ReceiptSchema: "AcceptedView", Receipt: []byte("{\n  \"accepted\": true\n}")}
}
func storeTestBid(t *testing.T, loaded *Loaded, a AccessAdmission, id string) AcceptedTransition {
	return storeTestRequest(t, loaded, a, id, []byte(`{"type":"action","action":{"kind":"bid","seat":1,"bid":3}}`))
}
func storeTestDecision(t *testing.T, s *Store, loaded *Loaded, a AccessAdmission) DecisionRecord {
	t.Helper()
	_, digest, window, err := s.codec.PermittedInput(loaded.Document, loaded.Snapshot, 1)
	if err != nil {
		t.Fatal(err)
	}
	return DecisionRecord{RecordVersion: RecordVersion, ID: "original-decision", OwnerID: a.OwnerID, GameID: loaded.Document.Metadata.GameID, Revision: loaded.Document.Revision, Actor: 1, WindowID: window, Purpose: "bot-action", PacketVersion: "1.0.0", InputDigest: digest, Policy: loaded.Document.Metadata.Policy, SelectedCandidateID: "bid:3", AnalysisSchema: "RegisteredAnalysis", Analysis: []byte(`{ "publicSchemaVersion":"2.0.0","gameId":"spades","variantId":"partners","origin":"demo","selectedCandidateId":"bid:3","objective":{"id":"fixture","version":"1","metric":"points","direction":"higher"},"horizon":{"id":"fixture","version":"1","scope":"hand"},"facts":[],"estimates":[],"scenarios":[],"assumptions":["original fixture"] }`), AdviceSchema: "AdviceView", Advice: []byte("{\n  \"focus\":\"Fixture\",\"notice\":\"Original\",\"reason\":\"Recorded fixture\",\"suggestion\":\"Bid three\",\"bid\":3,\"source\":\"code\",\"decisionId\":\"original-decision\",\"requestedLevel\":1,\"policyVersion\":\"1.0.0\"\n}"), Access: a, ReceiptID: "original-receipt", AttemptID: "fixture-attempt", AttemptFence: 1}
}

func TestM03StoreRestartConcurrentAcceptanceAndReconciliation(t *testing.T) {
	s, other := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "restart")
	request := storeTestBid(t, before, a, "same-command")
	request.Charge = &AllowanceCharge{Admission: a, BucketID: "stable", PeriodKey: "lifetime", OfferID: "fixture-offer", OfferVersion: "1", Units: 1}
	decision := storeTestDecision(t, s, before, a)
	work, err := s.QueueWork(context.Background(), WorkRequest{GameID: decision.GameID, Revision: decision.Revision, Actor: decision.Actor, WindowID: decision.WindowID, Purpose: decision.Purpose, InputDigest: decision.InputDigest, Policy: decision.Policy, Admission: a, Lifetime: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	lease, err := s.ClaimWork(context.Background(), a.OwnerID, work.ID, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	decision.AttemptID = lease.WorkID
	decision.AttemptFence = lease.Fence
	decision, err = s.PublishWork(context.Background(), a.OwnerID, lease, decision)
	if err != nil {
		t.Fatal(err)
	}
	request.Decisions = []DecisionRecord{decision}
	mismatched := request
	mismatched.Command = CommandRecord{RecordVersion: RecordVersion, GameID: before.Document.Metadata.GameID, Revision: 1, CommandID: "wrong-selected-bid", Command: []byte(`{"type":"action","action":{"kind":"bid","seat":1,"bid":4}}`)}
	mismatched.Command.Digest, _ = CommandDigest(mismatched.Command.GameID, mismatched.Command.Revision, mismatched.Command.Command)
	if _, err = s.Commit(context.Background(), mismatched); err == nil {
		t.Fatal("bot command differed from issued selected candidate")
	}
	var wg sync.WaitGroup
	outcomes := make([]AcceptedOutcome, 2)
	errs := make([]error, 2)
	for i, repo := range []*Store{s, other} {
		wg.Add(1)
		go func(i int, repo *Store) {
			defer wg.Done()
			outcomes[i], errs[i] = repo.Commit(context.Background(), request)
		}(i, repo)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if outcomes[0].Reconciled == outcomes[1].Reconciled {
		t.Fatalf("want one acceptance and one original receipt: %#v", outcomes)
	}
	for _, outcome := range outcomes {
		if !bytes.Equal(outcome.Receipt, request.Receipt) || outcome.Revision != 1 {
			t.Fatal("original receipt changed")
		}
	}
	for _, changed := range []string{"game", "revision"} {
		mutated := request
		mutated.Command = request.Command
		if changed == "game" {
			mutated.Command.GameID = "another-game"
		} else {
			mutated.Command.Revision++
		}
		mutated.Command.Digest, _ = CommandDigest(mutated.Command.GameID, mutated.Command.Revision, mutated.Command.Command)
		if _, err = s.Commit(context.Background(), mutated); !errors.Is(err, ErrCommandDigest) {
			t.Fatalf("same command identity reused against another %s: %v", changed, err)
		}
	}
	used, err := s.AllowanceUsed(context.Background(), a.OwnerID, "stable", "lifetime")
	if err != nil || used != 1 {
		t.Fatalf("charge=%d error=%v", used, err)
	}
	reloaded, err := other.Load(context.Background(), a.OwnerID, "restart")
	if err != nil || reloaded.Document.Revision != 1 {
		t.Fatalf("reload %#v %v", reloaded, err)
	}
	// A fresh repository process boundary needs no cached receipt or state.
	restarted, err := OpenStore(context.Background(), os.Getenv("TEST_DATABASE_URL"), StoreOptions{Schema: s.schema, Codec: storeTestCodec()})
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	if _, err = restarted.Load(context.Background(), a.OwnerID, "restart"); err != nil {
		t.Fatal(err)
	}
	historical, err := restarted.ReadDecision(context.Background(), a.OwnerID, decision.ID)
	if err != nil || !bytes.Equal(historical.Advice, decision.Advice) || !bytes.Equal(historical.Analysis, decision.Analysis) {
		t.Fatalf("original advice/analysis changed: %v", err)
	}
	exposure := ExposureRecord{RecordVersion: RecordVersion, ID: "first-exposure", DecisionID: decision.ID, OwnerID: a.OwnerID, GameID: decision.GameID, ReceiptID: decision.ReceiptID, ExposedAt: time.Now().UTC().Format(time.RFC3339Nano), ContentDigest: contracts.SHA256(decision.Advice)}
	if err = restarted.AppendExposure(context.Background(), exposure); err != nil {
		t.Fatal(err)
	}
	if err = restarted.AppendExposure(context.Background(), exposure); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ChangeAccess(context.Background(), a.OwnerID, a.Generation, AccessChange{ActiveGameID: "replacement-game", CanRead: true}); err != nil {
		t.Fatal(err)
	}
	recovered, err := restarted.Commit(context.Background(), request)
	if err != nil || !recovered.Reconciled || !bytes.Equal(recovered.Receipt, request.Receipt) {
		t.Fatalf("lost response reconciliation %v %v", recovered, err)
	}
	if _, err = restarted.ReadDecision(context.Background(), a.OwnerID, decision.ID); err != nil {
		t.Fatal("changed active game hid readable history", err)
	}
	if _, err = s.Reconcile(context.Background(), a.OwnerID, request.Command.CommandID, strings.Repeat("0", 64)); !errors.Is(err, ErrCommandDigest) {
		t.Fatalf("digest mismatch accepted: %v", err)
	}
	if _, err = s.Reconcile(context.Background(), "other-owner", request.Command.CommandID, request.Command.Digest); !errors.Is(err, ErrReadDenied) {
		t.Fatalf("cross owner receipt %v", err)
	}
	if _, err = s.ChangeAccess(context.Background(), a.OwnerID, a.Generation+1, AccessChange{}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Reconcile(context.Background(), a.OwnerID, request.Command.CommandID, request.Command.Digest); !errors.Is(err, ErrReadDenied) {
		t.Fatalf("privacy denied receipt %v", err)
	}
}

func TestM03StoreConcurrentGameReplacementRetainsHistory(t *testing.T) {
	s, other := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "replaced")
	accepted, err := s.Commit(context.Background(), storeTestBid(t, before, a, "old-accepted"))
	if err != nil {
		t.Fatal(err)
	}
	var docs [2]Document
	var anchors [2]ReplayAnchor
	var eventLists [2][]EventRecord
	var errs [2]error
	for i := 0; i < 2; i++ {
		id := fmt.Sprintf("replacement-%d", i)
		meta := PracticeMetadata("spades-partners", id, a.OwnerID, storeTestPolicy())
		config, _ := json.Marshal(map[string]any{"id": id, "mode": "spades-partners", "dealer": 0})
		docs[i], anchors[i], eventLists[i], errs[i] = s.codec.Start(meta, config, storeTestDeal())
		if errs[i] != nil {
			t.Fatal(errs[i])
		}
	}
	var wg sync.WaitGroup
	for i, repo := range []*Store{s, other} {
		wg.Add(1)
		go func(i int, repo *Store) {
			defer wg.Done()
			errs[i] = repo.Create(context.Background(), docs[i], anchors[i], eventLists[i], a, "v1:0:bid")
		}(i, repo)
	}
	wg.Wait()
	successes := 0
	for _, err := range errs {
		if err == nil {
			successes++
		} else if !errors.Is(err, ErrAccess) {
			t.Fatal(err)
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent replacements accepted=%d", successes)
	}
	if _, err = s.Load(context.Background(), a.OwnerID, "replaced"); err != nil {
		t.Fatal(err)
	}
	original, err := s.Reconcile(context.Background(), a.OwnerID, "old-accepted", storeTestBid(t, before, a, "old-accepted").Command.Digest)
	if err != nil || !bytes.Equal(original.Receipt, accepted.Receipt) {
		t.Fatal("replaced game's accepted receipt disappeared", err)
	}
}

func TestM03StoreRollsBackEveryAcceptedWriteOnReceiptFailure(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "rollback")
	request := storeTestBid(t, before, a, "failed-command")
	request.Charge = &AllowanceCharge{Admission: a, BucketID: "stable", PeriodKey: "lifetime", OfferID: "fixture-offer", OfferVersion: "1", Units: 1}
	_, err := s.pool.Exec(context.Background(), `CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected receipt failure'; END; $$; CREATE TRIGGER fail_receipt BEFORE INSERT ON m03_commands FOR EACH ROW EXECUTE FUNCTION fail_receipt()`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Commit(context.Background(), request); err == nil {
		t.Fatal("injected transaction failure accepted")
	}
	after, err := s.Load(context.Background(), a.OwnerID, "rollback")
	if err != nil {
		t.Fatal(err)
	}
	if after.Document.Revision != 0 || !bytes.Equal(after.origin, before.origin) || len(after.Events) != len(before.Events) {
		t.Fatal("partial snapshot/event mutation")
	}
	for _, table := range []string{"m03_commands", "m03_decisions", "m03_allowance_charges", "m03_allowance"} {
		var n int
		if err = s.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&n); err != nil || n != 0 {
			t.Fatalf("partial %s writes: %d %v", table, n, err)
		}
	}
	if _, err = s.pool.Exec(context.Background(), `DROP TRIGGER fail_receipt ON m03_commands`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Commit(context.Background(), request); err != nil {
		t.Fatal(err)
	}
}

func TestM03StoreMalformedAndSubstitutedOriginsFailClosed(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "malformed")
	bad := append([]byte(`{"unexpected":true,`), before.origin[1:]...)
	if _, err := s.pool.Exec(context.Background(), `UPDATE m03_games SET document=$1 WHERE game_id=$2`, bad, "malformed"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Load(context.Background(), a.OwnerID, "malformed"); !errors.Is(err, ErrStorage) {
		t.Fatalf("malformed storage accepted: %v", err)
	}
	if _, err := s.Commit(context.Background(), storeTestBid(t, before, a, "stale-origin")); !errors.Is(err, ErrConflict) {
		t.Fatalf("DB origin corruption overwritten: %v", err)
	}
	if _, err := s.pool.Exec(context.Background(), `UPDATE m03_games SET document=$1 WHERE game_id=$2`, before.origin, "malformed"); err != nil {
		t.Fatal(err)
	}
	copied := *before
	copied.Document.Metadata.OwnerID = "spoofed"
	if _, err := s.Commit(context.Background(), storeTestBid(t, &copied, a, "forged-origin")); err == nil {
		t.Fatal("substituted loaded document accepted")
	}
	// Known reader plus unknown policy is safe read-only and never acquires a new pin.
	readOnly, err := OpenStore(context.Background(), os.Getenv("TEST_DATABASE_URL"), StoreOptions{Schema: s.schema, Codec: NewDocumentCodec()})
	if err != nil {
		t.Fatal(err)
	}
	defer readOnly.Close()
	historical, err := readOnly.Load(context.Background(), a.OwnerID, "malformed")
	if err != nil {
		t.Fatal(err)
	}
	if historical.Disposition.Playable || historical.Disposition.Reason != "unsupported-policy-pin" {
		t.Fatal("unsupported policy repinned")
	}
	if _, err = readOnly.Commit(context.Background(), storeTestBid(t, historical, a, "unsupported")); err == nil {
		t.Fatal("unsupported policy mutated state")
	}
	var current []byte
	if err = s.pool.QueryRow(context.Background(), `SELECT document FROM m03_games WHERE game_id=$1`, "malformed").Scan(&current); err != nil || !bytes.Equal(current, before.origin) {
		t.Fatal("failed read/save mutated stored record")
	}
}

func TestM03CanonicalMigrationCrossRuntimeLedger(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	script := filepath.Join("..", "..", "..", "scripts", "m03-migrations.mjs")
	runNode := func() {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, "node", script, "--schema="+s.schema)
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("Node canonical migration reader: %v\n%s", err, output)
		}
	}
	runNode() // Go -> Node: exact same seven checksums, no second ledger.
	if err := s.ApplyMigrations(context.Background(), storeMigrationDirectory()); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.pool.QueryRow(context.Background(), `SELECT count(*) FROM schema_migrations`).Scan(&count); err != nil || count != 7 {
		t.Fatalf("canonical ledger %d %v", count, err)
	}
	// Node -> Go in a separate fresh schema verifies actual Node creation.
	secondSchema := s.schema + "_node"
	if _, err := s.pool.Exec(context.Background(), "CREATE SCHEMA "+pgx.Identifier{secondSchema}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	defer s.pool.Exec(context.Background(), "DROP SCHEMA "+pgx.Identifier{secondSchema}.Sanitize()+" CASCADE")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", script, "--schema="+secondSchema)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("Node first migration: %v\n%s", err, output)
	}
	adopted, err := OpenStore(context.Background(), os.Getenv("TEST_DATABASE_URL"), StoreOptions{Schema: secondSchema})
	if err != nil {
		t.Fatal(err)
	}
	defer adopted.Close()
	if err = adopted.ApplyMigrations(context.Background(), storeMigrationDirectory()); err != nil {
		t.Fatal(err)
	}
	if _, err = s.pool.Exec(context.Background(), `UPDATE schema_migrations SET checksum='tampered' WHERE name='007-versioned-platform-records.sql'`); err != nil {
		t.Fatal(err)
	}
	if err = s.ApplyMigrations(context.Background(), storeMigrationDirectory()); err == nil {
		t.Fatal("applied migration checksum drift accepted")
	}
}

func TestM03StoreLockAndPoolWaitsAreBounded(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "waits")
	limited, err := OpenStore(context.Background(), os.Getenv("TEST_DATABASE_URL"), StoreOptions{Schema: s.schema, Codec: s.codec, MaxConns: 1, QueryTimeout: time.Second, LockTimeout: 50 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	defer limited.Close()
	tx, err := s.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(context.Background(), `SELECT 1 FROM m03_access WHERE owner_id=$1 FOR UPDATE`, a.OwnerID); err != nil {
		t.Fatal(err)
	}
	began := time.Now()
	if _, err = limited.Commit(context.Background(), storeTestBid(t, before, a, "locked")); err == nil {
		t.Fatal("locked transaction unexpectedly accepted")
	}
	if time.Since(began) > 2*time.Second {
		t.Fatal("unbounded lock wait")
	}
	if err = tx.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	connection, err := limited.pool.Acquire(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	began = time.Now()
	_, err = limited.Load(context.Background(), a.OwnerID, "waits")
	connection.Release()
	if err == nil {
		t.Fatal("pool starvation unexpectedly read")
	}
	if time.Since(began) > 2*time.Second {
		t.Fatal("unbounded pool wait")
	}
	if _, err = limited.Load(context.Background(), a.OwnerID, "waits"); err != nil {
		t.Fatal(err)
	}
}
