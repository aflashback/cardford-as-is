package records

import (
	"cardford/server/internal/contracts"
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
)

type PlatformHelpRequest struct {
	Source                 *Loaded
	ExpectedLiveRevision   int64
	Admission              AccessAdmission
	DecisionID, Kind, Tool string
	Level                  int
	Unlock                 bool
	Content                json.RawMessage
	ReceiptSchema          string
	Receipt                json.RawMessage
}

// ReadPlatformHelp rechecks the original grant's security revocation, while
// natural expiry does not erase help already delivered to this owner.
func (s *Store) ReadPlatformHelp(ctx context.Context, owner, game, decision, kind string, level int) (json.RawMessage, error) {
	if err := s.currentRead(ctx, owner); err != nil {
		return nil, err
	}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	var content []byte
	var grant string
	err := s.pool.QueryRow(bounded, "SELECT content,grant_id FROM "+s.table("m04_help_deliveries")+" WHERE owner_id=$1 AND game_id=$2 AND decision_id=$3 AND kind=$4 AND level=$5", owner, game, decision, kind, level).Scan(&content, &grant)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	if len(content) > MaxRecordBytes {
		return nil, ErrStorage
	}
	if err = s.checkSavedGrant(ctx, owner, grant); err != nil {
		return nil, err
	}
	return content, s.currentRead(ctx, owner)
}

func (s *Store) platformHelpFence(ctx context.Context, tx pgx.Tx, r PlatformHelpRequest) (Grant, error) {
	var empty Grant
	if r.Source == nil || r.Source.Document.Metadata.OwnerID != r.Admission.OwnerID || r.Source.Document.Revision > r.ExpectedLiveRevision {
		return empty, ErrStorage
	}
	sourceUnit, err := s.codec.CurrentUnitID(r.Source.Document, r.Source.Snapshot)
	if err != nil || sourceUnit != r.Admission.UnitID {
		return empty, ErrAccess
	}
	game := r.Source.Document.Metadata.GameID
	if err = s.checkCommitAccess(ctx, tx, r.Admission, game, true); err != nil {
		return empty, err
	}
	var live int64
	if err = tx.QueryRow(ctx, "SELECT revision FROM "+s.table("m03_games")+" WHERE owner_id=$1 AND game_id=$2 FOR UPDATE", r.Admission.OwnerID, game).Scan(&live); err != nil {
		return empty, err
	}
	if live != r.ExpectedLiveRevision {
		return empty, ErrConflict
	}
	pin := r.Source.Document.Metadata.Pin
	g, now, err := s.checkGrant(ctx, tx, r.Admission, game, pin.GameID, pin.VariantID, true)
	if err != nil {
		return empty, err
	}
	if !grantHasTool(g, r.Tool) {
		return empty, ErrAccess
	}
	u, err := s.readUnlock(ctx, tx, r.Admission.OwnerID, game, sourceUnit)
	if err == nil {
		if u.Revoked || u.GrantID != g.ID {
			return empty, ErrAccess
		}
		return g, nil
	}
	if !errors.Is(err, ErrConflict) {
		return empty, err
	}
	if !r.Unlock {
		return empty, ErrAccess
	}
	command, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok {
		return empty, ErrCommandDigest
	}
	period := "lifetime"
	if g.Terms.Period == "day" {
		period = now.UTC().Format("2006-01-02")
	}
	charge := AllowanceCharge{Admission: r.Admission, BucketID: g.Terms.BucketID, PeriodKey: period, OfferID: g.OfferID, OfferVersion: g.OfferVersion, Units: 1}
	if err = s.chargeAllowance(ctx, tx, r.Admission.OwnerID, command.ID, game, pin.GameID, pin.VariantID, charge); err != nil {
		return empty, err
	}
	_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_unit_admissions")+"(owner_id,game_id,unit_id,grant_id,access_generation,admitted_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", g.OwnerID, game, sourceUnit, g.ID, r.Admission.Generation, now, g.ValidUntil)
	return g, err
}

// PublishPlatformHelp atomically validates source-unit coverage, the live
// control/revision fence, optional original quota reservation, and help bytes.
func (s *Store) PublishPlatformHelp(ctx context.Context, r PlatformHelpRequest) (AcceptedOutcome, error) {
	if r.Source == nil {
		return AcceptedOutcome{}, ErrStorage
	}
	out := AcceptedOutcome{GameID: r.Source.Document.Metadata.GameID, Revision: r.ExpectedLiveRevision, ReceiptSchema: r.ReceiptSchema, Receipt: r.Receipt}
	if r.Level < 1 || r.Level > 3 || (r.Kind != "advice" && r.Kind != "notes" && r.Kind != "trial") || !json.Valid(r.Content) || len(r.Content) > MaxRecordBytes {
		return out, ErrStorage
	}
	if err := contracts.Validate(r.ReceiptSchema, r.Receipt); err != nil {
		return out, err
	}
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok {
		return out, ErrCommandDigest
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		prior, e := s.reconcileServiceTx(ctx, tx, r.Admission.OwnerID, c.ID, c.Digest)
		if e == nil {
			if e = s.platformHelpReadableTx(ctx, tx, r.Admission.OwnerID, out.GameID, r.DecisionID, r.Kind, r.Level); e != nil {
				return e
			}
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		g, e := s.platformHelpFence(ctx, tx, r)
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("m04_help_deliveries")+"(owner_id,game_id,decision_id,source_revision,live_revision,kind,level,grant_id,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING", r.Admission.OwnerID, out.GameID, r.DecisionID, r.Source.Document.Revision, r.ExpectedLiveRevision, r.Kind, r.Level, g.ID, []byte(r.Content)); e != nil {
			return e
		}
		return s.saveServiceTx(ctx, tx, r.Admission.OwnerID, out)
	})
	return out, err
}

// ReissuePlatformHelp binds a new receipt to the original delivered bytes after
// security authorization, without requiring coverage or a still-current turn.
func (s *Store) ReissuePlatformHelp(ctx context.Context, owner, game, decision, kind string, level int, schema string, receipt json.RawMessage) (AcceptedOutcome, error) {
	out := AcceptedOutcome{GameID: game, ReceiptSchema: schema, Receipt: receipt}
	revision, err := ParsePlatformDecisionID(game, decision)
	if err != nil {
		return out, err
	}
	out.Revision = revision
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok {
		return out, ErrCommandDigest
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		prior, e := s.reconcileServiceTx(ctx, tx, owner, c.ID, c.Digest)
		if e == nil {
			if e = s.platformHelpReadableTx(ctx, tx, owner, game, decision, kind, level); e != nil {
				return e
			}
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		if e = s.platformHelpReadableTx(ctx, tx, owner, game, decision, kind, level); e != nil {
			return e
		}
		return s.saveServiceTx(ctx, tx, owner, out)
	})
	return out, err
}

// Reconciliation owns the owner lock before this grant lock. Recheck the
// original delivery's security even when another request published the same
// receipt after the caller's initial miss. Natural expiry remains readable.
func (s *Store) platformHelpReadableTx(ctx context.Context, tx pgx.Tx, owner, game, decision, kind string, level int) error {
	var revoked bool
	err := tx.QueryRow(ctx, "SELECT g.revoked FROM "+s.table("m04_help_deliveries")+" h JOIN "+s.table("m03_grants")+" g ON g.grant_id=h.grant_id AND g.owner_id=h.owner_id WHERE h.owner_id=$1 AND h.game_id=$2 AND h.decision_id=$3 AND h.kind=$4 AND h.level=$5 FOR SHARE OF g", owner, game, decision, kind, level).Scan(&revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrReadDenied
	}
	if err != nil {
		return err
	}
	if revoked {
		return ErrAccess
	}
	return nil
}
