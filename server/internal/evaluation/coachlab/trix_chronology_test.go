package coachlab

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"testing"
)

func nativeTrixAuditRecord(t *testing.T, pin gamekernel.Pin, policy string, turns int) DecisionRecord {
	t.Helper()
	adapter, err := NewAdapter(sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID})
	if err != nil {
		t.Fatal(err)
	}
	config, _ := json.Marshal(trix.Config{ID: "audit-chronology", Variant: pin.VariantID})
	material, _ := json.Marshal(trix.Chance{Deck: trix.Deck()})
	bound, err := adapter.Start(config, material)
	if err != nil {
		t.Fatal(err)
	}
	if turns >= 0 {
		node, _ := bound.Node()
		transition, err := bound.Commit(*node.Seat, "choose:trix")
		if err != nil {
			t.Fatal(err)
		}
		bound = transition.Next
		for i := 0; i < turns; i++ {
			node, _ := bound.Node()
			prepared, err := Prepare(context.Background(), bound, SeatPolicyPin{*node.Seat, trix.PolicyID, "1.0.0"}, "advance")
			if err != nil {
				t.Fatal(err)
			}
			transition, err = bound.Commit(*node.Seat, prepared.Prepared.CandidateID)
			if err != nil {
				t.Fatal(err)
			}
			bound = transition.Next
		}
	}
	node, _ := bound.Node()
	actor := *node.Seat
	prepared, err := Prepare(context.Background(), bound, SeatPolicyPin{actor, policy, "1.0.0"}, "audit-original")
	if err != nil {
		t.Fatal(err)
	}
	binding, err := bound.PreparationBinding(actor, policy)
	if err != nil {
		t.Fatal(err)
	}
	var packet trixEvaluationPacket
	if err = json.Unmarshal(binding.Packet, &packet); err != nil {
		t.Fatal(err)
	}
	candidates := []LabCandidate{}
	for _, candidate := range packet.Candidates {
		candidates = append(candidates, LabCandidate{candidate.ID, candidate.Public})
	}
	record := DecisionRecord{DecisionID: "audit-original", Actor: actor, Phase: packet.Phase, Forced: len(candidates) == 1, PolicyPin: SeatPolicyPin{actor, policy, "1.0.0"}, InputDigest: binding.InputDigest, ActorPacket: binding.Packet, LegalCandidates: candidates, SelectedCandidateID: prepared.Prepared.CandidateID, RegisteredAnalysis: prepared.Prepared.Analysis, OriginalAnalysis: prepared.Detail.Bytes, OriginalAdvice: prepared.Advice.Bytes}
	message, err := savedTrixMessage(record)
	if err != nil {
		t.Fatal(err)
	}
	record.CoachMessage, _ = json.Marshal(message)
	return record
}

func TestTrixChronologyLabExactProfiles(t *testing.T) {
	for _, variant := range trix.Variants {
		pins := []gamekernel.Pin{trix.LegacyPin(variant), trix.Pin(variant)}
		if variant == "basic-partners" || variant == "complex-partners" {
			pins = append(pins, trix.AnnouncedPin(variant))
		}
		for _, pin := range pins {
			t.Run(variant+"/"+pin.PublicSchemaVersion, func(t *testing.T) {
				record := nativeTrixAuditRecord(t, pin, trix.HistoryPolicyID, 5)
				if audit := AuditTrixDecision(record); audit.Status == "failed" {
					t.Fatalf("exact historical/current audit failed: %+v", audit)
				}
				blind, err := ExportBlindPacket(record)
				if err != nil {
					t.Fatal(err)
				}
				if blind.RuleProfileID != pin.RuleProfileID {
					t.Fatalf("rule pin changed: %s", blind.RuleProfileID)
				}
				if err = contracts.Validate("RegisteredActorPacket", blind.ActorPacket); err != nil {
					t.Fatal("blind export lost required chronology", err)
				}
				var original, exported trixEvaluationPacket
				_ = json.Unmarshal(record.ActorPacket, &original)
				_ = json.Unmarshal(blind.ActorPacket, &exported)
				before, _ := json.Marshal(original.Observation.LayoutHistory)
				after, _ := json.Marshal(exported.Observation.LayoutHistory)
				if !bytes.Equal(before, after) {
					t.Fatal("blind export changed captured public turns")
				}
				c := DefaultTrixEvaluationConfig(record.DecisionID, record.SelectedCandidateID)
				c.Request.Worlds = 1
				c.Request.MaxSamplerOperations = 1
				result, err := evaluateTrixDecision(context.Background(), record, c)
				if err != nil || result.Result.RulePin != pin {
					t.Fatalf("evaluator rebound exact pin: %+v %v", result.Result.RulePin, err)
				}
				if result.Summary.Status != "incomplete" {
					t.Fatal("bounded pin probe claimed completed evidence")
				}
			})
		}
	}
}

func TestTrixChronologyLabRejectsForgedBaselineHistory(t *testing.T) {
	record := nativeTrixAuditRecord(t, trix.Pin("basic-partners"), trix.PolicyID, 5)
	if AuditTrixDecision(record).Status == "failed" {
		t.Fatal("unmodified baseline audit failed")
	}
	var packet trixEvaluationPacket
	_ = json.Unmarshal(record.ActorPacket, &packet)
	packet.Observation.LayoutHistory.Turns[0].Ordinal = 2
	record.ActorPacket, _ = json.Marshal(packet)
	if err := contracts.Validate("RegisteredActorPacket", record.ActorPacket); err != nil {
		t.Fatal("tamper must remain schema-valid", err)
	}
	if AuditTrixDecision(record).Status != "failed" {
		t.Fatal("baseline audit accepted forged public chronology")
	}
	if _, err := ExportBlindPacket(record); err == nil {
		t.Fatal("blind export accepted forged public chronology")
	}
}

func TestTrixChronologyLabRejectsUnknownAndSoloAnnouncementPins(t *testing.T) {
	record := nativeTrixAuditRecord(t, trix.Pin("basic-solo"), trix.PolicyID, -1)
	for _, version := range []string{"1.1.0", "9.0.0"} {
		changed := record
		var packet trixEvaluationPacket
		_ = json.Unmarshal(record.ActorPacket, &packet)
		packet.PublicSchemaVersion = version
		packet.Observation.LayoutHistory = nil
		changed.ActorPacket, _ = json.Marshal(packet)
		if AuditTrixDecision(changed).Status != "failed" {
			t.Fatal("audit accepted impossible schema", version)
		}
		if _, err := ExportBlindPacket(changed); err == nil {
			t.Fatal("blind export accepted impossible schema", version)
		}
		c := DefaultTrixEvaluationConfig(changed.DecisionID, changed.SelectedCandidateID)
		if _, err := evaluateTrixDecision(context.Background(), changed, c); err == nil {
			t.Fatal("evaluator accepted impossible schema", version)
		}
	}
	record.ActorObservation.RuleProfileID = "trix-basic-solo-9.0.0"
	if _, err := ExportBlindPacket(record); err == nil {
		t.Fatal("legacy observation field replaced exact Trix rule pin")
	}
}

func TestTrixFactAuditRejectsSchemaValidProjectionTampering(t *testing.T) {
	// Historical observations avoid relying on the new public-pin implementation
	// while proving that schema-valid fact/metadata edits cannot pass the audit.
	record := nativeTrixAuditRecord(t, trix.LegacyPin("basic-partners"), trix.ReasoningPolicyID, 1)
	if AuditTrixDecision(record).Status == "failed" {
		t.Fatal("unmodified historical trace audit failed")
	}
	mutations := map[string]func(map[string]any){
		"fact-kind":         func(v map[string]any) { v["facts"].([]any)[0].(map[string]any)["kind"] = "inferred" },
		"candidate-binding": func(v map[string]any) { v["facts"].([]any)[0].(map[string]any)["candidateId"] = "layout:CJ" },
		"objective":         func(v map[string]any) { v["objective"].(map[string]any)["id"] = "other-objective" },
		"horizon":           func(v map[string]any) { v["horizon"].(map[string]any)["version"] = "9.0.0" },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			changed := record
			var projection map[string]any
			_ = json.Unmarshal(record.RegisteredAnalysis, &projection)
			mutate(projection)
			changed.RegisteredAnalysis, _ = json.Marshal(projection)
			if err := contracts.Validate("RegisteredAnalysis", changed.RegisteredAnalysis); err != nil {
				t.Fatal("tamper must remain schema-valid", err)
			}
			if AuditTrixDecision(changed).Status != "failed" {
				t.Fatal("accepted altered registered trace projection")
			}
		})
	}
}
