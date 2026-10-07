package spades

import (
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"fmt"
	"testing"
)

// historyReducerFixture uses legal recorded deals and bids of 13 at every seat
// to keep the match below its winning threshold. It measures reducer history
// cost only: no policy, prepared decision, database, or public request is run.
func historyReducerFixture(tb testing.TB, hands int) *sessionState {
	tb.Helper()
	s, err := createState(json.RawMessage(`{"id":"history-reducer","mode":"spades-partners","dealer":0}`), d.FullDeck())
	if err != nil {
		tb.Fatal(err)
	}
	current := &sessionState{original: s}
	material, err := json.Marshal(sessionDeal{Kind: "deal", Deck: d.FullDeck()})
	if err != nil {
		tb.Fatal(err)
	}
	for current.original.HandNumber <= hands || current.awaitingDeal {
		node := spadesSessionNode(current)
		op := gamekernel.Operation[Action]{Kind: node.Kind}
		switch node.Kind {
		case "actor":
			op.Seat = *node.Seat
			actions := observationActions(observeSession(current, op.Seat))
			if len(actions) == 0 {
				tb.Fatal("fixture has no legal choice")
			}
			op.Action = actions[0]
			if current.original.Phase == "bid" {
				op.Action = actions[len(actions)-1]
			}
		case "automatic":
			op.TransitionID = node.TransitionID
		case "round-complete":
			op.Kind = "continue-round"
		case "chance":
			op.RequestID, op.Material = node.RequestID, material
		default:
			tb.Fatalf("fixture reached unexpected node %s", node.Kind)
		}
		current, _, err = reduceSession(current, op)
		if err != nil {
			tb.Fatal(err)
		}
	}
	if err = validateState(current.original); err != nil {
		tb.Fatal("fixture must retain valid full history", err)
	}
	return current
}

var historyReducerResult *sessionState

func BenchmarkSpadesSessionReduceHistory(b *testing.B) {
	for _, hands := range []int{1, 10, 20} {
		b.Run(fmt.Sprintf("hands-%d", hands), func(b *testing.B) {
			source := historyReducerFixture(b, hands)
			seat := *source.original.Turn
			op := gamekernel.Operation[Action]{Kind: "actor", Seat: seat, Action: Action{Kind: "bid", Seat: seat, Bid: ptr(13)}}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				next, _, err := reduceSession(source, op)
				if err != nil {
					b.Fatal(err)
				}
				historyReducerResult = next
			}
			b.ReportMetric(float64(len(source.original.Events)), "events")
		})
	}
}
