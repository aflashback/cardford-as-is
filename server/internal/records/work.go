package records

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrWorkBusy = errors.New("prepared work already has a live attempt")
var ErrWorkStale = errors.New("prepared work expired, canceled, rejected, or fenced")

const MaxWorkLifetime = 10 * time.Minute
const MaxWorkLease = 30 * time.Second

type WorkRequest struct {
	GameID                         string
	PredecessorID                  string
	Revision                       int64
	Actor                          int
	WindowID, Purpose, InputDigest string
	Policy                         PolicyPin
	Admission                      AccessAdmission
	Lifetime                       time.Duration
}
type WorkLease struct {
	WorkID, Token string
	Fence         int64
}
type PreparedWork struct {
	ID, LogicalKey, Status string
	Request                WorkRequest
	Attempt                int64
	LeaseUntil             *time.Time
	ExpiresAt              time.Time
	ReceiptID, DecisionID  string
}

func freshID() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func workKey(r WorkRequest) string {
	r.Lifetime = 0
	raw, _ := json.Marshal(r)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
func workCoach(purpose string) bool {
	return purpose == "coach-advice" || purpose == "review-alternative"
}
func workTool(purpose string) string {
	if purpose == "coach-advice" {
		return "advice"
	}
	if purpose == "review-alternative" {
		return "review-alternative"
	}
	return ""
}

func (s *Store) validateWorkInput(loaded *Loaded, r WorkRequest) error {
	if !loaded.Disposition.Playable || loaded.Document.Revision != r.Revision || loaded.WindowID != r.WindowID {
		return ErrWorkStale
	}
	unit, err := s.codec.CurrentUnitID(loaded.Document, loaded.Snapshot)
	if err != nil {
		return err
	}
	if unit != r.Admission.UnitID {
		return ErrAccess
	}
	return s.codec.ValidateWork(loaded.Document, loaded.Snapshot, r.Actor, r.WindowID, r.Purpose, r.Policy, r.InputDigest)
}

// QueueWork persists a unique logical identity before any expensive work may
// dispatch. ClaimWork is the only transition granting an execution lease.
func (s *Store) QueueWork(ctx context.Context, r WorkRequest) (PreparedWork, error) {
	if r.PredecessorID != "" {
		return PreparedWork{}, ErrWorkStale
	}
	return s.queueWork(ctx, r)
}
func (s *Store) queueWork(ctx context.Context, r WorkRequest) (PreparedWork, error) {
	var result PreparedWork
	if r.Lifetime <= 0 || r.Lifetime > MaxWorkLifetime || r.Admission.OwnerID == "" || !recordID(r.Admission.GrantID) || !recordID(r.Admission.UnitID) {
		return result, ErrWorkStale
	}
	loaded, err := s.Load(ctx, r.Admission.OwnerID, r.GameID)
	if err != nil {
		return result, err
	}
	if err = s.validateWorkInput(loaded, r); err != nil {
		return result, err
	}
	id, err := freshID()
	if err != nil {
		return result, err
	}
	key := workKey(r)
	policy, _ := json.Marshal(r.Policy)
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.checkWorkOrigin(ctx, tx, r, loaded.Document.Metadata.Pin); err != nil {
			return err
		}
		if r.PredecessorID != "" {
			previous, _, err := s.readWork(ctx, tx, "work_id", r.PredecessorID, r.Admission.OwnerID, true)
			if err != nil {
				return err
			}
			var expired bool
			if err = tx.QueryRow(ctx, "SELECT expires_at<=clock_timestamp() FROM "+s.table("m03_work")+" WHERE work_id=$1", previous.ID).Scan(&expired); err != nil {
				return err
			}
			oldRequest, newRequest := previous.Request, r
			oldRequest.PredecessorID = ""
			newRequest.PredecessorID = ""
			if previous.Status != "completed" || !expired || workKey(oldRequest) != workKey(newRequest) {
				return ErrWorkStale
			}
		}
		_, err := tx.Exec(ctx, "INSERT INTO "+s.table("m03_work")+" (work_id,logical_key,owner_id,game_id,revision,actor,window_id,purpose,policy_version,input_digest,access_generation,control_generation,grant_id,unit_id,status,expires_at,predecessor_work_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'queued',clock_timestamp()+$15*interval '1 millisecond',NULLIF($16,'')) ON CONFLICT(logical_key) DO NOTHING", id, key, r.Admission.OwnerID, r.GameID, r.Revision, r.Actor, r.WindowID, r.Purpose, string(policy), r.InputDigest, r.Admission.Generation, r.Admission.ControlRevision, r.Admission.GrantID, r.Admission.UnitID, r.Lifetime.Milliseconds(), r.PredecessorID)
		if err != nil {
			return err
		}
		result, _, err = s.readWork(ctx, tx, "logical_key", key, r.Admission.OwnerID, false)
		return err
	})
	return result, err
}

// RetryExpiredResult creates one successor identity for an expired issued
// receipt. It never extends, mutates or replaces the prior result. Duplicate
// retries of that predecessor converge on the same unique successor key.
func (s *Store) RetryExpiredResult(ctx context.Context, owner, id string, lifetime time.Duration) (PreparedWork, error) {
	w, err := s.ReadWork(ctx, owner, id)
	if err != nil {
		return PreparedWork{}, err
	}
	if w.Status != "completed" {
		return PreparedWork{}, ErrWorkStale
	}
	r := w.Request
	r.PredecessorID = id
	r.Lifetime = lifetime
	return s.queueWork(ctx, r)
}

func (s *Store) checkWorkOrigin(ctx context.Context, tx pgx.Tx, r WorkRequest, pin ModulePin) error {
	if err := s.checkCommitAccess(ctx, tx, r.Admission, r.GameID, workCoach(r.Purpose)); err != nil {
		return err
	}
	var revision int64
	var window string
	err := tx.QueryRow(ctx, "SELECT revision,window_id FROM "+s.table("m03_games")+" WHERE game_id=$1 AND owner_id=$2 FOR UPDATE", r.GameID, r.Admission.OwnerID).Scan(&revision, &window)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrWorkStale
	}
	if err != nil {
		return err
	}
	if revision != r.Revision || window != r.WindowID {
		return ErrWorkStale
	}
	g, _, err := s.checkGrant(ctx, tx, r.Admission, r.GameID, pin.GameID, pin.VariantID, workCoach(r.Purpose))
	if err != nil {
		return err
	}
	tool := workTool(r.Purpose)
	if tool != "" {
		found := false
		for _, id := range g.Terms.Tools {
			if id == tool {
				found = true
			}
		}
		if !found {
			return ErrAccess
		}
	}
	return nil
}

func (s *Store) readWork(ctx context.Context, q grantReader, field, value, owner string, lock bool) (PreparedWork, string, error) {
	var w PreparedWork
	var token, policy string
	var lease *time.Time
	if field != "work_id" && field != "logical_key" {
		return w, "", ErrWorkStale
	}
	suffix := ""
	if lock {
		suffix = " FOR UPDATE"
	}
	err := q.QueryRow(ctx, "SELECT work_id,logical_key,status,game_id,revision,actor,window_id,purpose,policy_version,input_digest,access_generation,control_generation,grant_id,unit_id,attempt,COALESCE(lease_token,''),lease_until,expires_at,COALESCE(receipt_id,''),COALESCE(decision_id,''),COALESCE(predecessor_work_id,'') FROM "+s.table("m03_work")+" WHERE "+field+"=$1 AND owner_id=$2"+suffix, value, owner).Scan(&w.ID, &w.LogicalKey, &w.Status, &w.Request.GameID, &w.Request.Revision, &w.Request.Actor, &w.Request.WindowID, &w.Request.Purpose, &policy, &w.Request.InputDigest, &w.Request.Admission.Generation, &w.Request.Admission.ControlRevision, &w.Request.Admission.GrantID, &w.Request.Admission.UnitID, &w.Attempt, &token, &lease, &w.ExpiresAt, &w.ReceiptID, &w.DecisionID, &w.Request.PredecessorID)
	if errors.Is(err, pgx.ErrNoRows) {
		return w, "", ErrWorkStale
	}
	if err != nil {
		return w, "", err
	}
	w.Request.Admission.OwnerID = owner
	w.LeaseUntil = lease
	if strictRecord([]byte(policy), &w.Request.Policy) != nil || ValidatePolicy(w.Request.Policy) != nil || workKey(w.Request) != w.LogicalKey || w.Attempt < 0 || w.Attempt > maxRecordInteger {
		return w, "", ErrStorage
	}
	if w.Status != "queued" && w.Status != "running" && w.Status != "completed" && w.Status != "rejected" && w.Status != "canceled" {
		return w, "", ErrStorage
	}
	return w, token, nil
}

func (s *Store) ReadWork(ctx context.Context, owner, id string) (PreparedWork, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err := s.authorize(ctx, s.pool, owner); err != nil {
		return PreparedWork{}, err
	}
	var allowed bool
	err := s.pool.QueryRow(ctx, "SELECT can_read FROM "+s.table("m03_access")+" WHERE owner_id=$1", owner).Scan(&allowed)
	if err != nil || !allowed {
		return PreparedWork{}, ErrReadDenied
	}
	w, _, err := s.readWork(ctx, s.pool, "work_id", id, owner, false)
	if err == nil {
		err = s.currentRead(ctx, owner)
	}
	return w, err
}

// ClaimWork may reclaim only an expired attempt, while the finite work lifetime
// and all original admission fences still hold. The old token never revives.
func (s *Store) ClaimWork(ctx context.Context, owner, id string, duration time.Duration) (WorkLease, error) {
	var lease WorkLease
	if duration < time.Millisecond || duration > MaxWorkLease {
		return lease, ErrWorkStale
	}
	w, err := s.ReadWork(ctx, owner, id)
	if err != nil {
		return lease, err
	}
	loaded, err := s.Load(ctx, owner, w.Request.GameID)
	if err != nil {
		return lease, err
	}
	if err = s.validateWorkInput(loaded, w.Request); err != nil {
		return lease, err
	}
	token, err := freshID()
	if err != nil {
		return lease, err
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.checkWorkOrigin(ctx, tx, w.Request, loaded.Document.Metadata.Pin); err != nil {
			return err
		}
		current, _, err := s.readWork(ctx, tx, "work_id", id, owner, true)
		if err != nil {
			return err
		}
		var now time.Time
		if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		if !now.Before(current.ExpiresAt) || current.Status == "completed" || current.Status == "rejected" || current.Status == "canceled" || current.Attempt >= maxRecordInteger {
			return ErrWorkStale
		}
		if current.Status == "running" && current.LeaseUntil != nil && now.Before(*current.LeaseUntil) {
			return ErrWorkBusy
		}
		if current.Status == "running" {
			if _, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work_attempts")+" SET status='rejected',finished_at=$3 WHERE work_id=$1 AND fence=$2 AND status='running'", id, current.Attempt, now); err != nil {
				return err
			}
		}
		until := now.Add(duration)
		if until.After(current.ExpiresAt) {
			until = current.ExpiresAt
		}
		fence := current.Attempt + 1
		_, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work")+" SET status='running',attempt=$2,lease_token=$3,lease_until=$4,updated_at=$5 WHERE work_id=$1", id, fence, token, until, now)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_work_attempts")+" (work_id,fence,lease_token,lease_until,status,started_at) VALUES($1,$2,$3,$4,'running',$5)", id, fence, token, until, now)
		lease = WorkLease{id, token, fence}
		return err
	})
	return lease, err
}

// RequeueWork is an explicit retry of unfinished work. It keeps its logical
// identity and all old attempts, grants a new bounded lifetime, and can never
// replace a completed/issued result. A live attempt must finish or expire first.
func (s *Store) RequeueWork(ctx context.Context, owner, id string, lifetime time.Duration) (PreparedWork, error) {
	var result PreparedWork
	if lifetime < time.Millisecond || lifetime > MaxWorkLifetime {
		return result, ErrWorkStale
	}
	w, err := s.ReadWork(ctx, owner, id)
	if err != nil {
		return result, err
	}
	loaded, err := s.Load(ctx, owner, w.Request.GameID)
	if err != nil {
		return result, err
	}
	if err = s.validateWorkInput(loaded, w.Request); err != nil {
		return result, err
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.checkWorkOrigin(ctx, tx, w.Request, loaded.Document.Metadata.Pin); err != nil {
			return err
		}
		current, _, err := s.readWork(ctx, tx, "work_id", id, owner, true)
		if err != nil {
			return err
		}
		var now time.Time
		if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		if current.Status == "completed" {
			return ErrWorkStale
		}
		if current.Status == "running" && now.Before(current.ExpiresAt) && current.LeaseUntil != nil && now.Before(*current.LeaseUntil) {
			return ErrWorkBusy
		}
		if current.Status == "queued" && now.Before(current.ExpiresAt) {
			result = current
			return nil
		}
		if current.Status == "running" {
			if _, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work_attempts")+" SET status='rejected',finished_at=$3 WHERE work_id=$1 AND fence=$2 AND status='running'", id, current.Attempt, now); err != nil {
				return err
			}
		}
		if _, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work")+" SET status='queued',lease_token=NULL,lease_until=NULL,expires_at=$2,updated_at=$3 WHERE work_id=$1", id, now.Add(lifetime), now); err != nil {
			return err
		}
		result, _, err = s.readWork(ctx, tx, "work_id", id, owner, false)
		return err
	})
	return result, err
}

func decisionMatchesWork(w PreparedWork, lease WorkLease, d DecisionRecord) bool {
	r := w.Request
	return d.OwnerID == r.Admission.OwnerID && d.GameID == r.GameID && d.Revision == r.Revision && d.Actor == r.Actor && d.WindowID == r.WindowID && d.Purpose == r.Purpose && d.InputDigest == r.InputDigest && reflect.DeepEqual(d.Policy, r.Policy) && d.Access == r.Admission && d.AttemptID == lease.WorkID && d.AttemptFence == lease.Fence
}

// PublishWork validates the actor/policy/input/candidate/result outside a DB
// transaction, then atomically issues immutable decision bytes and its receipt.
func (s *Store) PublishWork(ctx context.Context, owner string, lease WorkLease, d DecisionRecord) (DecisionRecord, error) {
	w, err := s.ReadWork(ctx, owner, lease.WorkID)
	if err != nil {
		return DecisionRecord{}, err
	}
	if w.Status == "completed" {
		return s.ReadPrepared(ctx, owner, w.ID)
	}
	if !decisionMatchesWork(w, lease, d) {
		return DecisionRecord{}, ErrWorkStale
	}
	loaded, err := s.Load(ctx, owner, w.Request.GameID)
	if err != nil {
		return DecisionRecord{}, err
	}
	if err = s.codec.ValidateDecision(loaded.Document, loaded.Snapshot, d); err != nil {
		return DecisionRecord{}, err
	}
	unit, err := s.codec.CurrentUnitID(loaded.Document, loaded.Snapshot)
	if err != nil {
		return DecisionRecord{}, err
	}
	if unit != d.Access.UnitID {
		return DecisionRecord{}, ErrAccess
	}
	raw, err := json.Marshal(d)
	if err != nil {
		return DecisionRecord{}, err
	}
	if len(raw) > MaxRecordBytes {
		return DecisionRecord{}, ErrStorage
	}
	var reused bool
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.checkWorkOrigin(ctx, tx, w.Request, loaded.Document.Metadata.Pin); err != nil {
			return err
		}
		current, token, err := s.readWork(ctx, tx, "work_id", w.ID, owner, true)
		if err != nil {
			return err
		}
		if current.Status == "completed" {
			reused = true
			return nil
		}
		var now time.Time
		if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		if current.Status != "running" || token != lease.Token || current.Attempt != lease.Fence || current.LeaseUntil == nil || !now.Before(*current.LeaseUntil) || !now.Before(current.ExpiresAt) {
			return ErrWorkStale
		}
		_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_decisions")+" (id,owner_id,game_id,revision,record) VALUES($1,$2,$3,$4,$5)", d.ID, d.OwnerID, d.GameID, d.Revision, raw)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work")+" SET status='completed',receipt_id=$2,decision_id=$3,updated_at=$4 WHERE work_id=$1", w.ID, d.ReceiptID, d.ID, now)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work_attempts")+" SET status='completed',finished_at=$3 WHERE work_id=$1 AND fence=$2 AND status='running'", w.ID, lease.Fence, now)
		return err
	})
	if err != nil {
		return DecisionRecord{}, err
	}
	if reused {
		return s.ReadPrepared(ctx, owner, w.ID)
	}
	return DecodeDecision(raw)
}

func (s *Store) ReadPrepared(ctx context.Context, owner, id string) (DecisionRecord, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err := s.authorize(ctx, s.pool, owner); err != nil {
		return DecisionRecord{}, err
	}
	var raw []byte
	var receipt, decision string
	err := s.pool.QueryRow(ctx, "SELECT d.record,w.receipt_id,w.decision_id FROM "+s.table("m03_work")+" w JOIN "+s.table("m03_decisions")+" d ON d.id=w.decision_id AND d.owner_id=w.owner_id AND d.game_id=w.game_id JOIN "+s.table("m03_access")+" a ON a.owner_id=w.owner_id WHERE w.work_id=$1 AND w.owner_id=$2 AND w.status='completed' AND a.can_read", id, owner).Scan(&raw, &receipt, &decision)
	if errors.Is(err, pgx.ErrNoRows) {
		return DecisionRecord{}, ErrReadDenied
	}
	if err != nil {
		return DecisionRecord{}, err
	}
	d, err := DecodeDecision(raw)
	if err != nil {
		return d, storageError(err)
	}
	if d.OwnerID != owner || d.ID != decision || d.ReceiptID != receipt {
		return d, ErrStorage
	}
	w, _, err := s.readWork(ctx, s.pool, "work_id", id, owner, false)
	if err != nil {
		return DecisionRecord{}, err
	}
	if w.Status != "completed" || w.ReceiptID != d.ReceiptID || w.DecisionID != d.ID || !decisionMatchesWork(w, WorkLease{WorkID: w.ID, Fence: w.Attempt}, d) {
		return DecisionRecord{}, ErrStorage
	}
	verified, err := s.ReadDecision(ctx, owner, decision)
	if err != nil {
		return DecisionRecord{}, err
	}
	if !SamePreparedBytes(d, verified) {
		return DecisionRecord{}, ErrStorage
	}
	if err = s.currentRead(ctx, owner); err != nil {
		return DecisionRecord{}, err
	}
	return verified, nil
}

func (s *Store) FinishWork(ctx context.Context, owner string, lease WorkLease, status string) error {
	if status != "canceled" && status != "rejected" {
		return fmt.Errorf("invalid terminal work state")
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		w, token, err := s.readWork(ctx, tx, "work_id", lease.WorkID, owner, true)
		if err != nil {
			return err
		}
		if (w.Status != "running" && w.Status != "queued") || w.Attempt != lease.Fence || token != lease.Token || w.Status == "queued" && lease.Token != "" {
			return ErrWorkStale
		}
		if _, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work")+" SET status=$2,updated_at=clock_timestamp() WHERE work_id=$1", lease.WorkID, status); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "UPDATE "+s.table("m03_work_attempts")+" SET status=$3,finished_at=clock_timestamp() WHERE work_id=$1 AND fence=$2 AND status='running'", lease.WorkID, lease.Fence, status)
		return err
	})
}

// SamePreparedBytes is useful for acceptance reconciliation: original analysis
// and advice must be compared as bytes, rather than reparsed and regenerated.
func SamePreparedBytes(a, b DecisionRecord) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return bytes.Equal(x, y)
}

// checkPreparedDecisionCommit is SQL-only and belongs inside the accepted
// command transaction after owner/game locks. Reconciliation happens before it.
func (s *Store) checkPreparedDecisionCommit(ctx context.Context, tx pgx.Tx, d DecisionRecord) error {
	var id string
	err := tx.QueryRow(ctx, "SELECT work_id FROM "+s.table("m03_work")+" WHERE decision_id=$1", d.ID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		if d.Purpose == "human-analysis" {
			return nil
		}
		return ErrWorkStale
	}
	if err != nil {
		return err
	}
	w, _, err := s.readWork(ctx, tx, "work_id", id, d.OwnerID, true)
	if err != nil {
		return err
	}
	if w.Status != "completed" || w.ReceiptID != d.ReceiptID || w.DecisionID != d.ID || !decisionMatchesWork(w, WorkLease{WorkID: id, Fence: w.Attempt}, d) {
		return ErrWorkStale
	}
	var valid bool
	if err = tx.QueryRow(ctx, "SELECT expires_at>clock_timestamp() FROM "+s.table("m03_work")+" WHERE work_id=$1", id).Scan(&valid); err != nil {
		return err
	}
	if !valid {
		return ErrWorkStale
	}
	return nil
}
