package cardcontinuation

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/rollout"
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

func latePlay(t *testing.T, mode string) (d.Observation, gamekernel.Snapshot) {
	t.Helper()
	raw, _ := json.Marshal(map[string]any{"id": "late", "mode": mode, "dealer": 0})
	var s gamekernel.Snapshot
	var err error
	if mode == "hearts" {
		s, err = hearts.Start(raw, d.FullDeck())
	} else {
		s, err = spades.Start(raw, d.FullDeck())
	}
	if err != nil {
		t.Fatal(err)
	}
	for step := 0; step < 100; step++ {
		p, err := s.Project(0)
		if err != nil {
			t.Fatal(err)
		}
		var o d.Observation
		json.Unmarshal(p.Observation, &o)
		if o.Phase == "play" && len(o.History) >= 11 {
			p, err = s.Project(*o.Turn)
			if err != nil {
				t.Fatal(err)
			}
			json.Unmarshal(p.Observation, &o)
			return o, s
		}
		var command any
		switch o.Phase {
		case "pass":
			passes := [4][]string{}
			for seat := 0; seat < 4; seat++ {
				p, err = s.Project(seat)
				if err != nil {
					t.Fatal(err)
				}
				var own d.Observation
				json.Unmarshal(p.Observation, &own)
				passes[seat] = own.LegalActions[0].Cards
			}
			command = map[string]any{"type": "action", "action": map[string]any{"kind": "pass-bundle", "passes": passes}}
		case "bid", "play":
			p, err = s.Project(*o.Turn)
			if err != nil {
				t.Fatal(err)
			}
			json.Unmarshal(p.Observation, &o)
			command = map[string]any{"type": "action", "action": o.LegalActions[0]}
		case "trick-end":
			command = map[string]any{"type": "collect-trick"}
		default:
			t.Fatalf("unexpected fixture phase %s", o.Phase)
		}
		raw, _ = json.Marshal(command)
		s, err = s.Apply(raw)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("fixture did not reach late play")
	return d.Observation{}, nil
}

type capturingReferee struct {
	*referee
	seed   uint32
	sample world
}

func (r *capturingReferee) Sample(ctx context.Context, w *rollout.Work, seed uint32) (*rollout.Sample[world], error) {
	v, e := r.referee.Sample(ctx, w, seed)
	if e == nil && v != nil {
		r.seed = seed
		r.sample = v.World
	}
	return v, e
}
func TestPlaySamplerParityAndProductionReducerCompletion(t *testing.T) {
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			o, source := latePlay(t, mode)
			before, _ := source.Export()
			c := DefaultConfig()
			c.Budget.MaxWorlds = 1
			r := &capturingReferee{referee: &referee{input: o, config: c}}
			p := r.Components()
			p.Seeds = c.Seeds
			policies := map[int]rollout.ActorPolicy[d.Observation, d.Action]{}
			for s := 0; s < 4; s++ {
				policies[s] = actorPolicy{}
			}
			ids := []string{}
			for _, a := range o.LegalActions {
				ids = append(ids, d.ActionID(a))
			}
			got, e := rollout.RunPaired(r, policies, c.Horizon, rollout.Root{Seat: o.Seat, CandidateIDs: ids}, c.Budget, comparison{o.Mode, o.Seat}, p, rollout.ExecutionContext{Context: context.Background(), AdmissionClass: "offline"})
			if e != nil {
				t.Fatal(e)
			}
			if got.Coverage.Completed != 1 || got.Results[0].Kind != "terminal" {
				t.Fatalf("late play failed: %+v", got)
			}
			expected, e := d.SampleHands(context.Background(), o, r.seed)
			if e != nil {
				t.Fatal(e)
			}
			raw, _ := r.sample.snapshot.Export()
			var state struct{ Hands [4][]string }
			json.Unmarshal(raw, &state)
			if !reflect.DeepEqual(expected, state.Hands) {
				t.Fatal("bounded sampler changed V1 feasible-world draw")
			}
			after, _ := source.Export()
			if !bytes.Equal(before, after) {
				t.Fatal("synthetic planning mutated original game")
			}
			t.Logf("worlds=%d steps=%d sampler=%d setup=%d reserved=%d", got.Work.Worlds, got.Work.Steps, got.Work.SamplerOperations, got.Work.SetupOperations, got.Work.PeakMemoryBytes)
		})
	}
}
func TestFreshRoundChanceAndDeclaredMatchCutoff(t *testing.T) {
	o, _ := latePlay(t, "spades-partners")
	c := DefaultConfig()
	c.Budget.MaxWorlds = 1
	c.Horizon.Scope = "match-cutoff-two-rounds"
	got, e := Evaluate(context.Background(), o, c)
	if e != nil {
		t.Fatal(e)
	}
	if got.Coverage.Completed != 1 || got.Results[0].Kind != "cutoff" || got.Results[0].Evaluator == nil || got.Work.SamplerOperations < 52 {
		t.Fatalf("round did not use fresh chance and declared cutoff: %+v", got)
	}
}
func TestAdapterCancellationAndSamplerCaps(t *testing.T) {
	o, _ := latePlay(t, "hearts")
	c := DefaultConfig()
	c.Budget.MaxSamplerOperations = 1
	got, e := Evaluate(context.Background(), o, c)
	if e != nil {
		t.Fatal(e)
	}
	if got.ExecutionStatus != "budget-exhausted" || got.Work.SamplerOperations > 1 || got.SelectedID != nil {
		t.Fatalf("sampler exceeded cap: %+v", got)
	}
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	got, e = Evaluate(ctx, o, DefaultConfig())
	if e != nil {
		t.Fatal(e)
	}
	if got.ExecutionStatus != "deadline" || got.Work.Worlds != 0 {
		t.Fatalf("expired setup did work: %+v", got)
	}
}

// Probe inside the already-budgeted referee callback, without accepting an
// authoritative game or exposing a world to the policy.
type isolationReferee struct {
	*referee
	inputs  []rollout.ActorInput[d.Observation, d.Action]
	choices []rollout.Choice
	worlds  []json.RawMessage
}

func (r *isolationReferee) Sample(ctx context.Context, w *rollout.Work, seed uint32) (*rollout.Sample[world], error) {
	for _, s := range []uint32{100, 200} {
		v, e := r.referee.Sample(ctx, w, s)
		if e != nil {
			return nil, e
		}
		in, e := r.Project(ctx, w, v.World, r.input.Seat)
		if e != nil {
			return nil, e
		}
		m, e := r.Memory(in)
		if e != nil {
			return nil, e
		}
		choice, e := (actorPolicy{}).Choose(ctx, w, in, m, 719)
		if e != nil {
			return nil, e
		}
		r.inputs = append(r.inputs, in)
		r.choices = append(r.choices, choice)
		raw, e := v.World.snapshot.Export()
		if e != nil {
			return nil, e
		}
		r.worlds = append(r.worlds, raw)
	}
	return nil, nil
}
func TestConcreteIndistinguishableWorldsChooseIdentically(t *testing.T) {
	for _, mode := range []string{"spades-partners", "hearts"} {
		t.Run(mode, func(t *testing.T) {
			o := fixture(t, mode)
			c := DefaultConfig()
			c.Budget.MaxWorlds = 1
			r := &isolationReferee{referee: &referee{input: o, config: c}}
			p := r.Components()
			p.Seeds = c.Seeds
			_, e := rollout.RunPaired(r, map[int]rollout.ActorPolicy[d.Observation, d.Action]{}, c.Horizon, rollout.Root{Seat: o.Seat, CandidateIDs: []string{d.ActionID(o.LegalActions[0])}}, c.Budget, comparison{o.Mode, o.Seat}, p, rollout.ExecutionContext{Context: context.Background(), AdmissionClass: "offline"})
			if e != nil {
				t.Fatal(e)
			}
			if bytes.Equal(r.worlds[0], r.worlds[1]) {
				t.Fatal("fixture did not produce distinct feasible concealed worlds")
			}
			if !reflect.DeepEqual(r.inputs[0], r.inputs[1]) || !reflect.DeepEqual(r.choices[0], r.choices[1]) {
				t.Fatal("indistinguishable actor decision depends on concealed world")
			}
		})
	}
}
