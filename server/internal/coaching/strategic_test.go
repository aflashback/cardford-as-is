package coaching_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"cardford/server/internal/coaching"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	hr "cardford/server/internal/games/hearts/reasoning"
	d "cardford/server/internal/legacydecision"
)

// Reach the owner's example through a full conserved deal, a legal sealed pass,
// one completed trick and three legal plays. Seat 2 has exhausted its only club.
func queenPosition(t *testing.T) d.Observation {
	t.Helper()
	hands := [4][]string{{"C2", "C3", "CA"}, {"C10", "CJ"}, {"C4", "SQ"}, {"C5", "C6", "C7", "C8", "C9", "CQ", "CK"}}
	used := map[string]bool{}
	for _, h := range hands {
		for _, c := range h {
			used[c] = true
		}
	}
	for _, c := range d.FullDeck() {
		if used[c] {
			continue
		}
		for seat := 0; seat < 4; seat++ {
			if len(hands[seat]) < 13 {
				hands[seat] = append(hands[seat], c)
				break
			}
		}
	}
	received := [4][]string{}
	for seat, h := range hands {
		for _, c := range h {
			if d.CardSuit(c) != "C" && len(received[seat]) < 3 {
				received[seat] = append(received[seat], c)
			}
		}
	}
	initial := [4][]string{}
	for seat, h := range hands {
		for _, c := range h {
			if !has(received[seat], c) {
				initial[seat] = append(initial[seat], c)
			}
		}
		initial[seat] = append(initial[seat], received[(seat+1)%4]...)
	}
	deck := []string{}
	for i := 0; i < 13; i++ {
		for seat := 0; seat < 4; seat++ {
			deck = append(deck, initial[seat][i])
		}
	}
	material, _ := json.Marshal(map[string]any{"kind": "deal", "deck": deck})
	b, err := hearts.StartSession(json.RawMessage(`{"id":"coach-queen","dealer":3}`), material)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := b.Node()
	choices := []gamekernel.SeatChoice{}
	for seat := 0; seat < 4; seat++ {
		choices = append(choices, gamekernel.SeatChoice{Seat: seat, CandidateID: d.ActionID(d.Action{Kind: "pass", Seat: seat, Cards: d.Sorted(received[(seat+1)%4])})})
	}
	tr, err := b.CommitSealed(n.WindowID, choices)
	if err != nil {
		t.Fatal(err)
	}
	b = tr.Next
	for _, p := range []d.Play{{0, "C2"}, {1, "C10"}, {2, "C4"}, {3, "C5"}, {1, "CJ"}, {2, "SQ"}, {3, "CK"}} {
		n, _ = b.Node()
		if n.Kind == "automatic" {
			tr, err = b.Advance(n.TransitionID)
			if err != nil {
				t.Fatal(err)
			}
			b = tr.Next
		}
		tr, err = b.Commit(p.Seat, "play:"+p.Card)
		if err != nil {
			t.Fatalf("unreachable fixture %v: %v", p, err)
		}
		b = tr.Next
	}
	raw, err := b.LegacyObservation(0)
	if err != nil {
		t.Fatal(err)
	}
	o, err := d.ParseObservation(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(o.LegalActions) != 2 {
		t.Fatalf("legal clubs: %+v", o.LegalActions)
	}
	return o
}
func has(xs []string, x string) bool {
	for _, s := range xs {
		if s == x {
			return true
		}
	}
	return false
}

func TestCoachMessageHeartsQueenAvoidance(t *testing.T) {
	o := queenPosition(t)
	a, err := hr.Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	if a.Action.Card != "C3" {
		t.Fatalf("fixture selection %v", a.Action)
	}
	m, err := coaching.BuildCoachMessage(o, a, "original-1", coaching.ContextualCueVersion)
	if err != nil {
		t.Fatal(err)
	}
	if m.Status != "tactical" || m.SelectedAction != "play:C3" || !strings.Contains(m.Cue, "13") || !strings.Contains(m.Reason.Summary, "King of Clubs") || len(m.Reason.Alternatives) == 0 {
		t.Fatalf("missing specific consequence %+v", m)
	}
}
func TestCoachMessageReasonIdentity(t *testing.T) {
	o := queenPosition(t)
	a, _ := hr.Analyze(o)
	before, _ := json.Marshal(a)
	m, err := coaching.BuildCoachMessage(o, a, "original-2", coaching.ContextualCueVersion)
	if err != nil {
		t.Fatal(err)
	}
	cue, err := coaching.ProjectCoachMessage(m, "recommendation")
	if err != nil {
		t.Fatal(err)
	}
	why, err := coaching.ProjectCoachMessage(m, "reason")
	if err != nil {
		t.Fatal(err)
	}
	if cue.Reason != nil || why.Reason == nil || cue.Cue != why.Cue || cue.SelectedAction != why.SelectedAction || cue.DecisionID != why.DecisionID {
		t.Fatal("projection changes original advice")
	}
	why.Reason.Limitations = append(why.Reason.Limitations, "later information")
	again, err := coaching.ProjectCoachMessage(m, "reason")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(again)
	if strings.Contains(string(raw), "later information") {
		t.Fatal("projection aliases frozen reason")
	}
	after, _ := json.Marshal(a)
	if string(before) != string(after) {
		t.Fatal("analysis mutated")
	}
	if _, err = coaching.ProjectCoachMessage(m, "third-hint"); err == nil {
		t.Fatal("accepted third layer")
	}
	m.SelectedAction = "play:CA"
	if err = coaching.ValidateCoachMessage(m, a); err == nil {
		t.Fatal("accepted wrong selected action")
	}
}
func TestCoachMessageRejectsChangedDecisionFacts(t *testing.T) {
	o := queenPosition(t)
	a, err := hr.Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	// Keep actor, hand, legal actions and selected card unchanged, but change
	// the public penalty card. It must not silently rewrite the saved reason.
	o.Trick[1].Card = "H2"
	o.Memory = d.GetMemory(o)
	if err = d.ValidateObservation(o); err != nil {
		t.Fatal(err)
	}
	if _, err = coaching.BuildCoachMessage(o, a, "drift", coaching.ContextualCueVersion); err == nil {
		t.Fatal("accepted analysis from different public facts")
	}
}
func TestCoachMessageForcedAndTied(t *testing.T) {
	o := queenPosition(t)
	o.Hand = []string{"C3"}
	o.HandSizes[0] = 1
	o.LegalActions = []d.Action{{Kind: "play", Seat: 0, Card: "C3"}}
	o.Memory = d.GetMemory(o)
	a, err := hr.Analyze(o)
	if err != nil {
		t.Fatal(err)
	}
	m, err := coaching.BuildCoachMessage(o, a, "forced", coaching.ContextualCueVersion)
	if err != nil {
		t.Fatal(err)
	}
	if m.Status != "only-option" || strings.Contains(m.Cue, "best") {
		t.Fatalf("forced tactical praise %+v", m)
	}
	o = queenPosition(t)
	a, _ = hr.Analyze(o)
	for i := range a.Trace.Candidates {
		a.Trace.Candidates[i].Score = d.Ptr(0.0)
	}
	m, err = coaching.BuildCoachMessage(o, a, "tie", coaching.ContextualCueVersion)
	if err != nil {
		t.Fatal(err)
	}
	if m.Status != "no-clear-preference" {
		t.Fatal("tie-break became unique advantage", m)
	}
}
func TestCoachMessageActionPurpose(t *testing.T) {
	o := queenPosition(t)
	a, _ := hr.Analyze(o)
	a.Action.Card = "CK"
	if _, err := coaching.BuildCoachMessage(o, a, "bad", coaching.ContextualCueVersion); err == nil {
		t.Fatal("illegal mismatched action accepted")
	}
	a, _ = hr.Analyze(o)
	a.Reasons = nil
	m, err := coaching.BuildCoachMessage(o, a, "gap", coaching.ContextualCueVersion)
	if err != nil {
		t.Fatal(err)
	}
	if m.Status != "insufficient-reason" {
		t.Fatal("invented rationale for missing premise", m)
	}
	raw, err := json.Marshal(m)
	if err != nil || contracts.Validate("CoachMessage", raw) != nil {
		t.Fatal("invalid gap contract", err)
	}
}

func TestCoachMessagePartnerNilPurposeComesBeforeOrdinaryContract(t *testing.T) {
	raw, err := os.ReadFile("../../../qa/implementation/multi-game/m04b/reference-corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Samples []struct {
			Observation d.Observation
			Analysis    d.Analysis
		}
	}
	if err = json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	tested := false
	for _, s := range corpus.Samples {
		selected := false
		for _, c := range s.Analysis.Candidates {
			if c.Disposition == "selected" && has(c.ReasonIDs, "P02.cover-action") {
				selected = true
			}
		}
		if !selected {
			continue
		}
		tested = true
		m, err := coaching.BuildCoachMessage(s.Observation, s.Analysis, "nil-cover", coaching.ContextualCueVersion)
		if err != nil {
			t.Fatal(err)
		}
		if m.Status != "tactical" || !strings.Contains(m.Cue, "Nil partner") {
			t.Fatalf("Nil objective hidden behind ordinary contract: %+v", m)
		}
		if len(m.Reason.Support) < 2 || len(m.Reason.Limitations) == 0 {
			t.Fatal("full reason dropped original evidence or limitations")
		}
	}
	if !tested {
		t.Fatal("missing independent original fixture")
	}
}
