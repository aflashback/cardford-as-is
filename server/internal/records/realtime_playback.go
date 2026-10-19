package records

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

const ForegroundLease = 15 * time.Second
const PausePolicyVersion = "pause-v1"

type PlaybackState struct {
	Running              bool       `json:"running"`
	Generation           int64      `json:"generation"`
	Phase                string     `json:"phase,omitempty"`
	PauseReason          *string    `json:"pauseReason"`
	ServerNow            time.Time  `json:"serverNow"`
	ForegroundLeaseUntil *time.Time `json:"foregroundLeaseUntil"`
	PausedAt             *time.Time `json:"pausedAt"`
	ExpiresAt            *time.Time `json:"expiresAt"`
	PolicyVersion        string     `json:"policyVersion,omitempty"`
	RetentionSeconds     int        `json:"retentionSeconds,omitempty"`
}
type playbackKey struct{}
type playbackFence struct {
	gameID     string
	generation int64
	instanceID string
}

func WithPlayback(ctx context.Context, gameID string, generation int64, instanceID string) context.Context {
	return context.WithValue(ctx, playbackKey{}, playbackFence{gameID, generation, instanceID})
}
func PlaybackGeneration(ctx context.Context) (int64, bool) {
	f, ok := ctx.Value(playbackKey{}).(playbackFence)
	return f.generation, ok
}

// checkLifecycleTx is evaluated under the owner's access lock, using fresh SQL
// time at admission, claim, publication and accepted mutation. A delayed sweep
// cannot authorize an expired lease. Coach reads/work may run while paused,
// until the original retention deadline; bot/human game mutations may not.
func (s *Store) checkLifecycleTx(ctx context.Context, tx pgx.Tx, owner, game string, coach bool) error {
	var allowed bool
	err := tx.QueryRow(ctx, `SELECT NOT EXISTS(SELECT 1 FROM m05_playback WHERE owner_id=$1 AND game_id=$2 AND policy_version='pause-v1' AND (phase='expired' OR phase='paused' AND expires_at<=clock_timestamp() OR phase IN ('running','held') AND foreground_lease_until<=clock_timestamp() OR NOT $3 AND phase<>'running'))`, owner, game, coach).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrAccess
	}
	return nil
}
func (s *Store) checkPlaybackTx(ctx context.Context, tx pgx.Tx, owner, game string, control int64) error {
	f, ok := ctx.Value(playbackKey{}).(playbackFence)
	if err := s.checkLifecycleTx(ctx, tx, owner, game, false); err != nil {
		if ok && errors.Is(err, ErrAccess) {
			return ErrControl
		}
		return err
	}
	if !ok {
		return nil
	}
	if f.gameID != game || f.generation < 1 || !recordID(f.instanceID) {
		return ErrControl
	}
	var allowed bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM m05_playback WHERE owner_id=$1 AND game_id=$2 AND generation=$3 AND instance_id=$4 AND control_generation=$5 AND running AND (policy_version='legacy' OR foreground_lease_until>clock_timestamp()))`, owner, game, f.generation, f.instanceID, control).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrControl
	}
	return nil
}

type lifecycleRow struct {
	PlaybackState
	control                         int64
	instance, gameKind, variantKind string
	sequence                        int64
}

func (s *Store) readLifecycleTx(ctx context.Context, tx pgx.Tx, owner, game string) (lifecycleRow, error) {
	var r lifecycleRow
	err := tx.QueryRow(ctx, `SELECT running,generation,phase,pause_reason,clock_timestamp(),foreground_lease_until,paused_at,expires_at,policy_version,retention_seconds,control_generation,instance_id,presence_sequence,game_kind,variant_kind FROM m05_playback WHERE owner_id=$1 AND game_id=$2 FOR UPDATE`, owner, game).Scan(&r.Running, &r.Generation, &r.Phase, &r.PauseReason, &r.ServerNow, &r.ForegroundLeaseUntil, &r.PausedAt, &r.ExpiresAt, &r.PolicyVersion, &r.RetentionSeconds, &r.control, &r.instance, &r.sequence, &r.gameKind, &r.variantKind)
	return r, err
}
func (s *Store) saveLifecycleTx(ctx context.Context, tx pgx.Tx, owner, game string, r lifecycleRow) error {
	_, err := tx.Exec(ctx, `INSERT INTO m05_playback(owner_id,game_id,running,generation,phase,pause_reason,foreground_lease_until,paused_at,expires_at,policy_version,retention_seconds,control_generation,instance_id,presence_sequence,game_kind,variant_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(game_id) DO UPDATE SET running=EXCLUDED.running,generation=EXCLUDED.generation,phase=EXCLUDED.phase,pause_reason=EXCLUDED.pause_reason,foreground_lease_until=EXCLUDED.foreground_lease_until,paused_at=EXCLUDED.paused_at,expires_at=EXCLUDED.expires_at,policy_version=EXCLUDED.policy_version,retention_seconds=EXCLUDED.retention_seconds,control_generation=EXCLUDED.control_generation,instance_id=EXCLUDED.instance_id,presence_sequence=EXCLUDED.presence_sequence,game_kind=EXCLUDED.game_kind,variant_kind=EXCLUDED.variant_kind`, owner, game, r.Running, r.Generation, r.Phase, r.PauseReason, r.ForegroundLeaseUntil, r.PausedAt, r.ExpiresAt, r.PolicyVersion, r.RetentionSeconds, r.control, r.instance, r.sequence, r.gameKind, r.variantKind)
	return err
}
func pauseLifecycle(r *lifecycleRow, at time.Time, reason string) {
	r.Running = false
	r.Phase = "paused"
	r.PauseReason = &reason
	r.PausedAt = &at
	until := at.Add(time.Duration(r.RetentionSeconds) * time.Second)
	r.ExpiresAt = &until
	r.ForegroundLeaseUntil = nil
	r.Generation++
	r.sequence = 0
}
func (s *Store) cancelLifecycleWorkTx(ctx context.Context, tx pgx.Tx, owner, game string, all bool) error {
	if _, err := tx.Exec(ctx, `UPDATE m03_work_attempts SET status='canceled',finished_at=clock_timestamp() WHERE status='running' AND work_id IN(SELECT work_id FROM m03_work WHERE owner_id=$1 AND game_id=$2 AND status IN ('queued','running') AND ($3 OR purpose NOT IN ('coach-advice','review-alternative')))`, owner, game, all); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE m03_work SET status='canceled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE owner_id=$1 AND game_id=$2 AND status IN ('queued','running') AND ($3 OR purpose NOT IN ('coach-advice','review-alternative'))`, owner, game, all)
	return err
}

// materializeLifecycleTx never infers process death from instance identity.
// Replicas share absolute deadlines; a foreign live lease remains live.
func (s *Store) materializeLifecycleTx(ctx context.Context, tx pgx.Tx, owner, game string, r *lifecycleRow) (bool, error) {
	if r.PolicyVersion != PausePolicyVersion {
		return false, nil
	}
	changed := false
	if (r.Phase == "running" || r.Phase == "held") && r.ForegroundLeaseUntil != nil && !r.ServerNow.Before(*r.ForegroundLeaseUntil) {
		pauseLifecycle(r, *r.ForegroundLeaseUntil, "lease_expired")
		changed = true
	}
	if r.Phase == "paused" && r.ExpiresAt != nil && !r.ServerNow.Before(*r.ExpiresAt) {
		r.Phase = "expired"
		r.Running = false
		r.ForegroundLeaseUntil = nil
		r.Generation++
		changed = true
		if _, err := tx.Exec(ctx, `UPDATE m03_access SET active_game_id=NULL,generation=generation+1 WHERE owner_id=$1 AND active_game_id=$2`, owner, game); err != nil {
			return false, err
		}
	}
	if changed {
		if err := s.saveLifecycleTx(ctx, tx, owner, game, *r); err != nil {
			return false, err
		}
		if err := s.cancelLifecycleWorkTx(ctx, tx, owner, game, true); err != nil {
			return false, err
		}
	}
	return changed, nil
}
func (s *Store) lifecycleRetentionTx(ctx context.Context, tx pgx.Tx, owner, kind, variant string) (int, error) {
	// Live purchase/family or explicit local operator-test grants earn Paid retention. Unlimited free
	// fixture grants and trials remain Free; the browser supplies neither tier
	// nor TTL. A pause pins the value established at creation/explicit Resume.
	var paid bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM m03_grants WHERE owner_id=$1 AND game=$2 AND variant=$3 AND source_kind IN ('purchase','family','operator-test') AND NOT revoked AND valid_from<=clock_timestamp() AND (valid_until IS NULL OR valid_until>clock_timestamp()) AND (convert_from(terms,'UTF8')::jsonb->>'canPlay')::boolean)`, owner, kind, variant).Scan(&paid)
	if err != nil {
		return 0, err
	}
	if paid {
		return int(s.pausePaidRetention / time.Second), nil
	}
	return int(s.pauseFreeRetention / time.Second), nil
}
func (s *Store) initializeLifecycleTx(ctx context.Context, tx pgx.Tx, meta SessionMetadata, control int64) error {
	retention, err := s.lifecycleRetentionTx(ctx, tx, meta.OwnerID, meta.Pin.GameID, meta.Pin.VariantID)
	if err != nil {
		return err
	}
	var now time.Time
	if err = tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		return err
	}
	r := lifecycleRow{PlaybackState: PlaybackState{PolicyVersion: PausePolicyVersion, RetentionSeconds: retention, ServerNow: now}, control: control, instance: "unstarted", gameKind: meta.Pin.GameID, variantKind: meta.Pin.VariantID}
	pauseLifecycle(&r, now, "reopened")
	r.Generation = 0
	return s.saveLifecycleTx(ctx, tx, meta.OwnerID, meta.GameID, r)
}

func (s *Store) ReadPlayback(ctx context.Context, owner, game, instanceID string) (PlaybackState, error) {
	var out PlaybackState
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT 1 FROM m03_access WHERE owner_id=$1 FOR UPDATE`, owner); err != nil {
			return err
		}
		if err := s.authorize(ctx, tx, owner); err != nil {
			return err
		}
		var readable bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM m03_access a JOIN m03_games g ON g.owner_id=a.owner_id WHERE a.owner_id=$1 AND g.game_id=$2 AND a.can_read)`, owner, game).Scan(&readable); err != nil {
			return err
		}
		if !readable {
			return ErrReadDenied
		}
		r, err := s.readLifecycleTx(ctx, tx, owner, game)
		if errors.Is(err, pgx.ErrNoRows) {
			out = PlaybackState{Phase: "paused", PolicyVersion: "legacy", ServerNow: time.Now().UTC()}
			return nil
		}
		if err != nil {
			return err
		}
		if _, err = s.materializeLifecycleTx(ctx, tx, owner, game, &r); err != nil {
			return err
		}
		var allowed bool
		if err = tx.QueryRow(ctx, `SELECT COALESCE(can_read AND active_game_id=$2 AND can_play AND control_generation=$3 AND EXISTS(SELECT 1 FROM m04_controls c JOIN m04_sessions ss ON ss.token_hash=c.session_hash WHERE c.owner_id=$1 AND c.expires_at>clock_timestamp() AND ss.expires_at>clock_timestamp() AND ss.revoked_at IS NULL),false) FROM m03_access WHERE owner_id=$1`, owner, game, r.control).Scan(&allowed); err != nil {
			return err
		}
		if !allowed && (r.Phase == "running" || r.Phase == "held") {
			if r.PolicyVersion == PausePolicyVersion {
				pauseLifecycle(&r, r.ServerNow, "control_lost")
				if err = s.saveLifecycleTx(ctx, tx, owner, game, r); err != nil {
					return err
				}
				if err = s.cancelLifecycleWorkTx(ctx, tx, owner, game, true); err != nil {
					return err
				}
			} else {
				r.Running = false
				r.Phase = "paused"
			}
		}
		out = r.PlaybackState
		return nil
	})
	return out, err
}
func (s *Store) SetPlayback(ctx context.Context, game string, expectedControl, expectedPlayback int64, running bool, instanceID string) (PlaybackState, error) {
	intent := "pause"
	if running {
		intent = "resume"
	}
	return s.SetPlaybackIntent(ctx, game, expectedControl, expectedPlayback, intent, "manual", instanceID)
}
func validPauseReason(reason string) bool {
	switch reason {
	case "manual", "away", "layout_unavailable", "idle", "connection_lost", "service_unavailable", "lease_expired", "control_lost", "access_required", "reopened":
		return true
	}
	return false
}
func (s *Store) SetPlaybackIntent(ctx context.Context, game string, expectedControl, expectedPlayback int64, intent, reason, instanceID string) (PlaybackState, error) {
	var out PlaybackState
	p, err := principalFrom(ctx)
	if err != nil {
		return out, err
	}
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil {
		return out, err
	}
	if !ok || !recordID(game) || !recordID(instanceID) || expectedControl < 1 || expectedPlayback < 0 || expectedPlayback >= maxRecordInteger-2 {
		return out, ErrCommandDigest
	}
	if reason == "" {
		reason = "manual"
	}
	if !validPauseReason(reason) {
		return out, ErrCommandDigest
	}
	if intent != "resume" && intent != "pause" && intent != "hold" && intent != "release_hold" {
		return out, ErrCommandDigest
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		original, e := s.reconcileServiceTx(ctx, tx, p.OwnerID, c.ID, c.Digest)
		if e == nil {
			if original.ReceiptSchema != "RealtimePlaybackView" {
				return ErrCommandDigest
			}
			return json.Unmarshal(original.Receipt, &out)
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		if e = s.authorizeControl(ctx, tx, p.OwnerID); e != nil {
			return e
		}
		var control, revision int64
		var active string
		var play bool
		if e = tx.QueryRow(ctx, `SELECT control_generation,COALESCE(active_game_id,''),can_play FROM m03_access WHERE owner_id=$1`, p.OwnerID).Scan(&control, &active, &play); e != nil {
			return e
		}
		if control != expectedControl {
			return ErrControl
		}
		if e = tx.QueryRow(ctx, `SELECT revision FROM m03_games WHERE owner_id=$1 AND game_id=$2`, p.OwnerID, game).Scan(&revision); e != nil {
			return e
		}
		r, e := s.readLifecycleTx(ctx, tx, p.OwnerID, game)
		if errors.Is(e, pgx.ErrNoRows) {
			r = lifecycleRow{PlaybackState: PlaybackState{Phase: "paused", PolicyVersion: "legacy", RetentionSeconds: int(s.pauseFreeRetention / time.Second)}, control: control}
			e = tx.QueryRow(ctx, `SELECT clock_timestamp(),convert_from(document,'UTF8')::jsonb#>>'{metadata,pin,gameId}',convert_from(document,'UTF8')::jsonb#>>'{metadata,pin,variantId}' FROM m03_games WHERE owner_id=$1 AND game_id=$2`, p.OwnerID, game).Scan(&r.ServerNow, &r.gameKind, &r.variantKind)
		}
		if e != nil {
			return e
		}
		if r.gameKind == "" {
			if e = tx.QueryRow(ctx, `SELECT convert_from(document,'UTF8')::jsonb#>>'{metadata,pin,gameId}',convert_from(document,'UTF8')::jsonb#>>'{metadata,pin,variantId}' FROM m03_games WHERE owner_id=$1 AND game_id=$2`, p.OwnerID, game).Scan(&r.gameKind, &r.variantKind); e != nil {
				return e
			}
		}
		changed, e := s.materializeLifecycleTx(ctx, tx, p.OwnerID, game, &r)
		if e != nil {
			return e
		}
		if r.Phase != "expired" && r.Phase != "completed" {
			if active != game || ((intent == "resume" || intent == "release_hold") && !play) {
				return ErrControl
			}
			if !changed && r.Generation != expectedPlayback {
				return ErrConflict
			}
			// A stale action receives the newly materialized pause, never auto-resumes.
			if !changed {
				switch intent {
				case "resume":
					r.RetentionSeconds, e = s.lifecycleRetentionTx(ctx, tx, p.OwnerID, r.gameKind, r.variantKind)
					if e != nil {
						return e
					}
					r.PolicyVersion = PausePolicyVersion
					r.Phase = "running"
					r.Running = true
					r.Generation++
					r.PausedAt = nil
					r.ExpiresAt = nil
					r.PauseReason = nil
					r.sequence = 0
					until := r.ServerNow.Add(ForegroundLease)
					r.ForegroundLeaseUntil = &until
					r.control = control
					r.instance = instanceID
				case "pause":
					if r.PolicyVersion == "legacy" {
						r.Running = false
						r.Phase = "paused"
						r.PauseReason = &reason
						r.Generation++
						break
					}
					if r.PausedAt == nil || r.Phase != "paused" {
						pauseLifecycle(&r, r.ServerNow, reason)
					} else {
						r.Generation++
					}
				case "hold":
					if r.Phase == "running" && r.ForegroundLeaseUntil != nil {
						r.Phase = "held"
						r.Running = false
						r.Generation++
						r.sequence = 0
					}
				case "release_hold":
					if r.Phase == "held" && r.ForegroundLeaseUntil != nil && r.ServerNow.Before(*r.ForegroundLeaseUntil) {
						r.Phase = "running"
						r.Running = true
						r.Generation++
						r.sequence = 0
						r.instance = instanceID
						r.control = control
					}
				}
				if e = s.saveLifecycleTx(ctx, tx, p.OwnerID, game, r); e != nil {
					return e
				}
				if !r.Running {
					if e = s.cancelLifecycleWorkTx(ctx, tx, p.OwnerID, game, false); e != nil {
						return e
					}
				}
			}
		}
		out = r.PlaybackState
		raw, e := json.Marshal(out)
		if e != nil {
			return e
		}
		return s.saveServiceTx(ctx, tx, p.OwnerID, AcceptedOutcome{GameID: game, Revision: revision, ReceiptSchema: "RealtimePlaybackView", Receipt: raw})
	})
	return out, err
}
func (s *Store) RenewForeground(ctx context.Context, game string, expectedControl, expectedPlayback, sequence int64, instanceID string) (PlaybackState, error) {
	var out PlaybackState
	p, err := principalFrom(ctx)
	if err != nil {
		return out, err
	}
	if sequence < 1 || sequence > maxRecordInteger {
		return out, ErrConflict
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var control int64
		var active string
		var play bool
		if e := tx.QueryRow(ctx, `SELECT control_generation,COALESCE(active_game_id,''),can_play FROM m03_access WHERE owner_id=$1 FOR UPDATE`, p.OwnerID).Scan(&control, &active, &play); e != nil {
			return e
		}
		if e := s.authorizeControl(ctx, tx, p.OwnerID); e != nil {
			return e
		}
		if control != expectedControl {
			return ErrControl
		}
		r, e := s.readLifecycleTx(ctx, tx, p.OwnerID, game)
		if e != nil {
			return e
		}
		changed, e := s.materializeLifecycleTx(ctx, tx, p.OwnerID, game, &r)
		if e != nil {
			return e
		}
		if !changed && r.Phase != "expired" {
			if active != game || !play || r.control != control || r.instance != instanceID {
				return ErrControl
			}
			if r.Generation != expectedPlayback {
				return ErrConflict
			}
			if (r.Phase == "running" || r.Phase == "held") && r.ForegroundLeaseUntil != nil && r.ServerNow.Before(*r.ForegroundLeaseUntil) && sequence > r.sequence {
				until := r.ServerNow.Add(ForegroundLease)
				r.ForegroundLeaseUntil = &until
				r.sequence = sequence
				if e = s.saveLifecycleTx(ctx, tx, p.OwnerID, game, r); e != nil {
					return e
				}
			}
		}
		out = r.PlaybackState
		return nil
	})
	return out, err
}
func (s *Store) StopPlayback(ctx context.Context, owner, game string, generation int64, instanceID string) error {
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT 1 FROM m03_access WHERE owner_id=$1 FOR UPDATE`, owner); err != nil {
			return err
		}
		if err := s.authorize(ctx, tx, owner); err != nil {
			return err
		}
		r, err := s.readLifecycleTx(ctx, tx, owner, game)
		if err != nil {
			return err
		}
		if r.Generation != generation || r.instance != instanceID || !r.Running {
			return nil
		}
		pauseLifecycle(&r, r.ServerNow, "service_unavailable")
		if err = s.saveLifecycleTx(ctx, tx, owner, game, r); err != nil {
			return err
		}
		return s.cancelLifecycleWorkTx(ctx, tx, owner, game, false)
	})
}
