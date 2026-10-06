package coaching

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"cardford/server/internal/contracts"
	hearts "cardford/server/internal/games/hearts/reasoning"
	spades "cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
)

// The independent original TypeScript oracle supplies all expectations. Compare
// entire outputs: agreeing on a move does not establish facts or coach parity.
func TestOriginalDiagnosticSamples(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("../../..", "qa/implementation/multi-game/m04b/reference-corpus.json"))
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Samples []struct {
			CaseID                        string
			CommandIndex, Seat            int
			Observation, Analysis, Advice json.RawMessage
			Projections                   []json.RawMessage
		}
	}
	if err = json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Samples) != 28 {
		t.Fatalf("incomplete independent sample oracle: got %d", len(corpus.Samples))
	}
	equal := func(t *testing.T, label string, actual any, expected json.RawMessage) {
		t.Helper()
		got, err := json.Marshal(actual)
		if err != nil {
			t.Fatal(err)
		}
		canonicalGot, err := contracts.UTF16Canonical(got)
		if err != nil {
			t.Fatal(err)
		}
		canonicalWant, err := contracts.UTF16Canonical(expected)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(canonicalGot, canonicalWant) {
			t.Fatalf("%s differs\nactual: %s\noriginal: %s", label, got, expected)
		}
	}
	for _, sample := range corpus.Samples {
		t.Run(fmt.Sprintf("%s/%d/%d", sample.CaseID, sample.CommandIndex, sample.Seat), func(t *testing.T) {
			obs, err := d.ParseObservation(sample.Observation)
			if err != nil {
				t.Fatal(err)
			}
			var analysis d.Analysis
			if obs.Mode == "hearts" {
				analysis, err = hearts.Analyze(obs)
			} else {
				analysis, err = spades.Analyze(obs)
			}
			if err != nil {
				t.Fatal(err)
			}
			equal(t, "analysis", analysis, sample.Analysis)
			advice, err := Explain(obs, &analysis)
			if err != nil {
				t.Fatal(err)
			}
			equal(t, "advice", advice, sample.Advice)
			implicit, err := Explain(obs, nil)
			if err != nil {
				t.Fatal(err)
			}
			equal(t, "implicit advice", implicit, sample.Advice)
			if len(sample.Projections) != 3 {
				t.Fatal("missing original help levels")
			}
			for i, want := range sample.Projections {
				view, err := ProjectAdvice(advice, i+1, "original-decision")
				if err != nil {
					t.Fatal(err)
				}
				equal(t, fmt.Sprintf("help level %d", i+1), view, want)
			}
		})
	}
}
