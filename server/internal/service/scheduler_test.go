package service

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestSchedulerBoundsDedupAndCancellation(t *testing.T) {
	s := newScheduler(1, 1, time.Second)
	started := make(chan struct{})
	release := make(chan struct{})
	r, err := s.reserve("running")
	if err != nil {
		t.Fatal(err)
	}
	r.dispatch(func(ctx context.Context) {
		close(started)
		select {
		case <-ctx.Done():
		case <-release:
		}
	})
	<-started
	duplicate, err := s.reserve("running")
	if err != nil || duplicate != nil {
		t.Fatal("duplicate gained execution")
	}
	queued, err := s.reserve("queued")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.reserve("overflow"); !errors.Is(err, ErrBusy) {
		t.Fatal("unbounded admission", err)
	}
	queued.release()
	next, err := s.reserve("replacement")
	if err != nil {
		t.Fatal(err)
	}
	next.release()
	done := make(chan struct{})
	go func() { s.close(); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("shutdown did not cancel execution")
	}
	if _, err = s.reserve("closed"); !errors.Is(err, context.Canceled) {
		t.Fatal("closed scheduler admitted work")
	}
}

func TestSchedulerRegisteredDeadlineRemainsBoundedAndCancelable(t *testing.T) {
	s := newScheduler(1, 1, 20*time.Millisecond)
	seen := make(chan time.Duration, 1)
	r, err := s.reserve("explicit-budget")
	if err != nil {
		t.Fatal(err)
	}
	r.dispatchWithDeadline(time.Second, func(ctx context.Context) {
		deadline, ok := ctx.Deadline()
		if !ok {
			seen <- 0
			return
		}
		seen <- time.Until(deadline)
		<-ctx.Done()
	})
	if got := <-seen; got <= 20*time.Millisecond || got > time.Second {
		t.Fatal("registered deadline lost", got)
	}
	stopped := make(chan struct{})
	go func() { s.close(); close(stopped) }()
	select {
	case <-stopped:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("explicit-budget work escaped shutdown")
	}
}
