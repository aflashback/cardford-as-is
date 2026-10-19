package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"log"
	"sync"
	"time"

	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"github.com/jackc/pgx/v5/pgconn"
)

// Playback admits server work using the real controlling session. It never
// manufactures a Principal from an owner ID. Credentials survive only in this
// process; the durable instance fence makes an API restart effectively paused.
type botPlaybackRunner struct {
	ctx                     context.Context
	cancel                  context.CancelFunc
	owner, game, tab, token string
	generation              int64
	wake                    chan struct{}
	workID                  string
	workRevision            int64
	retryAt                 time.Time
	stage                   string // Runner-local diagnostics; never public game data.
}

type botPlaybackManager struct {
	service    *Service
	instanceID string
	commands   [64]sync.Mutex
	mu         sync.Mutex
	runners    map[string]*botPlaybackRunner
	reserved   map[string]bool
	closed     bool
	wg         sync.WaitGroup
}

const maxPlaybackRunners = 18

// Fixed stripes bound lock memory and avoid one slow owner blocking all users.
func (m *botPlaybackManager) lockOwner(owner string) func() {
	h := fnv.New32a()
	_, _ = h.Write([]byte(owner))
	lock := &m.commands[h.Sum32()%uint32(len(m.commands))]
	lock.Lock()
	return lock.Unlock
}

func (m *botPlaybackManager) stopThrough(owner, game string, generation int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r := m.runners[owner]; r != nil && r.game == game && r.generation <= generation {
		r.cancel()
		delete(m.runners, owner)
	}
}

func (m *botPlaybackManager) cancelWithRunner(owner, game string, cancel context.CancelFunc) func() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r := m.runners[owner]; r != nil && r.game == game {
		return context.AfterFunc(r.ctx, cancel)
	}
	return nil
}

// Human/round commands carry authenticated credentials, so an on-demand runner
// can be recreated after an idle human node without retaining a goroutine.
func (m *botPlaybackManager) wakeOrStart(ctx context.Context, owner, game, tab, token string) {
	unlock := m.lockOwner(owner)
	defer unlock()
	m.mu.Lock()
	r := m.runners[owner]
	if r != nil && r.game == game && r.ctx.Err() == nil {
		select {
		case r.wake <- struct{}{}:
		default:
		}
		m.mu.Unlock()
		return
	}
	m.mu.Unlock()
	state, err := m.service.store.ReadPlayback(ctx, owner, game, m.instanceID)
	if err != nil || !state.Running {
		return
	}
	release, err := m.reserveStart(owner)
	if err != nil {
		return
	}
	defer release()
	m.start(ctx, owner, game, tab, token, state.Generation)
}

// Shared inspection drains locally admitted work after another replica pauses
// or a read materializes expiry before the sweep sees it. The number of actual
// CPU runners is bounded; paused/human-wait games have no runner here.
func (m *botPlaybackManager) reap(ctx context.Context) {
	m.mu.Lock()
	active := make([]*botPlaybackRunner, 0, len(m.runners))
	for _, r := range m.runners {
		active = append(active, r)
	}
	m.mu.Unlock()
	for _, r := range active {
		// Hold/stop can retire a runner after the snapshot. Its canceled context
		// is not evidence that independently requested Coach work lost access.
		if r.ctx.Err() != nil {
			continue
		}
		if ctx.Err() != nil {
			m.stopThrough(r.owner, r.game, r.generation)
			m.service.jobs.cancelGameThrough(r.owner, r.game, false, r.generation)
			continue
		}
		check, done := context.WithTimeout(r.ctx, 250*time.Millisecond)
		stop := context.AfterFunc(ctx, done)
		state, err := m.service.store.ReadPlayback(check, r.owner, r.game, m.instanceID)
		stop()
		done()
		m.mu.Lock()
		current := m.runners[r.owner] == r
		m.mu.Unlock()
		if !current || r.ctx.Err() != nil {
			continue
		}
		if err != nil || !state.Running || state.Generation != r.generation {
			m.stopThrough(r.owner, r.game, r.generation)
			// Runner cleanup only owns bot work. The independent work reaper
			// evaluates Coach with its own authenticated context and policy.
			m.service.jobs.cancelGameThrough(r.owner, r.game, false, r.generation)
		}
	}
}

var errPlaybackStopped = errors.New("playback stopped")
var errPlaybackDormant = errors.New("playback awaits foreground command")

type playbackWorkStateError struct{ state string }

func (e *playbackWorkStateError) Error() string { return "bot preparation unavailable" }

// Diagnostics intentionally classify rather than format arbitrary errors. DB
// messages can contain SQL/connection data; transport errors may carry private
// context. Only fixed categories and operation names reach process logs.
func playbackFailureClass(err error) string {
	if err == nil {
		return "none"
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline"
	case errors.Is(err, context.Canceled):
		return "canceled"
	case errors.Is(err, errPlaybackStopped):
		return "playback_fence_changed"
	case errors.Is(err, records.ErrUnauthenticated):
		return "unauthenticated"
	case errors.Is(err, records.ErrControl):
		return "control_lost"
	case errors.Is(err, records.ErrReadDenied), errors.Is(err, records.ErrAccess):
		return "access_denied"
	case errors.Is(err, records.ErrAllowance):
		return "allowance"
	case errors.Is(err, records.ErrConflict), errors.Is(err, records.ErrWorkStale):
		return "stale"
	case errors.Is(err, ErrBusy), errors.Is(err, records.ErrWorkBusy):
		return "capacity"
	case errors.Is(err, records.ErrCommandDigest):
		return "command_conflict"
	case errors.Is(err, records.ErrStorage):
		return "storage"
	}
	var work *playbackWorkStateError
	if errors.As(err, &work) {
		switch work.state {
		case "rejected":
			return "prepared_rejected"
		case "canceled":
			return "prepared_canceled"
		default:
			return "prepared_unavailable"
		}
	}
	var public *transport.LocalError
	if errors.As(err, &public) {
		switch public.Code {
		case "INVALID_COMMAND", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "STALE_REVISION", "IDEMPOTENCY_CONFLICT", "LEASE_LOST", "QUOTA_EXHAUSTED", "SERVICE_UNAVAILABLE":
			return "service_" + public.Code
		default:
			return "service_error"
		}
	}
	var database *pgconn.PgError
	if errors.As(err, &database) {
		switch database.Code {
		case "57014":
			return "db_query_canceled"
		case "55P03":
			return "db_lock_timeout"
		case "40P01":
			return "db_deadlock"
		case "40001":
			return "db_serialization"
		case "23505":
			return "db_unique"
		case "23514":
			return "db_constraint"
		default:
			return "db_error"
		}
	}
	return "internal"
}

func playbackDiagnostic(stage string, err, stepContextErr, stopErr error, attempted bool, elapsed time.Duration) string {
	switch stage {
	case "read_playback", "load_game", "decode_session", "read_node", "prepare", "decode_prepare", "read_work", "retry_work", "decode_retry", "read_retry", "reclaim_work", "work_status", "digest_command", "encode_command", "advance":
	default:
		stage = "unknown"
	}
	class := playbackFailureClass(err)
	if errors.Is(stepContextErr, context.DeadlineExceeded) {
		class = "deadline"
	}
	stop := "not_attempted"
	if attempted {
		stop = "ok"
		if stopErr != nil {
			stop = "failed"
		}
	}
	ms := elapsed.Milliseconds()
	if ms < 0 {
		ms = 0
	}
	if ms > 60000 {
		ms = 60000
	}
	return fmt.Sprintf("cardford_playback_runner_exit stage=%s class=%s inspection_ms=%d durable_stop=%s stop_class=%s", stage, class, ms, stop, playbackFailureClass(stopErr))
}

func newBotPlaybackManager(s *Service) (*botPlaybackManager, error) {
	id, err := randomID()
	if err != nil {
		return nil, err
	}
	return &botPlaybackManager{service: s, instanceID: id, runners: map[string]*botPlaybackRunner{}, reserved: map[string]bool{}}, nil
}

func (m *botPlaybackManager) reserveStart(owner string) (func(), error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil, context.Canceled
	}
	if m.runners[owner] == nil && !m.reserved[owner] && len(m.runners)+len(m.reserved) >= maxPlaybackRunners {
		return nil, ErrBusy
	}
	if m.runners[owner] == nil {
		m.reserved[owner] = true
	}
	return func() { m.mu.Lock(); delete(m.reserved, owner); m.mu.Unlock() }, nil
}

// start/stop are serialized with the playback command acknowledgement. A
// one-element signal retains a completion that races the current inspection.
func (m *botPlaybackManager) start(ctx context.Context, owner, game, tab, token string, generation int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return
	}
	delete(m.reserved, owner)
	if old := m.runners[owner]; old != nil {
		old.cancel()
	}
	admitted := records.WithPlayback(context.WithoutCancel(ctx), game, generation, m.instanceID)
	work, cancel := context.WithCancel(admitted)
	r := &botPlaybackRunner{ctx: work, cancel: cancel, owner: owner, game: game, tab: tab, token: token, generation: generation, wake: make(chan struct{}, 1)}
	m.runners[owner] = r
	m.wg.Add(1)
	go m.run(r)
	r.wake <- struct{}{}
}

func (m *botPlaybackManager) stop(owner, game string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r := m.runners[owner]; r != nil && (game == "" || r.game == game) {
		r.cancel()
		delete(m.runners, owner)
	}
}

func (m *botPlaybackManager) wake(owner, game string) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if r := m.runners[owner]; r != nil && (game == "" || r.game == game) {
		select {
		case r.wake <- struct{}{}:
		default:
		}
	}
}

// effectiveState distinguishes durable intent from a live admitted runner.
// Admission is serialized so readers cannot observe SetPlayback's committed
// resume before start has installed its matching runner.
func (m *botPlaybackManager) effectiveState(ctx context.Context, owner, game string) (records.PlaybackState, error) {
	unlock := m.lockOwner(owner)
	defer unlock()
	state, err := m.service.store.ReadPlayback(ctx, owner, game, m.instanceID)
	if err != nil || !state.Running {
		return state, err
	}
	return state, nil
}

func (m *botPlaybackManager) close() {
	if m == nil {
		return
	}
	m.mu.Lock()
	m.closed = true
	for _, r := range m.runners {
		r.cancel()
	}
	m.runners = map[string]*botPlaybackRunner{}
	m.mu.Unlock()
	m.wg.Wait()
}

func (m *botPlaybackManager) run(r *botPlaybackRunner) {
	defer m.wg.Done()
	var retry *time.Timer
	failedStop := false
	defer func() {
		if retry != nil {
			retry.Stop()
		}
		r.cancel()
		m.mu.Lock()
		removed := m.runners[r.owner] == r
		if removed {
			delete(m.runners, r.owner)
		}
		m.mu.Unlock()
		if removed && failedStop {
			// A failed durable stop has no outbox event. Force recovery only
			// after removing this runner so it observes effective pause.
			m.service.realtime.closeOwner(r.owner)
		}
	}()
	for {
		select {
		case <-r.ctx.Done():
			return
		case <-r.wake:
			if retry != nil {
				retry.Stop()
			}
			r.retryAt = time.Time{}
			if r.ctx.Err() != nil {
				return
			}
			// This inspection only queues bounded preparation or commits one
			// ready action. It never waits for animation or polls work status.
			ctx, cancel := context.WithTimeout(r.ctx, 5*time.Second)
			started := time.Now()
			err := m.service.stepPlayback(ctx, r)
			inspectionElapsed := time.Since(started)
			stepContextErr := ctx.Err() // Capture before our ordinary cancel below.
			cancel()
			if errors.Is(err, errPlaybackDormant) {
				m.mu.Lock()
				if len(r.wake) > 0 {
					m.mu.Unlock()
					continue
				}
				if m.runners[r.owner] == r {
					delete(m.runners, r.owner)
				}
				m.mu.Unlock()
				return
			}
			if err != nil {
				var stopErr error
				attempted := false
				if r.ctx.Err() == nil && !errors.Is(err, errPlaybackStopped) {
					attempted = true
					cleanup, done := context.WithTimeout(context.WithoutCancel(r.ctx), time.Second)
					stopErr = m.service.store.StopPlayback(cleanup, r.owner, r.game, r.generation, m.instanceID)
					failedStop = stopErr != nil
					done()
				}
				if r.ctx.Err() == nil {
					log.Print(playbackDiagnostic(r.stage, err, stepContextErr, stopErr, attempted, inspectionElapsed))
				}
				return
			}
			if !r.retryAt.IsZero() {
				// Only lease recovery needs a clock wake. A healthy worker wakes
				// the runner immediately when its durable result is published.
				retry = time.AfterFunc(time.Until(r.retryAt), func() {
					select {
					case r.wake <- struct{}{}:
					default:
					}
				})
			}
		}
	}
}

func (s *Service) setPlayback(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q struct {
		CommandID                  string `json:"commandId"`
		GameID                     string `json:"gameId"`
		ControlLeaseToken          string `json:"controlLeaseToken"`
		ExpectedControlGeneration  int64  `json:"expectedControlGeneration"`
		ExpectedPlaybackGeneration int64  `json:"expectedPlaybackGeneration"`
		Running                    bool   `json:"running"`
		Intent                     string `json:"intent"`
		Reason                     string `json:"reason"`
	}
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, fail(400, "invalid-playback-command")
	}
	// Serializing these small admission operations prevents a newer pause from
	// being followed by an older in-memory resume, even across HTTP requests.
	unlock := s.playback.lockOwner(owner)
	defer unlock()
	ctx, previous, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if previous != nil {
		return accepted(*previous)
	}
	if q.Intent == "" {
		if q.Running {
			return transport.Response{}, fail(400, "explicit-lifecycle-intent-required")
		}
		q.Intent = "pause"
	}
	if (q.Intent == "resume" || q.Intent == "release_hold") != q.Running {
		return transport.Response{}, fail(400, "inconsistent-playback-intent")
	}
	if q.Intent == "resume" || q.Intent == "release_hold" {
		var release func()
		if release, err = s.playback.reserveStart(owner); err != nil {
			return transport.Response{}, err
		}
		defer release()
	}
	ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
	state, err := s.store.SetPlaybackIntent(ctx, q.GameID, q.ExpectedControlGeneration, q.ExpectedPlaybackGeneration, q.Intent, q.Reason, s.playback.instanceID)
	if err != nil {
		return transport.Response{}, err
	}
	if state.Running {
		s.playback.start(ctx, owner, q.GameID, r.Tab, q.ControlLeaseToken, state.Generation)
	} else {
		s.playback.stop(owner, q.GameID)
		s.jobs.cancelGame(owner, q.GameID, q.Intent != "hold")
		s.realtime.closeGame(owner, q.GameID)
	}
	return result("RealtimePlaybackView", state)
}

// stepPlayback acts only on registered automatic nodes and computer seats.
// Human choices, sealed human windows, chance and round boundaries keep their
// existing explicit command flow; a single legal human card is never autoplay.
func (s *Service) stepPlayback(ctx context.Context, r *botPlaybackRunner) error {
	r.stage = "read_playback"
	state, err := s.store.ReadPlayback(ctx, r.owner, r.game, s.playback.instanceID)
	if err != nil {
		return err
	}
	if !state.Running || state.Generation != r.generation {
		return errPlaybackStopped
	}
	r.stage = "load_game"
	loaded, err := s.store.Load(ctx, r.owner, r.game)
	if err != nil {
		return err
	}
	r.stage = "decode_session"
	bound, err := s.codec.Session(loaded.Document, loaded.Snapshot)
	if err != nil {
		return err
	}
	r.stage = "read_node"
	node, err := bound.Node()
	if err != nil {
		return err
	}
	if node.Kind != "automatic" && (node.Kind != "actor" || node.Seat == nil || *node.Seat == 0) {
		return errPlaybackDormant
	}
	q := map[string]any{"gameId": r.game, "expectedRevision": loaded.Document.Revision, "controlLeaseToken": r.token}
	if node.Kind == "actor" {
		work, err := s.playbackPreparation(ctx, r, loaded.Document.Revision)
		if err != nil {
			return err
		}
		switch work.Status {
		case "queued", "running":
			if work.LeaseUntil != nil {
				r.retryAt = work.LeaseUntil.Add(time.Millisecond)
			}
			return nil
		case "completed":
			q["kind"], q["preparedDecisionId"] = "bot", work.ID
		default:
			r.stage = "work_status"
			return &playbackWorkStateError{state: work.Status}
		}
	} else {
		q["kind"], q["transitionId"] = "automatic", node.TransitionID
	}
	r.stage = "digest_command"
	identity, _ := json.Marshal([]any{r.game, loaded.Document.Revision, r.generation})
	digest, err := records.JSONDigest(identity)
	if err != nil {
		return err
	}
	q["commandId"] = "playback-" + digest
	r.stage = "encode_command"
	raw, err := json.Marshal(q)
	if err != nil {
		return err
	}
	r.stage = "advance"
	_, err = s.mutate(ctx, r.owner, transport.Request{Operation: "advance", Tab: r.tab, Body: raw})
	return err
}

func (s *Service) playbackPreparation(ctx context.Context, r *botPlaybackRunner, revision int64) (records.PreparedWork, error) {
	if r.workRevision != revision {
		r.workID = ""
		r.workRevision = revision
	}
	first := r.workID == ""
	if first {
		r.stage = "prepare"
		raw, _ := json.Marshal(map[string]any{"gameId": r.game, "expectedRevision": revision, "controlLeaseToken": r.token, "purpose": "bot-action"})
		response, err := s.prepare(ctx, r.owner, transport.Request{Operation: "prepare", Tab: r.tab, Body: raw})
		if err != nil {
			return records.PreparedWork{}, err
		}
		var view struct {
			WorkID string `json:"workId"`
		}
		r.stage = "decode_prepare"
		if err = json.Unmarshal(response.Body, &view); err != nil {
			return records.PreparedWork{}, err
		}
		r.workID = view.WorkID
	}
	r.stage = "read_work"
	work, err := s.store.ReadWork(ctx, r.owner, r.workID)
	if err != nil {
		return work, err
	}
	// A fresh explicit resume can retry the prior failed/expired result once.
	// Keep its returned successor ID; do not repeatedly return the expired work.
	if first && (work.Status == "rejected" || work.Status == "canceled" || !time.Now().Before(work.ExpiresAt)) {
		r.stage = "retry_work"
		raw, _ := json.Marshal(map[string]any{"controlLeaseToken": r.token})
		response, err := s.work(ctx, r.owner, transport.Request{Operation: "work-retry", Tab: r.tab, Body: raw, CommandID: r.workID})
		if err != nil {
			return work, err
		}
		var view struct {
			WorkID string `json:"workId"`
		}
		r.stage = "decode_retry"
		if err = json.Unmarshal(response.Body, &view); err != nil {
			return work, err
		}
		r.workID = view.WorkID
		r.stage = "read_retry"
		return s.store.ReadWork(ctx, r.owner, r.workID)
	}
	if work.Status == "running" && work.LeaseUntil != nil && !time.Now().Before(*work.LeaseUntil) {
		r.stage = "reclaim_work"
		// A process can die holding a durable work lease. Re-admit the same
		// logical work only once that lease has expired; ClaimWork fences it.
		reservation, err := s.jobs.reserve(r.owner + ":playback-reclaim:" + work.ID)
		if err != nil {
			return work, err
		}
		s.dispatch(ctx, r.owner, work, reservation)
		// Dispatch has the completion signal now. Avoid an expired-time busy
		// loop while that admitted worker is claiming the new attempt.
		work.LeaseUntil = nil
	}
	return work, nil
}
