package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type TrialActivation struct {
	OwnerID, TrialKey, GrantID string
	ActivatedAt, ExpiresAt     time.Time
}

// ActivateAccessTrial is once per server identity and stable trial key. An
// existing activation wins before new offer terms are considered. No device,
// policy version, or grant ID participates in that uniqueness constraint.
func (s *Store) ActivateAccessTrial(ctx context.Context, key string, g Grant, duration time.Duration) (TrialActivation, error) {
	var result TrialActivation
	if !recordID(key) || duration < time.Second || duration > 366*24*time.Hour || g.SourceKind != "access-trial" || g.Revoked {
		return result, ErrAccess
	}
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var generation int64
		if err := tx.QueryRow(ctx, "SELECT generation FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", g.OwnerID).Scan(&generation); err != nil {
			return err
		}
		err := tx.QueryRow(ctx, "SELECT owner_id,trial_key,grant_id,activated_at,expires_at FROM "+s.table("m03_access_trials")+" WHERE owner_id=$1 AND trial_key=$2", g.OwnerID, key).Scan(&result.OwnerID, &result.TrialKey, &result.GrantID, &result.ActivatedAt, &result.ExpiresAt)
		if err == nil {
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		var now time.Time
		if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		expires := now.Add(duration)
		g.ValidFrom = now
		g.ValidUntil = &expires
		g = normalizeGrant(g)
		if err = validateGrant(g); err != nil {
			return err
		}
		raw, _ := json.Marshal(g.Terms)
		if err = s.checkBucketTerms(ctx, tx, g); err != nil {
			return err
		}
		if err = s.insertGrant(ctx, tx, g, raw); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_access_trials")+" (owner_id,trial_key,grant_id,activated_at,expires_at) VALUES ($1,$2,$3,$4,$5)", g.OwnerID, key, g.ID, now, expires)
		if err != nil {
			return err
		}
		if err = s.bumpAccess(ctx, tx, g.OwnerID); err != nil {
			return err
		}
		result = TrialActivation{g.OwnerID, key, g.ID, now, expires}
		return nil
	})
	return result, err
}
