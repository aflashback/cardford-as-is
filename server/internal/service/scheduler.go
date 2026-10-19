package service

import (
	"context"
	"errors"
	"sync"
	"time"
)

var ErrBusy = errors.New("local work capacity is full")

// A finite queue permits eager removal of canceled work. No goroutine waits
// for admission; running callbacks retain capacity until cancellation drains.
type scheduler struct {
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	cond     *sync.Cond
	keys     map[string]bool
	groups   map[string]*reservation
	queue    []scheduled
	capacity int
	closed   bool
	wg       sync.WaitGroup
	deadline time.Duration
}
type scheduled struct {
	reservation *reservation
	run         func(context.Context)
	deadline    time.Duration
}
type reservation struct {
	scheduler   *scheduler
	key         string
	once        sync.Once
	ctx         context.Context
	cancel      context.CancelFunc
	owner, game string
	bot         bool
	generation  int64
	running     bool
	auth        context.Context
}

func newScheduler(workers, queued int, deadline time.Duration) *scheduler {
	ctx, cancel := context.WithCancel(context.Background())
	s := &scheduler{ctx: ctx, cancel: cancel, keys: map[string]bool{}, groups: map[string]*reservation{}, capacity: workers + queued, deadline: deadline}
	s.cond = sync.NewCond(&s.mu)
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
	if len(s.keys) >= s.capacity {
		return nil, ErrBusy
	}
	ctx, cancel := context.WithCancel(s.ctx)
	r := &reservation{scheduler: s, key: key, ctx: ctx, cancel: cancel}
	s.keys[key] = true
	s.groups[key] = r
	return r, nil
}
func (r *reservation) release() {
	if r != nil {
		r.once.Do(func() { r.scheduler.remove(r) })
	}
}
func (r *reservation) dispatch(run func(context.Context)) { r.dispatchWithDeadline(0, run) }
func (r *reservation) dispatchWithDeadline(deadline time.Duration, run func(context.Context)) {
	if r == nil {
		return
	}
	r.once.Do(func() {
		s := r.scheduler
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.closed || r.ctx.Err() != nil || s.groups[r.key] != r {
			s.removeLocked(r)
			return
		}
		if deadline <= 0 || deadline > 90*time.Second {
			deadline = s.deadline
		}
		s.queue = append(s.queue, scheduled{r, run, deadline})
		s.cond.Signal()
	})
}
func (s *scheduler) removeLocked(r *reservation) {
	r.cancel()
	if s.groups[r.key] == r {
		delete(s.keys, r.key)
		delete(s.groups, r.key)
	}
}
func (s *scheduler) remove(r *reservation) { s.mu.Lock(); s.removeLocked(r); s.mu.Unlock() }
func (r *reservation) group(owner, game string, bot bool, generation int64, auth context.Context) {
	if r == nil {
		return
	}
	s := r.scheduler
	s.mu.Lock()
	r.owner = owner
	r.game = game
	r.bot = bot
	r.generation = generation
	r.auth = context.WithoutCancel(auth)
	s.mu.Unlock()
}
func (s *scheduler) cancelGame(owner, game string, all bool) {
	s.cancelGameThrough(owner, game, all, 9007199254740991)
}
func (s *scheduler) cancelGameThrough(owner, game string, all bool, generation int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.groups {
		if r.owner == owner && r.game == game && (all || r.bot) && r.generation <= generation {
			r.cancel()
			if !r.running {
				s.removeLocked(r)
			}
		}
	}
	kept := s.queue[:0]
	for _, j := range s.queue {
		if j.reservation.ctx.Err() == nil {
			kept = append(kept, j)
		}
	}
	clear(s.queue[len(kept):])
	s.queue = kept
}
func (s *scheduler) worker() {
	defer s.wg.Done()
	for {
		s.mu.Lock()
		for len(s.queue) == 0 && !s.closed {
			s.cond.Wait()
		}
		if s.closed {
			s.mu.Unlock()
			return
		}
		j := s.queue[0]
		s.queue[0] = scheduled{}
		s.queue = s.queue[1:]
		r := j.reservation
		r.running = true
		s.mu.Unlock()
		ctx, cancel := context.WithTimeout(r.ctx, j.deadline)
		if ctx.Err() == nil {
			j.run(ctx)
		}
		cancel()
		s.remove(r)
	}
}
func (s *scheduler) close() {
	s.mu.Lock()
	s.closed = true
	s.cancel()
	for _, r := range s.groups {
		r.cancel()
	}
	s.cond.Broadcast()
	s.mu.Unlock()
	s.wg.Wait()
}
