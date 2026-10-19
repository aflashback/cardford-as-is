package coachlab

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func trixEvaluationDecision(t *testing.T, variant, profile string) DecisionRecord {
	t.Helper()
	s, e := trix.New(trix.Config{ID: "lab-evaluation", Variant: variant, ProfileVersion: profile}, trix.Deck())
	if e != nil {
		t.Fatal(e)
	}
	o := trix.Observe(s, s.Turn)
	candidates := []gamekernel.PublicCandidate{}
	legal := []LabCandidate{}
	for _, a := range trix.Legal(o) {
		raw, _ := json.Marshal(a)
		candidates = append(candidates, gamekernel.PublicCandidate{ID: trix.ActionID(a), Public: raw})
		legal = append(legal, LabCandidate{trix.ActionID(a), raw})
	}
	version := "1.0.0"
	if profile == "1.1.0" {
		version = profile
	}
	packet, _ := json.Marshal(map[string]any{"publicSchemaVersion": version, "gameId": "trix", "variantId": variant, "seat": o.Seat, "phase": o.Phase, "observation": o, "candidates": candidates})
	return DecisionRecord{DecisionID: "trix-eval-case", Actor: o.Seat, Phase: o.Phase, ActorPacket: packet, LegalCandidates: legal, SelectedCandidateID: legal[0].ID}
}

func TestTrixEvaluationDispatchPairsEveryLegalRoot(t *testing.T) {
	for _, variant := range trix.Variants {
		profile := ""
		if variant == "basic-partners" || variant == "complex-partners" {
			profile = "1.1.0"
		}
		decision := trixEvaluationDecision(t, variant, profile)
		c := DefaultTrixEvaluationConfig(decision.DecisionID, decision.SelectedCandidateID)
		got, e := AnalyzePreparedDecision(context.Background(), decision, EvidenceOptions{TrixComparison: &c})
		if e != nil {
			t.Fatal(e)
		}
		if got.Status != "completed" || got.Evaluation == nil || got.TrixComparisonDetails == nil {
			t.Fatalf("Trix incorrectly unsupported: %+v", got)
		}
		if len(got.Evaluation.TestedActions) != len(decision.LegalCandidates) || len(got.Evaluation.Values) != len(decision.LegalCandidates) || len(got.Evaluation.UntestedActions) != 0 {
			t.Fatal("lost legal alternatives")
		}
		for _, v := range got.Evaluation.Values {
			if v.ActionID == decision.SelectedCandidateID && (v.Value != 0 || v.Lower != 0 || v.Upper != 0) {
				t.Fatal("original reference was not zero")
			}
		}
		before, _ := json.Marshal(got)
		again, e := AnalyzePreparedDecision(context.Background(), decision, EvidenceOptions{TrixComparison: &c})
		after, _ := json.Marshal(again)
		if e != nil || string(before) != string(after) {
			t.Fatal("replay changed comparison")
		}
	}
}

func TestTrixEvaluationIncompleteDoesNotPublishPartialPreference(t *testing.T) {
	d := trixEvaluationDecision(t, "basic-solo", "")
	c := DefaultTrixEvaluationConfig(d.DecisionID, d.SelectedCandidateID)
	c.Request.MaxSteps = 1
	got, e := AnalyzePreparedDecision(context.Background(), d, EvidenceOptions{TrixComparison: &c})
	if e != nil {
		t.Fatal(e)
	}
	if got.Status != "incomplete" || got.Evaluation.Status != "incomplete" || len(got.Evaluation.Values) != 0 || len(got.Evaluation.UntestedActions) != len(d.LegalCandidates) {
		t.Fatalf("partial work presented as evidence: %+v", got)
	}
	c.DecisionID = "other-decision"
	if _, e = AnalyzePreparedDecision(context.Background(), d, EvidenceOptions{TrixComparison: &c}); e == nil {
		t.Fatal("comparison original identity unbound")
	}
}

func TestTrixEvaluationConfigAndHistoricalProfileIsolation(t *testing.T) {
	batch := DefaultEvaluationBatchConfig()
	tc := DefaultTrixEvaluationConfig("", "")
	batch.TrixComparison = &tc
	raw, _ := json.Marshal(batch)
	decoded, e := DecodeEvaluationBatch(raw)
	if e != nil || !reflect.DeepEqual(batch, decoded) {
		t.Fatal("Trix fixed config cannot roundtrip", e)
	}
	for _, profile := range []string{"", "1.1.0"} {
		d := trixEvaluationDecision(t, "basic-partners", profile)
		c := DefaultTrixEvaluationConfig(d.DecisionID, d.SelectedCandidateID)
		got, e := AnalyzePreparedDecision(context.Background(), d, EvidenceOptions{TrixComparison: &c})
		if e != nil {
			t.Fatal(e)
		}
		want := trix.LegacyPin("basic-partners")
		if profile != "" {
			want = trix.AnnouncedPin("basic-partners")
		}
		if got.TrixComparisonDetails.Result.RulePin != want {
			t.Fatal("historical rule pin promoted")
		}
	}
	batch.TrixComparison.Request.Policies[0] = "spades-tactics-2.1.0"
	if batch.Validate() == nil {
		t.Fatal("foreign continuation admitted")
	}
}

func TestTrixEvaluationRejectsChangedActionPayloadWithSameID(t *testing.T) {
	d := trixEvaluationDecision(t, "basic-solo", "")
	// Request kind/ID remain valid, but a card payload is not part of that
	// legal action. Identity alone must not validate the saved alternative.
	var action trix.Action
	if e := json.Unmarshal(d.LegalCandidates[0].Action, &action); e != nil {
		t.Fatal(e)
	}
	action.Card = "C2"
	d.LegalCandidates[0].Action, _ = json.Marshal(action)
	c := DefaultTrixEvaluationConfig(d.DecisionID, d.SelectedCandidateID)
	if _, e := AnalyzePreparedDecision(context.Background(), d, EvidenceOptions{TrixComparison: &c}); e == nil {
		t.Fatal("changed candidate payload admitted through matching ID")
	}
}
