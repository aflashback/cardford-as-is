package gamekernel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

const (
	MaxCommands    = 256
	MaxStateBytes  = 256 * 1024
	MaxFrameBytes  = 512 * 1024
	MaxInputBytes  = 1024 * 1024
	AdmissionSlots = 2
)

var (
	ErrBudget    = errors.New("compatibility replay budget exceeded")
	ErrSaturated = errors.New("compatibility replay admission saturated")
)

// Limits are logical/input/output limits, not hard CPU or process containment.
// All nonzero limits must fit the frozen M02A maxima. Admission has no queue.
type Limits struct {
	MaxCommands   int
	MaxStateBytes int
	MaxFrameBytes int
	MaxInputBytes int
}

func DefaultLimits() Limits {
	return Limits{MaxCommands: MaxCommands, MaxStateBytes: MaxStateBytes, MaxFrameBytes: MaxFrameBytes, MaxInputBytes: MaxInputBytes}
}

type Executor struct {
	registry *Registry
	limits   Limits
	slots    chan struct{}
}

func NewExecutor(registry *Registry, limits Limits) (*Executor, error) {
	if registry == nil {
		return nil, fmt.Errorf("missing replay registry")
	}
	if limits.MaxCommands < 1 || limits.MaxCommands > MaxCommands || limits.MaxStateBytes < 1 || limits.MaxStateBytes > MaxStateBytes || limits.MaxFrameBytes < 1 || limits.MaxFrameBytes > MaxFrameBytes || limits.MaxInputBytes < 1 || limits.MaxInputBytes > MaxInputBytes {
		return nil, fmt.Errorf("invalid replay limits")
	}
	return &Executor{registry: registry, limits: limits, slots: make(chan struct{}, AdmissionSlots)}, nil
}

type ReplayRequest struct {
	Mode     string
	Config   json.RawMessage
	Deal     []string
	Commands []json.RawMessage
	Seats    []int
}

// Frame is server-private test/evidence data. A callback must not retain frames
// in a live service, publish private State, or treat it as a safe player view.
type Frame struct {
	CommandIndex int               `json:"commandIndex"`
	State        json.RawMessage   `json:"state"`
	Observations []json.RawMessage `json:"observations"`
	Views        []json.RawMessage `json:"views"`
	CandidateIDs [][]string        `json:"candidateIds"`
}
type Result struct {
	Final       Frame
	Transitions int
}

// Replay retains only the current checkpoint. The synchronous optional visitor
// lets a private harness compare/stream each frame without accumulating history.
// Cancellation is checked before every transition, validation and projection;
// module calls are bounded by the input, but are not forcibly interrupted.
func (e *Executor) Replay(ctx context.Context, request ReplayRequest, visit func(Frame) error) (Result, error) {
	var result Result
	if err := ctx.Err(); err != nil {
		return result, err
	}
	if err := e.checkInput(request); err != nil {
		return result, err
	}
	module, err := e.registry.Resolve(request.Mode)
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
	state, err := module.Create(request.Config, request.Deal)
	if err != nil {
		return result, err
	}
	frame, err := e.frame(ctx, module, state, -1, request.Seats)
	if err != nil {
		return result, err
	}
	if err = e.visit(ctx, frame, visit); err != nil {
		return result, err
	}
	result.Final = frame
	for index, command := range request.Commands {
		if err = ctx.Err(); err != nil {
			return result, err
		}
		// The entire command count is reserved before Create; this defensive check
		// also keeps charging adjacent to the operation it bounds.
		if result.Transitions >= e.limits.MaxCommands {
			return result, ErrBudget
		}
		next, applyErr := module.Apply(state, command)
		if applyErr != nil {
			return result, fmt.Errorf("command %d: %w", index, applyErr)
		}
		frame, err = e.frame(ctx, module, next, index, request.Seats)
		if err != nil {
			return result, err
		}
		if err = e.visit(ctx, frame, visit); err != nil {
			return result, err
		}
		state = next
		result.Final = frame
		result.Transitions++
	}
	return result, nil
}
func (e *Executor) checkInput(r ReplayRequest) error {
	if len(r.Commands) > e.limits.MaxCommands {
		return ErrBudget
	}
	if len(r.Seats) > 4 {
		return fmt.Errorf("at most four seat projections")
	}
	seen := [4]bool{}
	for _, seat := range r.Seats {
		if seat < 0 || seat > 3 || seen[seat] {
			return fmt.Errorf("invalid or repeated observer seat")
		}
		seen[seat] = true
	}
	// Upper-bound JSON string quoting (six bytes per source byte) without
	// allocating a serialized copy of caller-owned chance material.
	remaining := e.limits.MaxInputBytes
	charge := func(n int) bool {
		if n < 0 || n > remaining {
			return false
		}
		remaining -= n
		return true
	}
	if !charge(len(r.Mode)) || !charge(len(r.Config)) || len(r.Config) > e.limits.MaxStateBytes {
		return ErrBudget
	}
	if !charge(2) {
		return ErrBudget
	}
	for _, token := range r.Deal {
		if len(token) > (remaining-3)/6 {
			return ErrBudget
		}
		if !charge(3 + 6*len(token)) {
			return ErrBudget
		}
	}
	for _, command := range r.Commands {
		if len(command) > e.limits.MaxStateBytes || !charge(len(command)+1) {
			return ErrBudget
		}
	}
	return nil
}
func (e *Executor) frame(ctx context.Context, module Module, state json.RawMessage, index int, seats []int) (Frame, error) {
	frame := Frame{CommandIndex: index, State: state, Observations: []json.RawMessage{}, Views: []json.RawMessage{}, CandidateIDs: [][]string{}}
	if len(state) > e.limits.MaxStateBytes {
		return Frame{}, ErrBudget
	}
	if err := ctx.Err(); err != nil {
		return Frame{}, err
	}
	if err := module.Validate(state); err != nil {
		return Frame{}, err
	}
	// Bound each produced component before assembling/serializing the frame.
	remaining := e.limits.MaxFrameBytes - len(state)
	if remaining < 0 {
		return Frame{}, ErrBudget
	}
	for _, seat := range seats {
		if err := ctx.Err(); err != nil {
			return Frame{}, err
		}
		o, err := module.Observe(state, seat)
		if err != nil {
			return Frame{}, err
		}
		if len(o) > remaining {
			return Frame{}, ErrBudget
		}
		remaining -= len(o)
		if err = ctx.Err(); err != nil {
			return Frame{}, err
		}
		v, err := module.SafeView(state, seat)
		if err != nil {
			return Frame{}, err
		}
		if len(v) > remaining {
			return Frame{}, ErrBudget
		}
		remaining -= len(v)
		if err = ctx.Err(); err != nil {
			return Frame{}, err
		}
		ids, err := module.CandidateIDs(state, seat)
		if err != nil {
			return Frame{}, err
		}
		if len(ids) > remaining/3 {
			return Frame{}, ErrBudget
		}
		for _, id := range ids {
			if remaining < 3 || len(id) > (remaining-3)/6 {
				return Frame{}, ErrBudget
			}
			remaining -= 3 + 6*len(id)
		}
		frame.Observations = append(frame.Observations, o)
		frame.Views = append(frame.Views, v)
		frame.CandidateIDs = append(frame.CandidateIDs, ids)
	}
	if err := ctx.Err(); err != nil {
		return Frame{}, err
	}
	encoded, err := json.Marshal(frame)
	if err != nil {
		return Frame{}, err
	}
	if len(encoded) > e.limits.MaxFrameBytes {
		return Frame{}, ErrBudget
	}
	return frame, nil
}
func (e *Executor) visit(ctx context.Context, frame Frame, visit func(Frame) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if visit != nil {
		if err := visit(frame); err != nil {
			return err
		}
	}
	return ctx.Err()
}
