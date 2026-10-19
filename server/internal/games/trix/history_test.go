package trix

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"

	"cardford/server/internal/contracts"
)

func TestCompletedRoundHistoryIsFrozenAndPublic(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			s, err := New(Config{ID: "history-game", Variant: variant}, Deck())
			if err != nil {
				t.Fatal(err)
			}
			var frozen []byte
			for round := 1; round <= 2; round++ {
				for step := 0; s.Phase != "round-complete" && step < 160; step++ {
					o := Observe(s, s.Turn)
					if len(CompletedRounds(o)) != round-1 {
						t.Fatal("unfinished round was exposed")
					}
					choices := Legal(o)
					if len(choices) == 0 {
						t.Fatal("no legal action")
					}
					s, err = Apply(s, s.Turn, choices[0])
					if err != nil {
						t.Fatal(err)
					}
				}
				if s.Phase != "round-complete" {
					t.Fatal("round did not finish")
				}
				o := Observe(s, 0)
				saved, ok := SavedRound(o, "history-game:trix-request:1")
				if !ok || len(CompletedRounds(o)) != round {
					t.Fatal("completed history missing")
				}
				raw, _ := json.Marshal(saved)
				if err = contracts.Validate("TrixRoundHistory", raw); err != nil {
					t.Fatal(err)
				}
				if bytes.Contains(raw, []byte(`"hand"`)) || bytes.Contains(raw, []byte(`"candidates"`)) {
					t.Fatal("private/decision fields escaped")
				}
				if round == 1 {
					frozen = raw
					if !reflect.DeepEqual(saved.Totals, o.Totals) || !reflect.DeepEqual(saved.RequestTotals, o.RequestTotals) || !reflect.DeepEqual(saved.KingdomTotals, o.KingdomTotals) {
						t.Fatal("saved totals differ from terminal score")
					}
				} else if !bytes.Equal(raw, frozen) {
					t.Fatal("later scoring changed the saved round")
				}
				if _, ok := SavedRound(o, "another-game:trix-request:1"); ok {
					t.Fatal("foreign game accepted")
				}
				if _, ok := SavedRound(o, "history-game:trix-request:3"); ok {
					t.Fatal("unfinished/future round accepted")
				}
				s, err = Continue(s)
				if err != nil {
					t.Fatal(err)
				}
				s, err = Supply(s, Deck())
				if err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}
