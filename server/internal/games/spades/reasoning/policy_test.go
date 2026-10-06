package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"reflect"
	"slices"
	"testing"
)

func observation(mode string, hand []string, trick []d.Play, bids []int) d.Observation {
	profile := "spades-solo-training-1.0.0"
	if mode == "spades-partners" {
		profile = "spades-training-1.0.0"
	}
	o := d.Observation{Mode: mode, Seat: 0, ModuleVersion: "1.0.0", RuleProfileID: profile, ObservationSchemaVersion: "1.0.0", FeatureVersion: "1.0.0", Phase: "play", Hand: hand, HandSizes: []int{len(hand), 13, 13, 13}, Bids: []*int{}, Tricks: []int{0, 0, 0, 0}, Scores: []int{0, 0, 0, 0}, Bags: []int{0, 0, 0, 0}, Trick: trick, History: []d.Trick{}, Turn: d.Ptr(0), Dealer: 3, HandNumber: 1, Events: []d.Event{}, PassDirection: "hold", Pass: d.PassMemory{Outgoing: []string{}, Incoming: []string{}}, KnownHoldings: []d.Play{}}
	for _, b := range bids {
		o.Bids = append(o.Bids, d.Ptr(b))
	}
	o.Memory = d.GetMemory(o)
	o.LegalActions = d.ActionsFor(o)
	return o
}

func TestDoubleNilExactTrickConsequenceAndOrderedTrace(t *testing.T) {
	o := observation("spades-partners", []string{"C2", "CK"}, []d.Play{{Seat: 1, Card: "CQ"}, {Seat: 2, Card: "C3"}, {Seat: 3, Card: "C4"}}, []int{0, 4, 0, 3})
	before, _ := json.Marshal(o)
	a, err := Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	if a.Action.Card != "C2" || a.PolicyVersion != PolicyVersion || !slices.Contains(a.Candidates[0].ReasonIDs, "P04.keep-both-live") {
		t.Fatalf("wrong double Nil action: %+v", a.Action)
	}
	effects := a.Trace.Candidates[0].Effects
	if effects[0].ID != "tie.economical-rank" || effects[1].ID != "P04.keep-both-live" || effects[1].Delta != 1000 {
		t.Fatal("trace ordering changed")
	}
	if a.Facts.CardOutcomes[0].GuaranteedWinner == nil || *a.Facts.CardOutcomes[0].GuaranteedWinner != 1 {
		t.Fatal("fourth-player winner is not exact")
	}
	after, _ := json.Marshal(o)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("analysis mutated observation")
	}
	a.Facts.PossibleOwners[0].Seats[0] = 3
	*a.Facts.OwnBid = 12
	a.Candidates[0].ReasonIDs[0] = "altered"
	again, err := Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	if again.Candidates[0].ReasonIDs[0] == "altered" || *o.Bids[0] != 0 {
		t.Fatal("analysis ownership escaped")
	}
}

func TestForcedMoveStillHasFullOriginalTacticalReasons(t *testing.T) {
	o := observation("spades-solo", []string{"CA"}, []d.Play{{Seat: 1, Card: "C2"}, {Seat: 2, Card: "C3"}, {Seat: 3, Card: "C4"}}, []int{0, 3, 4, 4})
	a, err := Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	if a.Provenance != "forced" || a.Trace.SelectedBy != "forced" || a.Candidates[0].Evidence != "exact" || a.Candidates[0].ReasonIDs[0] != "S01.forced" {
		t.Fatal("forced provenance or order lost")
	}
	if !slices.Contains(a.Candidates[0].ReasonIDs, "S06.guaranteed-failure") || a.Reasons[len(a.Reasons)-1].ID != "S01.forced" {
		t.Fatal("forced action lost original tactic trace")
	}
}

func TestContextualBidRejectsImpossibleNilAndPreservesLimitations(t *testing.T) {
	o := observation("spades-partners", d.FullDeck()[39:], []d.Play{}, []int{0, 0, 13, 0})
	o.Phase = "bid"
	o.Bids[0] = nil
	o.Bids[1] = nil
	o.Bids[3] = nil
	o.LegalActions = d.ActionsFor(o)
	a, err := Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	if a.Action.Kind != "bid" || a.Action.Bid != 1 || len(a.Candidates) != 14 || len(a.Limitations) != 4 {
		t.Fatalf("impossible-contract fallback lost: %+v", a.Action)
	}
	if a.Trace.Candidates[0].Effects[2].Delta != -200 || a.Trace.Candidates[1].Effects[1].Delta != -100 {
		t.Fatal("exact feasibility evidence lost")
	}
	reversed := append([]d.Action{}, o.LegalActions...)
	slices.Reverse(reversed)
	o.LegalActions = reversed
	if _, err := Analyze(o); err == nil || err.Error() != "Spades bid assessment requires the complete legal set." {
		t.Fatalf("reordered bid rejection changed: %v", err)
	}
}

func TestNoDecisionAndWrongGameFailClosed(t *testing.T) {
	o := observation("spades-solo", []string{"C2"}, []d.Play{}, []int{1, 1, 1, 1})
	o.Turn = d.Ptr(1)
	o.LegalActions = d.ActionsFor(o)
	if _, err := Analyze(o); err == nil || err.Error() != "No decision is available for this seat." {
		t.Fatalf("waiting rejection changed: %v", err)
	}
	o.Mode = "hearts"
	o.RuleProfileID = "hearts-training-1.0.0"
	o.Turn = d.Ptr(0)
	o.LegalActions = d.ActionsFor(o)
	if _, err := Analyze(o); err == nil {
		t.Fatal("wrong game policy dispatch")
	}
}
