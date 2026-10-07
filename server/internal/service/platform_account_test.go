package service

import (
	"testing"
	"time"

	"cardford/server/internal/access"
	"cardford/server/internal/records"
)

func TestM04EPlatformFixtureDecisionAuthority(t *testing.T) {
	zero := int64(0)
	target := access.Target{GameID: "spades", VariantID: "partners"}
	now := time.Now()
	c := records.AccessContext{Now: now, Access: records.AccessState{OwnerID: "owner", Generation: 7, CanRead: true, CanPlay: true, CanCoach: true}, Grants: []records.Grant{{ID: records.LocalGrantID("owner", "spades", "partners"), OfferID: "fixture", OfferVersion: "1", ValidFrom: now.Add(-time.Hour), Terms: records.GrantTerms{CanPlay: true, CanCoach: true, Tools: []string{"advice", "review-alternative"}, BucketID: "original-lifetime"}}}}
	v := records.FixturePlatformAccess{Covered: true, Remaining: &zero}
	d := fixtureDecision(v, c, target, "game", "hand-1", "coach", "advice")
	if d.Allowed || d.Reason != "exhausted" {
		t.Fatalf("zero allowance: %+v", d)
	}
	v.HandUnlocked = true
	d = fixtureDecision(v, c, target, "game", "hand-1", "coach", "advice")
	if !d.Allowed || d.Reason != "existing-unlock" || d.BucketID != "original-lifetime" || d.PeriodKey != "lifetime" {
		t.Fatalf("original unlocked terms: %+v", d)
	}
	v.Covered = false
	d = fixtureDecision(v, c, target, "game", "hand-1", "coach", "advice")
	if d.Allowed || d.Reason != "expired" {
		t.Fatalf("expired unlocked coverage: %+v", d)
	}
	v.Covered = true
	c.Access.CanCoach = false
	d = fixtureDecision(v, c, target, "game", "hand-1", "coach", "advice")
	if d.Allowed || d.Reason != "revoked" {
		t.Fatalf("coarse security revocation: %+v", d)
	}
	c.Access.CanCoach = true
	c.Grants[0].Revoked = true
	if fixtureDecision(v, c, target, "game", "hand-1", "play", "").Allowed {
		t.Fatal("revoked original grant allowed")
	}
	c.Grants[0].Revoked = false
	c.Grants[0].Terms.Tools = []string{"advice"}
	if fixtureDecision(v, c, target, "game", "hand-1", "coach", "review-alternative").Allowed {
		t.Fatal("wrong original tool allowed")
	}
}
