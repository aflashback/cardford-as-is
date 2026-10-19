package records

import (
	"bytes"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestTrixHistoricalPartnersResumeOriginalPinsAndBytes(t *testing.T) {
	for _, variant := range trix.Variants {
		versions := []string{"1.0.0"}
		if variant == "basic-partners" || variant == "complex-partners" {
			versions = append(versions, "1.1.0")
		}
		for _, version := range versions {
			t.Run(variant+"/"+version, func(t *testing.T) {
				codec := trixCodec(t)
				pin, err := trix.PinForPublicSchema(variant, version)
				if err != nil {
					t.Fatal(err)
				}
				selector := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
				if _, err := codec.MetadataForNew(selector, "legacy-partners", "owner"); err == nil {
					t.Fatal("historical selector admitted a new game")
				}
				current := trix.Pin(variant)
				meta, err := codec.MetadataForNew(sessions.Selector{GameID: current.GameID, VariantID: current.VariantID, ModuleVersion: current.ModuleVersion, RuleProfileID: current.RuleProfileID}, "legacy-partners", "owner")
				if err != nil {
					t.Fatal(err)
				}
				meta.Pin = ModulePin(pin)
				meta.Policy, err = codec.PolicyForNew(selector)
				if err != nil {
					t.Fatal(err)
				}
				cfg := trix.Config{ID: meta.GameID, Variant: variant}
				if version == "1.1.0" {
					cfg.ProfileVersion = "1.1.0"
				}
				config, _ := json.Marshal(cfg)
				material, _ := json.Marshal(trix.Chance{Deck: trix.Deck()})
				// A historical replay anchor can still instantiate its original model;
				// public admission above is separately forbidden.
				doc, _, events, err := codec.StartMaterial(meta, config, material)
				if err != nil {
					t.Fatal(err)
				}
				snap, disposition, err := codec.Open(doc, events)
				if err != nil || !disposition.Playable {
					t.Fatalf("original reader not executable: %v", err)
				}
				bound, _ := codec.Session(doc, snap)
				node, _ := bound.Node()
				op, _ := sessions.EncodeOperation(sessions.ActorOperation{Kind: "actor", Seat: *node.Seat, CandidateID: "choose:trix"})
				staged, err := codec.StageTransition(doc, snap, op)
				if err != nil {
					t.Fatal(err)
				}
				doc, delta, err := codec.AcceptStaged(doc, snap, op, staged)
				if err != nil {
					t.Fatal(err)
				}
				events = append(events, delta...)
				snap = staged.NextSnapshot()
				bound, _ = codec.Session(doc, snap)
				before, err := bound.Presentation(0)
				if err != nil {
					t.Fatal(err)
				}
				if bytes.Contains(before, []byte("layoutHistory")) || bytes.Contains(doc.Checkpoint.State, []byte("layoutHistoryVersion")) || version == "1.0.0" && (bytes.Contains(before, []byte("twoAnnouncements")) || bytes.Contains(doc.Checkpoint.State, []byte("profileVersion"))) {
					t.Fatal("legacy layout gained modern rules")
				}
				original, err := codec.EncodeDocument(doc)
				if err != nil {
					t.Fatal(err)
				}
				fresh := trixCodec(t)
				decoded, err := fresh.DecodeDocument(original)
				if err != nil {
					t.Fatal(err)
				}
				resumed, status, err := fresh.Open(decoded, events)
				if err != nil || !status.Playable || !reflect.DeepEqual(decoded.Metadata, meta) {
					t.Fatalf("legacy resume changed pins: %v", err)
				}
				afterBound, _ := fresh.Session(decoded, resumed)
				after, _ := afterBound.Presentation(0)
				reencoded, _ := fresh.EncodeDocument(decoded)
				if !bytes.Equal(before, after) || !bytes.Equal(original, reencoded) {
					t.Fatal("legacy original bytes changed")
				}
				originalNode, _ := afterBound.Node()
				prepared, err := fresh.PrepareDecision(context.Background(), decoded, resumed, *originalNode.Seat, "legacy-original-decision")
				if err != nil || !bytes.Contains(prepared.Analysis, []byte(`"publicSchemaVersion":"`+version+`"`)) {
					t.Fatalf("legacy preparation unavailable: %v", err)
				}
			})
		}
	}
}
