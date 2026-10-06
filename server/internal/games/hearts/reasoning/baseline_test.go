package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"reflect"
	"testing"
)

func observation(hand []string, phase string, trick []d.Play) d.Observation {
	o := d.Observation{Mode: "hearts", Seat: 0, ModuleVersion: "1.0.0", RuleProfileID: "hearts-training-1.0.0", ObservationSchemaVersion: "1.0.0", FeatureVersion: "1.0.0", Phase: phase, Hand: hand, HandSizes: []int{len(hand), 13, 13, 13}, Bids: []*int{nil, nil, nil, nil}, Tricks: []int{0, 0, 0, 0}, Scores: []int{0, 0, 0, 0}, Bags: []int{0, 0, 0, 0}, Trick: trick, History: []d.Trick{}, Dealer: 3, HandNumber: 1, Events: []d.Event{}, PassDirection: "left", Pass: d.PassMemory{Outgoing: []string{}, Incoming: []string{}}, KnownHoldings: []d.Play{}}
	if phase == "play" {
		o.Turn = d.Ptr(0)
		o.HeartsBroken = true
		o.History = []d.Trick{{Plays: []d.Play{{Seat: 0, Card: "C3"}, {Seat: 1, Card: "C4"}, {Seat: 2, Card: "C5"}, {Seat: 3, Card: "C6"}}, Winner: 3}}
	}
	o.LegalActions = d.ActionsFor(o)
	o.Memory = d.GetMemory(o)
	return o
}

func TestOriginalHeartsSelectionAndStableTies(t *testing.T) {
	cases := []struct {
		name  string
		hand  []string
		trick []d.Play
		want  string
	}{
		{"lead rank then suit", []string{"S2", "D2", "C2", "H2"}, []d.Play{}, "play:C2"},
		{"shed queen when losing", []string{"SQ", "HA", "CA", "S2"}, []d.Play{{Seat: 1, Card: "D10"}, {Seat: 2, Card: "DQ"}}, "play:SQ"},
		{"all winners choose lowest", []string{"DQ", "DA"}, []d.Play{{Seat: 1, Card: "D10"}}, "play:DQ"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			o := observation(c.hand, "play", c.trick)
			a, err := Analyze(o)
			if err != nil {
				t.Fatal(err)
			}
			if d.ActionID(a.Action) != c.want {
				t.Fatalf("got %s want %s", d.ActionID(a.Action), c.want)
			}
		})
	}
	o := observation([]string{"C2", "D2", "H2", "S2"}, "pass", []d.Play{})
	o.LegalActions[0], o.LegalActions[3] = o.LegalActions[3], o.LegalActions[0]
	a, err := Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	if d.ActionID(a.Action) != "pass:D2,H2,S2" {
		t.Fatalf("tie did not retain legal input order: %+v", a.Action)
	}
	if a.Candidates[0].Disposition != "selected" || a.Trace == nil || a.Trace.Candidates[0].TieOrder != 0 || a.Trace.Candidates[0].Score != nil {
		t.Fatal("original candidate/trace order changed")
	}
	before, _ := json.Marshal(o)
	a.Action.Cards[0] = "SA"
	a.Candidates[0].Action.Cards[1] = "SK"
	a.Candidates[0].ReasonIDs[0] = "changed"
	after, _ := json.Marshal(o)
	if !reflect.DeepEqual(before, after) || a.Candidates[1].ReasonIDs[0] != "hearts.baseline" {
		t.Fatal("analysis aliases caller or sibling candidate")
	}
}

func TestForcedAndNoDecision(t *testing.T) {
	o := observation([]string{"D2"}, "play", []d.Play{{Seat: 1, Card: "DA"}})
	a, err := Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	if a.Provenance != "forced" || a.Reasons[0].Kind != "fact" || a.Reasons[0].Text != "Only one legal action exists." || a.Candidates[0].Evidence != "exact" || a.Trace.SelectedBy != "forced" {
		t.Fatal("forced metadata lost")
	}
	if a.Facts.Mode != "hearts" || a.Facts.ContractBid != nil || len(a.Facts.CardOutcomes) != 1 {
		t.Fatal("Hearts facts changed")
	}
	o.Turn = d.Ptr(2)
	o.LegalActions = []d.Action{}
	if _, err := Analyze(o); err == nil || err.Error() != "No decision is available for this seat." {
		t.Fatalf("no-decision error: %v", err)
	}
	o.Mode = "spades-solo"
	o.RuleProfileID = "spades-solo-training-1.0.0"
	if _, err := Analyze(o); err == nil {
		t.Fatal("Hearts analyzed wrong mode")
	}
}
