package gamekernel

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
)

type counterSnapshot struct {
	raw    json.RawMessage
	calls  *atomic.Int32
	cancel context.CancelFunc
}

func (s *counterSnapshot) Export() (json.RawMessage, error) { return bytes.Clone(s.raw), nil }
func (s *counterSnapshot) Apply(c json.RawMessage) (Snapshot, error) {
	raw, err := counterModule(s.calls).Apply(s.raw, c)
	if err != nil {
		return nil, err
	}
	if s.cancel != nil {
		s.cancel()
	}
	return &counterSnapshot{raw: raw, calls: s.calls, cancel: s.cancel}, nil
}
func (s *counterSnapshot) Project(int) (Projection, error) {
	return Projection{Observation: bytes.Clone(s.raw), View: bytes.Clone(s.raw), CandidateIDs: []string{"increment"}}, nil
}
func nativeExecutor(t *testing.T, l Limits, calls *atomic.Int32, opens *atomic.Int32, cancel context.CancelFunc) *Executor {
	t.Helper()
	r := NewRegistry()
	if err := r.RegisterSnapshot("counter", SnapshotFuncs{StartFunc: func(json.RawMessage, []string) (Snapshot, error) {
		opens.Add(1)
		return &counterSnapshot{raw: json.RawMessage(`{"counter":0}`), calls: calls, cancel: cancel}, nil
	}, OpenFunc: func(raw json.RawMessage) (Snapshot, error) {
		opens.Add(1)
		if !json.Valid(raw) {
			return nil, fmt.Errorf("invalid stored state")
		}
		return &counterSnapshot{raw: bytes.Clone(raw), calls: calls, cancel: cancel}, nil
	}}); err != nil {
		t.Fatal(err)
	}
	e, err := NewExecutor(r, l)
	if err != nil {
		t.Fatal(err)
	}
	return e
}
func TestNativeReplaySingleFrameEncodingAndCounts(t *testing.T) {
	var calls, opens atomic.Int32
	e := nativeExecutor(t, DefaultLimits(), &calls, &opens, nil)
	r := request(2)
	r.Config = nil
	n := 0
	result, err := e.ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: r, InitialState: json.RawMessage(`{"counter":0}`)}, func(f EncodedFrame) error {
		encoded, _ := json.Marshal(f.Frame)
		if !bytes.Equal(encoded, f.Bytes) {
			t.Fatal("encoded frame differs")
		}
		n++
		return nil
	})
	if err != nil || opens.Load() != 1 || calls.Load() != 2 || result.Transitions != 2 || n != 3 || string(result.Final.State) != `{"counter":2}` {
		t.Fatalf("native replay boundaries: opens%d applies%d frames%d error%v", opens.Load(), calls.Load(), n, err)
	}
}
func TestNativeReplayBoundsAndCancellation(t *testing.T) {
	var calls, opens atomic.Int32
	l := DefaultLimits()
	l.MaxCommands = 1
	e := nativeExecutor(t, l, &calls, &opens, nil)
	if _, err := e.ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: request(2)}, nil); !errors.Is(err, ErrBudget) || opens.Load() != 0 {
		t.Fatal("command budget not checked before module work")
	}
	r := request(0)
	if _, err := e.ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: r, InitialState: json.RawMessage(`{}`)}, nil); err == nil {
		t.Fatal("mixed initial state/configuration accepted")
	}
	r.Config = nil
	if _, err := e.ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: r, InitialState: bytes.Repeat([]byte(" "), MaxStateBytes+1)}, nil); !errors.Is(err, ErrBudget) {
		t.Fatal("oversized initial state accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	e = nativeExecutor(t, DefaultLimits(), &calls, &opens, cancel)
	r = request(3)
	seen := 0
	if _, err := e.ReplayNative(ctx, NativeReplayRequest{ReplayRequest: r}, func(EncodedFrame) error { seen++; return nil }); !errors.Is(err, context.Canceled) || calls.Load() != 1 || seen != 1 {
		t.Fatalf("canceled native replay continued: %v calls%d frames%d", err, calls.Load(), seen)
	}
}
func TestNativeReplayCallbackCannotMutateSnapshot(t *testing.T) {
	var calls, opens atomic.Int32
	e := nativeExecutor(t, DefaultLimits(), &calls, &opens, nil)
	result, err := e.ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: request(1)}, func(f EncodedFrame) error {
		if f.CommandIndex == -1 {
			f.State[0] = '['
			f.Observations[0][0] = '['
			f.Views[0][0] = '['
			f.CandidateIDs[0][0] = "other"
		}
		return nil
	})
	if err != nil || string(result.Final.State) != `{"counter":1}` {
		t.Fatalf("callback altered trusted snapshot: %v", err)
	}
}

type boundedSnapshot struct {
	raw        json.RawMessage
	projection Projection
	next       Snapshot
	onProject  func()
}

func (s *boundedSnapshot) Export() (json.RawMessage, error)        { return bytes.Clone(s.raw), nil }
func (s *boundedSnapshot) Apply(json.RawMessage) (Snapshot, error) { return s.next, nil }
func (s *boundedSnapshot) Project(int) (Projection, error) {
	if s.onProject != nil {
		s.onProject()
	}
	return s.projection, nil
}
func boundedExecutor(t *testing.T, s Snapshot, l Limits) *Executor {
	t.Helper()
	r := NewRegistry()
	if err := r.RegisterSnapshot("counter", SnapshotFuncs{StartFunc: func(json.RawMessage, []string) (Snapshot, error) { return s, nil }, OpenFunc: func(json.RawMessage) (Snapshot, error) { return s, nil }}); err != nil {
		t.Fatal(err)
	}
	e, err := NewExecutor(r, l)
	if err != nil {
		t.Fatal(err)
	}
	return e
}
func TestNativeCheckpointStateAndProjectionBudgets(t *testing.T) {
	good := &boundedSnapshot{raw: json.RawMessage(`{}`), projection: Projection{Observation: json.RawMessage(`{}`), View: json.RawMessage(`{}`), CandidateIDs: []string{}}}
	largeState := &boundedSnapshot{raw: json.RawMessage(`{"padding":"` + string(bytes.Repeat([]byte("x"), 80)) + `"}`)}
	l := DefaultLimits()
	l.MaxStateBytes = 64
	if _, err := boundedExecutor(t, largeState, l).ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: request(0)}, nil); !errors.Is(err, ErrBudget) {
		t.Fatal("initial state bound missing")
	}
	good.next = largeState
	seen := 0
	if _, err := boundedExecutor(t, good, l).ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: request(1)}, func(EncodedFrame) error { seen++; return nil }); !errors.Is(err, ErrBudget) || seen != 1 {
		t.Fatal("next state bound missing")
	}
	largeView := *good
	largeView.projection = Projection{Observation: json.RawMessage(`{}`), View: json.RawMessage(`{"padding":"` + string(bytes.Repeat([]byte("x"), 280)) + `"}`), CandidateIDs: []string{}}
	l.MaxFrameBytes = 256
	if _, err := boundedExecutor(t, &largeView, l).ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: request(0)}, nil); !errors.Is(err, ErrBudget) {
		t.Fatal("projection bound missing")
	}
}
func TestNativeCancellationBetweenProjectionsAndAdmissionRelease(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	count := 0
	s := &boundedSnapshot{raw: json.RawMessage(`{}`), projection: Projection{Observation: json.RawMessage(`{}`), View: json.RawMessage(`{}`), CandidateIDs: []string{}}, onProject: func() { count++; cancel() }}
	e := boundedExecutor(t, s, DefaultLimits())
	if _, err := e.ReplayNative(ctx, NativeReplayRequest{ReplayRequest: request(0)}, nil); !errors.Is(err, context.Canceled) || count != 1 {
		t.Fatal("canceled projections continued")
	}
	s.onProject = nil
	// Occupy both of the same slots used by legacy Replay; native work must
	// reject without queueing and must recover when a slot is released.
	e.slots <- struct{}{}
	e.slots <- struct{}{}
	if _, err := e.ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: request(0)}, nil); !errors.Is(err, ErrSaturated) {
		t.Fatal("native admission bound missing")
	}
	<-e.slots
	<-e.slots
	sentinel := errors.New("capture stopped")
	for i := 0; i < 3; i++ {
		if _, err := e.ReplayNative(context.Background(), NativeReplayRequest{ReplayRequest: request(0)}, func(EncodedFrame) error { return sentinel }); !errors.Is(err, sentinel) {
			t.Fatal("visitor failure did not release admission")
		}
	}
}
