package records

import (
	"bytes"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func trixCodec(t *testing.T) *DocumentCodec {
	t.Helper()
	registry, err := sessions.NewRegistryWithRegistrations(trix.Handlers(sessions.DefaultHandlers()), trix.Installations()...)
	if err != nil {
		t.Fatal(err)
	}
	codec, err := NewServiceCodecWithRegistry(registry)
	if err != nil {
		t.Fatal(err)
	}
	return codec
}

func TestTrixNativeDocumentResumeAndDecisionBinding(t *testing.T) {
	for _, variant := range trix.Variants {
		t.Run(variant, func(t *testing.T) {
			codec := trixCodec(t)
			pin := trix.Pin(variant)
			selector := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
			meta, err := codec.MetadataForNew(selector, "trix-native", "owner")
			if err != nil {
				t.Fatal(err)
			}
			config, _ := json.Marshal(trix.Config{ID: meta.GameID, Variant: variant})
			material, _ := json.Marshal(trix.Chance{Deck: trix.Deck()})
			doc, anchor, events, err := codec.StartMaterial(meta, config, material)
			if err != nil {
				t.Fatal(err)
			}
			snap, disposition, err := codec.Open(doc, events)
			if err != nil || !disposition.Playable {
				t.Fatal(err)
			}
			commands := []CommandRecord{}
			rounds := 0
			for step := 0; step < 200; step++ {
				b, e := codec.Session(doc, snap)
				if e != nil {
					t.Fatal(e)
				}
				node, e := b.Node()
				if e != nil {
					t.Fatal(e)
				}
				var op sessions.Operation
				switch node.Kind {
				case "actor":
					actor := *node.Seat
					id := fmt.Sprintf("trix-%s-%d", variant, doc.Revision)
					input, e := codec.PreparationInput(doc, snap, actor)
					if e != nil {
						t.Fatal(e)
					}
					output, e := codec.PrepareDecision(context.Background(), doc, snap, actor, id)
					if e != nil {
						t.Fatal(e)
					}
					unit, e := codec.CurrentUnitID(doc, snap)
					if e != nil {
						t.Fatal(e)
					}
					purpose := "bot-action"
					if actor == 0 {
						purpose = "human-analysis"
					}
					d := DecisionRecord{RecordVersion: RecordVersion, ID: id, OwnerID: meta.OwnerID, GameID: meta.GameID, Revision: doc.Revision, Actor: actor, WindowID: input.WindowID, Purpose: purpose, PacketVersion: input.PacketVersion, InputDigest: input.InputDigest, Policy: meta.Policy, SelectedCandidateID: output.Prepared.CandidateID, AnalysisSchema: output.AnalysisSchema, Analysis: output.Analysis, AdviceSchema: output.AdviceSchema, Advice: output.Advice, Access: AccessAdmission{OwnerID: meta.OwnerID, Generation: 1, ControlRevision: 1, GrantID: "grant", UnitID: unit}, ReceiptID: id + "-receipt", AttemptID: id + "-attempt", AttemptFence: 1}
					if e = codec.ValidateDecision(doc, snap, d); e != nil {
						t.Fatal(e)
					}
					if step == 0 {
						bad := d
						bad.Advice = bytes.Replace(d.Advice, []byte(d.SelectedCandidateID), []byte("ineligible-candidate"), 1)
						if e = codec.ValidateDecision(doc, snap, bad); e == nil {
							t.Fatal("accepted corrupt advice candidate")
						}
					}
					op = sessions.ActorOperation{Kind: "actor", Seat: actor, CandidateID: d.SelectedCandidateID}
					raw, _ := sessions.EncodeOperation(op)
					if e = codec.ValidateDecisionCommand(d, raw); e != nil {
						t.Fatal(e)
					}
				case "round-complete":
					rounds++
					if rounds == 2 {
						return
					}
					op = sessions.ContinueOperation{Kind: "continue-round"}
				case "chance":
					op = sessions.ChanceOperation{Kind: "chance", RequestID: node.RequestID, Material: material}
				default:
					t.Fatalf("unexpected node %s", node.Kind)
				}
				raw, e := sessions.EncodeOperation(op)
				if e != nil {
					t.Fatal(e)
				}
				staged, e := codec.StageTransition(doc, snap, raw)
				if e != nil {
					t.Fatal(e)
				}
				next, delta, e := codec.AcceptStaged(doc, snap, raw, staged)
				if e != nil {
					t.Fatal(e)
				}
				digest, e := CommandDigest(meta.GameID, next.Revision, raw)
				if e != nil {
					t.Fatal(e)
				}
				commands = append(commands, CommandRecord{RecordVersion: RecordVersion, GameID: meta.GameID, CommandID: fmt.Sprintf("cmd-%d", next.Revision), Revision: next.Revision, Command: raw, Digest: digest})
				events = append(events, delta...)
				doc = next
				snap = staged.NextSnapshot()
				if step%173 == 0 || node.Kind == "round-complete" || node.Kind == "chance" {
					fresh := trixCodec(t)
					resumed, status, e := fresh.Open(doc, events)
					if e != nil || !status.Playable {
						t.Fatal(e)
					}
					before, _ := codec.Session(doc, snap)
					after, _ := fresh.Session(doc, resumed)
					v1, _ := before.Presentation(0)
					v2, _ := after.Presentation(0)
					if !bytes.Equal(v1, v2) {
						t.Fatal("resume changed safe view")
					}
					replayed, _, _, e := fresh.Replay(meta, anchor, commands)
					if e != nil || replayed.Revision != doc.Revision {
						t.Fatal("replay failed", e)
					}
				}
			}
			t.Fatal("did not finish two requests within bounded steps")
		})
	}
}
