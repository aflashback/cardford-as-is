package cardcontinuation

import (
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"testing"
)

func fixture(t *testing.T, mode string) d.Observation {
	t.Helper()
	config, _ := json.Marshal(map[string]any{"id": "m05", "mode": mode, "dealer": 0})
	var raw json.RawMessage
	var err error
	var observe func(json.RawMessage, int) (json.RawMessage, error)
	if mode == "hearts" {
		raw, err = hearts.Create(config, d.FullDeck())
		observe = hearts.Observe
	} else {
		raw, err = spades.Create(config, d.FullDeck())
		observe = spades.Observe
	}
	if err != nil {
		t.Fatal(err)
	}
	raw, err = observe(raw, 1)
	if err != nil {
		t.Fatal(err)
	}
	var o d.Observation
	if err = json.Unmarshal(raw, &o); err != nil {
		t.Fatal(err)
	}
	return o
}
func TestConcreteAdaptersCoverEveryBidAndPassCandidate(t *testing.T) {
	for _, mode := range []string{"spades-solo", "spades-partners", "hearts"} {
		t.Run(mode, func(t *testing.T) {
			o := fixture(t, mode)
			c := DefaultConfig()
			c.Budget.MaxWorlds = 1
			got, err := Evaluate(context.Background(), o, c)
			if err != nil {
				t.Fatal(err)
			}
			if got.SelectedID == nil || got.Coverage.Completed != 1 || len(got.Results) != len(o.LegalActions) {
				t.Fatalf("incomplete concrete comparison: %+v", got)
			}
			want := 14
			if mode == "hearts" {
				want = 286
			}
			if len(got.Results) != want {
				t.Fatalf("lost legal candidates: %d", len(got.Results))
			}
			if got.ExecutionStatus != "completed" {
				t.Fatalf("status %s", got.ExecutionStatus)
			}
		})
	}
}
