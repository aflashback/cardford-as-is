package records

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

func configuredFreeID(owner string, g Grant) string {
	raw, _ := json.Marshal([]string{owner, g.OfferID, g.Terms.Game, g.Terms.Variant})
	return "free-" + tokenHash(string(raw))
}

// EnsureConfiguredFreeGrants applies newly configured offers/targets to an
// existing identity. Original terms (including revoked grants) take precedence
// across versions; reloading or editing an offer never replaces that history.
func (s *Store) EnsureConfiguredFreeGrants(ctx context.Context, templates []Grant) error {
	p, err := principalFrom(ctx)
	if err != nil {
		return err
	}
	if len(templates) > 64 {
		return ErrAccess
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var configured, read bool
		if err := tx.QueryRow(ctx, "SELECT configured_offers,can_read FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", p.OwnerID).Scan(&configured, &read); err != nil {
			return err
		}
		if err := s.authorize(ctx, tx, p.OwnerID); err != nil {
			return err
		}
		if !configured || !read {
			return ErrAccess
		}
		var now time.Time
		if err := tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		changed := false
		// Most calls issue nothing. Read all existing free targets once rather
		// than making a query per configured target while holding the owner lock.
		rows, err := tx.Query(ctx, "SELECT grant_id,owner_id,offer_id,offer_version,source_kind,source_id,CASE WHEN octet_length(terms)<=65536 THEN terms ELSE NULL END,valid_from,valid_until,revoked,game,variant,bucket_id FROM "+s.table("m03_grants")+" WHERE owner_id=$1 AND source_kind='free' LIMIT 4097", p.OwnerID)
		if err != nil {
			return err
		}
		existing := map[string]GrantTerms{}
		for rows.Next() {
			g, err := scanGrant(rows)
			if err != nil {
				rows.Close()
				return err
			}
			raw, _ := json.Marshal([]string{g.OfferID, g.Terms.Game, g.Terms.Variant})
			existing[string(raw)] = g.Terms
			if len(existing) > 4096 {
				rows.Close()
				return ErrStorage
			}
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		for _, template := range templates {
			g := template
			if g.SourceKind != "free" || g.Revoked {
				return ErrAccess
			}
			g.OwnerID, g.SourceID = p.OwnerID, p.OwnerID
			g.ID = configuredFreeID(p.OwnerID, g)
			if g.ValidFrom.IsZero() {
				g.ValidFrom = now
			}
			g = normalizeGrant(g)
			if err := validateGrant(g); err != nil {
				return err
			}
			key, _ := json.Marshal([]string{g.OfferID, g.Terms.Game, g.Terms.Variant})
			if original, ok := existing[string(key)]; ok {
				if original.BucketID != g.Terms.BucketID || original.Period != g.Terms.Period || original.Timezone != g.Terms.Timezone {
					return ErrAllowance
				}
				continue
			}
			if err = s.checkBucketTerms(ctx, tx, g); err != nil {
				return err
			}
			raw, err := json.Marshal(g.Terms)
			if err != nil {
				return err
			}
			if err = s.insertGrant(ctx, tx, g, raw); err != nil {
				return err
			}
			changed = true
			existing[string(key)] = g.Terms
		}
		if changed {
			return s.bumpAccess(ctx, tx, p.OwnerID)
		}
		return nil
	})
}
