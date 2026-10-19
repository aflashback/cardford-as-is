package main

import (
	"cardford/server/internal/access"
	"testing"
	"time"
)

func TestAuthFreePolicyIsBounded(t *testing.T) {
	p := freePolicy()
	if e := access.ValidatePolicy(p); e != nil {
		t.Fatal(e)
	}
	for _, o := range p.Offers {
		if o.ID == "operator-local-paid" {
			if o.Enabled || p.Precedence[0] != o.ID {
				t.Fatal("operator offer must be disabled and preferred for owned grants")
			}
			continue
		}
		if o.Kind != "free" || o.Coach.Allowance.Kind != "limited" || o.Coach.Allowance.Limit == nil || *o.Coach.Allowance.Limit != 3 {
			t.Fatal("unbounded local Free coaching")
		}
	}
}

func TestAuthOperatorPaidPrecedesFree(t *testing.T) {
	p := freePolicy()
	target := access.Target{GameID: "spades", VariantID: "solo"}
	free, err := p.Offers[1].Terms(target)
	if err != nil {
		t.Fatal(err)
	}
	paid := free
	paid.Unlimited = true
	paid.Limit = 0
	paid.BucketID = "operator-local-paid"
	now := time.Now()
	until := now.Add(time.Hour)
	result, err := access.Resolve(p, access.Input{OwnerID: "owner", Generation: 1, ActiveSessionID: "game", Target: target, Now: now, Operation: access.Operation{Kind: "coach", SessionID: "game", UnitID: "hand-1", UnitKind: "hand", ToolID: "advice"}, Grants: []access.Grant{{ID: "free", OwnerID: "owner", OfferID: p.Offers[1].ID, OfferVersion: "1.0.0", SourceKind: "free", SourceID: "owner", Terms: free, ValidFrom: now.Add(-time.Hour)}, {ID: "paid", OwnerID: "owner", OfferID: "operator-local-paid", OfferVersion: "1.0.0", SourceKind: "operator-test", SourceID: "audit", Terms: paid, ValidFrom: now.Add(-time.Hour), ValidUntil: &until}}})
	if err != nil || !result.Allowed || len(result.Applied) != 1 || result.Applied[0].GrantID != "paid" {
		t.Fatal("operator Paid did not outrank Free", result, err)
	}
}
