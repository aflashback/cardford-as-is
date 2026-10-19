package coachlab

import (
	"cardford/server/internal/games/cardcontinuation"
	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"math"
	"testing"
)

func TestPairedIntervalsCorrectMultiplicityAndCoverage(t *testing.T) {
	values := [][]float64{{0, 1, 2}, {0, -1, 2}}
	got, err := PairedIntervals([]string{"original", "variable", "constant"}, values, []float64{1, 1}, .05)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || math.Abs(got[0].Mean) > 1e-12 || got[0].Lower >= -12.7 || got[0].Upper <= 12.7 {
		t.Fatalf("multiplicity or pairing lost: %+v", got)
	}
	if got[1].Mean != 2 || got[1].Lower != 2 || got[1].Upper != 2 {
		t.Fatalf("incorrect paired difference: %+v", got[1])
	}
	if _, err = PairedIntervals([]string{"o", "a"}, [][]float64{{1}}, []float64{1}, .05); err == nil {
		t.Fatal("incomplete row accepted")
	}
	if _, err = PairedIntervals([]string{"o", "a"}, [][]float64{{0, 1}, {0, 2}}, []float64{1, .5}, .05); err == nil {
		t.Fatal("unequal weights presented as ordinary paired interval")
	}
}

func lateEvidenceObservation(t *testing.T) d.Observation {
	t.Helper()
	raw, err := spades.Create(json.RawMessage(`{"id":"offline-evidence","mode":"spades-partners","dealer":0}`), d.FullDeck())
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 100; i++ {
		var state struct {
			Phase string
			Turn  *int
		}
		json.Unmarshal(raw, &state)
		if state.Phase == "trick-end" {
			raw, err = spades.Apply(raw, json.RawMessage(`{"type":"collect-trick"}`))
			if err != nil {
				t.Fatal(err)
			}
			continue
		}
		if state.Turn == nil {
			t.Fatal("fixture ended before test prefix")
		}
		packet, err := spades.Observe(raw, *state.Turn)
		if err != nil {
			t.Fatal(err)
		}
		var o d.Observation
		json.Unmarshal(packet, &o)
		if o.Phase == "play" && len(o.History) >= 11 && len(o.LegalActions) >= 2 {
			return o
		}
		command, _ := json.Marshal(map[string]any{"type": "action", "action": o.LegalActions[0]})
		raw, err = spades.Apply(raw, command)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("no late unforced prefix")
	return d.Observation{}
}
func TestOfflineEvidenceRunsFromPreparedActorPacket(t *testing.T) {
	o := lateEvidenceObservation(t)
	id := d.ActionID(o.LegalActions[len(o.LegalActions)-1])
	c := DefaultEvaluationConfig("saved-decision", id)
	c.Screening.Budget.MaxWorlds = 2
	c.ConfirmationBudget.MaxWorlds = 3
	c.MaxAlternatives = 1
	got, err := EvaluateOffline(context.Background(), o, c)
	if err != nil {
		t.Fatal(err)
	}
	if got.Summary.Status != "completed" || got.Confirmation == nil || got.Confirmation.CandidateIDs[0] != id || len(got.Intervals) != 1 || got.Intervals[0].Worlds != 3 {
		t.Fatalf("original/fresh confirmation lost: %+v", got)
	}
	if got.Screening.Paired.Provenance.Seeds == got.Confirmation.Paired.Provenance.Seeds {
		t.Fatal("confirmation reused screening stream")
	}
	bc := DefaultBeliefConfig()
	bc.Sampling.Count = 2
	bc.Sampling.Budget.MaxWorlds = 2
	evidence, err := AnalyzePreparedDecision(context.Background(), DecisionRecord{DecisionID: "saved-decision", Phase: "play", ActorObservation: o, SelectedCandidateID: id}, EvidenceOptions{Beliefs: &bc, Comparison: &c})
	if err != nil || evidence.Inference == nil || evidence.Evaluation == nil || evidence.Evaluation.DecisionID != "saved-decision" {
		t.Fatalf("prepared-decision path disconnected: %+v %v", evidence, err)
	}
}

func TestStudentCriticalValues(t *testing.T) {
	for _, row := range []struct {
		p    float64
		df   int
		want float64
	}{{.975, 1, 12.706204736}, {.975, 10, 2.228138852}, {.975, 127, 1.978819534}} {
		if got := studentQuantile(row.p, row.df); math.Abs(got-row.want) > 1e-6 {
			t.Fatalf("df=%d got=%g want=%g", row.df, got, row.want)
		}
	}
}

func TestComparisonRefusesInvalidOriginalAndUnapprovedPins(t *testing.T) {
	c := DefaultEvaluationConfig("decision", "play:fake")
	c.Screening.Policies[0] = "model"
	if _, err := EvaluateOffline(context.Background(), emptyObservationForTest(), c); err == nil {
		t.Fatal("bad input accepted")
	}
	_ = cardcontinuation.OfflineVersion
}
