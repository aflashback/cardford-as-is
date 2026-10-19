package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"cardford/server/internal/contracts"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

const maxRealtimeConnections = 256
const maxRealtimeOwnerConnections = 4
const maxRealtimeMessageBytes = 2 << 20
const maxRealtimeQueuedBytes = 4 << 20

type realtimeRate struct {
	start time.Time
	count int
}
type realtimeHub struct {
	service  *Service
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	bindings map[string]*realtimeBinding
	rates    map[string]realtimeRate
	wg       sync.WaitGroup
	disabled bool
}
type realtimeBinding struct {
	hub            *realtimeHub
	id, owner, tab string
	game           string
	principal      records.Principal
	tokenHash      [32]byte
	ctx            context.Context
	cancel         context.CancelFunc
	created        time.Time
	connected      bool
	queue          chan json.RawMessage
	mu             sync.Mutex
	queuedBytes    int
	accessDeadline time.Time
	accessWake     chan struct{}
	accessMu       sync.Mutex
	once           sync.Once
}

// NotifySessionChanged is called only after authentication commits. It fences
// each binding against its stable family so delayed cleanup cannot close a
// newer valid login. Login notifications may carry the newly installed family.
func (s *Service) NotifySessionChanged(p records.Principal) {
	h := s.realtime
	h.mu.Lock()
	var targets []*realtimeBinding
	for _, b := range h.bindings {
		if b.owner == p.OwnerID {
			targets = append(targets, b)
		}
	}
	h.mu.Unlock()
	for _, b := range targets {
		if err := b.refreshAccessDeadline(); err != nil {
			b.Close()
		}
	}
	s.playback.wake(p.OwnerID, "")
}

func (b *realtimeBinding) Done() <-chan struct{} { return b.ctx.Done() }

func (b *realtimeBinding) refreshAccessDeadline() error {
	b.accessMu.Lock()
	defer b.accessMu.Unlock()
	ctx, cancel := context.WithTimeout(b.ctx, time.Second)
	defer cancel()
	deadline, err := b.hub.service.store.SessionAccessDeadline(ctx, b.principal)
	if err != nil {
		return err
	}
	b.mu.Lock()
	b.accessDeadline = deadline
	b.mu.Unlock()
	select {
	case b.accessWake <- struct{}{}:
	default:
	}
	return nil
}

// Only admitted game bindings own timers. At the old access deadline, re-read
// PostgreSQL: successful renewal must survive a lost process notification.
func (b *realtimeBinding) watchAccess() {
	defer b.hub.wg.Done()
	for {
		b.mu.Lock()
		deadline := b.accessDeadline
		b.mu.Unlock()
		b.hub.mu.Lock()
		connected := b.connected
		b.hub.mu.Unlock()
		admissionDeadline := b.created.Add(30 * time.Second)
		if !connected && admissionDeadline.Before(deadline) {
			deadline = admissionDeadline
		}
		timer := time.NewTimer(time.Until(deadline))
		select {
		case <-b.ctx.Done():
			timer.Stop()
			return
		case <-b.accessWake:
			timer.Stop()
			continue
		case <-timer.C:
		}
		b.hub.mu.Lock()
		connected = b.connected
		b.hub.mu.Unlock()
		if !connected && !time.Now().Before(admissionDeadline) {
			b.Close()
			return
		}
		if err := b.refreshAccessDeadline(); err != nil {
			b.Close()
			return
		}
	}
}

func (s *Service) activeRealtimeGame(ctx context.Context, owner, tab string) (string, error) {
	a, err := s.store.ReadAccess(ctx, owner)
	if err != nil {
		return "", err
	}
	if !a.CanRead || !a.CanPlay || a.ActiveGameID == "" {
		return "", records.ErrReadDenied
	}
	owned, _, err := s.store.ControlStatus(ctx, tab)
	if err != nil {
		return "", err
	}
	if !owned {
		return "", records.ErrReadDenied
	}
	state, err := s.store.ReadPlayback(ctx, owner, a.ActiveGameID, s.playback.instanceID)
	if err != nil {
		return "", err
	}
	if !state.Running || state.Phase != "running" {
		return "", records.ErrReadDenied
	}
	return a.ActiveGameID, nil
}

func newRealtimeHub(s *Service) *realtimeHub {
	ctx, cancel := context.WithCancel(context.Background())
	h := &realtimeHub{service: s, ctx: ctx, cancel: cancel, bindings: map[string]*realtimeBinding{}, rates: map[string]realtimeRate{}, disabled: os.Getenv("CARDFORD_REALTIME") == "off"}
	h.wg.Add(1)
	go h.run()
	return h
}
func (h *realtimeHub) close() {
	if h == nil {
		return
	}
	h.cancel()
	h.mu.Lock()
	all := make([]*realtimeBinding, 0, len(h.bindings))
	for _, b := range h.bindings {
		all = append(all, b)
	}
	h.mu.Unlock()
	for _, b := range all {
		b.Close()
	}
	h.wg.Wait()
}
func (b *realtimeBinding) Close() {
	b.once.Do(func() {
		b.cancel()
		b.hub.mu.Lock()
		delete(b.hub.bindings, b.id)
		b.hub.mu.Unlock()
		b.mu.Lock()
		for {
			select {
			case <-b.queue:
			default:
				b.queuedBytes = 0
				b.mu.Unlock()
				return
			}
		}
	})
}
func (b *realtimeBinding) Authorize(ctx context.Context) error {
	if b.ctx.Err() != nil {
		return records.ErrUnauthenticated
	}
	// Preserve only server-authenticated principal values, but respect caller's
	// deadline and cancellation for the current dispatch.
	check, cancel := context.WithCancel(b.ctx)
	stop := context.AfterFunc(ctx, cancel)
	defer cancel()
	defer stop()
	game, err := b.hub.service.activeRealtimeGame(check, b.owner, b.tab)
	if err != nil {
		return err
	}
	if game != b.game {
		return records.ErrReadDenied
	}
	return nil
}
func (b *realtimeBinding) Next(ctx context.Context) (json.RawMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-b.ctx.Done():
		return nil, b.ctx.Err()
	case raw := <-b.queue:
		b.mu.Lock()
		b.queuedBytes -= len(raw)
		b.mu.Unlock()
		if err := b.Authorize(ctx); err != nil {
			b.Close()
			return nil, err
		}
		return raw, nil
	}
}
func (b *realtimeBinding) enqueue(raw json.RawMessage) {
	if b.ctx.Err() != nil {
		return
	}
	b.mu.Lock()
	if len(raw) > maxRealtimeMessageBytes || b.queuedBytes+len(raw) > maxRealtimeQueuedBytes {
		b.mu.Unlock()
		b.Close()
		return
	}
	select {
	case b.queue <- raw:
		b.queuedBytes += len(raw)
		b.mu.Unlock()
	default:
		b.mu.Unlock()
		b.Close()
	}
}

func (s *Service) negotiateRealtime(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	h := s.realtime
	if h.disabled {
		return result("RealtimeNegotiateView", map[string]any{"enabled": false, "mode": "http", "streamId": nil, "url": nil})
	}
	game, err := s.activeRealtimeGame(ctx, owner, r.Tab)
	if err != nil {
		return transport.Response{}, err
	}
	if _, err := s.store.RealtimeCursor(ctx, owner); err != nil {
		return transport.Response{}, err
	}
	p, err := s.store.Authenticate(ctx, r.Token)
	if err != nil {
		return transport.Response{}, err
	}
	deadline, err := s.store.SessionAccessDeadline(ctx, p)
	if err != nil {
		return transport.Response{}, err
	}
	id, err := randomID()
	if err != nil {
		return transport.Response{}, err
	}
	now := time.Now()
	h.mu.Lock()
	if h.ctx.Err() != nil {
		h.mu.Unlock()
		return transport.Response{}, ErrBusy
	}
	for key, b := range h.bindings {
		if !b.connected && now.Sub(b.created) > 30*time.Second {
			b.cancel()
			delete(h.bindings, key)
		}
	}
	for key, rate := range h.rates {
		if now.Sub(rate.start) >= time.Minute {
			delete(h.rates, key)
		}
	}
	rate := h.rates[owner]
	if rate.start.IsZero() {
		rate.start = now
	}
	count := 0
	for _, b := range h.bindings {
		if b.owner == owner {
			count++
		}
	}
	if count >= maxRealtimeOwnerConnections || len(h.bindings) >= maxRealtimeConnections || rate.count >= 12 || len(h.rates) >= maxRealtimeConnections && rate.count == 0 {
		h.mu.Unlock()
		return transport.Response{}, ErrBusy
	}
	rate.count++
	h.rates[owner] = rate
	bound, cancel := context.WithCancel(context.WithoutCancel(ctx))
	b := &realtimeBinding{hub: h, id: id, owner: owner, tab: r.Tab, game: game, principal: p, tokenHash: sha256.Sum256([]byte(r.Token)), ctx: bound, cancel: cancel, created: now, queue: make(chan json.RawMessage, 64), accessDeadline: deadline, accessWake: make(chan struct{}, 1)}
	h.bindings[id] = b
	h.wg.Add(1)
	h.mu.Unlock()
	go b.watchAccess()
	// Register before the final durable check: a pause/revocation committing
	// after this check now has a binding to invalidate, including negotiations
	// that were in flight when the lifecycle command began.
	if err := b.Authorize(ctx); err != nil {
		b.Close()
		return transport.Response{}, err
	}
	return result("RealtimeNegotiateView", map[string]any{"enabled": true, "mode": "local", "streamId": id, "url": "/api/realtime/connect?streamId=" + id})
}

func (s *Service) OpenRealtime(ctx context.Context, token, streamID string) (transport.RealtimeSubscription, error) {
	p, err := s.store.Authenticate(ctx, token)
	if err != nil {
		return nil, fail(401, "invalid-session")
	}
	if err = s.identityMode(ctx, p); err != nil {
		return nil, fail(403, "access-denied")
	}
	h := s.realtime
	h.mu.Lock()
	b := h.bindings[streamID]
	if h.disabled || b == nil || b.connected || b.owner != p.OwnerID || b.tokenHash != sha256.Sum256([]byte(token)) || time.Since(b.created) > 30*time.Second {
		h.mu.Unlock()
		return nil, fail(403, "invalid-realtime-binding")
	}
	b.connected = true
	h.mu.Unlock()
	select {
	case b.accessWake <- struct{}{}:
	default:
	}
	if err = b.Authorize(ctx); err != nil {
		b.Close()
		return nil, fail(401, "invalid-session")
	}
	return b, nil
}

func (s *Service) realtimeSnapshot(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q struct {
		StreamID *string  `json:"streamId"`
		WorkIDs  []string `json:"workIds"`
	}
	if json.Unmarshal(r.Body, &q) != nil {
		return transport.Response{}, fail(400, "invalid-snapshot")
	}
	if q.StreamID != nil {
		s.realtime.mu.Lock()
		b := s.realtime.bindings[*q.StreamID]
		valid := b != nil && b.owner == owner && b.tab == r.Tab && b.tokenHash == sha256.Sum256([]byte(r.Token)) && b.ctx.Err() == nil
		s.realtime.mu.Unlock()
		if !valid {
			return transport.Response{}, fail(403, "invalid-realtime-binding")
		}
	}
	// The cursor brackets every mutable read. A successful bracket is one
	// committed point; a writer racing any component forces a bounded retry.
	for attempt := 0; attempt < 4; attempt++ {
		before, err := s.store.RealtimeCursor(ctx, owner)
		if err != nil {
			return transport.Response{}, err
		}
		view, err := s.platformSession(ctx, owner, r.Tab)
		if err != nil {
			return transport.Response{}, err
		}
		works := make([]json.RawMessage, 0, len(q.WorkIDs))
		for _, id := range q.WorkIDs {
			w, e := s.work(ctx, owner, transport.Request{Operation: "work", CommandID: id})
			if e != nil {
				return transport.Response{}, e
			}
			works = append(works, w.Body)
		}
		playback, err := s.playbackForView(ctx, owner, view.Body)
		if err != nil {
			return transport.Response{}, err
		}
		after, err := s.store.RealtimeCursor(ctx, owner)
		if err != nil {
			return transport.Response{}, err
		}
		if before != after {
			continue
		}
		return result("RealtimeSnapshot", map[string]any{"schemaVersion": "1.0.0", "streamId": q.StreamID, "sequence": after, "view": view.Body, "works": works, "playback": playback})
	}
	return transport.Response{}, ErrBusy
}
func (s *Service) playbackForView(ctx context.Context, owner string, raw json.RawMessage) (records.PlaybackState, error) {
	var v struct {
		Session *struct {
			GameID string `json:"gameId"`
		} `json:"session"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return records.PlaybackState{}, err
	}
	if v.Session == nil {
		return s.store.LatestExpiredPlayback(ctx, owner, s.playback.instanceID)
	}
	return s.playback.effectiveState(ctx, owner, v.Session.GameID)
}

func (h *realtimeHub) run() {
	defer h.wg.Done()
	// This is a missed-wakeup/restart safety net, never the normal publication
	// path. Successful commits wake the loop directly.
	recovery := time.NewTicker(time.Second)
	defer recovery.Stop()
	purge := time.NewTicker(time.Minute)
	defer purge.Stop()
	var sessionSequence int64
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-h.service.store.RealtimeWake():
		case <-recovery.C:
		case <-purge.C:
			_, _ = h.service.store.PurgeRealtimeEvents(h.ctx, 10*time.Minute, 256)
		}
		// One shared bounded durable recovery pass serves active bindings. Idle
		// accounts have neither sockets nor recurring per-session auth checks.
		h.mu.Lock()
		active := len(h.bindings) != 0
		h.mu.Unlock()
		if active {
			changes, err := h.service.store.SessionChanges(h.ctx, sessionSequence)
			if err == nil {
				for _, change := range changes {
					h.service.NotifySessionChanged(change.Principal)
					sessionSequence = change.Sequence
				}
			}
		}
		for batch := 0; batch < 256 && h.ctx.Err() == nil; batch++ {
			events, err := h.service.store.ClaimRealtimeEvents(h.ctx, 32, 30*time.Second)
			if err != nil || len(events) == 0 {
				break
			}
			for _, d := range events {
				if err = h.publish(d.RealtimeEvent); err != nil {
					if d.Attempt >= 5 {
						h.closeOwner(d.OwnerID)
						_ = h.service.store.AckRealtimeEvent(h.ctx, d)
					} else {
						_ = h.service.store.RetryRealtimeEvent(h.ctx, d, time.Second)
					}
				} else {
					_ = h.service.store.AckRealtimeEvent(h.ctx, d)
				}
			}
		}
	}
}
func (h *realtimeHub) closeOwner(owner string) {
	h.closeGame(owner, "")
}

func (h *realtimeHub) closeGame(owner, game string) {
	h.mu.Lock()
	var all []*realtimeBinding
	for _, b := range h.bindings {
		if b.owner == owner && (game == "" || b.game == game) {
			all = append(all, b)
		}
	}
	h.mu.Unlock()
	for _, b := range all {
		b.Close()
	}
}

// Destructive identity changes cannot leave an event containing the erased
// owner behind. Close and discard its queued private views before HTTP success.
func (h *realtimeHub) invalidate(token string, wholeOwner bool) {
	hash := sha256.Sum256([]byte(token))
	h.mu.Lock()
	owners := map[string]bool{}
	for _, b := range h.bindings {
		if b.tokenHash == hash {
			owners[b.owner] = true
		}
	}
	var all []*realtimeBinding
	for _, b := range h.bindings {
		if b.tokenHash == hash || wholeOwner && owners[b.owner] {
			all = append(all, b)
		}
	}
	h.mu.Unlock()
	for _, b := range all {
		b.Close()
	}
}
func (h *realtimeHub) publish(e records.RealtimeEvent) error {
	// Access/control/session invalidations also retire dormant runners that
	// stopped at a human boundary and therefore have no work callback pending.
	h.service.playback.wake(e.OwnerID, "")
	h.mu.Lock()
	var targets []*realtimeBinding
	for _, b := range h.bindings {
		if b.connected && b.owner == e.OwnerID {
			targets = append(targets, b)
		}
	}
	h.mu.Unlock()
	for _, b := range targets {
		if err := b.Authorize(h.ctx); err != nil {
			b.Close()
			continue
		}
		kind := map[string]string{"session": "session.view", "playback": "session.view", "work": "work.updated", "review": "work.updated", "control": "control.changed", "access": "access.changed"}[e.Kind]
		msg := map[string]any{"schemaVersion": "1.0.0", "messageId": fmt.Sprintf("%s:%d", b.id, e.Sequence), "streamId": b.id, "sequence": e.Sequence, "type": kind}
		ctx, cancel := context.WithTimeout(b.ctx, 5*time.Second)
		err := h.compose(ctx, b, e, msg)
		cancel()
		if err != nil {
			if errors.Is(err, records.ErrUnauthenticated) || errors.Is(err, records.ErrReadDenied) || errors.Is(err, records.ErrConflict) {
				b.Close()
				continue
			}
			return err
		}
		raw, err := json.Marshal(msg)
		if err != nil {
			return err
		}
		if err = contracts.Validate("RealtimeMessage", raw); err != nil {
			return err
		}
		b.enqueue(raw)
	}
	return nil
}
func (h *realtimeHub) compose(ctx context.Context, b *realtimeBinding, e records.RealtimeEvent, msg map[string]any) error {
	s := h.service
	switch e.Kind {
	case "session", "playback":
		var p *records.RealtimeProjection
		if len(e.Projection) > 0 {
			p = &records.RealtimeProjection{}
			if err := json.Unmarshal(e.Projection, p); err != nil {
				return err
			}
		}
		view, err := s.platformSessionProjection(ctx, b.owner, "", p)
		if err != nil {
			return err
		}
		playback, err := s.playbackForView(ctx, b.owner, view.Body)
		if err != nil {
			return err
		}
		msg["view"], msg["playback"] = view.Body, playback
	case "work":
		w, err := s.work(ctx, b.owner, transport.Request{Operation: "work", CommandID: e.WorkID})
		if err != nil {
			return err
		}
		msg["work"] = w.Body
	case "review":
		w, err := s.platformTrialStatus(ctx, b.owner, e.WorkID)
		if err != nil {
			return err
		}
		msg["review"] = w.Body
	case "control":
		msg["controlGeneration"] = e.ControlGeneration
	case "access":
		msg["accessGeneration"] = e.AccessGeneration
	default:
		return fmt.Errorf("unknown realtime event")
	}
	return nil
}
