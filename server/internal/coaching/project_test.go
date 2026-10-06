package coaching

import (
	"encoding/json"
	"strings"
	"testing"

	"cardford/server/internal/legacydecision"
)

// A level leak or legacy-field backfill changes the original saved hint contract.
func TestProjectLegacyLevelsAndNilBid(t *testing.T) {
	advice := legacydecision.Advice{Focus: "Your own contract", Notice: "Count likely tricks before bidding.", Reason: "context", Suggestion: "Consider 0.", Bid: legacydecision.Ptr(0), Provenance: "code", PolicyVersion: "spades-tactics-2.1.0", ReasonIDs: []string{}, Evidence: "heuristic"}
	for level := 1; level <= 3; level++ {
		view, err := ProjectAdvice(advice, level, "decision-original")
		if err != nil {
			t.Fatal(err)
		}
		raw, err := json.Marshal(view)
		if err != nil {
			t.Fatal(err)
		}
		var got map[string]any
		if err = json.Unmarshal(raw, &got); err != nil {
			t.Fatal(err)
		}
		if got["focus"] != advice.Focus || got["source"] != "code" || got["decisionId"] != "decision-original" || got["requestedLevel"] != float64(level) {
			t.Fatalf("level %d lost envelope: %s", level, raw)
		}
		if _, present := got["bid"]; present != (level == 3) {
			t.Fatalf("level %d bid visibility: %s", level, raw)
		}
		if level == 3 && got["bid"] != float64(0) {
			t.Fatalf("Nil omitted: %s", raw)
		}
		for _, key := range []string{"outcome", "explanation", "evidence", "policyVersion", "cueVersion", "reasonIds"} {
			if _, present := got[key]; present {
				t.Fatalf("legacy advice backfilled %s", key)
			}
		}
		wantReason := ""
		if level >= 2 {
			wantReason = "context"
		}
		wantSuggestion := ""
		if level == 3 {
			wantSuggestion = "Consider 0."
		}
		if got["reason"] != wantReason || got["suggestion"] != wantSuggestion {
			t.Fatalf("level %d text leak: %s", level, raw)
		}
	}
	for _, level := range []int{-1, 0, 4} {
		if _, err := ProjectAdvice(advice, level, "decision-original"); err == nil || !strings.Contains(err.Error(), "Unsupported help level.") {
			t.Fatalf("accepted level %d: %v", level, err)
		}
	}
}

func TestProjectVersionedAbstentionAndCopies(t *testing.T) {
	advice := legacydecision.Advice{Focus: "Options", Notice: "Notice", Reason: "Reason", Suggestion: "Consider both.", Provenance: "code", PolicyVersion: "saved-policy", ReasonIDs: []string{}, Evidence: "heuristic", CueVersion: legacydecision.Ptr("saved-cues"), Outcome: "several-reasonable", Explanation: "facts-only", ConsideredCards: []string{"C2", "D2"}}
	for level := 1; level <= 3; level++ {
		view, err := ProjectAdvice(advice, level, "saved")
		if err != nil {
			t.Fatal(err)
		}
		if view.CueVersion == nil || *view.CueVersion != "saved-cues" || view.Evidence == nil || *view.Evidence != "heuristic" || view.Outcome == nil || *view.Outcome != "several-reasonable" {
			t.Fatal("missing versioned context")
		}
		if (view.ConsideredCards != nil) != (level == 3) {
			t.Fatal("considered choices leaked help level")
		}
		if level == 3 {
			(*view.ConsideredCards)[0] = "SA"
			*view.CueVersion = "changed"
		}
	}
	if advice.ConsideredCards[0] != "C2" || *advice.CueVersion != "saved-cues" {
		t.Fatal("projected output aliases saved advice")
	}
	invalid := []legacydecision.Advice{advice, advice, advice, advice, advice}
	invalid[0].Card = "C2"
	invalid[1].Outcome = "suggestion"
	invalid[2].ConsideredBids = []int{0, 1}
	invalid[3].ConsideredCards = []string{"C2"}
	invalid[4].ConsideredCards = []string{"C2", "C2"}
	for i, v := range invalid {
		if _, err := ProjectAdvice(v, 1, "saved"); err == nil {
			t.Fatalf("invalid abstention %d accepted", i)
		}
	}
	empty := advice
	empty.CueVersion = legacydecision.Ptr("")
	view, err := ProjectAdvice(empty, 1, "saved")
	if err != nil || view.CueVersion == nil || view.Evidence == nil {
		t.Fatal("explicit empty cue version treated as absent")
	}
}
