package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func configuredTemplate(limit int64) Grant {
	return Grant{OfferID: "configured-free", OfferVersion: "1", SourceKind: "free", Terms: GrantTerms{Version: RecordVersion, Game: "spades", Variant: "partners", CanPlay: true, CanCoach: true, Tools: []string{"advice", "review-alternative"}, BucketID: "configured-stable", Period: "lifetime", Timezone: "UTC", Limit: limit, ExpiryRule: "finish-admitted-unit"}}
}

func configuredOpening(t *testing.T, s *Store, identity Identity, id string, priorControl ...context.Context) (*Loaded, AccessAdmission, context.Context) {
	t.Helper()
	r, ctx := localOpening(t, s, identity, id)
	a, err := s.ReadAccess(ctx, identity.Principal.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	r.Admission.Generation = a.Generation
	r.Admission.ControlRevision = a.ControlGeneration
	r.Admission.GrantID = identity.Grants[0].ID
	r.ExpectedActiveGameID = a.ActiveGameID
	if a.ActiveGameID != "" {
		previous, err := s.Load(ctx, a.OwnerID, a.ActiveGameID)
		if err != nil {
			t.Fatal(err)
		}
		r.ExpectedRevision = &previous.Document.Revision
		if len(priorControl) != 1 {
			t.Fatal("existing session requires its retained control proof")
		}
		ctx = priorControl[0]
	}
	if _, err = s.CreateAccepted(localCommand(ctx, "start-"+id), r); err != nil {
		t.Fatal(err)
	}
	ctx = WithControl(ctx, r.TabID, r.NewControlToken)
	a, err = s.ReadAccess(ctx, identity.Principal.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := s.Load(ctx, a.OwnerID, id)
	if err != nil {
		t.Fatal(err)
	}
	return loaded, AccessAdmission{OwnerID: a.OwnerID, Generation: a.Generation, ControlRevision: a.ControlGeneration, GrantID: identity.Grants[0].ID, UnitID: "hand-1"}, ctx
}

func configuredUnlockRequest(a AccessAdmission, g Grant, game string) CoachingUnlockRequest {
	period := "lifetime"
	if g.Terms.Period == "day" {
		period = time.Now().UTC().Format("2006-01-02")
	}
	return CoachingUnlockRequest{Admission: a, GameID: game, ExpectedRevision: 0, ToolID: "advice", Charge: AllowanceCharge{Admission: a, BucketID: g.Terms.BucketID, PeriodKey: period, OfferID: g.OfferID, OfferVersion: g.OfferVersion, Units: 1}}
}

func TestM04DConfiguredIdentityNoFixtureAndAtomicInvalidTerms(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithPrincipal(context.Background(), identity.Principal)
	a, err := s.ReadAccessContext(ctx, identity.Principal.OwnerID, "", "")
	if err != nil || !a.Configured || len(a.Grants) != 0 || len(a.Admissions) != 0 {
		t.Fatalf("implicit fixture: %+v %v", a, err)
	}
	var before, after int
	if err = s.pool.QueryRow(context.Background(), "SELECT count(*) FROM m03_access").Scan(&before); err != nil {
		t.Fatal(err)
	}
	invalid := configuredTemplate(1)
	invalid.Terms.Timezone = "America/Toronto"
	bad, err := s.NewConfiguredIdentity(context.Background(), []Grant{configuredTemplate(1), invalid})
	if !errors.Is(err, ErrAccess) {
		t.Fatalf("unsupported calendar accepted: %v", err)
	}
	if _, err = s.Authenticate(context.Background(), bad.Token); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("partial identity persisted: %v", err)
	}
	if err = s.pool.QueryRow(context.Background(), "SELECT count(*) FROM m03_access").Scan(&after); err != nil || before != after {
		t.Fatalf("partial identity mutation: %d %d %v", before, after, err)
	}
}

func TestM04DConfiguredUnlockConcurrentRecoveryAndOriginalTerms(t *testing.T) {
	s, s2 := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), []Grant{configuredTemplate(1)})
	if err != nil {
		t.Fatal(err)
	}
	_, a, ctx := configuredOpening(t, s, identity, "configured-unlock")
	r := configuredUnlockRequest(a, identity.Grants[0], "configured-unlock")
	var results [2]AcceptedOutcome
	var errs [2]error
	var wg sync.WaitGroup
	for i, store := range []*Store{s, s2} {
		wg.Add(1)
		go func(i int, store *Store) {
			defer wg.Done()
			results[i], errs[i] = store.UnlockCoaching(localCommand(ctx, "unlock-same"), r)
		}(i, store)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if !bytes.Equal(results[0].Receipt, results[1].Receipt) {
		t.Fatal("retry changed original receipt")
	}
	var receipt CoachingUnlockReceipt
	if err = json.Unmarshal(results[0].Receipt, &receipt); err != nil {
		t.Fatal(err)
	}
	if receipt.Remaining == nil || *receipt.Remaining != 0 || receipt.GrantID != identity.Grants[0].ID {
		t.Fatalf("unlock receipt: %+v", receipt)
	}
	current, err := s2.ReadAccessContext(ctx, a.OwnerID, r.GameID, a.UnitID)
	if err != nil || len(current.Unlocks) != 1 || len(current.Usage) != 1 || current.Usage[0].Used != 1 {
		t.Fatalf("duplicate allowance spend: %+v %v", current, err)
	}
	if len(current.Admissions) < 1 {
		t.Fatal("coach grant admission absent")
	}
	second, err := s2.UnlockCoaching(localCommand(ctx, "unlock-different-command"), r)
	if err != nil {
		t.Fatal(err)
	}
	var secondReceipt CoachingUnlockReceipt
	_ = json.Unmarshal(second.Receipt, &secondReceipt)
	if secondReceipt.BucketID != receipt.BucketID || secondReceipt.Offer != receipt.Offer || secondReceipt.PeriodKey != receipt.PeriodKey {
		t.Fatal("unit reattributed")
	}
	changed := identity.Grants[0]
	changed.ID = "new-offer-grant"
	changed.OfferID = "different-offer"
	changed.OfferVersion = "2"
	changed.Terms.BucketID = "another-bucket"
	if err = s.PutGrant(ctx, changed); err != nil {
		t.Fatal(err)
	}
	state, err := s.ReadAccess(ctx, a.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	r.Admission.Generation = state.Generation
	r.Admission.GrantID = changed.ID
	r.Charge.Admission = r.Admission
	r.Charge.BucketID = changed.Terms.BucketID
	r.Charge.OfferVersion = changed.OfferVersion
	if _, err = s.UnlockCoaching(localCommand(ctx, "cross-bucket"), r); !errors.Is(err, ErrAccess) {
		t.Fatalf("unit broadened through new bucket: %v", err)
	}
	again, err := s2.UnlockCoaching(localCommand(ctx, "unlock-same"), r)
	if err != nil || !again.Reconciled || !bytes.Equal(again.Receipt, results[0].Receipt) {
		t.Fatalf("receipt-first restart: %v", err)
	}
	if err = s.RevokeGrant(ctx, a.OwnerID, identity.Grants[0].ID); err != nil {
		t.Fatal(err)
	}
	current, err = s2.ReadAccessContext(ctx, a.OwnerID, r.GameID, a.UnitID)
	if err != nil || !current.Unlocks[0].Revoked {
		t.Fatalf("revocation missing from context: %v", err)
	}
}

func TestM04DConfiguredZeroQuotaAndToolRejectWithoutMutation(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), []Grant{configuredTemplate(0)})
	if err != nil {
		t.Fatal(err)
	}
	_, a, ctx := configuredOpening(t, s, identity, "configured-zero")
	r := configuredUnlockRequest(a, identity.Grants[0], "configured-zero")
	if _, err = s.UnlockCoaching(localCommand(ctx, "zero-quota"), r); !errors.Is(err, ErrAllowance) {
		t.Fatalf("zero quota unlocked: %v", err)
	}
	r.ToolID = "invented"
	if _, err = s.UnlockCoaching(localCommand(ctx, "wrong-tool"), r); !errors.Is(err, ErrAccess) {
		t.Fatalf("unsupported tool unlocked: %v", err)
	}
	var charges, unlocks int
	if err = s.pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM m03_allowance_charges),(SELECT count(*) FROM m04_coaching_unlocks)").Scan(&charges, &unlocks); err != nil || charges != 0 || unlocks != 0 {
		t.Fatalf("reject mutation: %d %d %v", charges, unlocks, err)
	}
}

func TestM04DConfiguredCommercialTrialOnceAcrossOffersAndTargets(t *testing.T) {
	s, s2 := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithPrincipal(context.Background(), identity.Principal)
	one := configuredTemplate(2)
	one.SourceKind = "access-trial"
	one.OfferID = "trial-one"
	two := one
	two.Terms.Game = "hearts"
	two.Terms.Variant = "solo"
	var result [2]AcceptedOutcome
	var errs [2]error
	var wg sync.WaitGroup
	for i, store := range []*Store{s, s2} {
		wg.Add(1)
		go func(i int, store *Store) {
			defer wg.Done()
			result[i], errs[i] = store.ActivateConfiguredTrial(localCommand(ctx, "commercial-trial"), []Grant{one, two}, time.Hour, 1)
		}(i, store)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if !bytes.Equal(result[0].Receipt, result[1].Receipt) {
		t.Fatal("concurrent trial created two receipts")
	}
	current, err := s2.ReadAccessContext(ctx, identity.Principal.OwnerID, "", "")
	if err != nil || len(current.Grants) != 2 || current.Access.Generation != 2 {
		t.Fatalf("partial trial: %+v %v", current, err)
	}
	var original ConfiguredTrialReceipt
	_ = json.Unmarshal(result[0].Receipt, &original)
	one.OfferID = "trial-switched"
	one.OfferVersion = "2"
	newReceipt, err := s2.ActivateConfiguredTrial(localCommand(ctx, "trial-new-policy"), []Grant{one}, 24*time.Hour, current.Access.Generation)
	if err != nil {
		t.Fatal(err)
	}
	var unchanged ConfiguredTrialReceipt
	_ = json.Unmarshal(newReceipt.Receipt, &unchanged)
	if unchanged.Offer != original.Offer || unchanged.ActivatedAt != original.ActivatedAt || unchanged.ExpiresAt != original.ExpiresAt {
		t.Fatal("offer switch restarted commercial trial")
	}
	var count int
	if err = s.pool.QueryRow(ctx, "SELECT count(*) FROM m03_grants").Scan(&count); err != nil || count != 2 {
		t.Fatalf("trial switch granted again: %d %v", count, err)
	}
	if _, err = s2.ActivateConfiguredTrial(localCommand(ctx, "commercial-trial"), nil, 0, 0); err != nil {
		t.Fatalf("original trial retry considered changed terms: %v", err)
	}
}

func TestM04DConfiguredInvalidTrialRollsBackEveryTarget(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithPrincipal(context.Background(), identity.Principal)
	one := configuredTemplate(1)
	one.SourceKind = "access-trial"
	two := one
	two.Terms.Variant = "unsupported"
	if _, err = s.ActivateConfiguredTrial(localCommand(ctx, "invalid-trial"), []Grant{one, two}, time.Hour, 1); !errors.Is(err, ErrAccess) {
		t.Fatalf("invalid trial accepted: %v", err)
	}
	current, err := s.ReadAccessContext(ctx, identity.Principal.OwnerID, "", "")
	if err != nil || len(current.Grants) != 0 || current.Access.Generation != 1 {
		t.Fatalf("partial trial mutation: %+v %v", current, err)
	}
}

func TestM04DConfiguredWorkerRequiresUnlockAndSecurityRevocation(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), []Grant{configuredTemplate(1)})
	if err != nil {
		t.Fatal(err)
	}
	_, a, ctx := configuredOpening(t, s, identity, "configured-work")
	check := func() error {
		return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
			return s.checkConfiguredUnlock(ctx, tx, a, "configured-work", "advice")
		})
	}
	if err = check(); !errors.Is(err, ErrAllowance) {
		t.Fatalf("unreserved coached work: %v", err)
	}
	r := configuredUnlockRequest(a, identity.Grants[0], "configured-work")
	if _, err = s.UnlockCoaching(localCommand(ctx, "reserve-work"), r); err != nil {
		t.Fatal(err)
	}
	if err = check(); err != nil {
		t.Fatal(err)
	}
	if err = s.RevokeGrant(ctx, a.OwnerID, a.GrantID); err != nil {
		t.Fatal(err)
	}
	if err = check(); !errors.Is(err, ErrAccess) {
		t.Fatalf("revoked work unlocked: %v", err)
	}
}

func TestM04DConfiguredFreePolicyUpdatesPreserveTermsAndRevocation(t *testing.T) {
	s, s2 := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), []Grant{configuredTemplate(1)})
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithPrincipal(context.Background(), identity.Principal)
	p, err := s2.Authenticate(ctx, identity.Token)
	if err != nil || !p.Configured {
		t.Fatalf("configured mode lost on restart: %v", err)
	}
	changed := configuredTemplate(99)
	changed.OfferVersion = "2"
	if err = s2.EnsureConfiguredFreeGrants(ctx, []Grant{changed}); err != nil {
		t.Fatal(err)
	}
	original, err := s.ReadGrant(ctx, identity.Principal.OwnerID, identity.Grants[0].ID)
	if err != nil || original.Terms.Limit != 1 || original.OfferVersion != "1" {
		t.Fatalf("original free terms replaced: %+v %v", original, err)
	}
	newTarget := changed
	newTarget.Terms.Game = "hearts"
	newTarget.Terms.Variant = "solo"
	if err = s2.EnsureConfiguredFreeGrants(ctx, []Grant{changed, newTarget}); err != nil {
		t.Fatal(err)
	}
	current, err := s.ReadAccessContext(ctx, identity.Principal.OwnerID, "", "")
	if err != nil || len(current.Grants) != 2 || current.Access.Generation != 2 {
		t.Fatalf("new target issue: %+v %v", current, err)
	}
	if err = s.RevokeGrant(ctx, identity.Principal.OwnerID, original.ID); err != nil {
		t.Fatal(err)
	}
	if err = s2.EnsureConfiguredFreeGrants(ctx, []Grant{changed, newTarget}); err != nil {
		t.Fatal(err)
	}
	original, err = s.ReadGrant(ctx, identity.Principal.OwnerID, original.ID)
	if err != nil || !original.Revoked {
		t.Fatalf("free grant resurrected: %v", err)
	}
	bad := changed
	bad.Terms.BucketID = "reset-existing-bucket"
	if err = s.EnsureConfiguredFreeGrants(ctx, []Grant{bad}); !errors.Is(err, ErrAllowance) {
		t.Fatalf("existing offer bucket reset after restart: %v", err)
	}
	bad = changed
	bad.Terms.Period = "day"
	if err = s.EnsureConfiguredFreeGrants(ctx, []Grant{bad}); !errors.Is(err, ErrAllowance) {
		t.Fatalf("existing offer period reset after restart: %v", err)
	}
	bad = changed
	bad.Terms.Variant = "solo"
	bad.Terms.BucketID = "reset-bucket"
	if err = s.EnsureConfiguredFreeGrants(ctx, []Grant{bad}); !errors.Is(err, ErrAllowance) {
		t.Fatalf("same offer bucket reset: %v", err)
	}
	current, err = s.ReadAccessContext(ctx, identity.Principal.OwnerID, "", "")
	if err != nil || len(current.Grants) != 2 || current.Access.Generation != 3 {
		t.Fatalf("failed free issue mutated state: %+v %v", current, err)
	}
}

func TestM04DConfiguredLastUnitCannotResetThroughNewSession(t *testing.T) {
	s, s2 := storeTestOpen(t, storeTestCodec())
	identity, err := s.NewConfiguredIdentity(context.Background(), []Grant{configuredTemplate(1)})
	if err != nil {
		t.Fatal(err)
	}
	_, a, ctx := configuredOpening(t, s, identity, "last-unit-one")
	if _, err = s.UnlockCoaching(localCommand(ctx, "last-unit-reserve"), configuredUnlockRequest(a, identity.Grants[0], "last-unit-one")); err != nil {
		t.Fatal(err)
	}
	_, next, nextCtx := configuredOpening(t, s2, identity, "last-unit-two", ctx)
	if _, err = s2.UnlockCoaching(localCommand(nextCtx, "last-unit-again"), configuredUnlockRequest(next, identity.Grants[0], "last-unit-two")); !errors.Is(err, ErrAllowance) {
		t.Fatalf("new session reset quota: %v", err)
	}
	current, err := s.ReadAccessContext(nextCtx, a.OwnerID, "last-unit-two", "hand-1")
	if err != nil || len(current.Unlocks) != 0 || current.Usage[0].Used != 1 {
		t.Fatalf("exhausted allowance mutated: %+v %v", current, err)
	}
}

func TestM04DConfiguredMigrationRetainsLegacyOriginalReservation(t *testing.T) {
	s, _, loaded, g, a := workFixture(t, 3, true)
	period := time.Now().UTC().Format("2006-01-02")
	charge := AllowanceCharge{Admission: a, BucketID: g.Terms.BucketID, PeriodKey: period, OfferID: g.OfferID, OfferVersion: g.OfferVersion, Units: 1}
	if _, err := workBidCommit(t, s, loaded, a, "legacy-first", 0, &charge); err != nil {
		t.Fatal(err)
	}
	// Model the pre-M04D schema and preserve its real accepted command/charge.
	ctx := context.Background()
	if _, err := s.pool.Exec(ctx, "DROP TABLE m04_coaching_unlocks"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(ctx, "ALTER TABLE m03_access DROP COLUMN configured_offers"); err != nil {
		t.Fatal(err)
	}
	migrations, err := ReadCanonicalMigrations(storeMigrationDirectory())
	if err != nil {
		t.Fatal(err)
	}
	if err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if migrations[8].Name != "009-configured-access.sql" {
			return errors.New("missing frozen configured-access migration")
		}
		_, err := tx.Exec(ctx, string(migrations[8].SQL))
		return err
	}); err != nil {
		t.Fatal(err)
	}
	current, err := s.ReadAccessContext(ctx, a.OwnerID, "game", a.UnitID)
	if err != nil || len(current.Unlocks) != 1 {
		t.Fatalf("legacy unlock disappeared: %+v %v", current, err)
	}
	u := current.Unlocks[0]
	if u.CommandID != "legacy-first" || u.GrantID != g.ID || u.PeriodKey != period || u.OfferVersion != g.OfferVersion || current.Usage[0].Used != 1 {
		t.Fatalf("legacy reservation reattributed: %+v", u)
	}
	if _, err = s.pool.Exec(ctx, "UPDATE m04_coaching_unlocks SET offer_version='changed'"); err == nil {
		t.Fatal("original migrated unlock mutable")
	}
}

func TestM04DConfiguredCoachingIndependentOfCoarsePlayPermission(t *testing.T) {
	s, _, loaded, _, a := workFixture(t, 3, true)
	ctx := context.Background()
	state, err := s.ReadAccess(ctx, a.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	state, err = s.ChangeAccess(ctx, a.OwnerID, state.Generation, AccessChange{ActiveGameID: loaded.Document.Metadata.GameID, CanRead: true, CanPlay: false, CanCoach: true})
	if err != nil {
		t.Fatal(err)
	}
	a.Generation, a.ControlRevision = state.Generation, state.ControlGeneration
	check := func(coach bool) error {
		return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
			return s.checkCommitAccess(ctx, tx, a, loaded.Document.Metadata.GameID, coach)
		})
	}
	if err = check(true); err != nil {
		t.Fatalf("coaching inherited play denial: %v", err)
	}
	if err = check(false); !errors.Is(err, ErrAccess) {
		t.Fatalf("play bypassed independent denial: %v", err)
	}
	state, err = s.ChangeAccess(ctx, a.OwnerID, state.Generation, AccessChange{ActiveGameID: loaded.Document.Metadata.GameID, CanRead: true, CanPlay: true, CanCoach: false})
	if err != nil {
		t.Fatal(err)
	}
	a.Generation, a.ControlRevision = state.Generation, state.ControlGeneration
	if err = check(false); err != nil {
		t.Fatalf("play inherited coaching denial: %v", err)
	}
	if err = check(true); !errors.Is(err, ErrAccess) {
		t.Fatalf("coaching bypassed independent denial: %v", err)
	}
}
