package trix

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func frontierObservation(variant string, hand []string) Observation {
	turn, request := 0, "trix"
	return Observation{GameID: "trix", VariantID: variant, Seat: 0, Turn: &turn, Phase: "layout", Request: &request, Hand: hand, HandCounts: [4]int{len(hand), 6, 6, 6}, Board: []Row{{"C", 11, 11}, {"D", 11, 11}, {"H", 11, 11}, {"S", 11, 11}}}
}

func TestTrixFrontierJackBranchesStopIndependently(t *testing.T) {
	for _, test := range []struct {
		name    string
		hand    []string
		want    float64
		removed int
	}{
		{"gaps on both sides", []string{"DJ", "D10", "D8", "DQ", "DA", "S10"}, 15, 6},
		{"contiguous on both sides", []string{"DJ", "D10", "D9", "DQ", "DK", "S10"}, 21, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			o := frontierObservation("basic-partners", test.hand)
			o.Board[1] = Row{"D", 0, 0}
			trace, err := BuildDecisionTrace(o, FrontierPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			comparison := trace.FrontierEvidence.Comparisons[0]
			if comparison.CandidateID != "layout:DJ" || comparison.Value != test.want || comparison.RemovedCredit != test.removed || len(comparison.Branches) != 2 {
				t.Fatalf("incorrect independent jack branches: %+v", comparison)
			}
			if test.removed > 0 && (comparison.Branches[0].FirstExternal != "D9" || comparison.Branches[1].FirstExternal != "DK") {
				t.Fatal("wrong first gaps")
			}
		})
	}
}

func TestTrixFrontierRetainsPublicPartnerAndOpponentTerms(t *testing.T) {
	for _, seat := range []int{1, 2} {
		o := frontierObservation("complex-partners", []string{"C3", "D3", "D2"})
		o.Board[0], o.Board[1] = Row{"C", 4, 14}, Row{"D", 4, 14}
		o.HandCounts[seat] = 1
		o.TwoAnnouncements = &TwoAnnouncements{Status: "revealed", Cards: []Play{{seat, "C2"}}}
		old, _ := BuildDecisionTrace(o, HistoryPolicyID)
		trace, err := BuildDecisionTrace(o, FrontierPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		if !actionsEqual(trace.Action, old.Action) {
			t.Fatal("public finishing preference lost")
		}
		for i, c := range trace.Candidates {
			if c.Value != old.Candidates[i].Value {
				t.Fatal("public team/opponent term changed")
			}
		}
		branch := trace.FrontierEvidence.Comparisons[0].Branches[0]
		if !reflect.DeepEqual(branch.PossibleHolders, []int{seat}) {
			t.Fatal("public holder missing from blocker evidence")
		}
	}
	o := frontierObservation("basic-partners", []string{"C10"})
	trace, err := BuildDecisionTrace(o, FrontierPolicyID)
	if err != nil || trace.Candidates[0].Value != 1000 || trace.Status != "only-option" || trace.FrontierEvidence.Eligible {
		t.Fatalf("forced finish changed: %+v %v", trace, err)
	}
}

func TestTrixFrontierSavedEvidenceRejectsForgery(t *testing.T) {
	o := frontierObservation("basic-partners", []string{"C2", "C3", "C4", "C10", "D9", "D10"})
	trace, err := BuildDecisionTrace(o, FrontierPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if !trace.FrontierEvidence.Eligible || !trace.FrontierEvidence.SelectedChanged || trace.FrontierEvidence.PriorCandidateID != "layout:C10" {
		t.Fatal("missing comparison identity")
	}
	for _, change := range []func(*DecisionTrace){
		func(t *DecisionTrace) { t.FrontierEvidence.Comparisons[0].RemovedCredit = 0 },
		func(t *DecisionTrace) { t.FrontierEvidence.Comparisons[0].Branches[0].PossibleHolders = []int{2} },
		func(t *DecisionTrace) { t.FrontierEvidence.SelectedChanged = false },
		func(t *DecisionTrace) { t.FrontierEvidence = nil },
		func(t *DecisionTrace) { t.PolicyID = HistoryPolicyID },
	} {
		raw, _ := json.Marshal(trace)
		var modified DecisionTrace
		if err := json.Unmarshal(raw, &modified); err != nil {
			t.Fatal(err)
		}
		change(&modified)
		if ValidateDecisionTrace(o, modified) == nil {
			t.Fatal("forged frontier evidence accepted")
		}
	}
	for _, policy := range []string{ReasoningPolicyID, HistoryPolicyID} {
		old, _ := BuildDecisionTrace(o, policy)
		raw, _ := json.Marshal(old)
		if strings.Contains(string(raw), `"frontierEvidence"`) {
			t.Fatal("frontier metadata entered historical trace")
		}
	}
}

func TestTrixFrontierCompleteLayoutCoachContracts(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		for seed := 71; seed < 74; seed++ {
			s, err := New(Config{ID: "frontier-contract", Variant: variant, ProfileVersion: "1.1.0", LayoutHistoryVersion: "1.0.0"}, shuffledTestDeck(seed))
			if err != nil {
				t.Fatal(err)
			}
			s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
			if err != nil {
				t.Fatal(err)
			}
			for step := 0; s.Phase == "layout" && step < 208; step++ {
				o := Observe(s, s.Turn)
				trace, err := BuildDecisionTrace(o, FrontierPolicyID)
				if err != nil {
					t.Fatal(err)
				}
				if err = ValidateDecisionTraceWithPin(o, trace, Pin(variant)); err != nil {
					t.Fatal(err)
				}
				if _, err = BuildCoachMessage(trace, "frontier-contract"); err != nil {
					t.Fatal(err)
				}
				if _, err = BuildAdviceFromTrace(trace, "frontier-contract"); err != nil {
					t.Fatal(err)
				}
				s, err = Apply(s, s.Turn, trace.Action)
				if err != nil {
					t.Fatal(err)
				}
			}
			if s.Phase != "round-complete" || len(s.FinishOrder) != 4 {
				t.Fatalf("native layout did not finish: %s", s.Phase)
			}
		}
	}
}

// CFL-07: distant same-suit cards cannot extend a row through a missing rank.
func TestTrixFrontierPrefersOwnedPathOverDistantCount(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		o := frontierObservation(variant, []string{"C2", "C3", "C4", "C10", "D9", "D10"})
		old, err := BuildDecisionTrace(o, HistoryPolicyID)
		if err != nil || old.Action.Card != "C10" {
			t.Fatalf("control fixture changed: %+v %v", old.Action, err)
		}
		trace, err := BuildDecisionTrace(o, "trix-frontier-1.0.0")
		if err != nil || trace.Action.Card != "D10" {
			t.Fatalf("did not prefer contiguous D10/D9 over blocked clubs: %+v %v", trace.Action, err)
		}
		if err := ValidateDecisionTrace(o, trace); err != nil {
			t.Fatal(err)
		}
		message, err := BuildCoachMessage(trace, "frontier-path")
		if err != nil || message.SelectedAction != "layout:D10" || !strings.Contains(message.Reason.Summary, "own later turns") {
			t.Fatalf("action/reason mismatch: %+v %v", message, err)
		}
	}
}

func TestTrixFrontierPreservesContiguousAndOutsideScope(t *testing.T) {
	observations := []Observation{
		frontierObservation("basic-partners", []string{"C8", "C9", "C10", "D9", "D10"}),
		frontierObservation("basic-solo", []string{"C2", "C3", "C4", "C10", "D9", "D10"}),
		reasoningPlay("complex-partners", "complex"),
		frontierObservation("complex-partners", []string{"C2", "C10"}),
	}
	for _, o := range observations {
		old, err := BuildDecisionTrace(o, HistoryPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		trace, err := BuildDecisionTrace(o, "trix-frontier-1.0.0")
		if err != nil {
			t.Fatal(err)
		}
		if !actionsEqual(trace.Action, old.Action) {
			t.Fatalf("fallback changed: %+v %+v", old.Action, trace.Action)
		}
		for i, c := range trace.Candidates {
			if c.Value != old.Candidates[i].Value {
				t.Fatalf("unaffected score changed: %+v", c)
			}
		}
		if !reflect.DeepEqual(trace.HistoryEvidence, old.HistoryEvidence) {
			t.Fatal("changed inherited penalty evidence")
		}
	}
}
