package coaching

import (
	"encoding/json"
	"testing"

	d "cardford/server/internal/legacydecision"
)

func heartsObservation() d.Observation {
	o := d.Observation{Mode: "hearts", Seat: 0, ModuleVersion: "1.0.0", RuleProfileID: "hearts-training-1.0.0", ObservationSchemaVersion: "1.0.0", FeatureVersion: "1.0.0", Phase: "play", Hand: []string{"C2", "DA"}, HandSizes: []int{2, 13, 13, 13}, Bids: []*int{nil, nil, nil, nil}, Tricks: []int{0, 0, 0, 0}, Scores: []int{0, 0, 0, 0}, Bags: []int{0, 0, 0, 0}, Trick: []d.Play{}, History: []d.Trick{}, Turn: d.Ptr(0), Dealer: 3, HandNumber: 1, Events: []d.Event{}, PassDirection: "left", Pass: d.PassMemory{Outgoing: []string{}, Incoming: []string{}}, KnownHoldings: []d.Play{}}
	o.LegalActions = d.ActionsFor(o)
	o.Memory = d.GetMemory(o)
	return o
}

func TestForcedEnvelopeAndNoDecisionIgnoreSuppliedAnalysis(t *testing.T) {
	o := heartsObservation()
	before, _ := json.Marshal(o)
	advice, err := Explain(o, nil)
	if err != nil {
		t.Fatal(err)
	}
	if advice.Focus != "One legal play" || advice.Notice != "2 of Clubs is your only legal card." || advice.Reason != "The rules leave no strategic choice on this turn." || advice.Suggestion != "Play 2 of Clubs." || advice.Provenance != "forced" || advice.Evidence != "exact" || advice.Card != "C2" || advice.HighlightSuit != "" || advice.CueVersion != nil {
		t.Fatalf("forced envelope: %+v", advice)
	}
	after, _ := json.Marshal(o)
	if string(before) != string(after) {
		t.Fatal("Explain mutated observation")
	}
	for _, phase := range []string{"play", "trick-end", "hand-end", "match-end"} {
		o.Phase = phase
		o.Turn = d.Ptr(1)
		o.LegalActions = []d.Action{}
		advice, err = Explain(o, &d.Analysis{PolicyVersion: "unsupported"})
		if err != nil {
			t.Fatal(err)
		}
		focus := "Watch the table"
		if phase == "hand-end" || phase == "match-end" {
			focus = "Hand complete"
		}
		if advice.Focus != focus || advice.Provenance != "code" || advice.Evidence != "exact" || advice.PolicyVersion != "hearts-baseline-1.0.0" || advice.Notice != "No decision for you right now." || advice.Reason != "The memory aid shows facts from this hand’s public plays." || advice.Suggestion != "" || len(advice.ReasonIDs) != 0 || advice.ReasonIDs == nil {
			t.Fatalf("no-decision %s: %+v", phase, advice)
		}
	}
}

func TestSuppliedAnalysisRejectsWrongActionAndUnsupportedPolicies(t *testing.T) {
	o := heartsObservation()
	for _, a := range []d.Analysis{
		{PolicyVersion: "hearts-baseline-1.0.0", Action: d.Action{Kind: "play", Seat: 1, Card: "C2"}},
		{PolicyVersion: "hearts-baseline-1.0.0", Action: d.Action{Kind: "play", Seat: 0, Card: "DA"}},
		{SchemaVersion: "1.0.0", PolicyVersion: "hearts-plan-1.0.0", Action: d.Action{Kind: "play", Seat: 0, Card: "C2"}},
		{SchemaVersion: "1.0.0", PolicyVersion: "unknown-old-policy", Action: d.Action{Kind: "play", Seat: 0, Card: "C2"}},
		{SchemaVersion: "1.0.0", PolicyVersion: "spades-tactics-2.1.0", Action: d.Action{Kind: "play", Seat: 0, Card: "C2"}},
	} {
		if _, err := Explain(o, &a); err == nil {
			t.Fatalf("accepted mismatched/unsupported analysis %+v", a)
		}
	}
	// A supplied analysis owns its original provenance; a single legal action does
	// not relabel it forced unless that provenance was actually recorded.
	a := d.Analysis{SchemaVersion: "1.0.0", PolicyVersion: "hearts-baseline-1.0.0", Provenance: "code", Action: d.Action{Kind: "play", Seat: 0, Card: "C2"}, Candidates: []d.Candidate{}}
	advice, err := Explain(o, &a)
	if err != nil || advice.Focus != "Choose your lead" || advice.Provenance != "code" {
		t.Fatalf("supplied provenance changed: %+v %v", advice, err)
	}
	o.Memory[0].Played = 3
	if _, err = Explain(o, &a); err == nil {
		t.Fatal("observation validation skipped")
	}
}
