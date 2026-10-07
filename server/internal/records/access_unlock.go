package records

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

type CoachingUnlockRequest struct {
	Admission        AccessAdmission
	GameID           string
	ExpectedRevision int64
	ToolID           string
	Charge           AllowanceCharge
}

type CoachingUnlockReceipt struct {
	CommandID string `json:"commandId"`
	GameID    string `json:"gameId"`
	Revision  int64  `json:"revision"`
	GrantID   string `json:"grantId"`
	BucketID  string `json:"bucketId"`
	PeriodKey string `json:"periodKey"`
	Offer     struct {
		ID      string `json:"id"`
		Version string `json:"version"`
	} `json:"offer"`
	Remaining *int64   `json:"remaining"`
	ToolIDs   []string `json:"toolIds"`
}

// UnlockCoaching publishes the allowance reservation and original receipt in
// one transaction. No provider or game-state work occurs while holding locks.
func (s *Store) UnlockCoaching(ctx context.Context, r CoachingUnlockRequest) (AcceptedOutcome, error) {
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
	if r.Charge.Admission != r.Admission || r.ExpectedRevision < 0 || !recordID(r.ToolID) {
		return AcceptedOutcome{}, ErrAccess
	}
	loaded, err := s.Load(ctx, r.Admission.OwnerID, r.GameID)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	unit, err := s.codec.CurrentUnitID(loaded.Document, loaded.Snapshot)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if unit != r.Admission.UnitID || loaded.Document.Revision != r.ExpectedRevision {
		return AcceptedOutcome{}, ErrConflict
	}
	out := AcceptedOutcome{GameID: r.GameID, Revision: r.ExpectedRevision, ReceiptSchema: "LocalServiceUnlockReceipt"}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		prior, e := s.reconcileServiceTx(ctx, tx, r.Admission.OwnerID, c.ID, c.Digest)
		if e == nil {
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		if e = s.checkCommitAccess(ctx, tx, r.Admission, r.GameID, true); e != nil {
			return e
		}
		var revision int64
		if e = tx.QueryRow(ctx, "SELECT revision FROM "+s.table("m03_games")+" WHERE game_id=$1 AND owner_id=$2 FOR UPDATE", r.GameID, r.Admission.OwnerID).Scan(&revision); e != nil {
			return e
		}
		if revision != r.ExpectedRevision {
			return ErrConflict
		}
		g, now, e := s.checkGrant(ctx, tx, r.Admission, r.GameID, loaded.Document.Metadata.Pin.GameID, loaded.Document.Metadata.Pin.VariantID, true)
		if e != nil {
			return e
		}
		if !grantHasTool(g, r.ToolID) {
			return ErrAccess
		}
		u, e := s.readUnlock(ctx, tx, r.Admission.OwnerID, r.GameID, r.Admission.UnitID)
		if e == nil {
			if u.Revoked || u.GrantID != g.ID {
				return ErrAccess
			}
		} else {
			if !errors.Is(e, ErrConflict) {
				return e
			}
			if e = s.chargeAllowance(ctx, tx, r.Admission.OwnerID, c.ID, r.GameID, g.Terms.Game, g.Terms.Variant, r.Charge); e != nil {
				return e
			}
			// The immutable coaching admission also supports a separate coach
			// grant's finish-admitted-unit rule after natural expiry.
			if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("m03_unit_admissions")+"(owner_id,game_id,unit_id,grant_id,access_generation,admitted_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", g.OwnerID, r.GameID, r.Admission.UnitID, g.ID, r.Admission.Generation, now, g.ValidUntil); e != nil {
				return e
			}
			u, e = s.readUnlock(ctx, tx, r.Admission.OwnerID, r.GameID, r.Admission.UnitID)
			if e != nil {
				return e
			}
		}
		receipt := CoachingUnlockReceipt{CommandID: c.ID, GameID: r.GameID, Revision: r.ExpectedRevision, GrantID: u.GrantID, BucketID: u.BucketID, PeriodKey: u.PeriodKey, ToolIDs: u.Tools}
		receipt.Offer.ID, receipt.Offer.Version = u.OfferID, u.OfferVersion
		if !g.Terms.Unlimited {
			var used int64
			if e = tx.QueryRow(ctx, "SELECT used FROM "+s.table("m03_allowance")+" WHERE owner_id=$1 AND bucket_id=$2 AND period_key=$3", r.Admission.OwnerID, u.BucketID, u.PeriodKey).Scan(&used); e != nil {
				return e
			}
			remaining := g.Terms.Limit - used
			if remaining < 0 {
				remaining = 0
			}
			receipt.Remaining = &remaining
		}
		out.Receipt, e = json.Marshal(receipt)
		if e != nil {
			return e
		}
		return s.saveServiceTx(ctx, tx, r.Admission.OwnerID, out)
	})
	return out, err
}

func grantHasTool(g Grant, tool string) bool {
	for _, v := range g.Terms.Tools {
		if v == tool {
			return true
		}
	}
	return false
}

func sameAdmissionBoundary(a, b AccessAdmission) bool {
	return a.OwnerID == b.OwnerID && a.Generation == b.Generation && a.ControlRevision == b.ControlRevision && a.UnitID == b.UnitID
}

// Only configured identities require a reservation before coached work. The
// fixture path remains explicitly separate for the preserved M04C acceptance.
func (s *Store) checkConfiguredUnlock(ctx context.Context, tx pgx.Tx, a AccessAdmission, gameID, tool string) error {
	var configured bool
	if err := tx.QueryRow(ctx, "SELECT configured_offers FROM "+s.table("m03_access")+" WHERE owner_id=$1", a.OwnerID).Scan(&configured); err != nil {
		return err
	}
	if !configured {
		return s.checkPlatformFixtureUnlockTx(ctx, tx, a, gameID, tool)
	}
	u, err := s.readUnlock(ctx, tx, a.OwnerID, gameID, a.UnitID)
	if err != nil {
		if errors.Is(err, ErrConflict) {
			return ErrAllowance
		}
		return err
	}
	if u.Revoked || u.GrantID != a.GrantID {
		return ErrAccess
	}
	for _, v := range u.Tools {
		if v == tool {
			return nil
		}
	}
	return ErrAccess
}
