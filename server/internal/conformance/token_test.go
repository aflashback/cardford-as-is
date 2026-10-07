package conformance

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
)

func tokenConfig(variant string) json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{"id":"conformance","variant":%q,"opener":0}`, variant))
}
func tokenMaterial() json.RawMessage {
	tokens := make([]int, 20)
	for i := range tokens {
		tokens[i] = i + 1
	}
	raw, _ := json.Marshal(TokenChance{Kind: "token-layout", Tokens: tokens})
	return raw
}
func tokenView(t *testing.T, s gamekernel.Snapshot, seat int) TokenObservation {
	t.Helper()
	p, err := s.Project(seat)
	if err != nil {
		t.Fatal(err)
	}
	var o TokenObservation
	if err = json.Unmarshal(p.Observation, &o); err != nil {
		t.Fatal(err)
	}
	return o
}
func tokenArchive(t *testing.T, variant string) (json.RawMessage, []json.RawMessage, gamekernel.Snapshot) {
	t.Helper()
	start, err := StartToken(tokenConfig(variant), nil)
	if err != nil {
		t.Fatal(err)
	}
	initial, _ := start.Export()
	chance, _ := json.Marshal(map[string]any{"kind": "chance", "requestId": start.Node().RequestID, "material": tokenMaterial()})
	commands := []json.RawMessage{chance}
	var s gamekernel.Snapshot
	s, err = start.Apply(chance)
	if err != nil {
		t.Fatal(err)
	}
	for step := 0; s.(*TokenSnapshot).Node().Kind != "session-complete" && step < 30; step++ {
		n := s.(*TokenSnapshot).Node()
		var raw json.RawMessage
		if n.Kind == "actor" {
			o := tokenView(t, s, *n.Seat)
			raw, _ = json.Marshal(map[string]any{"kind": "actor", "seat": *n.Seat, "token": o.Own[0]})
		} else {
			raw, _ = json.Marshal(map[string]any{"kind": "automatic", "transitionId": n.TransitionID})
		}
		commands = append(commands, raw)
		s, err = s.Apply(raw)
		if err != nil {
			t.Fatal(err)
		}
	}
	if s.(*TokenSnapshot).Node().Kind != "session-complete" {
		t.Fatal("bounded fixture did not complete")
	}
	return initial, commands, s
}

func TestTokenOpaqueChanceHiddenInformationAndDetachedOutputs(t *testing.T) {
	s, err := StartToken(tokenConfig("neighbour-teams"), nil)
	if err != nil || s.Node().Kind != "chance" || string(s.Node().Request) != `{"kind":"token-layout","count":20}` {
		t.Fatal("module does not own numeric chance", err)
	}
	s, err = StartToken(tokenConfig("neighbour-teams"), tokenMaterial())
	if err != nil {
		t.Fatal(err)
	}
	before, _ := s.Export()
	left, _ := s.Project(0)
	other := &TokenSnapshot{state: cloneToken(s.state)}
	other.state.Holdings[1][0], other.state.Holdings[2][0] = other.state.Holdings[2][0], other.state.Holdings[1][0]
	if err = validateTokenState(other.state); err != nil {
		t.Fatal(err)
	}
	right, _ := other.Project(0)
	if !bytes.Equal(left.Observation, right.Observation) || !reflect.DeepEqual(left.CandidateIDs, right.CandidateIDs) {
		t.Fatal("concealed ownership changed actor-safe input")
	}
	o := tokenView(t, s, 0)
	if !reflect.DeepEqual(o.Competition[0].Seats, []int{0, 1}) || len(o.Own) != 5 || o.Held != [4]int{5, 5, 5, 5} {
		t.Fatal("non-opposite competition or own tokens lost")
	}
	left.Observation[0], left.View[0] = '[', '['
	after, _ := s.Export()
	if !bytes.Equal(before, after) {
		t.Fatal("mutable encoded output aliases private state")
	}
	if _, err = s.Project(4); err == nil {
		t.Fatal("invalid viewer accepted")
	}
}

func TestTokenRevealChronologyAndLowestScore(t *testing.T) {
	for _, variant := range []string{"individual", "neighbour-teams"} {
		t.Run(variant, func(t *testing.T) {
			_, commands, final := tokenArchive(t, variant)
			o := tokenView(t, final, 0)
			if len(commands) != 26 || len(o.Cycles) != 5 || len(o.Current) != 0 || o.Phase != "complete" || o.Collections != [4]int{0, 0, 0, 5} {
				t.Fatal("chance/reveal/automatic lifecycle differs", o)
			}
			want := []string{"seat-0", "seat-1", "seat-2"}
			if variant == "neighbour-teams" {
				want = []string{"A"}
			}
			if !reflect.DeepEqual(o.Winners, want) {
				t.Fatalf("lowest total must win: got %v want %v", o.Winners, want)
			}
			for _, cycle := range o.Cycles {
				if len(cycle.Reveals) != 4 || cycle.Collector != 3 {
					t.Fatal("public reveal history lost")
				}
			}
		})
	}
}

func TestTokenNativeKernelReplayUsesActualOpaqueChance(t *testing.T) {
	initial, commands, final := tokenArchive(t, "neighbour-teams")
	r := gamekernel.NewRegistry()
	if err := r.RegisterSnapshot(TokenGameID, gamekernel.SnapshotFuncs{
		StartFunc: func(json.RawMessage, []string) (gamekernel.Snapshot, error) {
			return nil, fmt.Errorf("legacy string-deck bootstrap cannot initialize a token module")
		}, OpenFunc: OpenToken,
	}); err != nil {
		t.Fatal(err)
	}
	e, err := gamekernel.NewExecutor(r, gamekernel.DefaultLimits())
	if err != nil {
		t.Fatal(err)
	}
	result, err := e.ReplayNative(context.Background(), gamekernel.NativeReplayRequest{
		ReplayRequest: gamekernel.ReplayRequest{Mode: TokenGameID, Commands: commands, Seats: []int{0, 1, 2, 3}}, InitialState: initial,
	}, nil)
	if err != nil || result.Transitions != len(commands) {
		t.Fatal("actual native kernel replay failed", err)
	}
	want, _ := final.Export()
	if !bytes.Equal(result.Final.Frame.State, want) {
		t.Fatal("replay differs from direct immutable transitions")
	}
	// Use the actual current production catalog builder, without installing a
	// fixture facade or pretending the native replay registry is that catalog.
	production, err := sessions.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	handlers := sessions.DefaultHandlers()
	for _, item := range production.Catalog(handlers.Engine, handlers.UI) {
		if item.GameID == TokenGameID {
			t.Fatal("test module entered public catalog")
		}
	}
}

func TestTokenStrictImportCommandsAndCorruption(t *testing.T) {
	s, err := StartToken(tokenConfig("individual"), tokenMaterial())
	if err != nil {
		t.Fatal(err)
	}
	before, _ := s.Export()
	for _, bad := range []string{
		`{"kind":"actor","seat":1,"token":2}`,
		`{"kind":"actor","seat":0,"token":2}`,
		`{"kind":"actor","seat":0,"token":1,"hidden":true}`,
		`{"kind":"actor","seat":0,"seat":1,"token":1}`,
		`{"kind":"automatic","transitionId":"collect:1"}`,
		`{"kind":"chance","requestId":"token-layout:1","material":{"kind":"token-layout","tokens":[]}}`,
	} {
		if _, err = s.Apply(json.RawMessage(bad)); err == nil {
			t.Fatalf("accepted invalid command: %s", bad)
		}
		after, _ := s.Export()
		if !bytes.Equal(before, after) {
			t.Fatal("rejected command changed source")
		}
	}
	broken := cloneToken(s.state)
	broken.Holdings[1][0] = broken.Holdings[0][0]
	raw, _ := json.Marshal(broken)
	if _, err = OpenToken(raw); err == nil {
		t.Fatal("duplicate material imported")
	}
	_, _, terminal := tokenArchive(t, "individual")
	broken = cloneToken(terminal.(*TokenSnapshot).state)
	broken.Cycles[0].Collector = 0
	raw, _ = json.Marshal(broken)
	if _, err = OpenToken(raw); err == nil {
		t.Fatal("changed public result imported")
	}
	if _, err = OpenToken(append(before[:len(before)-1:len(before)-1], []byte(`,"extra":true}`)...)); err == nil {
		t.Fatal("unknown private field imported")
	}
	if _, err = TokenPin("unknown"); err == nil {
		t.Fatal("unsupported variant silently accepted")
	}
}
