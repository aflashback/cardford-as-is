package coachlab

import (
	"cardford/server/internal/games/cardcontinuation"
	d "cardford/server/internal/legacydecision"
	"context"
	"testing"
)

func TestPopulationSensitivityIsExplicitAndBounded(t *testing.T) {
	o := lateEvidenceObservation(t)
	c := DefaultEvaluationConfig("population", d.ActionID(o.LegalActions[0]))
	c.Screening.Budget.MaxWorlds = 1
	c.ConfirmationBudget.MaxWorlds = 2
	second := c.Screening.Policies
	for i := range second {
		second[i] = cardcontinuation.LowestLegalPolicy
	}
	got, err := EvaluatePopulationSensitivity(context.Background(), o, c, []Population{{ID: "frozen-tactics", Policies: c.Screening.Policies}, {ID: "low-legal-control", Policies: second}})
	if err != nil || len(got.Runs) != 2 || got.Status == "validated" {
		t.Fatalf("population receipt: %+v %v", got, err)
	}
	if _, err = EvaluatePopulationSensitivity(context.Background(), o, c, []Population{{ID: "same", Policies: second}, {ID: "same", Policies: second}}); err == nil {
		t.Fatal("duplicate populations accepted")
	}
}
