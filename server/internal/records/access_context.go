package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type UnitAdmission struct {
	OwnerID, GameID, UnitID, GrantID string
	Generation                       int64
	AdmittedAt                       time.Time
	ExpiresAt                        *time.Time
}
type BucketUsage struct {
	OwnerID, BucketID, PeriodKey string
	Used                         int64
}
type CoachingUnlock struct {
	OwnerID, GameID, UnitID, GrantID                      string
	BucketID, PeriodKey, OfferID, OfferVersion, CommandID string
	Tools                                                 []string
	UnlockedAt                                            time.Time
	Revoked                                               bool
}
type AccessContext struct {
	Access     AccessState
	Configured bool
	Now        time.Time
	Grants     []Grant
	Admissions []UnitAdmission
	Usage      []BucketUsage
	Unlocks    []CoachingUnlock
}

// ReadAccessContext reads one authoritative, consistent permission snapshot.
// Session/unit selectors filter stored context; they cannot establish admission.
func (s *Store) ReadAccessContext(ctx context.Context, owner, gameID, unitID string) (AccessContext, error) {
	var out AccessContext
	if !recordID(owner) || gameID != "" && !recordID(gameID) || unitID != "" && !recordID(unitID) {
		return out, ErrAccess
	}
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.authorize(ctx, tx, owner); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, "SELECT owner_id,COALESCE(active_game_id,''),generation,control_generation,can_read,can_play,can_coach,configured_offers,clock_timestamp() FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&out.Access.OwnerID, &out.Access.ActiveGameID, &out.Access.Generation, &out.Access.ControlGeneration, &out.Access.CanRead, &out.Access.CanPlay, &out.Access.CanCoach, &out.Configured, &out.Now); err != nil {
			return err
		}
		if !out.Access.CanRead {
			return ErrReadDenied
		}
		rows, err := tx.Query(ctx, "SELECT grant_id,owner_id,offer_id,offer_version,source_kind,source_id,CASE WHEN octet_length(terms)<=65536 THEN terms ELSE NULL END,valid_from,valid_until,revoked,game,variant,bucket_id FROM "+s.table("m03_grants")+" WHERE owner_id=$1 ORDER BY grant_id LIMIT 4097", owner)
		if err != nil {
			return err
		}
		out.Grants = []Grant{}
		for rows.Next() {
			g, err := scanGrant(rows)
			if err != nil {
				rows.Close()
				return err
			}
			if len(out.Grants) >= 4096 {
				rows.Close()
				return ErrStorage
			}
			out.Grants = append(out.Grants, g)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		out.Admissions = []UnitAdmission{}
		rows, err = tx.Query(ctx, "SELECT owner_id,game_id,unit_id,grant_id,access_generation,admitted_at,expires_at FROM "+s.table("m03_unit_admissions")+" WHERE owner_id=$1 AND game_id=$2 AND unit_id=$3 ORDER BY admitted_at LIMIT 4097", owner, gameID, unitID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var a UnitAdmission
			if err = rows.Scan(&a.OwnerID, &a.GameID, &a.UnitID, &a.GrantID, &a.Generation, &a.AdmittedAt, &a.ExpiresAt); err != nil {
				rows.Close()
				return err
			}
			if len(out.Admissions) >= 4096 {
				rows.Close()
				return ErrStorage
			}
			out.Admissions = append(out.Admissions, a)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		out.Unlocks = []CoachingUnlock{}
		u, err := s.readUnlock(ctx, tx, owner, gameID, unitID)
		if err == nil {
			out.Unlocks = append(out.Unlocks, u)
		} else if !errors.Is(err, ErrConflict) {
			return err
		}
		out.Usage = []BucketUsage{}
		rows, err = tx.Query(ctx, "SELECT owner_id,bucket_id,period_key,used FROM "+s.table("m03_allowance")+" WHERE owner_id=$1 AND (period_key IN ('lifetime',$2) OR period_key=$3) ORDER BY bucket_id,period_key LIMIT 8193", owner, out.Now.UTC().Format("2006-01-02"), u.PeriodKey)
		if err != nil {
			return err
		}
		for rows.Next() {
			var v BucketUsage
			if err = rows.Scan(&v.OwnerID, &v.BucketID, &v.PeriodKey, &v.Used); err != nil {
				rows.Close()
				return err
			}
			if v.Used < 0 || v.Used > maxRecordInteger {
				rows.Close()
				return ErrStorage
			}
			if len(out.Usage) >= 8192 {
				rows.Close()
				return ErrStorage
			}
			out.Usage = append(out.Usage, v)
		}
		rows.Close()
		return rows.Err()
	})
	if err == nil {
		err = s.currentRead(ctx, owner)
	}
	return out, err
}

func (s *Store) readUnlock(ctx context.Context, q grantReader, owner, gameID, unitID string) (CoachingUnlock, error) {
	var u CoachingUnlock
	err := q.QueryRow(ctx, "SELECT owner_id,game_id,unit_id,grant_id,bucket_id,period_key,offer_id,offer_version,command_id,unlocked_at FROM "+s.table("m04_coaching_unlocks")+" WHERE owner_id=$1 AND game_id=$2 AND unit_id=$3", owner, gameID, unitID).Scan(&u.OwnerID, &u.GameID, &u.UnitID, &u.GrantID, &u.BucketID, &u.PeriodKey, &u.OfferID, &u.OfferVersion, &u.CommandID, &u.UnlockedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrConflict
	}
	if err != nil {
		return u, err
	}
	g, err := s.readGrant(ctx, q, u.GrantID, owner)
	if err != nil {
		return u, err
	}
	if g.OfferID != u.OfferID || g.OfferVersion != u.OfferVersion || g.Terms.BucketID != u.BucketID {
		return u, ErrStorage
	}
	u.Tools = append([]string{}, g.Terms.Tools...)
	u.Revoked = g.Revoked
	return u, nil
}

type SavedAccess struct {
	ID, OwnerID, GameID, UnitID, GrantID, Game, Variant string
	Delivered                                           bool
}

// ReadSavedAccess validates owned original result bytes and derives delivery
// from immutable exposures, independently of natural grant expiry.
func (s *Store) ReadSavedAccess(ctx context.Context, owner, id string) (SavedAccess, error) {
	d, err := s.ReadDecision(ctx, owner, id)
	if err != nil {
		return SavedAccess{}, err
	}
	// ReadDecision already replay-validates this original analysis against its
	// source pin. Extract that checked identity without loading the archive again.
	var target struct {
		GameID     string          `json:"gameId"`
		VariantID  string          `json:"variantId"`
		Registered json.RawMessage `json:"registered"`
	}
	if err = json.Unmarshal(d.Analysis, &target); err != nil {
		return SavedAccess{}, err
	}
	if len(target.Registered) > 0 {
		if err = json.Unmarshal(target.Registered, &target); err != nil {
			return SavedAccess{}, err
		}
	}
	if target.GameID == "" || target.VariantID == "" {
		return SavedAccess{}, ErrStorage
	}
	out := SavedAccess{ID: id, OwnerID: owner, GameID: d.GameID, UnitID: d.Access.UnitID, GrantID: d.Access.GrantID, Game: target.GameID, Variant: target.VariantID}
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	err = s.pool.QueryRow(bounded, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_exposures")+" WHERE owner_id=$1 AND decision_id=$2)", owner, id).Scan(&out.Delivered)
	if err == nil {
		err = s.checkSavedGrant(ctx, owner, d.Access.GrantID)
	}
	return out, err
}

func (s *Store) checkSavedGrant(ctx context.Context, owner, id string) error {
	g, err := s.ReadGrant(ctx, owner, id)
	if err != nil {
		return err
	}
	if g.Revoked {
		return ErrAccess
	}
	return nil
}
