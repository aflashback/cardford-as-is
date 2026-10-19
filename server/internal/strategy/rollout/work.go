package rollout

import (
	"context"
	"errors"
	"fmt"
)

type stopError struct{ status, cap string }

func (e *stopError) Error() string { return e.status + ": " + e.cap }

// Work is run-owned. Nested callbacks charge before execution. Reservations
// bound deterministic workspace, not measured process RSS.
type Work struct {
	ctx    context.Context
	budget RunBudget
	result WorkResult
}

// NewWork gives offline adapters the same charged counters used by RunPaired.
// It does not create a deadline or make wall time part of a decision rule.
func NewWork(ctx context.Context, budget RunBudget) (*Work, error) {
	if ctx == nil {
		return nil, fmt.Errorf("execution context required")
	}
	if budget.MaxWorlds < 0 || budget.MaxSteps < 0 || budget.MaxCandidates < 0 || budget.MaxMemoryBytes < 0 || budget.MaxSamplerOperations < 0 || budget.MaxSetupOperations < 0 {
		return nil, fmt.Errorf("negative work cap")
	}
	return &Work{ctx: ctx, budget: budget}, nil
}

// Result is a detached counter snapshot; callers cannot change charged work.
func (w *Work) Result() WorkResult { return w.result }

func (w *Work) Check() error {
	if err := w.ctx.Err(); err != nil {
		status := "cancelled"
		if errors.Is(err, context.DeadlineExceeded) {
			status = "deadline"
		}
		return &stopError{status: status}
	}
	return nil
}
func (w *Work) charge(count *int, n, limit int, cap string) error {
	if err := w.Check(); err != nil {
		return err
	}
	if n < 0 {
		return fmt.Errorf("negative work charge")
	}
	if n > limit-*count {
		return &stopError{"budget-exhausted", cap}
	}
	*count += n
	return nil
}
func (w *Work) Setup(n int) error {
	return w.charge(&w.result.SetupOperations, n, w.budget.MaxSetupOperations, "maxSetupOperations")
}
func (w *Work) Sampler(n int) error {
	return w.charge(&w.result.SamplerOperations, n, w.budget.MaxSamplerOperations, "maxSamplerOperations")
}
func (w *Work) step() error  { return w.charge(&w.result.Steps, 1, w.budget.MaxSteps, "maxSteps") }
func (w *Work) world() error { return w.charge(&w.result.Worlds, 1, w.budget.MaxWorlds, "maxWorlds") }
