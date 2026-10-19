package service

import (
	"bytes"
	"encoding/json"
	"testing"

	"cardford/server/internal/contracts"
	"cardford/server/internal/games/trix"
)

func TestTrixLiveIndividualScoresDoNotDuplicateTeamTotals(t *testing.T) {
	for _, variant := range trix.Variants {
		t.Run(variant, func(t *testing.T) {
			state, err := trix.New(trix.Config{ID: "seat-scores", Variant: variant}, trix.Deck())
			if err != nil {
				t.Fatal(err)
			}
			state.DealNumber = 2
			state.Request = "queens"
			zero, two := 0, 2
			state.Ledger = []trix.LedgerEntry{
				{DealNumber: 2, Kingdom: 1, Request: "queens", Trick: 1, Recipient: trix.Recipient{Kind: "seat", Seat: &zero}, Component: "queen", Delta: -50},
				{DealNumber: 2, Kingdom: 1, Request: "queens", Trick: 2, Recipient: trix.Recipient{Kind: "seat", Seat: &two}, Component: "queen", Delta: -25},
				{DealNumber: 2, Kingdom: 1, Request: "queens", Trick: 3, Recipient: trix.Recipient{Kind: "competitor", Competitor: "NS"}, Component: "double-bonus", Delta: 25},
				{DealNumber: 1, Kingdom: 1, Request: "trix", Finish: 1, Recipient: trix.Recipient{Kind: "seat", Seat: &zero}, Component: "layout-finish", Delta: 200},
			}
			original := trix.Observe(state, 0)
			before, _ := json.Marshal(original)
			for _, field := range []string{"table", "observation"} {
				raw, _ := json.Marshal(map[string]any{field: original})
				projected, err := liveTrixProjection(raw, field)
				if err != nil {
					t.Fatal(err)
				}
				var envelope map[string]json.RawMessage
				if err = json.Unmarshal(projected, &envelope); err != nil {
					t.Fatal(err)
				}
				if err = contracts.Validate("TrixObservation", envelope[field]); err != nil {
					t.Fatal(err)
				}
				var live struct {
					trix.Observation
					RequestSeatTotals [4]int `json:"requestSeatTotals"`
				}
				if err = json.Unmarshal(envelope[field], &live); err != nil {
					t.Fatal(err)
				}
				if live.RequestSeatTotals != [4]int{-50, 0, -25, 0} {
					t.Fatalf("wrong seat scores: %v", live.RequestSeatTotals)
				}
				if len(live.Ledger) != 0 || len(live.WithheldBonuses) != 0 {
					t.Fatal("live projection included score history")
				}
				got, _ := json.Marshal(live.Totals)
				want, _ := json.Marshal(original.Totals)
				if !bytes.Equal(got, want) {
					t.Fatal("team totals changed")
				}
			}
			after, _ := json.Marshal(original)
			if !bytes.Equal(before, after) || bytes.Contains(after, []byte("requestSeatTotals")) {
				t.Fatal("native decision observation changed")
			}
			state.DealNumber = 3
			raw, _ := json.Marshal(map[string]any{"observation": trix.Observe(state, 0)})
			projected, err := liveTrixProjection(raw, "observation")
			if err != nil || !bytes.Contains(projected, []byte(`"requestSeatTotals":[0,0,0,0]`)) {
				t.Fatal("seat totals did not reset for the next request")
			}
		})
	}
}
