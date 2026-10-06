package spades

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestSnapshotFrozenCorpusAndImmutableBranches(t *testing.T) {
	for _, c := range corpus(t) {
		if !strings.HasPrefix(c.Config.Mode, "spades-") {
			continue
		}
		t.Run(c.Config.Mode, func(t *testing.T) {
			raw := createSaved(t, c)
			snap, err := Open(raw)
			if err != nil {
				t.Fatal(err)
			}
			original := append([]byte{}, raw...)
			for i, command := range c.Commands {
				before, err := snap.Export()
				if err != nil {
					t.Fatal(err)
				}
				next, err := snap.Apply(command)
				if err != nil {
					t.Fatalf("step %d: %v", i, err)
				}
				after, err := snap.Export()
				if err != nil || !bytes.Equal(before, after) {
					t.Fatal("Apply changed prior snapshot")
				}
				// The same source remains independently usable after another branch.
				if i == 0 {
					branch, err := snap.Apply(command)
					if err != nil {
						t.Fatal(err)
					}
					a, _ := next.Export()
					b, _ := branch.Export()
					if !bytes.Equal(a, b) {
						t.Fatal("branch order changed result")
					}
				}
				raw, err = Apply(raw, command)
				if err != nil {
					t.Fatal(err)
				}
				exported, err := next.Export()
				if err != nil || !bytes.Equal(raw, exported) {
					t.Fatalf("step %d export mismatch", i)
				}
				for seat := 0; seat < 4; seat++ {
					p, err := next.Project(seat)
					if err != nil {
						t.Fatal(err)
					}
					ob, _ := Observe(raw, seat)
					v, _ := SafeView(raw, seat)
					ids, _ := CandidateIDs(raw, seat)
					if !bytes.Equal(p.Observation, ob) || !bytes.Equal(p.View, v) || !reflect.DeepEqual(p.CandidateIDs, ids) {
						t.Fatalf("step %d seat %d projection mismatch", i, seat)
					}
				}
				snap = next
			}
			if hashState(t, raw) != c.FinalSHA {
				t.Fatal("original final digest changed")
			}
			if len(original) == 0 {
				t.Fatal("missing source")
			}
		})
	}
}
func TestSnapshotImportsAndOutputsCannotMutatePrivateState(t *testing.T) {
	raw := start(t, "spades-partners")
	expected := append([]byte{}, raw...)
	snap, err := Open(raw)
	if err != nil {
		t.Fatal(err)
	}
	raw[0] = '['
	first, err := snap.Export()
	if err != nil || !bytes.Equal(first, expected) {
		t.Fatal("snapshot retained caller input")
	}
	first[0] = '['
	p, err := snap.Project(0)
	if err != nil {
		t.Fatal(err)
	}
	p.Observation[0] = '['
	p.View[0] = '['
	if len(p.CandidateIDs) > 0 {
		p.CandidateIDs[0] = "injected"
	}
	second, err := snap.Export()
	if err != nil || !bytes.Equal(second, expected) {
		t.Fatal("mutable projection changed private state")
	}
	before := append([]byte{}, second...)
	if _, err = snap.Apply(json.RawMessage(`{"type":"action","action":{"kind":"bid","seat":0,"bid":99}}`)); err == nil {
		t.Fatal("invalid action accepted")
	}
	after, _ := snap.Export()
	if !bytes.Equal(before, after) {
		t.Fatal("rejected action changed snapshot")
	}
	for _, bad := range []json.RawMessage{mutate(t, expected, func(m map[string]any) { m["moduleVersion"] = "future" }), mutate(t, expected, func(m map[string]any) { m["hidden"] = true }), mutate(t, expected, func(m map[string]any) { delete(m, "spadesBroken") })} {
		if _, err = Open(bad); err == nil {
			t.Fatal("unchecked snapshot import")
		}
	}
}
func TestSnapshotHiddenPermutationKeepsProjectionEqual(t *testing.T) {
	raw := start(t, "spades-partners")
	s, err := DecodeState(raw)
	if err != nil {
		t.Fatal(err)
	}
	s.Hands[1], s.Hands[2] = s.Hands[2], s.Hands[1]
	alternate, err := EncodeState(s)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := Open(raw)
	b, _ := Open(alternate)
	pa, _ := a.Project(0)
	pb, _ := b.Project(0)
	if !reflect.DeepEqual(pa, pb) {
		t.Fatal("snapshot projection disclosed concealed ownership")
	}
}
