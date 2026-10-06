package hearts

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func playCommand(seat int, card string) json.RawMessage {
	b, _ := json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "play", "seat": seat, "card": card}})
	return b
}

func advanceFirstLegal(t *testing.T, s *snapshot) *snapshot {
	t.Helper()
	var command json.RawMessage
	if s.state.Phase == "trick-end" {
		command = json.RawMessage(`{"type":"collect-trick"}`)
	} else {
		if s.state.Turn == nil {
			t.Fatal("missing test actor")
		}
		a := actions(s.state, *s.state.Turn)
		if len(a) == 0 {
			t.Fatal("missing test play")
		}
		command = playCommand(a[0].Seat, a[0].Card)
	}
	next, err := s.Apply(command)
	if err != nil {
		t.Fatal(err)
	}
	return next.(*snapshot)
}

func TestOriginalHeartsLegalExceptions(t *testing.T) {
	// These literal positions isolate the rules; they are not private import fixtures.
	tests := []struct {
		name   string
		hand   []string
		trick  []Play
		played bool
		broken bool
		want   []string
	}{
		{"forced opener", []string{"C2", "CA", "H2"}, nil, false, false, []string{"C2"}},
		{"follow before discard", []string{"C5", "H2", "SQ"}, []Play{{0, "C2"}}, false, false, []string{"C5"}},
		{"first trick safe discard", []string{"D2", "H2", "SQ"}, []Play{{0, "C2"}}, false, false, []string{"D2"}},
		{"first trick only points", []string{"H2", "SQ"}, []Play{{0, "C2"}}, false, false, []string{"H2", "SQ"}},
		{"unbroken lead", []string{"D2", "H2"}, nil, true, false, []string{"D2"}},
		{"only hearts lead", []string{"H2", "HA"}, nil, true, false, []string{"H2", "HA"}},
		{"broken lead", []string{"D2", "H2"}, nil, true, true, []string{"D2", "H2"}},
		{"later points discard", []string{"D2", "H2", "SQ"}, []Play{{0, "C2"}}, true, false, []string{"D2", "H2", "SQ"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seat := 0
			if len(tt.trick) > 0 {
				seat = 1
			}
			s := initial("rules", 0)
			s.Phase = "play"
			s.Turn = ptr(seat)
			s.Hands[seat] = tt.hand
			s.Trick = tt.trick
			s.HeartsBroken = tt.broken
			if tt.played {
				s.History = []Trick{{}}
			}
			got := []string{}
			for _, a := range actions(s, seat) {
				got = append(got, a.Card)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %v want %v", got, tt.want)
			}
			if len(actions(s, (seat+1)%4)) != 0 {
				t.Fatal("nonactor received legal plays")
			}
		})
	}
}

func TestImportRejectsImpossiblePlayedState(t *testing.T) {
	s := passedSnapshot(t)
	for step := 0; step < 6; step++ {
		s = advanceFirstLegal(t, s)
	}
	good, _ := s.Export()
	if _, err := Open(good); err != nil {
		t.Fatal(err)
	}
	mutations := map[string]func(*state){
		"wrong turn":               func(s *state) { s.Turn = ptr((*s.Turn + 1) % 4) },
		"wrong score":              func(s *state) { s.Scores[0]++ },
		"wrong broken flag":        func(s *state) { s.HeartsBroken = !s.HeartsBroken },
		"wrong trick winner":       func(s *state) { s.History[0].Winner = (s.History[0].Winner + 1) % 4 },
		"wrong wins":               func(s *state) { s.Tricks[0]++ },
		"duplicate concealed card": func(s *state) { s.Hands[2][0] = s.Hands[3][0] },
		"bad remembered owner":     func(s *state) { s.Passes[0].To = ptr(2) },
		"bad remembered card":      func(s *state) { s.Passes[0].Outgoing[0] = "SQ" },
		"wrong pass direction":     func(s *state) { s.PassDirection = "hold" },
		"wrong hand count":         func(s *state) { s.HandNumber = 2 },
		"future private pin":       func(s *state) { s.ModuleVersion = "2.0.0" },
		"null event list":          func(s *state) { s.Events = nil },
		"missing event":            func(s *state) { s.Events = s.Events[:len(s.Events)-1] },
		"wrong event id":           func(s *state) { s.Events[0].ID = 2 },
		"wrong event text":         func(s *state) { s.Events[0].Message = "forged" },
		"private event detail":     func(s *state) { s.Events[0].Card = ptr("SA") },
		"missing event actor":      func(s *state) { s.Events[2].Seat = nil },
		"invalid event actor":      func(s *state) { s.Events[2].Seat = ptr(4) },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			copy := cloneState(s.state)
			mutate(copy)
			raw, _ := json.Marshal(copy)
			if _, err := Open(raw); err == nil {
				t.Fatal("invalid state accepted")
			}
		})
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(good, &fields); err != nil {
		t.Fatal(err)
	}
	for _, mutation := range []struct {
		name string
		edit func(map[string]json.RawMessage)
	}{
		{"explicit optional null", func(m map[string]json.RawMessage) { m["handResult"] = json.RawMessage("null") }},
		{"case alias", func(m map[string]json.RawMessage) { m["Phase"] = m["phase"]; delete(m, "phase") }},
		{"unknown private field", func(m map[string]json.RawMessage) { m["secret"] = json.RawMessage("true") }},
		{"short fixed array", func(m map[string]json.RawMessage) { m["scores"] = json.RawMessage("[0,0,0]") }},
	} {
		t.Run(mutation.name, func(t *testing.T) {
			copy := map[string]json.RawMessage{}
			for k, v := range fields {
				copy[k] = v
			}
			mutation.edit(copy)
			raw, _ := json.Marshal(copy)
			if _, err := Open(raw); err == nil {
				t.Fatal("invalid closed shape accepted")
			}
		})
	}
	if _, err := Open(append([]byte(`{"phase":"play",`), good[1:]...)); err == nil {
		t.Fatal("duplicate private key accepted")
	}
	if _, err := Open([]byte(strings.Replace(string(good), `"continuation"`, `"\ud800"`, 1))); err == nil {
		t.Fatal("malformed Unicode accepted")
	}
}

func TestConcealedSwapLeavesPlayerProjectionUnchanged(t *testing.T) {
	s := advanceFirstLegal(t, passedSnapshot(t))
	changed := cloneState(s.state)
	// The opening pass moves low cards. These retained high side-suit cards are
	// unknown to South and have not participated in a public play.
	first, second := -1, -1
	for i, c := range changed.Hands[2] {
		if c[0] == 'D' && !has(changed.Passes[2].Incoming, c) {
			first = i
			break
		}
	}
	for i, c := range changed.Hands[3] {
		if c[0] == 'D' && !has(changed.Passes[3].Incoming, c) {
			second = i
			break
		}
	}
	if first < 0 || second < 0 {
		t.Fatal("missing concealed cards")
	}
	changed.Hands[2][first], changed.Hands[3][second] = changed.Hands[3][second], changed.Hands[2][first]
	changed.Hands[2] = sorted(changed.Hands[2])
	changed.Hands[3] = sorted(changed.Hands[3])
	raw, _ := json.Marshal(changed)
	other, err := Open(raw)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := s.Project(0)
	after, _ := other.Project(0)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("concealed ownership changed player projection")
	}
}

func TestRejectedTransitionsPreserveSnapshotAndEventCapacity(t *testing.T) {
	s := passedSnapshot(t)
	before, _ := s.Export()
	actor := *s.state.Turn
	bad := []json.RawMessage{
		playCommand((actor+1)%4, "C2"), playCommand(actor, "SQ"),
		json.RawMessage(`{"type":"collect-trick"}`), json.RawMessage(`{"type":"next-hand","deal":["C2"]}`),
		json.RawMessage(`{"type":"action","action":{"kind":"play","seat":0,"card":"C2","hidden":true}}`),
		json.RawMessage(`{"type":"action","action":{"kind":"play","seat":null,"card":"C2"}}`),
	}
	for _, cmd := range bad {
		if _, err := s.Apply(cmd); err == nil {
			t.Fatalf("accepted %s", cmd)
		}
		after, _ := s.Export()
		if !bytes.Equal(before, after) {
			t.Fatal("rejected operation mutated source")
		}
	}
	// A trusted-state boundary fixture isolates event reservation. It does not
	// claim this synthetic archive can pass the separate untrusted import gate.
	full := cloneState(s.state)
	full.Events = make([]event, maxEvents)
	original := cloneState(full)
	if err := applyPlay(full, actor, "C2"); err == nil {
		t.Fatal("event cap exceeded")
	}
	if !reflect.DeepEqual(full, original) {
		t.Fatal("capacity rejection mutated state")
	}
}
