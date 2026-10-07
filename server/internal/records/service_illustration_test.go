package records_test

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/localpolicies"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"cardford/server/internal/strategy/installation"
)

func illustrationSource(t *testing.T, mode string) d.Observation {
	t.Helper()
	material, _ := json.Marshal(map[string]any{"kind": "deal", "deck": d.FullDeck()})
	config := json.RawMessage(`{"id":"illustration-test","dealer":3}`)
	var b gamekernel.BoundSession
	var err error
	if mode == "hearts" {
		b, err = hearts.StartSession(config, material)
	} else {
		b, err = spades.StartSession(strings.TrimPrefix(mode, "spades-"), config, material)
	}
	if err != nil {
		t.Fatal(err)
	}
	for step := 0; step < 5; step++ {
		n, err := b.Node()
		if err != nil {
			t.Fatal(err)
		}
		if n.Phase == "play" {
			raw, err := b.LegacyObservation(*n.Seat)
			if err != nil {
				t.Fatal(err)
			}
			var o d.Observation
			if err = json.Unmarshal(raw, &o); err != nil {
				t.Fatal(err)
			}
			return o
		}
		var next gamekernel.BoundTransition
		if n.Kind == "sealed" {
			choices := []gamekernel.SeatChoice{}
			for _, actor := range n.Actors {
				raw, err := b.LegacyObservation(actor)
				if err != nil {
					t.Fatal(err)
				}
				var o d.Observation
				if err = json.Unmarshal(raw, &o); err != nil {
					t.Fatal(err)
				}
				choices = append(choices, gamekernel.SeatChoice{Seat: actor, CandidateID: d.ActionID(o.LegalActions[0])})
			}
			next, err = b.CommitSealed(n.WindowID, choices)
		} else {
			next, err = b.Commit(*n.Seat, "bid:1")
		}
		if err != nil {
			t.Fatal(err)
		}
		b = next.Next
	}
	t.Fatal("play source not reached")
	return d.Observation{}
}

func TestSavedPolicyIllustrationDispatchAndRestart(t *testing.T) {
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			codec, err := records.NewServiceCodec()
			if err != nil {
				t.Fatal(err)
			}
			p := records.OriginalPin(mode)
			selector := sessions.Selector{GameID: p.GameID, VariantID: p.VariantID, ModuleVersion: "2.0.0", RuleProfileID: p.RuleProfileID}
			baseline, err := codec.MetadataForNew(selector, "saved-source", "owner")
			if err != nil {
				t.Fatal(err)
			}
			if err = installation.InstallActorRollout(codec, true); err != nil {
				t.Fatal(err)
			}
			actor, err := codec.MetadataForNew(selector, "saved-source", "owner")
			if err != nil {
				t.Fatal(err)
			}
			cases := []records.SessionMetadata{baseline, actor}
			if mode == "spades-partners" {
				if err = localpolicies.InstallPartner(codec, true); err != nil {
					t.Fatal(err)
				}
				partner, err := codec.MetadataForNew(selector, "saved-source", "owner")
				if err != nil {
					t.Fatal(err)
				}
				cases = append(cases, partner)
			}
			// Fresh startup selects originals while retaining saved exact executors.
			restarted, err := records.NewServiceCodec()
			if err != nil {
				t.Fatal(err)
			}
			if err = installation.InstallActorRollout(restarted, false); err != nil {
				t.Fatal(err)
			}
			if err = localpolicies.InstallPartner(restarted, false); err != nil {
				t.Fatal(err)
			}
			o := illustrationSource(t, mode)
			candidate := d.ActionID(o.LegalActions[0])
			before, _ := json.Marshal(o)
			oldFrames, err := sessions.Illustrate(context.Background(), gamekernel.Pin(baseline.Pin), o, candidate, 23, baseline.Policy.ID)
			if err != nil {
				t.Fatal(err)
			}
			for _, source := range cases {
				got, err := restarted.Illustrate(context.Background(), source, source.Policy, o, candidate, 23)
				if err != nil {
					t.Fatalf("%s: %v", source.Policy.ID, err)
				}
				if got.Frames[len(got.Frames)-1].Phase != "trick-end" {
					t.Fatal("crossed trick boundary")
				}
				if source.Policy.ID == baseline.Policy.ID {
					if got.PolicyNote != "" || !reflect.DeepEqual(got.Frames, oldFrames) {
						t.Fatal("original output changed")
					}
				} else if got.PolicyNote == "" {
					t.Fatal("reply policy disclosure missing")
				}
				if source.Policy.ID == d.ActorRolloutPolicy {
					if !reflect.DeepEqual(got.Frames, oldFrames) || !strings.Contains(got.PolicyNote, "does not repeat the full two-deal search") {
						t.Fatal("actor continuation component mismatch")
					}
				}
				changed := source.Policy
				changed.Components = append([]records.ComponentVersion{}, changed.Components...)
				changed.Components[len(changed.Components)-1].Version = "999.0.0"
				if _, err = restarted.Illustrate(context.Background(), source, changed, o, candidate, 23); err == nil {
					t.Fatal("mismatched original policy accepted")
				}
				source.Policy = changed
				if _, err = restarted.Illustrate(context.Background(), source, changed, o, candidate, 23); err == nil {
					t.Fatal("uninstalled component tuple accepted")
				}
			}
			after, _ := json.Marshal(o)
			if string(before) != string(after) {
				t.Fatal("source observation mutated")
			}
			cancelled, cancel := context.WithCancel(context.Background())
			cancel()
			if _, err = restarted.Illustrate(cancelled, actor, actor.Policy, o, candidate, 23); err == nil {
				t.Fatal("cancelled continuation accepted")
			}
		})
	}
}
