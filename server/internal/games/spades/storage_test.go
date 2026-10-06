package spades

import (
	"encoding/json"
	"testing"
)

type persistentSnapshot interface {
	Persist(int) (json.RawMessage, []json.RawMessage, error)
	EventCount() int
}

func TestStorageSnapshotSeparatesEvents(t *testing.T) {
	deck := []string{}
	for _, suit := range []string{"C", "D", "H", "S"} {
		for _, rank := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, suit+rank)
		}
	}
	s, err := Start(json.RawMessage(`{"id":"compact","mode":"spades-partners","dealer":0}`), deck)
	if err != nil {
		t.Fatal(err)
	}
	p, ok := s.(persistentSnapshot)
	if !ok {
		t.Fatal("validated snapshots do not yet expose compact persistence")
	}
	hot, events, err := p.Persist(0)
	if err != nil {
		t.Fatal(err)
	}
	var saved State
	if err := json.Unmarshal(hot, &saved); err != nil {
		t.Fatal(err)
	}
	if len(saved.Events) != 0 || len(events) != 1 || p.EventCount() != 1 {
		t.Fatal("checkpoint repeats archived events")
	}
	s, err = s.Apply(json.RawMessage(`{"type":"action","action":{"kind":"bid","seat":1,"bid":3}}`))
	if err != nil {
		t.Fatal(err)
	}
	p = s.(persistentSnapshot)
	_, delta, err := p.Persist(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(delta) != 1 || p.EventCount() != 2 {
		t.Fatal("persistence did not append exactly the new event")
	}
	if _, _, err := p.Persist(3); err == nil {
		t.Fatal("future cursor accepted")
	}
}
