package records

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestM03AccessTrialActivationAndPurchasedTerms(t *testing.T) {
	s, s2, _, g, _ := workFixture(t, 3, true)
	ctx := context.Background()
	g.SourceKind = "access-trial"
	g.SourceID = "campaign-stable"
	g.ID = "trial-grant-one"
	g.OfferID = "trial"
	g.OfferVersion = "1"
	var activations [2]TrialActivation
	var errs [2]error
	var wg sync.WaitGroup
	for i, store := range []*Store{s, s2} {
		wg.Add(1)
		go func(i int, store *Store) {
			defer wg.Done()
			copy := g
			if i == 1 {
				copy.ID = "trial-grant-two"
				copy.OfferVersion = "2"
			}
			activations[i], errs[i] = store.ActivateAccessTrial(ctx, "once-ever", copy, 24*time.Hour)
		}(i, store)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if activations[0] != activations[1] {
		t.Fatal("two instances activated separate access trials")
	}
	stored, err := s.ReadGrant(ctx, "owner", activations[0].GrantID)
	if err != nil {
		t.Fatal(err)
	}
	original, _ := json.Marshal(stored)
	stored.Terms.Limit = 50
	stored.OfferVersion = "edited"
	if err = s.PutGrant(ctx, stored); !errors.Is(err, ErrCommandDigest) {
		t.Fatalf("purchased terms replaced: %v", err)
	}
	again, err := s2.ActivateAccessTrial(ctx, "once-ever", stored, 48*time.Hour)
	if err != nil || again != activations[0] {
		t.Fatalf("policy/grant switch reset activation: %v", err)
	}
	unchanged, _ := s.ReadGrant(ctx, "owner", activations[0].GrantID)
	raw, _ := json.Marshal(unchanged)
	if string(original) != string(raw) {
		t.Fatal("original trial terms changed")
	}
	if _, err = s.pool.Exec(ctx, "UPDATE m03_access_trials SET expires_at=expires_at+interval '1 day'"); err == nil {
		t.Fatal("trial provenance mutable through SQL")
	}
}

func workBidCommit(t *testing.T, s *Store, loaded *Loaded, a AccessAdmission, id string, seat int, charge *AllowanceCharge, decisions ...DecisionRecord) (AcceptedOutcome, error) {
	t.Helper()
	command, _ := json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "bid", "seat": seat, "bid": 1}})
	digest, err := CommandDigest(loaded.Document.Metadata.GameID, loaded.Document.Revision+1, command)
	if err != nil {
		t.Fatal(err)
	}
	next, delta, err := s.codec.Advance(loaded.Document, loaded.Snapshot, command)
	if err != nil {
		t.Fatal(err)
	}
	events := append(append([]EventRecord{}, loaded.Events...), delta...)
	snap, _, err := s.codec.Open(next, events)
	if err != nil {
		t.Fatal(err)
	}
	projected, err := snap.Project(0)
	if err != nil {
		t.Fatal(err)
	}
	return s.Commit(context.Background(), AcceptedTransition{Before: loaded, Command: CommandRecord{RecordVersion: RecordVersion, GameID: loaded.Document.Metadata.GameID, Revision: loaded.Document.Revision + 1, CommandID: id, Digest: digest, Command: command}, Admission: a, ReceiptSchema: "GameView", Receipt: projected.View, Charge: charge, Decisions: decisions, NextWindowID: fmt.Sprintf("v1:%d:bid", next.Revision)})
}

func TestM03AllowanceAtomicCommandStableAcrossGrantPolicy(t *testing.T) {
	s, s2, loaded, g, a := workFixture(t, 3, true)
	ctx := context.Background()
	period := time.Now().UTC().Format("2006-01-02")
	charge := AllowanceCharge{Admission: a, BucketID: g.Terms.BucketID, PeriodKey: period, OfferID: g.OfferID, OfferVersion: g.OfferVersion, Units: 1}
	var outcomes [2]AcceptedOutcome
	var errs [2]error
	var wg sync.WaitGroup
	for i, store := range []*Store{s, s2} {
		wg.Add(1)
		go func(i int, store *Store) {
			defer wg.Done()
			outcomes[i], errs[i] = workBidCommit(t, store, loaded, a, "same-charge-command", 0, &charge)
		}(i, store)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if outcomes[0].Revision != 1 || outcomes[1].Revision != 1 {
		t.Fatal("concurrent charge advanced twice")
	}
	used, err := s.AllowanceUsed(ctx, "owner", g.Terms.BucketID, period)
	if err != nil || used != 1 {
		t.Fatalf("duplicate allowance spent: %d %v", used, err)
	}
	g.ID = "new-grant"
	g.OfferVersion = "2"
	g.SourceKind = "purchase"
	g.SourceID = "purchased-original"
	if err = s.PutGrant(ctx, g); err != nil {
		t.Fatal(err)
	}
	access, _ := s.ReadAccess(ctx, "owner")
	a.Generation = access.Generation
	a.GrantID = g.ID
	a.UnitID = "hand-1"
	charge.OfferVersion = g.OfferVersion
	history, err := s.loadHistory(ctx, "owner", "game")
	if err != nil {
		t.Fatal(err)
	}
	var config map[string]any
	if err = json.Unmarshal(history.anchor.Config, &config); err != nil {
		t.Fatal(err)
	}
	config["id"] = "game-2"
	configRaw, _ := json.Marshal(config)
	doc, anchor, events, err := s.codec.Start(PracticeMetadata("spades-solo", "game-2", "owner", loaded.Document.Metadata.Policy), configRaw, history.anchor.OpeningChance)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Create(ctx, doc, anchor, events, a, "v1:0:bid"); err != nil {
		t.Fatal(err)
	}
	access, _ = s.ReadAccess(ctx, "owner")
	a.Generation = access.Generation
	charge.Admission = a
	loaded, err = s.Load(ctx, "owner", "game-2")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = workBidCommit(t, s, loaded, a, "next-unit-command", 0, &charge); !errors.Is(err, ErrAllowance) {
		t.Fatalf("grant/policy reset allowance: %v", err)
	}
	current, err := s.Load(ctx, "owner", "game-2")
	if err != nil || current.Document.Revision != 0 {
		t.Fatalf("rejected charge mutated game: %v", err)
	}
	var count int
	if err = s.pool.QueryRow(ctx, "SELECT count(*) FROM m03_commands").Scan(&count); err != nil || count != 1 {
		t.Fatalf("rejected charge accepted receipt: %d %v", count, err)
	}
	changed := g
	changed.ID = "reset-period"
	changed.Terms.Period = "lifetime"
	if err = s.PutGrant(ctx, changed); !errors.Is(err, ErrAllowance) {
		t.Fatalf("bucket reset through period edit: %v", err)
	}
	access, _ = s.ReadAccess(ctx, "owner")
	if _, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, ActiveGameID: "different-game"}); err != nil {
		t.Fatal(err)
	}
	// Accepted command reconciliation retains its original receipt after grant
	// and active-game changes, without consuming a second unit.
	command, _ := json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "bid", "seat": 0, "bid": 1}})
	digest, _ := CommandDigest("game", 1, command)
	first, err := s2.Commit(ctx, AcceptedTransition{Admission: a, Command: CommandRecord{RecordVersion: RecordVersion, GameID: "game", Revision: 1, CommandID: "same-charge-command", Digest: digest, Command: command}})
	if err != nil || !first.Reconciled {
		t.Fatalf("accepted response not reconciled: %v", err)
	}
}

func TestM03NaturalExpiryOnlyFinishesRecordedUnit(t *testing.T) {
	s, _, _, g, a := workFixture(t, 3, true)
	ctx := context.Background()
	g.ID = "expired-finish"
	g.ValidFrom = time.Now().Add(-2 * time.Hour)
	until := time.Now().Add(-time.Hour)
	g.ValidUntil = &until
	g.Terms.ExpiryRule = "finish-admitted-unit"
	if err := s.PutGrant(ctx, g); err != nil {
		t.Fatal(err)
	}
	access, _ := s.ReadAccess(ctx, "owner")
	a.Generation = access.Generation
	a.GrantID = g.ID
	// Represents an immutable unit admission recorded before natural expiry.
	_, err := s.pool.Exec(ctx, "INSERT INTO m03_unit_admissions(owner_id,game_id,unit_id,grant_id,access_generation,admitted_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)", a.OwnerID, "game", a.UnitID, g.ID, a.Generation, g.ValidFrom.Add(time.Minute), until)
	if err != nil {
		t.Fatal(err)
	}
	check := func(admission AccessAdmission) error {
		return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
			if err := s.checkCommitAccess(ctx, tx, admission, "game", false); err != nil {
				return err
			}
			_, _, err := s.checkGrant(ctx, tx, admission, "game", "spades", "solo", false)
			return err
		})
	}
	if err = check(a); err != nil {
		t.Fatal(err)
	}
	old := a
	access, _ = s.ReadAccess(ctx, "owner")
	access, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, CanPlay: true, CanCoach: true, ActiveGameID: "game", ChangeControl: true})
	if err != nil {
		t.Fatal(err)
	}
	a.Generation = access.Generation
	a.ControlRevision = access.ControlGeneration
	if err = check(old); !errors.Is(err, ErrAccess) {
		t.Fatal("stale generation survived device/control change")
	}
	if err = check(a); err != nil {
		t.Fatalf("purchased admitted-unit continuation lost after device change: %v", err)
	}
	next := a
	next.UnitID = "next-unit"
	if err = s.AdmitUnit(ctx, "game", "spades", "solo", next); !errors.Is(err, ErrAccess) {
		t.Fatalf("admitted fabricated module unit: %v", err)
	}
	if err = check(next); !errors.Is(err, ErrAccess) {
		t.Fatalf("expired grant admitted new unit: %v", err)
	}
	if err = s.RevokeGrant(ctx, "owner", g.ID); err != nil {
		t.Fatal(err)
	}
	if err = check(a); !errors.Is(err, ErrAccess) {
		t.Fatalf("security revoke preserved continuation: %v", err)
	}
}

func TestM03AdmittedUnitChargeRemainsInOriginalPeriod(t *testing.T) {
	s, _, loaded, g, a := workFixture(t, 3, true)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	// An immutable charge issued on the prior UTC day for this still-open unit.
	if _, err := s.pool.Exec(ctx, "INSERT INTO m03_allowance(owner_id,bucket_id,period_key,used) VALUES($1,$2,$3,1)", a.OwnerID, g.Terms.BucketID, yesterday); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(ctx, "INSERT INTO m03_allowance_charges(owner_id,command_id,bucket_id,period_key,grant_id,offer_id,offer_version,units,game_id,unit_id) VALUES($1,'prior-day',$2,$3,$4,$5,$6,1,'game',$7)", a.OwnerID, g.Terms.BucketID, yesterday, g.ID, g.OfferID, g.OfferVersion, a.UnitID); err != nil {
		t.Fatal(err)
	}
	c := AllowanceCharge{Admission: a, BucketID: g.Terms.BucketID, PeriodKey: today, OfferID: g.OfferID, OfferVersion: g.OfferVersion, Units: 1}
	if _, err := workBidCommit(t, s, loaded, a, "continue-today", 0, &c); err != nil {
		t.Fatal(err)
	}
	used, err := s.AllowanceUsed(ctx, a.OwnerID, g.Terms.BucketID, today)
	if err != nil || used != 0 {
		t.Fatalf("same unit charged again after midnight: %d %v", used, err)
	}
	prior, err := s.AllowanceUsed(ctx, a.OwnerID, g.Terms.BucketID, yesterday)
	if err != nil || prior != 1 {
		t.Fatal("original period usage rewritten")
	}
	var count int
	var period string
	if err = s.pool.QueryRow(ctx, "SELECT count(*),min(period_key) FROM m03_allowance_charges").Scan(&count, &period); err != nil || count != 1 || period != yesterday {
		t.Fatalf("charge attribution changed: %d %s %v", count, period, err)
	}
}
