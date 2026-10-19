package beliefs

import (
	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"testing"
)

func endingObservation(t *testing.T) (d.Observation, [4][]string) {
	t.Helper()
	o, w := queenFixture(t, false)
	raw, err := d.SyntheticWorld(o, w[0].Hands)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 80; i++ {
		var state struct {
			Phase string
			Turn  *int
			Hands [4][]string
		}
		json.Unmarshal(raw, &state)
		if state.Phase == "trick-end" {
			raw, err = spades.Apply(raw, json.RawMessage(`{"type":"collect-trick"}`))
			if err != nil {
				t.Fatal(err)
			}
			continue
		}
		encoded, err := spades.Observe(raw, *state.Turn)
		if err != nil {
			t.Fatal(err)
		}
		json.Unmarshal(encoded, &o)
		if len(o.History) == 12 {
			return o, state.Hands
		}
		action, _ := json.Marshal(map[string]any{"type": "action", "action": o.LegalActions[0]})
		raw, err = spades.Apply(raw, action)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("ending not reached")
	return o, [4][]string{}
}
func TestEnumeratedEndingKeepsActualFeasibleAllocationAndStopsAtomically(t *testing.T) {
	o, truth := endingObservation(t)
	got, err := EnumerateEnding(context.Background(), o, 9, 1000000)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "completed-exact" || len(got.Allocations) == 0 || len(got.Allocations) > 6 {
		t.Fatalf("not exhaustive three-card ending: %+v", got)
	}
	actual := false
	for _, world := range got.Allocations {
		same := true
		for seat := 0; seat < 4; seat++ {
			if len(world.Hands[seat]) != 1 || world.Hands[seat][0] != truth[seat][0] {
				same = false
			}
		}
		actual = actual || same
	}
	if !actual {
		t.Fatal("excluded actual legal history")
	}
	got, err = EnumerateEnding(context.Background(), o, 9, 1)
	if err != nil || got.Status != "budget-exhausted" || len(got.Allocations) != 0 {
		t.Fatalf("partial enumeration masquerades as exact: %+v %v", got, err)
	}
}
