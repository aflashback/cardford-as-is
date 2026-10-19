package coachlab

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"encoding/json"
	"reflect"
	"testing"
)

func TestTrixOwnershipComparisonAdmissionAndSavedParity(t *testing.T) {
	const comparison = trix.OwnershipComparisonPolicyID
	for _, variant := range trix.Variants {
		pins := []gamekernel.Pin{trix.Pin(variant), trix.LegacyPin(variant)}
		if variant == "basic-partners" || variant == "complex-partners" {
			pins = append(pins, trix.AnnouncedPin(variant))
		}
		for _, pin := range pins {
			t.Run(variant+"/"+pin.ModuleVersion, func(t *testing.T) {
				for _, arms := range [][2]string{{comparison, trix.OwnershipPolicyID}, {trix.OwnershipPolicyID, comparison}} {
					e := testTrixEnvelope(t, variant)
					e.Base.Candidate.ID, e.Base.Reference.ID = arms[0], arms[1]
					e.Base.RuleProfile.ID = pin.RuleProfileID
					e.Lab.Selector = sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
					e.Lab.SeatPolicies[1] = SeatPolicyPin{1, comparison, "1.0.0"}
					if err := e.Validate(); err != nil {
						t.Fatal("comparison pin rejected", err)
					}
					specs := EpisodeSpecs(e)
					if specs[0].Policies[0].ID != arms[1] || specs[1].Policies[0].ID != arms[0] || specs[1].Policies[1].ID != comparison {
						t.Fatal("frozen paired or continuation identity changed")
					}
				}
				control := nativeTrixAuditRecord(t, pin, trix.OwnershipPolicyID, 5)
				record := nativeTrixAuditRecord(t, pin, comparison, 5)
				if audit := AuditTrixDecision(record); audit.Status == "failed" {
					t.Fatalf("saved comparison audit failed: %+v", audit)
				}
				var baseline, trace trix.DecisionTrace
				if err := json.Unmarshal(control.OriginalAnalysis, &baseline); err != nil {
					t.Fatal(err)
				}
				if err := json.Unmarshal(record.OriginalAnalysis, &trace); err != nil {
					t.Fatal(err)
				}
				if record.SelectedCandidateID != control.SelectedCandidateID || len(trace.Candidates) != len(baseline.Candidates) {
					t.Fatal("explanation-only comparison changed selection or legal roots")
				}
				for i, candidate := range trace.Candidates {
					prior := baseline.Candidates[i]
					if candidate.CandidateID != prior.CandidateID || candidate.Value != prior.Value || !reflect.DeepEqual(candidate.Action, prior.Action) {
						t.Fatal("explanation-only comparison changed candidate actions or values")
					}
				}
				message, err := savedTrixMessage(record)
				if err != nil || message.PolicyVersion != comparison || message.CueVersion != "trix-ownership-comparison-cues-1.0.0" || message.SelectedAction != record.SelectedCandidateID || trace.SchemaVersion != "trix-decision-trace-1.4.0" || trace.PolicyID != comparison || trace.RuleProfileID != pin.RuleProfileID || trace.PublicSchemaVersion != pin.PublicSchemaVersion {
					t.Fatal("saved comparison identity or exact profile changed", err)
				}
			})
		}
	}
}

func TestTrixOwnershipComparisonPinAndContinuationIsolation(t *testing.T) {
	const comparison = trix.OwnershipComparisonPolicyID
	e := testTrixEnvelope(t, "basic-partners")
	for _, pin := range []SeatPolicyPin{{0, comparison, "2.0.0"}, {4, comparison, "1.0.0"}, {0, "trix-ownership-comparison-9.0.0", "1.0.0"}} {
		if ValidatePolicy(e.Lab.Selector, pin) == nil {
			t.Fatal("invalid comparison pin admitted")
		}
	}
	for _, game := range []string{"spades-partners", "spades-solo", "hearts-solo"} {
		foreign := testEnvelope(t, game)
		if ValidatePolicy(foreign.Lab.Selector, SeatPolicyPin{0, comparison, "1.0.0"}) == nil {
			t.Fatal("comparison policy admitted to foreign game")
		}
	}
	c := DefaultTrixEvaluationConfig("", "")
	c.Request.Policies[0] = comparison
	if err := c.Validate(); err != nil {
		t.Fatal("installed comparison continuation rejected", err)
	}
}
