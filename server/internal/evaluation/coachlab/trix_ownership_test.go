package coachlab

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestTrixOwnershipExactPinAndReversedArmAdmission(t *testing.T) {
	const ownership = "trix-ownership-1.0.0"
	for _, variant := range trix.Variants {
		pins := []gamekernel.Pin{trix.Pin(variant), trix.LegacyPin(variant)}
		if variant == "basic-partners" || variant == "complex-partners" {
			pins = append(pins, trix.AnnouncedPin(variant))
		}
		for _, pin := range pins {
			for _, arms := range [][2]string{{ownership, trix.HistoryPolicyID}, {trix.HistoryPolicyID, ownership}} {
				t.Run(variant+"/"+pin.ModuleVersion+"/"+arms[0], func(t *testing.T) {
					e := testTrixEnvelope(t, variant)
					e.Base.Candidate.ID, e.Base.Reference.ID = arms[0], arms[1]
					e.Base.RuleProfile.ID = pin.RuleProfileID
					e.Lab.Selector = sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
					e.Lab.SeatPolicies[1] = SeatPolicyPin{1, ownership, "1.0.0"}
					if err := e.Validate(); err != nil {
						t.Fatal("installed ownership policy rejected", err)
					}
					specs := EpisodeSpecs(e)
					if specs[0].Policies[0].ID != arms[1] || specs[1].Policies[0].ID != arms[0] || specs[1].Policies[1].ID != ownership {
						t.Fatal("paired arm or continuation identity changed")
					}
				})
			}
		}
	}
}

func TestTrixOwnershipSavedNativeEvidenceRoundTripAndTamper(t *testing.T) {
	const ownership = "trix-ownership-1.0.0"
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			e := testTrixEnvelope(t, variant)
			e.Base.Candidate.ID, e.Base.Reference.ID = ownership, trix.HistoryPolicyID
			adapter, err := NewAdapter(e.Lab.Selector)
			if err != nil {
				t.Fatal(err)
			}
			// Three actor-held twos and a suppressed announcement prove that
			// the fourth belongs to the partner without reading its hidden hand.
			hands := [4][]string{{"H7", "C2", "D2", "H2"}, {}, {"S2"}, {}}
			used := map[string]bool{}
			for _, hand := range hands {
				for _, card := range hand {
					used[card] = true
				}
			}
			remaining := []string{}
			for _, card := range trix.Deck() {
				if !used[card] {
					remaining = append(remaining, card)
				}
			}
			deck := []string{}
			for _, hand := range hands {
				missing := 13 - len(hand)
				deck = append(deck, hand...)
				deck = append(deck, remaining[:missing]...)
				remaining = remaining[missing:]
			}
			material, _ := json.Marshal(trix.Chance{Deck: deck})
			bound, err := adapter.Start(e.Lab.Config, material)
			if err != nil {
				t.Fatal(err)
			}
			node, _ := bound.Node()
			transition, err := bound.Commit(*node.Seat, "choose:trix")
			if err != nil {
				t.Fatal(err)
			}
			bound = transition.Next
			node, _ = bound.Node()
			if node.Seat == nil || *node.Seat != 0 {
				t.Fatal("fixture lost its actor")
			}
			spec := EpisodeSpecs(e)[1]
			episode := &EpisodeState{Spec: spec, Adapter: adapter, Session: bound, Config: e.Lab.Config, Revision: 1, Rounds: 1}
			prepared, err := Prepare(context.Background(), bound, spec.Policies[0], "ownership-original")
			if err != nil {
				t.Fatal(err)
			}
			record, err := prepareTrixRecord(episode, 0, "ownership-original", prepared)
			if err != nil {
				t.Fatal(err)
			}
			raw, err := json.Marshal(record)
			if err != nil {
				t.Fatal(err)
			}
			var restored PreparedRecord
			if err = json.Unmarshal(raw, &restored); err != nil {
				t.Fatal(err)
			}
			if err = verifyTrixPreparation(restored); err != nil {
				t.Fatal("saved ownership record did not verify", err)
			}
			var trace trix.DecisionTrace
			if err = json.Unmarshal(restored.Decision.OriginalAnalysis, &trace); err != nil {
				t.Fatal(err)
			}
			var evidence struct {
				SchemaVersion string `json:"schemaVersion"`
				Ownership     struct {
					Coverage    string `json:"coverage"`
					Eligible    bool   `json:"eligible"`
					Assignments int    `json:"assignments"`
					Twos        []struct {
						Card    string `json:"card"`
						Owners  []int  `json:"originalOwners"`
						Holders []int  `json:"possibleHolders"`
					} `json:"twos"`
				} `json:"ownershipEvidence"`
			}
			if err = json.Unmarshal(restored.Decision.OriginalAnalysis, &evidence); err != nil {
				t.Fatal(err)
			}
			if evidence.SchemaVersion != "trix-decision-trace-1.3.0" || evidence.Ownership.Coverage != "four-twos-constraints" || !evidence.Ownership.Eligible || evidence.Ownership.Assignments != 1 || len(evidence.Ownership.Twos) != 4 {
				t.Fatalf("saved trace lost exact ownership evidence: %s", restored.Decision.OriginalAnalysis)
			}
			last := evidence.Ownership.Twos[3]
			if last.Card != "S2" || !reflect.DeepEqual(last.Owners, []int{2}) || !reflect.DeepEqual(last.Holders, []int{2}) {
				t.Fatalf("saved partner ownership changed: %+v", last)
			}
			message, err := savedTrixMessage(restored.Decision)
			if err != nil || message.SelectedAction != prepared.Prepared.CandidateID || message.PolicyVersion != ownership || trace.PolicyID != ownership || trace.HistoryEvidence == nil || trace.FrontierEvidence != nil {
				t.Fatal("saved bot, trace and coach disagree", err)
			}
			blind, err := ExportBlindPacket(restored.Decision)
			if err != nil || blind.RuleProfileID != e.Base.RuleProfile.ID {
				t.Fatal("blind ownership export changed actor evidence", err)
			}
			var originalPacket, blindPacket trixEvaluationPacket
			if err = json.Unmarshal(restored.Decision.ActorPacket, &originalPacket); err != nil {
				t.Fatal(err)
			}
			if err = json.Unmarshal(blind.ActorPacket, &blindPacket); err != nil {
				t.Fatal(err)
			}
			// Blind export deliberately removes the archive ID while keeping
			// the exact decision-time actor observation and legal candidates.
			originalPacket.Observation.ID = "actor-context"
			if !reflect.DeepEqual(originalPacket, blindPacket) {
				t.Fatal("blind ownership export changed decision-time actor facts")
			}
			var changed map[string]json.RawMessage
			if err = json.Unmarshal(restored.Decision.OriginalAnalysis, &changed); err != nil {
				t.Fatal(err)
			}
			var changedEvidence map[string]json.RawMessage
			if err = json.Unmarshal(changed["ownershipEvidence"], &changedEvidence); err != nil {
				t.Fatal(err)
			}
			changedEvidence["assignments"] = json.RawMessage(`2`)
			changed["ownershipEvidence"], _ = json.Marshal(changedEvidence)
			restored.Decision.OriginalAnalysis, _ = json.Marshal(changed)
			if verifyTrixPreparation(restored) == nil || AuditTrixDecision(restored.Decision).Status != "failed" {
				t.Fatal("rewritten ownership evidence passed saved verification")
			}
		})
	}
}

func TestTrixOwnershipContinuationAndForeignPolicyIsolation(t *testing.T) {
	const ownership = "trix-ownership-1.0.0"
	e := testTrixEnvelope(t, "basic-partners")
	for _, pin := range []SeatPolicyPin{{0, ownership, "2.0.0"}, {4, ownership, "1.0.0"}, {0, "trix-ownership-9.0.0", "1.0.0"}, {0, "hearts-baseline-1.0.0", "1.0.0"}} {
		if ValidatePolicy(e.Lab.Selector, pin) == nil {
			t.Fatal("invalid candidate/version/seat or foreign policy admitted")
		}
	}
	for _, game := range []string{"spades-partners", "spades-solo", "hearts-solo"} {
		foreign := testEnvelope(t, game)
		if ValidatePolicy(foreign.Lab.Selector, SeatPolicyPin{0, ownership, "1.0.0"}) == nil {
			t.Fatal("ownership policy admitted to foreign game")
		}
	}
	c := DefaultTrixEvaluationConfig("", "")
	c.Request.Policies = [4]string{ownership, trix.HistoryPolicyID, ownership, trix.PolicyID}
	if err := c.Validate(); err != nil {
		t.Fatal("installed ownership continuation rejected", err)
	}
	c.Request.Policies[0] = "trix-ownership-9.0.0"
	if c.Validate() == nil {
		t.Fatal("unknown ownership continuation admitted")
	}
}

func TestTrixOwnershipSavedAuditRetainsHistoricalAndSoloFallbacks(t *testing.T) {
	for _, variant := range trix.Variants {
		pins := []gamekernel.Pin{trix.Pin(variant), trix.LegacyPin(variant)}
		if variant == "basic-partners" || variant == "complex-partners" {
			pins = append(pins, trix.AnnouncedPin(variant))
		}
		for _, pin := range pins {
			t.Run(variant+"/"+pin.PublicSchemaVersion, func(t *testing.T) {
				record := nativeTrixAuditRecord(t, pin, trix.OwnershipPolicyID, 5)
				if audit := AuditTrixDecision(record); audit.Status == "failed" {
					t.Fatalf("saved ownership audit lost its exact historical/current pin: %+v", audit)
				}
				var trace trix.DecisionTrace
				if err := json.Unmarshal(record.OriginalAnalysis, &trace); err != nil {
					t.Fatal(err)
				}
				if trace.OwnershipEvidence == nil || trace.PublicSchemaVersion != pin.PublicSchemaVersion || trace.RuleProfileID != pin.RuleProfileID {
					t.Fatal("saved ownership trace changed evidence or profile")
				}
				if variant == "basic-solo" || variant == "complex-solo" || pin.PublicSchemaVersion == "1.0.0" {
					control := nativeTrixAuditRecord(t, pin, trix.HistoryPolicyID, 5)
					if trace.OwnershipEvidence.Eligible || record.SelectedCandidateID != control.SelectedCandidateID {
						t.Fatal("ownership altered historical or Solo history fallback")
					}
				} else if !trace.OwnershipEvidence.Eligible {
					t.Fatal("announcement-compatible Partners profile lost ownership coverage")
				}
			})
		}
	}
}
