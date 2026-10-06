package legacydecision

import (
	"context"
	"testing"
)

// A deterministic context exposes a cancellation at a later archive checkpoint,
// without timing-dependent sleeps or changing any policy strategy arithmetic.
type archiveCancellation struct {
	context.Context
	checks int
}

func (c *archiveCancellation) Err() error {
	c.checks++
	if c.checks >= 4 {
		return context.Canceled
	}
	return nil
}
func TestM04COriginalArchiveValidationCancellation(t *testing.T) {
	o := bidObservation()
	for i := 0; i < 1000; i++ {
		o.Events = append(o.Events, Event{ID: i + 1, Type: "hand-started", Message: "Original archive event."})
	}
	if err := ValidateObservation(o); err != nil {
		t.Fatal(err)
	}
	ctx := &archiveCancellation{Context: context.Background()}
	if err := ValidateObservationContext(ctx, o); err != context.Canceled || ctx.checks != 4 {
		t.Fatalf("archive cancellation: %v, checks=%d", err, ctx.checks)
	}
	if len(o.Events) != 1000 {
		t.Fatal("cancellation truncated original knowledge")
	}
}
