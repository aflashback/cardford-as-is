package records

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"time"
)

// EnsureLocalTrixGrants only extends an authenticated local fixture identity.
// It never replaces terms, revives a revoked grant, changes access flags, or
// issues any grant to a configured-offer account.
func (s *Store) EnsureLocalTrixGrants(ctx context.Context, owner string) error {
	p, err := principalFrom(ctx)
	if err != nil || p.OwnerID != owner {
		return ErrUnauthenticated
	}
	if p.Configured {
		return nil
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.authorize(ctx, tx, owner); err != nil {
			return err
		}
		var configured, read, play, coach bool
		if err := tx.QueryRow(ctx, "SELECT configured_offers,can_read,can_play,can_coach FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&configured, &read, &play, &coach); err != nil {
			return err
		}
		if configured || !read || !play || !coach {
			return nil
		}
		var fixture bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_grants")+" WHERE owner_id=$1 AND offer_id='local-fixture' AND source_kind='free' AND source_id=$1 AND NOT revoked)", owner).Scan(&fixture); err != nil {
			return err
		}
		if !fixture {
			return nil
		}
		var now time.Time
		if err := tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		for _, variant := range []string{"basic-solo", "basic-partners", "complex-solo", "complex-partners"} {
			terms := GrantTerms{Version: "1.0.0", Game: "trix", Variant: variant, CanPlay: true, CanCoach: true, Tools: []string{"advice", "review-alternative"}, BucketID: "local-fixture", Period: "lifetime", Timezone: "UTC", Unlimited: true, ExpiryRule: "pause-at-expiry"}
			raw, err := json.Marshal(terms)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_grants")+" (grant_id,owner_id,offer_id,offer_version,game,variant,bucket_id,terms,valid_from,valid_until,revoked,source_kind,source_id) VALUES ($1,$2,'local-fixture','1.0.0','trix',$3,'local-fixture',$4,$5,NULL,false,'free',$2) ON CONFLICT (grant_id) DO NOTHING", LocalGrantID(owner, "trix", variant), owner, variant, raw, now)
			if err != nil {
				return err
			}
		}
		return nil
	})
}
