package gamekernel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// This non-card module has no suits, tricks, bids, teams or game phases. It
// proves that registration/replay orchestration does not depend on those rules.
func counterModule(applies *atomic.Int32) Funcs {
	return Funcs{
		CreateFunc: func(json.RawMessage, []string) (json.RawMessage, error) { return json.RawMessage(`{"counter":0}`), nil },
		ApplyFunc: func(state, command json.RawMessage) (json.RawMessage, error) {
			var s struct {
				Counter int `json:"counter"`
			}
			if err := json.Unmarshal(state, &s); err != nil {
				return nil, err
			}
			if string(command) != `{"increment":1}` {
				return nil, fmt.Errorf("invalid counter command")
			}
			applies.Add(1)
			return json.Marshal(struct {
				Counter int `json:"counter"`
			}{s.Counter + 1})
		},
		ObserveFunc: func(s json.RawMessage, seat int) (json.RawMessage, error) {
			return append(json.RawMessage{}, s...), nil
		},
		LegalFunc: func(json.RawMessage, int) (json.RawMessage, error) { return json.RawMessage(`[{"increment":1}]`), nil },
		SafeViewFunc: func(s json.RawMessage, seat int) (json.RawMessage, error) {
			return append(json.RawMessage{}, s...), nil
		},
		CandidateIDsFunc: func(json.RawMessage, int) ([]string, error) { return []string{"increment"}, nil },
		ValidateFunc: func(s json.RawMessage) error {
			if !json.Valid(s) {
				return fmt.Errorf("invalid counter snapshot")
			}
			return nil
		},
	}
}
func executor(t *testing.T, m Module, l Limits) *Executor {
	t.Helper()
	registry := NewRegistry()
	if err := registry.Register("counter", m); err != nil {
		t.Fatal(err)
	}
	e, err := NewExecutor(registry, l)
	if err != nil {
		t.Fatal(err)
	}
	return e
}
func request(count int) ReplayRequest {
	commands := make([]json.RawMessage, count)
	for i := range commands {
		commands[i] = json.RawMessage(`{"increment":1}`)
	}
	return ReplayRequest{Mode: "counter", Config: json.RawMessage(`{}`), Deal: []string{}, Commands: commands, Seats: []int{0, 1, 2, 3}}
}

func TestReplayStreamsFramesAndRetainsOnlyFinal(t *testing.T) {
	var applies atomic.Int32
	e := executor(t, counterModule(&applies), DefaultLimits())
	indices := []int{}
	result, err := e.Replay(context.Background(), request(3), func(f Frame) error {
		indices = append(indices, f.CommandIndex)
		if len(f.Observations) != 4 || len(f.Views) != 4 || len(f.CandidateIDs) != 4 {
			t.Fatal("missing observer frame")
		}
		return nil
	})
	if err != nil || result.Transitions != 3 || applies.Load() != 3 || string(result.Final.State) != `{"counter":3}` || !reflect.DeepEqual(indices, []int{-1, 0, 1, 2}) {
		t.Fatalf("bad replay: %+v %v indices=%v", result, err, indices)
	}
}
func TestCommandBudgetIsReservedBeforeCreate(t *testing.T) {
	var applies, creates atomic.Int32
	m := counterModule(&applies)
	original := m.CreateFunc
	m.CreateFunc = func(c json.RawMessage, d []string) (json.RawMessage, error) { creates.Add(1); return original(c, d) }
	l := DefaultLimits()
	l.MaxCommands = 2
	e := executor(t, m, l)
	if _, err := e.Replay(context.Background(), request(3), nil); !errors.Is(err, ErrBudget) {
		t.Fatalf("want command budget error, got %v", err)
	}
	if creates.Load() != 0 || applies.Load() != 0 {
		t.Fatal("exhausted replay started module work")
	}
	result, err := e.Replay(context.Background(), request(2), nil)
	if err != nil || result.Transitions != 2 || applies.Load() != 2 {
		t.Fatalf("exact boundary must complete: %v", err)
	}
}
func TestInputByteBudgetRejectsBeforeModuleWork(t *testing.T) {
	for _, which := range []string{"configuration", "chance", "command", "total"} {
		t.Run(which, func(t *testing.T) {
			var applies, creates atomic.Int32
			m := counterModule(&applies)
			m.CreateFunc = func(json.RawMessage, []string) (json.RawMessage, error) {
				creates.Add(1)
				return json.RawMessage(`{}`), nil
			}
			l := DefaultLimits()
			l.MaxStateBytes = 32
			l.MaxInputBytes = 100
			r := request(0)
			switch which {
			case "configuration":
				r.Config = json.RawMessage(strings.Repeat(" ", 33))
			case "chance":
				r.Deal = []string{strings.Repeat("x", 100)}
			case "command":
				r.Commands = []json.RawMessage{json.RawMessage(strings.Repeat(" ", 33))}
			case "total":
				r.Commands = make([]json.RawMessage, 6)
				for i := range r.Commands {
					r.Commands[i] = json.RawMessage(`{"increment":1}`)
				}
			}
			if _, err := executor(t, m, l).Replay(context.Background(), r, nil); !errors.Is(err, ErrBudget) {
				t.Fatalf("want input budget error, got %v", err)
			}
			if creates.Load() != 0 {
				t.Fatal("oversized input dispatched")
			}
		})
	}
}
func TestStateBudgetAtInitialAndEveryCheckpoint(t *testing.T) {
	for _, initial := range []bool{true, false} {
		t.Run(fmt.Sprint(initial), func(t *testing.T) {
			var applies atomic.Int32
			m := counterModule(&applies)
			oversized := json.RawMessage(`{"padding":"` + strings.Repeat("x", 80) + `"}`)
			if initial {
				m.CreateFunc = func(json.RawMessage, []string) (json.RawMessage, error) { return oversized, nil }
			} else {
				m.ApplyFunc = func(json.RawMessage, json.RawMessage) (json.RawMessage, error) { applies.Add(1); return oversized, nil }
			}
			l := DefaultLimits()
			l.MaxStateBytes = 64
			frames := 0
			_, err := executor(t, m, l).Replay(context.Background(), request(2), func(Frame) error { frames++; return nil })
			if !errors.Is(err, ErrBudget) {
				t.Fatalf("want state budget error, got %v", err)
			}
			if initial && (frames != 0 || applies.Load() != 0) || !initial && (frames != 1 || applies.Load() != 1) {
				t.Fatalf("work continued past oversized checkpoint: frames=%d applies=%d", frames, applies.Load())
			}
		})
	}
}
func TestFrameBudgetRejectsBeforeVisitor(t *testing.T) {
	var applies atomic.Int32
	m := counterModule(&applies)
	m.ObserveFunc = func(json.RawMessage, int) (json.RawMessage, error) {
		return json.RawMessage(`{"padding":"` + strings.Repeat("x", 160) + `"}`), nil
	}
	l := DefaultLimits()
	l.MaxFrameBytes = 256
	frames := 0
	if _, err := executor(t, m, l).Replay(context.Background(), request(1), func(Frame) error { frames++; return nil }); !errors.Is(err, ErrBudget) {
		t.Fatalf("want projection budget error, got %v", err)
	}
	if frames != 0 || applies.Load() != 0 {
		t.Fatal("oversized frame was visited or advanced")
	}
}
func TestCancellationBeforeAdmissionAndAfterTransition(t *testing.T) {
	var applies, creates atomic.Int32
	m := counterModule(&applies)
	original := m.CreateFunc
	m.CreateFunc = func(c json.RawMessage, d []string) (json.RawMessage, error) { creates.Add(1); return original(c, d) }
	e := executor(t, m, DefaultLimits())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := e.Replay(ctx, request(2), nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("want canceled, got %v", err)
	}
	if creates.Load() != 0 {
		t.Fatal("canceled request reached module")
	}
	ctx, cancel = context.WithCancel(context.Background())
	defer cancel()
	m = counterModule(&applies)
	apply := m.ApplyFunc
	m.ApplyFunc = func(s, c json.RawMessage) (json.RawMessage, error) {
		next, err := apply(s, c)
		cancel()
		return next, err
	}
	frames := 0
	if _, err := executor(t, m, DefaultLimits()).Replay(ctx, request(3), func(Frame) error { frames++; return nil }); !errors.Is(err, context.Canceled) {
		t.Fatalf("want cancellation after first transition, got %v", err)
	}
	if applies.Load() != 1 || frames != 1 {
		t.Fatalf("canceled transition leaked into later work: applies=%d frames=%d", applies.Load(), frames)
	}
}
func TestCancellationBetweenSeatProjections(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var applies, observed, views atomic.Int32
	m := counterModule(&applies)
	m.ObserveFunc = func(s json.RawMessage, seat int) (json.RawMessage, error) { observed.Add(1); cancel(); return s, nil }
	m.SafeViewFunc = func(s json.RawMessage, seat int) (json.RawMessage, error) { views.Add(1); return s, nil }
	if _, err := executor(t, m, DefaultLimits()).Replay(ctx, request(1), nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("want canceled, got %v", err)
	}
	if observed.Load() != 1 || views.Load() != 0 || applies.Load() != 0 {
		t.Fatal("work continued after observation canceled")
	}
}
func TestAdmissionHasTwoSlotsAndNoQueue(t *testing.T) {
	var applies atomic.Int32
	m := counterModule(&applies)
	entered := make(chan struct{}, 2)
	release := make(chan struct{})
	m.CreateFunc = func(json.RawMessage, []string) (json.RawMessage, error) {
		entered <- struct{}{}
		<-release
		return json.RawMessage(`{"counter":0}`), nil
	}
	e := executor(t, m, DefaultLimits())
	done := make(chan error, 2)
	for n := 0; n < 2; n++ {
		go func() { _, err := e.Replay(context.Background(), request(0), nil); done <- err }()
	}
	for n := 0; n < 2; n++ {
		select {
		case <-entered:
		case <-time.After(2 * time.Second):
			close(release)
			t.Fatal("admitted work did not start")
		}
	}
	_, err := e.Replay(context.Background(), request(0), nil)
	if !errors.Is(err, ErrSaturated) {
		close(release)
		t.Fatalf("third job must fail immediately, got %v", err)
	}
	close(release)
	for n := 0; n < 2; n++ {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	if _, err = e.Replay(context.Background(), request(0), nil); err != nil {
		t.Fatalf("completed work did not release admission: %v", err)
	}
}
func TestVisitorFailureReleasesAdmission(t *testing.T) {
	var applies atomic.Int32
	e := executor(t, counterModule(&applies), DefaultLimits())
	sentinel := errors.New("stop private capture")
	for n := 0; n < 3; n++ {
		if _, err := e.Replay(context.Background(), request(1), func(Frame) error { return sentinel }); !errors.Is(err, sentinel) {
			t.Fatalf("visitor failure or slot release mismatch: %v", err)
		}
	}
	if applies.Load() != 0 {
		t.Fatal("replay continued after visitor failure")
	}
}
func TestRegistryAndLimitsFailClosed(t *testing.T) {
	r := NewRegistry()
	var applies atomic.Int32
	m := counterModule(&applies)
	if err := r.Register("counter", m); err != nil {
		t.Fatal(err)
	}
	if err := r.Register("counter", m); err == nil {
		t.Fatal("duplicate module accepted")
	}
	if err := r.Register("bad", Funcs{}); err == nil {
		t.Fatal("partial module accepted")
	}
	if _, err := r.Resolve("missing"); err == nil {
		t.Fatal("unknown module resolved")
	}
	for _, l := range []Limits{{}, {MaxCommands: MaxCommands + 1, MaxStateBytes: MaxStateBytes, MaxFrameBytes: MaxFrameBytes, MaxInputBytes: MaxInputBytes}} {
		if _, err := NewExecutor(r, l); err == nil {
			t.Fatal("invalid/unbounded limits accepted")
		}
	}
	for _, seats := range [][]int{{0, 0}, {4}, {-1}, {0, 1, 2, 3, 0}} {
		req := request(0)
		req.Seats = seats
		if _, err := executor(t, m, DefaultLimits()).Replay(context.Background(), req, nil); err == nil {
			t.Fatalf("invalid seats accepted: %v", seats)
		}
	}
}
