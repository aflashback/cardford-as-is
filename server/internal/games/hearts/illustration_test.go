package hearts

import (
	"cardford/server/internal/games/hearts/reasoning"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"testing"
)

func TestPlatformHeartsIllustrationPreservesPassKnowledge(t *testing.T) {
	source := passedSnapshot(t)
	actor := *source.state.Turn
	o, err := legacySessionObservation(observeSession(&sessionState{original: source.state}, actor))
	if err != nil {
		t.Fatal(err)
	}
	before, _ := json.Marshal(source.state)
	frames, err := Illustrate(context.Background(), o, d.ActionID(o.LegalActions[0]), 91, reasoning.PolicyVersion)
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 5 || frames[4].Phase != "trick-end" {
		t.Fatal("illustration crossed trick boundary")
	}
	after, _ := json.Marshal(source.state)
	if string(before) != string(after) {
		t.Fatal("live state changed")
	}
	hands, err := d.SampleHands(context.Background(), o, 91)
	if err != nil {
		t.Fatal(err)
	}
	for _, known := range o.KnownHoldings {
		found := false
		for _, card := range hands[known.Seat] {
			found = found || card == known.Card
		}
		if !found {
			t.Fatal("forgot exact outgoing pass ownership")
		}
	}
	b, err := bindHeartsSession(&sessionState{original: source.state})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = b.Presentation(actor); err != nil {
		t.Fatal(err)
	}
}
