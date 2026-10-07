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
