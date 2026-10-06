package hearts

import (
	"bytes"
	"encoding/json"
	"testing"
)

func testDeck() []string {
	deck := []string{}
	for _, suit := range []string{"C", "D", "H", "S"} {
		for _, rank := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, suit+rank)
		}
	}
	return deck
}

func passedSnapshot(t *testing.T) *snapshot {
	t.Helper()
	s, err := Start(json.RawMessage(`{"id":"continuation","mode":"hearts","dealer":0}`), testDeck())
	if err != nil {
		t.Fatal(err)
	}
	start := s.(*snapshot)
	passes := [4][]string{}
	for seat, hand := range start.state.Hands {
		passes[seat] = append([]string{}, hand[:3]...)
	}
	command, _ := json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "pass-bundle", "passes": passes}})
	next, err := start.Apply(command)
	if err != nil {
		t.Fatal(err)
	}
	return next.(*snapshot)
}

func TestFirstPlayMovesCardAndPreservesSnapshot(t *testing.T) {
	before := passedSnapshot(t)
	actor := *before.state.Turn
	original, _ := before.Export()
	command, _ := json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "play", "seat": actor, "card": "C2"}})
	next, err := before.Apply(command)
	if err != nil {
		t.Fatal("legal first play rejected:", err)
	}
	actual := next.(*snapshot).state
	if len(actual.Hands[actor]) != 12 || len(actual.Trick) != 1 || actual.Trick[0] != (Play{actor, "C2"}) || actual.Turn == nil || *actual.Turn != (actor+1)%4 {
		t.Fatal("first play did not advance exactly once")
	}
	if len(actual.Events) != 3 || actual.Events[2].Type != "card-played" {
		t.Fatal("play event missing")
	}
	after, _ := before.Export()
	if !bytes.Equal(original, after) {
		t.Fatal("source snapshot changed")
	}
	if _, err := next.Apply(command); err == nil {
		t.Fatal("duplicate card play accepted")
	}
	encoded, _ := next.Export()
	if _, err := Open(encoded); err != nil {
		t.Fatal("played state cannot reopen:", err)
	}
}
