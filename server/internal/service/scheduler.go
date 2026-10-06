// Package service composes authenticated local play with durable preparation.
// It contains no game rules or tactical predicates.
package service

import (
	"context"
	"errors"
	"sync"
	"time"
)

var ErrBusy = errors.New("local work capacity is full")

// scheduler reserves finite capacity before any new durable job is queued.
// Two workers serve live practice; review continuation is not admitted here.
// A reservation survives only until dispatch or release, never in an unbounded
// goroutine waiting for capacity. Durable rows are the restart recovery source.
type scheduler struct {
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	keys     map[string]bool
	queue    chan scheduled
	closed   bool
	wg       sync.WaitGroup
	deadline time.Duration
}
type scheduled struct {
	key string
	run func(context.Context)
}
type reservation struct {
	scheduler *scheduler
	key       string
	once      sync.Once
}

func newScheduler(workers, queued int, deadline time.Duration) *scheduler {
	ctx, cancel := context.WithCancel(context.Background())
	s := &scheduler{ctx: ctx, cancel: cancel, keys: map[string]bool{}, queue: make(chan scheduled, workers+queued), deadline: deadline}
	for i := 0; i < workers; i++ {
		s.wg.Add(1)
		go s.worker()
	}
	return s
}
func (s *scheduler) reserve(key string) (*reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, context.Canceled
	}
	if s.keys[key] {
		return nil, nil
	}
	if len(s.keys) >= cap(s.queue) {
		return nil, ErrBusy
	}
	s.keys[key] = true
	return &reservation{scheduler: s, key: key}, nil
}
func (r *reservation) release() {
	if r == nil {
		return
	}
	r.once.Do(func() { r.scheduler.remove(r.key) })
}
func (r *reservation) dispatch(run func(context.Context)) {
	if r == nil {
		return
	}
	r.once.Do(func() {
		s := r.scheduler
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.closed {
			delete(s.keys, r.key)
			return
		}
		// Every sender owns one of at most cap(queue) reservations.
		s.queue <- scheduled{r.key, run}
	})
}
func (s *scheduler) remove(key string) { s.mu.Lock(); delete(s.keys, key); s.mu.Unlock() }
func (s *scheduler) worker() {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case job := <-s.queue:
			ctx, cancel := context.WithTimeout(s.ctx, s.deadline)
			if ctx.Err() == nil {
				job.run(ctx)
			}
			cancel()
			s.remove(job.key)
		}
	}
}
func (s *scheduler) close() { s.mu.Lock(); s.closed = true; s.cancel(); s.mu.Unlock(); s.wg.Wait() }
