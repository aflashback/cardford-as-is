package spades

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
)

func TestPartnerResourceIllustrationUsesSavedPolicy(t *testing.T) {
	raw, err := os.ReadFile("reasoning/testdata/partner-resources.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Rows []struct {
			Observation d.Observation `json:"observation"`
		} `json:"rows"`
	}
	if err = json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Rows) != 40 {
		t.Fatal("missing reachable fixtures")
	}
	for _, row := range corpus.Rows {
		o := row.Observation
		before, _ := json.Marshal(o)
		candidate := d.ActionID(o.LegalActions[0])
		frames, err := Illustrate(context.Background(), o, candidate, 23, reasoning.PartnerResourcePolicy)
		if err != nil {
			t.Fatal(err)
		}
		if len(frames) < 2 || len(frames) > 5 || frames[len(frames)-1].Phase != "trick-end" {
			t.Fatal("illustration did not stop at one trick")
		}
		after, _ := json.Marshal(o)
		if string(before) != string(after) {
			t.Fatal("source observation mutated")
		}
		o.Mode = "spades-solo"
		if _, err = Illustrate(context.Background(), o, candidate, 23, reasoning.PartnerResourcePolicy); err == nil {
			t.Fatal("Partners policy accepted for Solo")
		}
	}
}
