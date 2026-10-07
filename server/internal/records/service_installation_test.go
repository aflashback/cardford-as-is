package records

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestNewSessionSelectionPreservesOriginalResumeAndAnchor(t *testing.T) {
	c, doc, anchor, events, snap := serviceStart(t, "spades-partners")
	bound, e := c.Session(doc, snap)
	if e != nil {
		t.Fatal(e)
	}
	node, e := bound.Node()
	if e != nil || node.Seat == nil {
		t.Fatal("expected opening actor", e)
	}
	actor := *node.Seat
	before, e := c.PrepareDecision(context.Background(), doc, snap, actor, "pinned-original")
	if e != nil {
		t.Fatal(e)
	}
	originalAnchor, _ := json.Marshal(anchor)
	if bytes.Contains(originalAnchor, []byte("openingMaterial")) {
		t.Fatal("old anchor gained opaque field")
	}
	decoded, e := DecodeAnchor(originalAnchor)
	if e != nil {
		t.Fatal(e)
	}
	reencoded, _ := json.Marshal(decoded)
	if !bytes.Equal(originalAnchor, reencoded) {
		t.Fatal("legacy anchor bytes changed")
	}
	next := clonePolicy(doc.Metadata.Policy)
	next.ID = "test-explicit-policy"
	next.Version = "test-version"
	next.BudgetVersion = "test-budget"
	calls := 0
	executor := func(ctx context.Context, b gamekernel.BoundSession, actor int, policy, id string) (gamekernel.CompletePreparation, error) {
		calls++
		return b.PrepareComplete(ctx, actor, doc.Metadata.Policy.ID, id)
	}
	selector := serviceSelector("spades-partners")
	if e = c.ConfigureNewSessionPolicy(selector, next, executor); e != nil {
		t.Fatal(e)
	}
	selected, e := c.PolicyForNew(selector)
	if e != nil || !reflect.DeepEqual(selected, next) {
		t.Fatal("new policy selection missing", e)
	}
	selected.Components[0].ID = "changed"
	selected, _ = c.PolicyForNew(selector)
	if selected.Components[0].ID == "changed" {
		t.Fatal("policy aliases caller")
	}
	newMetadata, e := c.MetadataForNew(selector, "future-game", "owner")
	if e != nil || !reflect.DeepEqual(newMetadata.Policy, next) {
		t.Fatal("new metadata lacks selected pin", e)
	}
	reopened, status, e := c.Open(doc, events)
	if e != nil || !status.Playable {
		t.Fatal("original saved policy lost", e)
	}
	after, e := c.PrepareDecision(context.Background(), doc, reopened, actor, "pinned-original")
	if e != nil {
		t.Fatal(e)
	}
	if calls != 0 || !reflect.DeepEqual(before, after) {
		t.Fatal("original resume used replacement execution")
	}
	// A fresh default codec also retains the original saved tuple.
	restarted, e := NewServiceCodec()
	if e != nil {
		t.Fatal(e)
	}
	resumed, status, e := restarted.Open(doc, events)
	if e != nil || !status.Playable {
		t.Fatal(e)
	}
	final, e := restarted.PrepareDecision(context.Background(), doc, resumed, actor, "pinned-original")
	if e != nil || !reflect.DeepEqual(before, final) {
		t.Fatal("restart changed original output", e)
	}
	if e = c.ConfigureNewSessionPolicy(selector, doc.Metadata.Policy, executor); e == nil {
		t.Fatal("installed executor replaced")
	}
	changed := doc
	changed.Metadata.Policy = next
	changedSnapshot, _, e := c.Open(changed, events)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.PrepareDecision(context.Background(), changed, changedSnapshot, actor, "wrong-executor-pin"); e == nil || calls != 1 {
		t.Fatal("executor output escaped exact input/policy binding")
	}
}

func TestDefaultNewMetadataIsFrozen(t *testing.T) {
	c, e := NewServiceCodec()
	if e != nil {
		t.Fatal(e)
	}
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		selector := serviceSelector(mode)
		old, e := ServiceMetadata(selector, "id", "owner")
		if e != nil {
			t.Fatal(e)
		}
		current, e := c.MetadataForNew(selector, "id", "owner")
		if e != nil || !reflect.DeepEqual(old, current) {
			t.Fatalf("default metadata changed for %s: %v", mode, e)
		}
	}
}
