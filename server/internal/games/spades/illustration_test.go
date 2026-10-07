package spades

import (
	"cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestPlatformIllustrationIsolatedBoundedAndPinned(t *testing.T) {
	for _, mode := range []string{"spades-solo", "spades-partners"} {
		config, _ := json.Marshal(map[string]any{"id": "illustration", "mode": mode, "dealer": 3})
		s, err := createState(config, d.FullDeck())
		if err != nil {
			t.Fatal(err)
		}
		for s.Phase == "bid" {
			bid := 1
			if err = applyAction(s, Action{Kind: "bid", Seat: *s.Turn, Bid: &bid}); err != nil {
				t.Fatal(err)
			}
		}
		actor := *s.Turn
		o, err := legacySessionObservation(observeSession(&sessionState{original: s}, actor))
		if err != nil {
			t.Fatal(err)
		}
		original, _ := json.Marshal(s)
		frames, err := Illustrate(context.Background(), o, d.ActionID(o.LegalActions[0]), 23, reasoning.PolicyVersion)
		if err != nil {
			t.Fatal(err)
		}
		if len(frames) != 5 || frames[len(frames)-1].Phase != "trick-end" {
			t.Fatal("illustration did not stop at one trick")
		}
		after, _ := json.Marshal(s)
		if string(original) != string(after) {
			t.Fatal("live game mutated")
		}
		if !reflect.DeepEqual(frames[0].Hand, o.Hand) {
			t.Fatal("source hand changed")
		}
		if _, err = Illustrate(context.Background(), o, d.ActionID(o.LegalActions[0]), 23, "new-policy"); err == nil {
			t.Fatal("silently replaced source policy")
		}
		b, err := bindSpadesSession(&sessionState{original: s})
		if err != nil {
			t.Fatal(err)
		}
		if _, err = b.Presentation(actor); err != nil {
			t.Fatal("safe table projection", err)
		}
	}
}
