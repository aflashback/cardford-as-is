package coachlab

import (
	b "cardford/server/internal/games/spades/reasoning/beliefs"
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"strings"
	"testing"
)

func emptyObservationForTest() d.Observation { return d.Observation{} }
func TestPrivateCalibrationIsolation(t *testing.T) {
	prediction := FrozenPrediction{DecisionID: "private-id", FamilyID: "private-family", Partition: "validation", ObservationDigest: "digest", Cards: []b.CardEstimate{{Card: "DK", Probability: [4]float64{.25, .75, 0, 0}, Status: "conditional"}}}
	truth := ClosedTruth{DecisionID: "private-id", ObservationDigest: "digest", ClosedRun: true, ReceiptDigest: strings.Repeat("a", 64), Hands: [4][]string{{"DK"}, {}, {}, {}}}
	got, err := ScoreBeliefCalibration([]FrozenPrediction{prediction}, []ClosedTruth{truth}, "validation")
	if err != nil {
		t.Fatal(err)
	}
	if got.Cards != 1 || got.Families != 1 || got.MeanBrier != 1.125 {
		t.Fatalf("wrong multiclass Brier: %+v", got)
	}
	raw, _ := json.Marshal(got)
	for _, secret := range []string{"private-id", "private-family", "DK", "hands"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("truth leaked in aggregate: %s", raw)
		}
	}
	truth.ClosedRun = false
	if _, err = ScoreBeliefCalibration([]FrozenPrediction{prediction}, []ClosedTruth{truth}, "validation"); err == nil {
		t.Fatal("open truth scored")
	}
	truth.ClosedRun = true
	truth.ObservationDigest = "other-prefix"
	if _, err = ScoreBeliefCalibration([]FrozenPrediction{prediction}, []ClosedTruth{truth}, "validation"); err == nil {
		t.Fatal("stale truth scored")
	}
}
