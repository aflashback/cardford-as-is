package access

import (
	"cardford/server/internal/contracts"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T) (Policy, Input) {
	t.Helper()
	p, err := LocalFixturePolicy()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC)
	target := Target{"spades", "solo"}
	terms, err := p.Offers[0].Terms(target)
	if err != nil {
		t.Fatal(err)
	}
	g := Grant{ID: "g1", OwnerID: "owner", OfferID: p.Offers[0].ID, OfferVersion: p.Offers[0].Version, SourceKind: "free", SourceID: "source", Terms: terms, ValidFrom: now.Add(-time.Hour)}
	return p, Input{OwnerID: "owner", Generation: 7, ActiveSessionID: "session", Target: target, Now: now, Operation: Operation{Kind: "coach", SessionID: "session", UnitID: "unit", UnitKind: "hand", ToolID: "advice"}, Grants: []Grant{g}}
}
func resolve(t *testing.T, p Policy, in Input, allowed bool, reason string) Decision {
	t.Helper()
	d, err := Resolve(p, in)
	if err != nil {
		t.Fatal(err)
	}
	if d.Allowed != allowed || d.Reason != reason {
		t.Fatalf("want %t/%s, got %+v", allowed, reason, d)
	}
	raw, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	if err = contracts.Validate("AccessDecision", raw); err != nil {
		t.Fatalf("invalid public decision %s: %v", raw, err)
	}
	return d
}
func TestExactTargetAndIndependentPermissions(t *testing.T) {
	p, in := fixture(t)
	resolve(t, p, in, true, "grant")
	in.Target = Target{"spades", "partners"}
	resolve(t, p, in, false, "wrong-target")
	in.Target = Target{"spades", "solo"}
	in.Grants[0].Terms.CanCoach = false
	in.Grants[0].Terms.Tools = []string{}
	resolve(t, p, in, false, "wrong-tool")
	in.Operation.Kind = "play"
	in.Operation.Intent = "start"
	in.Operation.ToolID = ""
	resolve(t, p, in, true, "grant")
	in.Grants[0].Terms.CanPlay = false
	resolve(t, p, in, false, "no-grant")
	in.Grants[0].Terms.CanCoach = true
	in.Grants[0].Terms.Tools = []string{"advice"}
	in.Operation.Kind = "coach"
	in.Operation.Intent = ""
	in.Operation.ToolID = "advice"
	resolve(t, p, in, true, "grant")
	in.Operation.ToolID = "invented"
	resolve(t, p, in, false, "wrong-tool")
}
func TestExpiryRequiresActualRecordedUnitAndRevocationWins(t *testing.T) {
	p, in := fixture(t)
	expiry := in.Now
	in.Grants[0].ValidUntil = &expiry
	in.Operation = Operation{Kind: "play", Intent: "continue", SessionID: "session", UnitID: "unit", UnitKind: "hand", AtAdmissionBoundary: true}
	resolve(t, p, in, false, "not-admitted")
	in.Admissions = []Admission{{GrantID: "g1", SessionID: "session", UnitID: "unit", AdmittedAt: expiry.Add(-time.Minute)}}
	resolve(t, p, in, true, "admitted-unit")
	in.Operation.UnitID = "next"
	resolve(t, p, in, false, "not-admitted")
	in.Operation.UnitID = "unit"
	in.Operation.Intent = "start"
	resolve(t, p, in, false, "expired")
	in.Operation.Intent = "continue"
	in.Admissions[0].AdmittedAt = expiry
	resolve(t, p, in, false, "not-admitted")
	in.Admissions[0].AdmittedAt = expiry.Add(-time.Minute)
	in.Grants[0].Revoked = true
	resolve(t, p, in, false, "revoked")
	in.Grants[0].Revoked = false
	in.Admissions[0].Revoked = true
	resolve(t, p, in, false, "revoked")
	in.Admissions[0].Revoked = false
	in.Revoked = true
	resolve(t, p, in, false, "revoked")
	in.Revoked = false
	in.Grants[0].Terms.ExpiryRule = "pause-at-expiry"
	resolve(t, p, in, false, "expired")
}
func TestSingleWinningAllowanceDoesNotStackAndCountsReservations(t *testing.T) {
	p, in := fixture(t)
	g := in.Grants[0]
	g.Terms.Unlimited = false
	g.Terms.Limit = 2
	g.Terms.Period = "day"
	g.Terms.BucketID = "stable"
	in.Grants[0] = g
	in.Usage = []BucketUsage{{OwnerID: "owner", BucketID: "stable", PeriodKey: "2026-10-06", Used: 1, Reserved: 1}}
	g.ID = "g2"
	g.Terms.BucketID = "other"
	g.Terms.Unlimited = true
	g.Terms.Limit = 0
	in.Grants = append(in.Grants, g)
	d := resolve(t, p, in, false, "exhausted")
	if len(d.Applied) != 1 || d.Applied[0].GrantID != "g1" {
		t.Fatal(d)
	}
	in.Grants[0], in.Grants[1] = in.Grants[1], in.Grants[0]
	resolve(t, p, in, false, "exhausted")
	in.Usage[0].Reserved = 0
	d = resolve(t, p, in, true, "grant")
	if d.Remaining == nil || *d.Remaining != 1 {
		t.Fatal(d)
	}
	in.Now = in.Now.Add(24 * time.Hour)
	d = resolve(t, p, in, true, "grant")
	if *d.Remaining != 2 || d.PeriodKey != "2026-10-07" {
		t.Fatal(d)
	}
}
func TestPurchasedTermsAndBucketsSurviveOfferEdits(t *testing.T) {
	p, in := fixture(t)
	in.Grants[0].SourceKind = "purchase"
	in.Grants[0].Terms.Unlimited = false
	in.Grants[0].Terms.Limit = 3
	in.Grants[0].Terms.BucketID = "original"
	in.Usage = []BucketUsage{{OwnerID: "owner", BucketID: "original", PeriodKey: "lifetime", Used: 2}}
	p.Offers[0].Enabled = false
	p.Offers[0].Version = "edited"
	p.Offers[0].Play = false
	p.Offers[0].Coach.Tools = []string{}
	d := resolve(t, p, in, true, "grant")
	if *d.Remaining != 1 || d.Applied[0].Offer.Version != "1.0.0" || d.BucketID != "original" {
		t.Fatal(d)
	}
	p.Offers = []Offer{}
	p.Precedence = []string{}
	resolve(t, p, in, true, "grant")
}
func TestDisabledFreeOfferAndPinnedUnlock(t *testing.T) {
	p, in := fixture(t)
	p.Offers[0].Enabled = false
	resolve(t, p, in, false, "disabled")
	g := in.Grants[0]
	in.Unlocks = []Unlock{{GrantID: g.ID, SessionID: "session", UnitID: "unit", Tools: []string{"advice"}, BucketID: g.Terms.BucketID, PeriodKey: "lifetime", OfferID: g.OfferID, OfferVersion: g.OfferVersion}}
	resolve(t, p, in, true, "existing-unlock")
	expiry := in.Now
	in.Grants[0].ValidUntil = &expiry
	resolve(t, p, in, false, "not-admitted")
	in.Admissions = []Admission{{GrantID: g.ID, SessionID: "session", UnitID: "unit", AdmittedAt: expiry.Add(-time.Minute)}}
	resolve(t, p, in, true, "existing-unlock")
	in.Grants[0].Revoked = true
	resolve(t, p, in, false, "revoked")
}
func TestReadDeliveredOwnedResultIsIndependentOfGrant(t *testing.T) {
	p, in := fixture(t)
	in.Grants = nil
	r := &SavedResult{ID: "result", OwnerID: "owner", SessionID: "session", Target: in.Target, Delivered: true, Scope: "current-game"}
	in.Operation = Operation{Kind: "read-saved", SavedResult: r}
	resolve(t, p, in, true, "owned-result")
	r.Delivered = false
	resolve(t, p, in, false, "not-owned")
	r.Delivered = true
	in.ActiveSessionID = "other"
	resolve(t, p, in, false, "not-owned")
	r.Scope = "retained"
	resolve(t, p, in, true, "owned-result")
	r.OwnerID = "other"
	resolve(t, p, in, false, "not-owned")
	r.OwnerID = "owner"
	expiry := in.Now
	r.RetainedUntil = &expiry
	resolve(t, p, in, false, "expired")
	r.RetainedUntil = nil
	in.Revoked = true
	resolve(t, p, in, false, "revoked")
}

func TestSavedResultPreservesExpiryButFencesOriginalGrantRevocation(t *testing.T) {
	p, in := fixture(t)
	expiry := in.Now.Add(-time.Minute)
	in.Grants[0].ValidUntil = &expiry
	in.Operation = Operation{Kind: "read-saved", SavedResult: &SavedResult{ID: "result", OwnerID: "owner", SessionID: "session", GrantID: "g1", Target: in.Target, Delivered: true, Scope: "retained"}}
	resolve(t, p, in, true, "owned-result")
	in.Grants[0].Revoked = true
	resolve(t, p, in, false, "revoked")
}

func TestInstalledResolverOwnsItsPolicySnapshot(t *testing.T) {
	p, in := fixture(t)
	r, err := NewResolver(p)
	if err != nil {
		t.Fatal(err)
	}
	p.Offers[0].Enabled = false
	p.Precedence[0] = "edited"
	d, err := r.Resolve(in)
	if err != nil || !d.Allowed {
		t.Fatalf("caller mutated installed resolver: %+v %v", d, err)
	}
}

func TestOfferEditsCannotResetBucketsOrCalendars(t *testing.T) {
	p, _ := fixture(t)
	limit := int64(2)
	p.Offers[0].Coach.Allowance = Allowance{Kind: "limited", Limit: &limit, Unit: "hand", Period: "day", Timezone: "UTC", BucketID: "stable"}
	raw, _ := json.Marshal(p)
	for _, mutate := range []func(*Policy){
		func(p *Policy) { p.Offers[0].Coach.Allowance.BucketID = "new" },
		func(p *Policy) { p.Offers[0].Coach.Allowance.Period = "grant" },
	} {
		next, err := DecodePolicy(raw)
		if err != nil {
			t.Fatal(err)
		}
		mutate(&next)
		if ValidatePolicyUpdate(p, next) == nil {
			t.Fatal("bucket reset accepted")
		}
	}
	next, err := DecodePolicy(raw)
	if err != nil {
		t.Fatal(err)
	}
	next.Offers[0].Version = "2"
	limit = 3
	if err = ValidatePolicyUpdate(p, next); err != nil {
		t.Fatal(err)
	}
}

func TestFreeTrialScopeEditsApplyToFutureAdmissions(t *testing.T) {
	for _, source := range []string{"free", "access-trial"} {
		p, in := fixture(t)
		in.Grants[0].SourceKind = source
		p.Offers[0].Targets = []Target{{"hearts", "solo"}}
		resolve(t, p, in, false, "wrong-target")
		in.Operation = Operation{Kind: "play", Intent: "continue", SessionID: "session", UnitID: "unit", UnitKind: "hand"}
		resolve(t, p, in, false, "wrong-target")
		in.Admissions = []Admission{{GrantID: "g1", SessionID: "session", UnitID: "unit", AdmittedAt: in.Now.Add(-time.Minute)}}
		resolve(t, p, in, true, "grant")
		in.Operation.Intent = "start"
		resolve(t, p, in, false, "wrong-target")
		p.Offers[0].Targets = []Target{in.Target}
		p.Offers[0].Play = false
		resolve(t, p, in, false, "no-grant")
		in.Operation = Operation{Kind: "coach", ToolID: "advice", SessionID: "session", UnitID: "unit", UnitKind: "hand"}
		p.Offers[0].Coach.Tools = []string{}
		resolve(t, p, in, false, "wrong-tool")
		g := in.Grants[0]
		in.Unlocks = []Unlock{{GrantID: g.ID, SessionID: "session", UnitID: "unit", Tools: []string{"advice"}, BucketID: g.Terms.BucketID, PeriodKey: "lifetime", OfferID: g.OfferID, OfferVersion: g.OfferVersion}}
		resolve(t, p, in, true, "existing-unlock")
	}
}

func TestConfigurationMatchesDurableIssuanceBounds(t *testing.T) {
	makeOffers := func(count, targetsPerOffer int) Policy {
		p, _ := LocalFixturePolicy()
		template := p.Offers[0]
		p.Offers = []Offer{}
		p.Precedence = []string{}
		for i := 0; i < count; i++ {
			o := template
			o.ID = fmt.Sprintf("offer-%d", i)
			o.Targets = o.Targets[:targetsPerOffer]
			p.Offers = append(p.Offers, o)
			p.Precedence = append(p.Precedence, o.ID)
		}
		return p
	}
	if err := ValidatePolicy(makeOffers(64, 1)); err != nil {
		t.Fatal(err)
	}
	for _, p := range []Policy{makeOffers(65, 1), makeOffers(22, 3)} {
		if ValidatePolicy(p) == nil {
			t.Fatal("unissuable configuration accepted")
		}
	}
	p, _ := LocalFixturePolicy()
	p.Offers[0].ID = strings.Repeat("x", 256)
	p.Precedence = []string{p.Offers[0].ID}
	terms, err := p.Offers[0].Terms(p.Offers[0].Targets[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(terms.BucketID) > 256 || !strings.HasPrefix(terms.BucketID, "offer-sha256:") {
		t.Fatal("overflowing generated bucket")
	}
	p.Offers[0].Version = "changed"
	next, err := p.Offers[0].Terms(p.Offers[0].Targets[1])
	if err != nil || next.BucketID != terms.BucketID {
		t.Fatal("bucket changed with target/version")
	}
	p.Offers[0].ID = strings.Repeat("界", 100)
	p.Precedence = []string{p.Offers[0].ID}
	if ValidatePolicy(p) == nil {
		t.Fatal("offer ID exceeds durable UTF-8 byte bound")
	}
	if _, err := DecodePolicy(append([]byte(strings.Repeat(" ", MaxPolicyBytes)), launchConfig...)); err == nil {
		t.Fatal("oversized policy accepted")
	}
}
func TestRejectCorruptAuthoritativeContext(t *testing.T) {
	for _, mutate := range []func(*Input){
		func(i *Input) { i.Grants[0].OwnerID = "other" },
		func(i *Input) { i.Grants = append(i.Grants, i.Grants[0]) },
		func(i *Input) { i.Usage = []BucketUsage{{"owner", "bucket", "lifetime", -1, 0}} },
		func(i *Input) { i.Grants[0].Terms.Period = "week" },
		func(i *Input) { i.Operation.UnitKind = "invented" },
	} {
		p, in := fixture(t)
		mutate(&in)
		if _, err := Resolve(p, in); err == nil {
			t.Fatal("accepted corrupt record")
		}
	}
}
func TestStrictConfigurationAndSeparateDefaults(t *testing.T) {
	p, err := LaunchPolicy()
	if err != nil || len(p.Offers) != 0 {
		t.Fatalf("launch %+v %v", p, err)
	}
	p, in := fixture(t)
	raw, _ := json.Marshal(p)
	if _, err = DecodePolicy([]byte(strings.Replace(string(raw), `"enabled":true`, `"enabled":true,"unexpected":1`, 1))); err == nil {
		t.Fatal("unknown accepted")
	}
	limit := int64(4)
	for _, mutate := range []func(*Policy){
		func(p *Policy) { p.Precedence = []string{} },
		func(p *Policy) { p.Offers[0].Targets = []Target{{"hearts", "partners"}} },
		func(p *Policy) { p.Offers[0].Coach.Tools = []string{"invented"} },
		func(p *Policy) { p.Offers[0].Kind = "access-trial" },
		func(p *Policy) {
			p.Offers[0].Coach.Allowance = Allowance{Kind: "limited", Limit: &limit, Unit: "hand", Period: "week", Timezone: "UTC", BucketID: "bucket"}
		},
		func(p *Policy) {
			p.Offers[0].Coach.Allowance = Allowance{Kind: "limited", Limit: &limit, Unit: "hand", Period: "day", Timezone: "America/Toronto", BucketID: "bucket"}
		},
	} {
		p, _ := LocalFixturePolicy()
		mutate(&p)
		if err = ValidatePolicy(p); err == nil {
			t.Fatal("invalid configuration accepted")
		}
	}
	p, _ = LocalFixturePolicy()
	p.Offers[0].Coach.Allowance = Allowance{Kind: "limited", Limit: &limit, Unit: "hand", Period: "grant", Timezone: "UTC", BucketID: "stable"}
	terms, err := p.Offers[0].Terms(in.Target)
	if err != nil || terms.Period != "lifetime" || terms.BucketID != "stable" {
		t.Fatalf("%+v %v", terms, err)
	}
}
