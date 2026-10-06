package coaching

import (
	d "cardford/server/internal/legacydecision"
	"testing"
)

func TestOriginalHeartsPassAndFollowCue(t *testing.T) {
	a := d.Analysis{PolicyVersion: "hearts-baseline-1.0.0", Provenance: "code", Action: d.Action{Kind: "pass", Seat: 0, Cards: []string{"SQ", "SK", "SA"}}, Candidates: []d.Candidate{{Disposition: "selected", Evidence: "heuristic", ReasonIDs: []string{"hearts.baseline"}}}}
	advice, err := Render(d.Observation{Mode: "hearts"}, a)
	if err != nil {
		t.Fatal(err)
	}
	if advice.Focus != "Plan the whole pass" || len(advice.Pass) != 3 || advice.CueVersion != nil || advice.Outcome != "" {
		t.Fatal("original pass envelope changed")
	}
	advice.Pass[0] = "C2"
	advice.ReasonIDs[0] = "changed"
	if a.Action.Cards[0] != "SQ" || a.Candidates[0].ReasonIDs[0] != "hearts.baseline" {
		t.Fatal("advice aliases analysis")
	}
	a.Action = d.Action{Kind: "play", Seat: 0, Card: "DQ"}
	o := d.Observation{Mode: "hearts", Hand: []string{"DQ"}, Trick: []d.Play{{Seat: 1, Card: "D2"}}}
	advice, err = Render(o, a)
	if err != nil {
		t.Fatal(err)
	}
	if advice.Focus != "diamonds were led" || advice.Notice != "diamonds were led. You must follow suit." || advice.Suggestion != "Consider Queen of Diamonds. Other plans can be reasonable." || advice.HighlightSuit != "D" {
		t.Fatalf("wrong follow cue: %+v", advice)
	}
	o.Hand = []string{"SQ"}
	advice, err = Render(o, a)
	if err != nil || advice.Notice != "You have no diamonds to follow." {
		t.Fatalf("wrong void cue: %+v %v", advice, err)
	}
	a.Action = d.Action{Kind: "bid", Bid: 0}
	if _, err = Render(o, a); err == nil || err.Error() != "Hearts has no bid." {
		t.Fatalf("bid error: %v", err)
	}
}
