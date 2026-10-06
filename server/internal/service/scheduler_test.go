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
