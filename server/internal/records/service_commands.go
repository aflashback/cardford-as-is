package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type ServiceCommand struct{ ID, Digest, Kind string }
type serviceCommandKey struct{}

func WithServiceCommand(ctx context.Context, command ServiceCommand) context.Context {
	return context.WithValue(ctx, serviceCommandKey{}, command)
}
func serviceCommandFrom(ctx context.Context) (ServiceCommand, bool, error) {
	c, ok := ctx.Value(serviceCommandKey{}).(ServiceCommand)
	if ok && (!recordID(c.ID) || !validDigest(c.Digest) || !recordID(c.Kind)) {
		return c, true, ErrCommandDigest
	}
	return c, ok, nil
}
func (s *Store) reconcileServiceTx(ctx context.Context, tx pgx.Tx, owner, id, digest string) (AcceptedOutcome, error) {
	if !recordID(id) || !validDigest(digest) {
		return AcceptedOutcome{}, ErrCommandDigest
	}
	var read bool
	if err := tx.QueryRow(ctx, "SELECT can_read FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&read); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AcceptedOutcome{}, ErrReadDenied
		}
		return AcceptedOutcome{}, err
	}
	if err := s.authorize(ctx, tx, owner); err != nil {
		return AcceptedOutcome{}, err
	}
	if !read {
		return AcceptedOutcome{}, ErrReadDenied
	}
	var out AcceptedOutcome
	var saved string
	err := tx.QueryRow(ctx, "SELECT digest,game_id,revision,receipt_schema,CASE WHEN octet_length(receipt)<=$3 THEN receipt ELSE NULL END FROM "+s.table("m04_service_commands")+" WHERE owner_id=$1 AND command_id=$2", owner, id, MaxRecordBytes).Scan(&saved, &out.GameID, &out.Revision, &out.ReceiptSchema, &out.Receipt)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrConflict
	}
	if err != nil {
		return out, err
	}
	if saved != digest {
		return out, ErrCommandDigest
	}
	out.Reconciled = true
	return out, nil
}
func (s *Store) ReconcileService(ctx context.Context, id, digest string) (AcceptedOutcome, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	var out AcceptedOutcome
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var e error
		out, e = s.reconcileServiceTx(ctx, tx, p.OwnerID, id, digest)
		return e
	})
	if err == nil {
		err = validateServiceOutcome(out)
	}
	return out, err
}
func validateServiceOutcome(out AcceptedOutcome) error {
	// Taking control before the first game has an empty game identity.
	copy := out
	if copy.GameID == "" {
		copy.GameID = "bootstrap"
	}
	return validateOutcome(copy)
}
func (s *Store) saveServiceTx(ctx context.Context, tx pgx.Tx, owner string, out AcceptedOutcome) error {
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil {
		return err
	}
	if !ok {
		if s.localService {
			return ErrCommandDigest
		}
		return nil
	}
	if err := validateServiceOutcome(out); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m04_service_commands")+"(owner_id,command_id,digest,kind,game_id,revision,receipt_schema,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", owner, c.ID, c.Digest, c.Kind, out.GameID, out.Revision, out.ReceiptSchema, out.Receipt)
	return err
}

const ControlLifetime = 30 * time.Minute

type ControlRequest struct {
	ExpectedGameID                              string
	ExpectedRevision, ExpectedControlGeneration int64
	TabID                                       string
}
type ControlLease struct {
	Token             string `json:"controlLeaseToken"`
	ExpiresAt         string `json:"expiresAt"`
	AccessGeneration  int64  `json:"accessGeneration"`
	ControlGeneration int64  `json:"controlGeneration"`
}

func (s *Store) AcquireControl(ctx context.Context, r ControlRequest) (ControlLease, error) {
	var result ControlLease
	p, err := principalFrom(ctx)
	if err != nil {
		return result, err
	}
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil {
		return result, err
	}
	if !ok || !recordID(r.TabID) {
		return result, ErrCommandDigest
	}
	token, err := freshID()
	if err != nil {
		return result, err
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		original, e := s.reconcileServiceTx(ctx, tx, p.OwnerID, c.ID, c.Digest)
		if e == nil {
			if original.ReceiptSchema != "LocalControlView" {
				return ErrCommandDigest
			}
			return json.Unmarshal(original.Receipt, &result)
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		var active string
		var generation, control int64
		if e = tx.QueryRow(ctx, "SELECT COALESCE(active_game_id,''),generation,control_generation FROM "+s.table("m03_access")+" WHERE owner_id=$1", p.OwnerID).Scan(&active, &generation, &control); e != nil {
			return e
		}
		if active != r.ExpectedGameID || control != r.ExpectedControlGeneration || generation >= maxRecordInteger || control >= maxRecordInteger {
			return ErrConflict
		}
		if active != "" {
			var revision int64
			if e = tx.QueryRow(ctx, "SELECT revision FROM "+s.table("m03_games")+" WHERE game_id=$1 AND owner_id=$2", active, p.OwnerID).Scan(&revision); e != nil {
				return e
			}
			if revision != r.ExpectedRevision {
				return ErrConflict
			}
		} else if r.ExpectedRevision != 0 {
			return ErrConflict
		}
		var expires time.Time
		if e = tx.QueryRow(ctx, "SELECT clock_timestamp()+$1*interval '1 millisecond'", ControlLifetime.Milliseconds()).Scan(&expires); e != nil {
			return e
		}
		if e = s.installControlTx(ctx, tx, p, r.TabID, token, expires); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "UPDATE "+s.table("m03_access")+" SET generation=generation+1,control_generation=control_generation+1 WHERE owner_id=$1", p.OwnerID); e != nil {
			return e
		}
		result = ControlLease{token, expires.UTC().Format(time.RFC3339Nano), generation + 1, control + 1}
		raw, e := json.Marshal(result)
		if e != nil {
			return e
		}
		return s.saveServiceTx(ctx, tx, p.OwnerID, AcceptedOutcome{GameID: active, Revision: r.ExpectedRevision, ReceiptSchema: "LocalControlView", Receipt: raw})
	})
	return result, err
}
func (s *Store) installControlTx(ctx context.Context, tx pgx.Tx, p Principal, tab, token string, expires time.Time) error {
	if !recordID(tab) || len(token) < 32 || len(token) > 256 {
		return ErrControl
	}
	_, err := tx.Exec(ctx, "INSERT INTO "+s.table("m04_controls")+"(owner_id,session_hash,tab_id,lease_hash,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id) DO UPDATE SET session_hash=EXCLUDED.session_hash,tab_id=EXCLUDED.tab_id,lease_hash=EXCLUDED.lease_hash,expires_at=EXCLUDED.expires_at", p.OwnerID, p.sessionHash, tab, tokenHash(token), expires)
	return err
}
func (s *Store) ControlStatus(ctx context.Context, tab string) (bool, int64, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return false, 0, err
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err = s.authorize(ctx, s.pool, p.OwnerID); err != nil {
		return false, 0, err
	}
	var owned bool
	var generation int64
	err = s.pool.QueryRow(ctx, "SELECT a.control_generation,EXISTS(SELECT 1 FROM "+s.table("m04_controls")+" c WHERE c.owner_id=a.owner_id AND c.session_hash=$2 AND c.tab_id=$3 AND c.expires_at>clock_timestamp()) FROM "+s.table("m03_access")+" a WHERE a.owner_id=$1", p.OwnerID, p.sessionHash, tab).Scan(&generation, &owned)
	return owned, generation, err
}

// CreateTransition retains the original opening material and exact response.
// Its public command identity comes from WithServiceCommand.
type CreateTransition struct {
	Document               Document
	Anchor                 ReplayAnchor
	Events                 []EventRecord
	Admission              AccessAdmission
	ExpectedActiveGameID   string
	ExpectedRevision       *int64
	NewControlToken, TabID string
	ReceiptSchema          string
	Receipt                []byte
}
type createAcceptedKey struct{}
type createAcceptedState struct {
	request CreateTransition
	outcome AcceptedOutcome
}

func (s *Store) CreateAccepted(ctx context.Context, r CreateTransition) (AcceptedOutcome, error) {
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if !ok {
		return AcceptedOutcome{}, ErrCommandDigest
	}
	original, err := s.ReconcileService(ctx, c.ID, c.Digest)
	if err == nil {
		return original, nil
	}
	if !errors.Is(err, ErrConflict) {
		return AcceptedOutcome{}, err
	}
	state := &createAcceptedState{request: r, outcome: AcceptedOutcome{GameID: r.Document.Metadata.GameID, Revision: 0, ReceiptSchema: r.ReceiptSchema, Receipt: bytes.Clone(r.Receipt)}}
	if err = validateServiceOutcome(state.outcome); err != nil {
		return AcceptedOutcome{}, err
	}
	ctx = context.WithValue(ctx, createAcceptedKey{}, state)
	err = s.Create(ctx, r.Document, r.Anchor, r.Events, r.Admission, "")
	return state.outcome, err
}
