package coaching

import (
	d "cardford/server/internal/legacydecision"
	"strings"
	"testing"
)

func sampleAnalysis(ids ...string) d.Analysis {
	a := d.Analysis{PolicyVersion: "spades-tactics-2.1.0", Provenance: "code", Action: d.Action{Kind: "play", Seat: 0, Card: "SA"}, Candidates: []d.Candidate{{Disposition: "selected", Evidence: "heuristic", ReasonIDs: ids}}, Facts: d.Facts{OwnNil: "failed", Partner: d.Ptr(2), PartnerNil: d.Ptr("live"), CardOutcomes: []d.CardOutcome{{ActionID: "play:SA", CurrentWinner: 0, CoversPartnerNil: true}}}}
	for _, id := range ids {
		a.Reasons = append(a.Reasons, d.Reason{ID: id, Text: id + " text."})
	}
	return a
}

func TestOriginalCuePrecedenceAndReasonPriority(t *testing.T) {
	o := d.Observation{Mode: "spades-partners", Seat: 0, Trick: []d.Play{{Seat: 2, Card: "SK"}}}
	a := sampleAnalysis("S07.failed-nil", "S04.turn-order", "P02.live-nil-cover")
	advice, err := Render(o, a)
	if err != nil {
		t.Fatal(err)
	}
	if advice.Focus != "Cover your partner’s Nil" || advice.Reason != "P02.live-nil-cover text. S04.turn-order text." || advice.Suggestion != "Consider Ace of Spades to take the trick off your partner." {
		t.Fatalf("cover did not precede failed Nil: %+v", advice)
	}
	a = sampleAnalysis("P04.keep-both-live", "P04.double-nil")
	advice, err = Render(o, a)
	if err != nil || advice.Focus != "Keep both Nils live" {
		t.Fatalf("double Nil cue precedence: %+v %v", advice, err)
	}
	a = sampleAnalysis("S07.failed-nil")
	a.Action = d.Action{Kind: "bid", Bid: 0}
	advice, err = Render(o, a)
	if err != nil || advice.Bid == nil || *advice.Bid != 0 || advice.Focus != "Your team contract" {
		t.Fatalf("Nil bid cue: %+v %v", advice, err)
	}
	a.Action = d.Action{Kind: "pass"}
	if _, err = Render(o, a); err == nil || err.Error() != "Spades has no pass." {
		t.Fatalf("pass error: %v", err)
	}
}

func TestReasonTextUsesUTF16BudgetAndDistinctAvailableReasons(t *testing.T) {
	a := sampleAnalysis("long", "short", "third")
	a.Reasons = []d.Reason{{ID: "long", Text: strings.Repeat("😀", 851)}, {ID: "short", Text: "Short."}, {ID: "third", Text: "Third."}}
	if got := reasonText(a, []string{"missing", "long", "short", "short"}); got != "Short. Third." {
		t.Fatalf("UTF16 budget/skip/dedup: %q", got)
	}
	a.Reasons[0].Text = strings.Repeat("a", 1693)
	if got := reasonText(a, nil); got != a.Reasons[0].Text+" Short." {
		t.Fatalf("1700 boundary not inclusive: length=%d", len(got))
	}
}
