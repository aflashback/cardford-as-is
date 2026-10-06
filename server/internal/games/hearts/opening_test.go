package hearts

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestOpeningBoundaries(t *testing.T) {
	deck := []string{}
	for _, s := range []string{"C", "D", "H", "S"} {
		for _, r := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, s+r)
		}
	}
	raw, e := Create(json.RawMessage(`{"id":"test","mode":"hearts","dealer":0}`), deck)
	if e != nil {
		t.Fatal(e)
	}
	for seat := 0; seat < 4; seat++ {
		ids, e := CandidateIDs(raw, seat)
		if e != nil || len(ids) != 286 {
			t.Fatal("missing sealed candidates")
		}
	}
	var s state
	json.Unmarshal(raw, &s)
	bundle := struct {
		Type   string `json:"type"`
		Action struct {
			Kind   string      `json:"kind"`
			Passes [4][]string `json:"passes"`
		} `json:"action"`
	}{Type: "action"}
	bundle.Action.Kind = "pass-bundle"
	for i, h := range s.Hands {
		bundle.Action.Passes[i] = h[:3]
	}
	b, _ := json.Marshal(bundle)
	after, e := Apply(raw, b)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = Apply(after, b); e == nil {
		t.Fatal("accepted duplicate sealed pass")
	}
	if _, e = Apply(raw, json.RawMessage(`{"type":"action","action":{"kind":"pass-bundle","passes":[]}}`)); e == nil {
		t.Fatal("accepted incomplete bundle")
	}
	var object map[string]any
	json.Unmarshal(raw, &object)
	for _, key := range []string{"phase", "turn", "heartsBroken", "hands", "moduleVersion"} {
		copy := map[string]any{}
		for k, v := range object {
			copy[k] = v
		}
		delete(copy, key)
		b, _ := json.Marshal(copy)
		if Validate(b) == nil {
			t.Fatalf("missing %s accepted", key)
		}
	}
	object["hidden"] = true
	b, _ = json.Marshal(object)
	if Validate(b) == nil {
		t.Fatal("unknown private field accepted")
	}
	// Same own hand/public history, different concealed ownership => same packet.
	first, _ := Observe(raw, 0)
	s.Hands[1], s.Hands[2] = s.Hands[2], s.Hands[1]
	changed, _ := json.Marshal(s)
	second, e := Observe(changed, 0)
	if e != nil || !reflect.DeepEqual(first, second) {
		t.Fatal("concealed hands changed actor observation")
	}
}

func TestUTF16IdentityBoundary(t *testing.T) {
	deck := []string{}
	for _, s := range []string{"C", "D", "H", "S"} {
		for _, r := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, s+r)
		}
	}
	for _, count := range []int{128, 129} {
		config, _ := json.Marshal(map[string]any{"id": strings.Repeat("😀", count), "mode": "hearts", "dealer": 0})
		_, err := Create(config, deck)
		if (err == nil) != (count == 128) {
			t.Fatalf("UTF16 units boundary at %d", count)
		}
	}
}
