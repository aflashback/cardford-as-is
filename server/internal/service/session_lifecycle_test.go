package service

import (
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestSessionResourcesHoldCancelsGamePreparationOnly(t *testing.T) {
	for purpose, want := range map[string]bool{"bot-action": true, "human-analysis": true, "coach-advice": false, "review-alternative": false} {
		if got := holdCancelsPreparation(purpose); got != want {
			t.Fatalf("%s hold cancellation=%v", purpose, got)
		}
	}
}

func TestSessionResourcesPauseReleasesQueuedAdmission(t *testing.T) {
	s := newScheduler(1, 2, time.Second)
	defer s.close()
	blocking, _ := s.reserve("unrelated")
	started := make(chan struct{})
	release := make(chan struct{})
	defer close(release)
	blocking.dispatch(func(context.Context) { close(started); <-release })
	<-started
	for _, key := range []string{"a-one", "a-two"} {
		r, e := s.reserve(key)
		if e != nil {
			t.Fatal(e)
		}
		r.group("owner-a", "game-a", true, 1, context.Background())
		r.dispatch(func(context.Context) { t.Error("canceled queued job ran") })
	}
	if _, e := s.reserve("full"); e != ErrBusy {
		t.Fatal("fixture queue not full", e)
	}
	s.cancelGameThrough("owner-a", "game-a", true, 2)
	replacement, e := s.reserve("a-one")
	if e != nil || replacement == nil {
		t.Fatal("pause retained queued capacity", e)
	}
	replacement.group("owner-a", "game-a", true, 3, context.Background())
	s.cancelGameThrough("owner-a", "game-a", true, 2)
	if replacement.ctx.Err() != nil {
		t.Fatal("old pause canceled newer generation")
	}
	dispatched := make(chan struct{})
	go func() { replacement.dispatch(func(context.Context) {}); close(dispatched) }()
	select {
	case <-dispatched:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("replacement dispatch blocked behind canceled physical queue entries")
	}
}

func TestSessionResourcesHoldPreservesRequestedCoach(t *testing.T) {
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	created, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
	control := int64(created["controlGeneration"].(float64))
	state := playbackCommand(t, h, p, game, token, control, 0, true)
	principal, err := store.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithControl(records.WithPrincipal(context.Background(), principal), p.tab, token)
	reservation, err := h.app.jobs.reserve("explicit-coach")
	if err != nil {
		t.Fatal(err)
	}
	reservation.group(p.owner, game, false, state.Generation, ctx)
	started, drained := make(chan struct{}), make(chan struct{})
	reservation.dispatch(func(ctx context.Context) { close(started); <-ctx.Done(); close(drained) })
	<-started
	raw, _ := json.Marshal(map[string]any{"commandId": p.id(), "gameId": game, "controlLeaseToken": token, "expectedControlGeneration": control, "expectedPlaybackGeneration": state.Generation, "running": false, "intent": "hold"})
	response, err := h.app.setPlayback(ctx, p.owner, transport.Request{Operation: "playback", Tab: p.tab, Body: raw})
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(response.Body, &state); err != nil {
		t.Fatal(err)
	}
	h.app.playback.reap(context.Background())
	h.app.reapLifecycleWork(context.Background())
	select {
	case <-drained:
		t.Fatal("hold canceled requested coach")
	case <-time.After(25 * time.Millisecond):
	}
	playbackCommand(t, h, p, game, token, control, state.Generation, false)
	select {
	case <-drained:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("persistent pause did not cancel coach")
	}
}

func TestSessionResourcesConcurrentAdmissionRemainsBounded(t *testing.T) {
	m := &botPlaybackManager{runners: map[string]*botPlaybackRunner{}, reserved: map[string]bool{}}
	var wg sync.WaitGroup
	admitted := make(chan func(), 64)
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			release, err := m.reserveStart(fmt.Sprint(i))
			if err == nil {
				admitted <- release
			} else if err != ErrBusy {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	close(admitted)
	if len(admitted) != maxPlaybackRunners {
		t.Fatalf("concurrent admission count %d", len(admitted))
	}
	for release := range admitted {
		release()
	}
}

func TestSessionResourcesExpiredCleanupBudgetCancelsWithoutQueries(t *testing.T) {
	jobs := newScheduler(1, 1, time.Second)
	defer jobs.close()
	r, _ := jobs.reserve("work")
	r.group("owner", "game", true, 1, context.Background())
	started, drained := make(chan struct{}), make(chan struct{})
	r.dispatch(func(ctx context.Context) { close(started); <-ctx.Done(); close(drained) })
	<-started
	s := &Service{jobs: jobs}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s.reapLifecycleWork(ctx) // No Store: expired pass must not start another query.
	select {
	case <-drained:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expired cleanup budget retained work")
	}
}

func TestSessionResourcesRetiredRunnerDoesNotCancelCoach(t *testing.T) {
	jobs := newScheduler(1, 1, time.Second)
	defer jobs.close()
	coach, _ := jobs.reserve("coach-after-hold")
	coach.group("owner", "game", false, 1, context.Background())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := &botPlaybackRunner{ctx: ctx, cancel: cancel, owner: "owner", game: "game", generation: 1}
	s := &Service{jobs: jobs} // No Store: retired snapshots must not query with dead context.
	m := &botPlaybackManager{service: s, runners: map[string]*botPlaybackRunner{"owner": r}}
	m.reap(context.Background())
	if coach.ctx.Err() != nil {
		t.Fatal("retired runner canceled independent Coach")
	}
	coach.release()
}

func TestSessionResourcesControlTakeoverCancelsPriorCoach(t *testing.T) {
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	h.app.stopLifecycleSweeper()
	p := h.player(t)
	created, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
	control := int64(created["controlGeneration"].(float64))
	state := playbackCommand(t, h, p, game, token, control, 0, true)
	principal, err := store.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithControl(records.WithPrincipal(context.Background(), principal), p.tab, token)
	r, err := h.app.jobs.reserve("old-control-coach")
	if err != nil {
		t.Fatal(err)
	}
	r.group(p.owner, game, false, state.Generation, ctx)
	started, drained := make(chan struct{}), make(chan struct{})
	r.dispatch(func(ctx context.Context) { close(started); <-ctx.Done(); close(drained) })
	<-started
	digest, _ := records.JSONDigest([]byte(`{"test":"control-takeover"}`))
	controlCtx := records.WithServiceCommand(records.WithPrincipal(context.Background(), principal), records.ServiceCommand{ID: "test-takeover", Digest: digest, Kind: "control"})
	lease, err := store.AcquireControl(controlCtx, records.ControlRequest{ExpectedGameID: game, ExpectedRevision: 0, ExpectedControlGeneration: control, TabID: "replacement-tab"})
	if err != nil {
		t.Fatal(err)
	}
	// Do not depend on seeing an intermediate paused phase: current control
	// already changed even if a new tab immediately takes over active play.
	newCtx := records.WithControl(records.WithPrincipal(context.Background(), principal), "replacement-tab", lease.Token)
	current, err := store.ReadPlayback(newCtx, p.owner, game, h.app.playback.instanceID)
	if err != nil {
		t.Fatal(err)
	}
	newCtx = records.WithServiceCommand(newCtx, records.ServiceCommand{ID: "test-new-resume", Digest: digest, Kind: "playback"})
	current, err = store.SetPlaybackIntent(newCtx, game, lease.ControlGeneration, current.Generation, "resume", "", h.app.playback.instanceID)
	if err != nil || !current.Running {
		t.Fatal(current, err)
	}
	if r.ctx.Err() != nil {
		t.Fatal("fixture coach canceled before manual reaper check")
	}
	h.app.reapLifecycleWork(context.Background())
	select {
	case <-drained:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("old control retained Coach CPU")
	}
}

func TestSessionResourcesPauseCancelsActualRunningWork(t *testing.T) {
	s := newScheduler(1, 1, time.Second)
	defer s.close()
	r, _ := s.reserve("active")
	r.group("owner", "game", true, 1, context.Background())
	started, drained := make(chan struct{}), make(chan struct{})
	r.dispatch(func(ctx context.Context) { close(started); <-ctx.Done(); close(drained) })
	<-started
	s.cancelGameThrough("owner", "game", true, 2)
	select {
	case <-drained:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("CPU job did not receive cancellation")
	}
}
