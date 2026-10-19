package service

import (
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"sync"
	"time"
)

func holdCancelsPreparation(purpose string) bool {
	return purpose != "coach-advice" && purpose != "review-alternative"
}

func (s *Service) renewForeground(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	unlock := s.playback.lockOwner(owner)
	defer unlock()
	var q struct {
		GameID                     string `json:"gameId"`
		ControlLeaseToken          string `json:"controlLeaseToken"`
		ExpectedControlGeneration  int64  `json:"expectedControlGeneration"`
		ExpectedPlaybackGeneration int64  `json:"expectedPlaybackGeneration"`
		Sequence                   int64  `json:"sequence"`
	}
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
	state, err := s.store.RenewForeground(ctx, q.GameID, q.ExpectedControlGeneration, q.ExpectedPlaybackGeneration, q.Sequence, s.playback.instanceID)
	if err != nil {
		return transport.Response{}, err
	}
	if state.Phase == "paused" || state.Phase == "expired" {
		s.playback.stopThrough(owner, q.GameID, state.Generation)
		s.jobs.cancelGameThrough(owner, q.GameID, true, state.Generation)
	}
	return result("RealtimePlaybackView", state)
}

func (s *Service) startLifecycleSweeper() {
	ctx, cancel := context.WithCancel(context.Background())
	s.lifecycleCancel = cancel
	s.lifecycleDone = make(chan struct{})
	var workers sync.WaitGroup
	workers.Add(2)
	go func() {
		defer workers.Done()
		tick := time.NewTicker(time.Second)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				sweep, done := context.WithTimeout(ctx, 4*time.Second)
				changed, _ := s.store.SweepSessionLifecycle(sweep, 128)
				done()
				for _, c := range changed {
					s.playback.stopThrough(c.OwnerID, c.GameID, c.Generation)
					s.jobs.cancelGameThrough(c.OwnerID, c.GameID, true, c.Generation)
				}
			}
		}
	}()
	// Local CPU cancellation is independent of database sweep progress. One
	// shared deadline bounds the entire pass; timeout fails closed and drains
	// remaining contexts without starting more database calls.
	go func() {
		defer workers.Done()
		tick := time.NewTicker(500 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				check, done := context.WithTimeout(ctx, time.Second)
				s.playback.reap(check)
				s.reapLifecycleWork(check)
				done()
			}
		}
	}()
	go func() { workers.Wait(); close(s.lifecycleDone) }()
}
func (s *Service) stopLifecycleSweeper() {
	if s.lifecycleCancel != nil {
		s.lifecycleCancel()
		<-s.lifecycleDone
	}
}

func (s *Service) reapLifecycleWork(ctx context.Context) {
	s.jobs.mu.Lock()
	active := []*reservation{}
	for _, r := range s.jobs.groups {
		if r.auth != nil && r.ctx.Err() == nil {
			active = append(active, r)
		}
	}
	s.jobs.mu.Unlock()
	for _, r := range active {
		if ctx.Err() != nil {
			s.jobs.cancelGameThrough(r.owner, r.game, true, r.generation)
			continue
		}
		check, done := context.WithTimeout(r.auth, 250*time.Millisecond)
		stop := context.AfterFunc(ctx, done)
		state, err := s.store.ReadPlayback(check, r.owner, r.game, s.playback.instanceID)
		if err == nil {
			err = s.store.CheckControl(check, r.owner)
		}
		stop()
		done()
		if err != nil || state.Phase == "expired" || r.bot && (state.Phase != "running" || state.Generation != r.generation) || state.Phase == "paused" && state.Generation > r.generation {
			s.jobs.cancelGameThrough(r.owner, r.game, true, r.generation)
		}
	}
}
