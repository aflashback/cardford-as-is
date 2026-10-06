package gamekernel

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
)

// Snapshot is an immutable, validated, game-owned private position. Implementors
// never expose mutable private state; Apply creates a distinct next snapshot.
// Raw imports and commands stay strict boundaries. Export and Project operate
// on already validated data and do not decode it again.
type Snapshot interface {
	Apply(json.RawMessage) (Snapshot, error)
	Export() (json.RawMessage, error)
	Project(int) (Projection, error)
}
type Projection struct {
	Observation  json.RawMessage
	View         json.RawMessage
	CandidateIDs []string
}
type SnapshotModule interface {
	Start(json.RawMessage, []string) (Snapshot, error)
	Open(json.RawMessage) (Snapshot, error)
}
type SnapshotFuncs struct {
	StartFunc func(json.RawMessage, []string) (Snapshot, error)
	OpenFunc  func(json.RawMessage) (Snapshot, error)
}

func (f SnapshotFuncs) Start(c json.RawMessage, d []string) (Snapshot, error) {
	return f.StartFunc(c, d)
}
func (f SnapshotFuncs) Open(s json.RawMessage) (Snapshot, error) { return f.OpenFunc(s) }
func (r *Registry) RegisterSnapshot(mode string, module SnapshotModule) error {
	if r == nil || mode == "" || module == nil {
		return fmt.Errorf("invalid snapshot module registration")
	}
	v := reflect.ValueOf(module)
	if v.Kind() == reflect.Pointer && v.IsNil() {
		return fmt.Errorf("nil snapshot module")
	}
	if f, ok := module.(SnapshotFuncs); ok && (f.StartFunc == nil || f.OpenFunc == nil) {
		return fmt.Errorf("incomplete snapshot functions")
	}
	if f, ok := module.(*SnapshotFuncs); ok && (f.StartFunc == nil || f.OpenFunc == nil) {
		return fmt.Errorf("incomplete snapshot functions")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.snapshots == nil {
		r.snapshots = map[string]SnapshotModule{}
	}
	if _, ok := r.snapshots[mode]; ok {
		return fmt.Errorf("snapshot module already registered")
	}
	r.snapshots[mode] = module
	return nil
}
func (r *Registry) ResolveSnapshot(mode string) (SnapshotModule, error) {
	if r == nil {
		return nil, fmt.Errorf("missing registry")
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.snapshots[mode]
	if !ok {
		return nil, fmt.Errorf("unsupported snapshot module: %s", mode)
	}
	return m, nil
}

type NativeReplayRequest struct {
	ReplayRequest
	InitialState json.RawMessage
}

// EncodedFrame retains the one checked serialization so evidence consumers can
// hash/count/write its bytes without serializing the same frame again.
type EncodedFrame struct {
	Frame
	Bytes json.RawMessage
}
type NativeResult struct {
	Final       EncodedFrame
	Transitions int
}

// ReplayNative is an additive trusted-snapshot path. Replay remains the original
// byte-facade baseline. Both paths share this executor's limits and admission.
func (e *Executor) ReplayNative(ctx context.Context, request NativeReplayRequest, visit func(EncodedFrame) error) (NativeResult, error) {
	var result NativeResult
	if err := ctx.Err(); err != nil {
		return result, err
	}
	if len(request.InitialState) > 0 {
		if len(request.Config) > 0 || len(request.Deal) > 0 {
			return result, fmt.Errorf("initial state is exclusive with configuration/chance")
		}
		if len(request.InitialState) > e.limits.MaxStateBytes {
			return result, ErrBudget
		}
		bounded := request.ReplayRequest
		bounded.Config = request.InitialState
		if err := e.checkInput(bounded); err != nil {
			return result, err
		}
	} else if err := e.checkInput(request.ReplayRequest); err != nil {
		return result, err
	}
	module, err := e.registry.ResolveSnapshot(request.Mode)
	if err != nil {
		return result, err
	}
	select {
	case e.slots <- struct{}{}:
		defer func() { <-e.slots }()
	default:
		return result, ErrSaturated
	}
	if err = ctx.Err(); err != nil {
		return result, err
	}
	var snapshot Snapshot
	if len(request.InitialState) > 0 {
		snapshot, err = module.Open(request.InitialState)
	} else {
		snapshot, err = module.Start(request.Config, request.Deal)
	}
	if err != nil {
		return result, err
	}
	frame, err := e.nativeFrame(ctx, snapshot, -1, request.Seats)
	if err != nil {
		return result, err
	}
	if err = visitNative(ctx, frame, visit); err != nil {
		return result, err
	}
	result.Final = frame
	for index, command := range request.Commands {
		if err = ctx.Err(); err != nil {
			return result, err
		}
		if result.Transitions >= e.limits.MaxCommands {
			return result, ErrBudget
		}
		next, applyErr := snapshot.Apply(command)
		if applyErr != nil {
			return result, fmt.Errorf("command %d: %w", index, applyErr)
		}
		frame, err = e.nativeFrame(ctx, next, index, request.Seats)
		if err != nil {
			return result, err
		}
		if err = visitNative(ctx, frame, visit); err != nil {
			return result, err
		}
		snapshot = next
		result.Final = frame
		result.Transitions++
	}
	return result, nil
}
func (e *Executor) nativeFrame(ctx context.Context, s Snapshot, index int, seats []int) (EncodedFrame, error) {
	if err := ctx.Err(); err != nil {
		return EncodedFrame{}, err
	}
	state, err := s.Export()
	if err != nil {
		return EncodedFrame{}, err
	}
	if len(state) > e.limits.MaxStateBytes {
		return EncodedFrame{}, ErrBudget
	}
	f := Frame{CommandIndex: index, State: state, Observations: []json.RawMessage{}, Views: []json.RawMessage{}, CandidateIDs: [][]string{}}
	remaining := e.limits.MaxFrameBytes - len(state)
	if remaining < 0 {
		return EncodedFrame{}, ErrBudget
	}
	for _, seat := range seats {
		if err = ctx.Err(); err != nil {
			return EncodedFrame{}, err
		}
		p, projectErr := s.Project(seat)
		if projectErr != nil {
			return EncodedFrame{}, projectErr
		}
		if len(p.Observation) > remaining {
			return EncodedFrame{}, ErrBudget
		}
		remaining -= len(p.Observation)
		if len(p.View) > remaining {
			return EncodedFrame{}, ErrBudget
		}
		remaining -= len(p.View)
		if len(p.CandidateIDs) > remaining/3 {
			return EncodedFrame{}, ErrBudget
		}
		for _, id := range p.CandidateIDs {
			if remaining < 3 || len(id) > (remaining-3)/6 {
				return EncodedFrame{}, ErrBudget
			}
			remaining -= 3 + 6*len(id)
		}
		f.Observations = append(f.Observations, p.Observation)
		f.Views = append(f.Views, p.View)
		f.CandidateIDs = append(f.CandidateIDs, p.CandidateIDs)
	}
	if err = ctx.Err(); err != nil {
		return EncodedFrame{}, err
	}
	encoded, err := json.Marshal(f)
	if err != nil {
		return EncodedFrame{}, err
	}
	if len(encoded) > e.limits.MaxFrameBytes {
		return EncodedFrame{}, ErrBudget
	}
	return EncodedFrame{Frame: f, Bytes: encoded}, nil
}
func visitNative(ctx context.Context, f EncodedFrame, visit func(EncodedFrame) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if visit != nil {
		if err := visit(f); err != nil {
			return err
		}
	}
	return ctx.Err()
}
