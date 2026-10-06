package hearts

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
)

func TestSnapshotOpeningParityAndIsolation(t *testing.T) {
	deck := []string{}
	for _, s := range []string{"C", "D", "H", "S"} {
		for _, r := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, s+r)
		}
	}
	config := json.RawMessage(`{"id":"snapshot","mode":"hearts","dealer":0}`)
	raw, err := Create(config, deck)
	if err != nil {
		t.Fatal(err)
	}
	snap, err := Start(config, deck)
	if err != nil {
		t.Fatal(err)
	}
	exported, _ := snap.Export()
	if !bytes.Equal(raw, exported) {
		t.Fatal("opening mismatch")
	}
	var s state
	if err = json.Unmarshal(raw, &s); err != nil {
		t.Fatal(err)
	}
	passes := [4][]string{}
	for i, h := range s.Hands {
		passes[i] = h[:3]
	}
	command, _ := json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "pass-bundle", "passes": passes}})
	for index := 0; index < 2; index++ {
		for seat := 0; seat < 4; seat++ {
			p, err := snap.Project(seat)
			if err != nil {
				t.Fatal(err)
			}
			o, _ := Observe(raw, seat)
			v, _ := SafeView(raw, seat)
			ids, _ := CandidateIDs(raw, seat)
			if !bytes.Equal(p.Observation, o) || !bytes.Equal(p.View, v) || !reflect.DeepEqual(p.CandidateIDs, ids) {
				t.Fatal("actor projection mismatch")
			}
			if index == 0 && len(ids) != 286 {
				t.Fatal("lost sealed choices")
			}
		}
		if index == 1 {
			break
		}
		prior, _ := snap.Export()
		next, err := snap.Apply(command)
		if err != nil {
			t.Fatal(err)
		}
		after, _ := snap.Export()
		if !bytes.Equal(prior, after) {
			t.Fatal("pass mutated source")
		}
		raw, err = Apply(raw, command)
		if err != nil {
			t.Fatal(err)
		}
		snap = next
		exported, _ = snap.Export()
		if !bytes.Equal(raw, exported) {
			t.Fatal("atomic pass mismatch")
		}
	}
	opened, err := Open(raw)
	if err != nil {
		t.Fatal(err)
	}
	raw[0] = '['
	if _, err = opened.Project(0); err != nil {
		t.Fatal("input mutation affected snapshot")
	}
	if _, err = opened.Apply(command); err == nil {
		t.Fatal("duplicate sealed pass accepted")
	}
	good, _ := opened.Export()
	var m map[string]any
	json.Unmarshal(good, &m)
	m["moduleVersion"] = "future"
	bad, _ := json.Marshal(m)
	if _, err = Open(bad); err == nil {
		t.Fatal("unknown pin accepted")
	}
	if _, err = Open(json.RawMessage(`{}`)); err == nil {
		t.Fatal("missing fields accepted")
	}
}
