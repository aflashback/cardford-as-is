package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type ConfiguredTrialReceipt struct {
	CommandID string `json:"commandId"`
	Offer     struct {
		ID      string `json:"id"`
		Version string `json:"version"`
	} `json:"offer"`
	AccessGeneration int64  `json:"accessGeneration"`
	ActivatedAt      string `json:"activatedAt"`
	ExpiresAt        string `json:"expiresAt"`
}

// ActivateConfiguredTrial issues every selected target atomically, once per
// identity across all offer IDs and versions. Commercial and replay trials are
// separate ledgers. A retry recovers its original receipt before checking CAS.
func (s *Store) ActivateConfiguredTrial(ctx context.Context, templates []Grant, duration time.Duration, expectedGeneration int64) (AcceptedOutcome, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	if !ok {
		return AcceptedOutcome{}, ErrCommandDigest
	}
	var out AcceptedOutcome
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		prior, e := s.reconcileServiceTx(ctx, tx, p.OwnerID, c.ID, c.Digest)
		if e == nil {
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		var generation int64
		var configured bool
		if e = tx.QueryRow(ctx, "SELECT generation,configured_offers FROM "+s.table("m03_access")+" WHERE owner_id=$1", p.OwnerID).Scan(&generation, &configured); e != nil {
			return e
		}
		if !configured || generation != expectedGeneration || generation >= maxRecordInteger {
			return ErrAccess
		}
		var activation TrialActivation
		e = tx.QueryRow(ctx, "SELECT owner_id,trial_key,grant_id,activated_at,expires_at FROM "+s.table("m03_access_trials")+" WHERE owner_id=$1 AND trial_key='access-trial'", p.OwnerID).Scan(&activation.OwnerID, &activation.TrialKey, &activation.GrantID, &activation.ActivatedAt, &activation.ExpiresAt)
		var original Grant
		if e == nil {
			original, e = s.readGrant(ctx, tx, activation.GrantID, p.OwnerID)
			if e != nil {
				return e
			}
			if original.Revoked {
				return ErrAccess
			}
		} else {
			if !errors.Is(e, pgx.ErrNoRows) {
				return e
			}
			if len(templates) == 0 || len(templates) > 16 || duration < time.Second || duration > 366*24*time.Hour {
				return ErrAccess
			}
			var now time.Time
			if e = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); e != nil {
				return e
			}
			expires := now.Add(duration)
			seen := map[string]bool{}
			for i, template := range templates {
				g := template
				if g.SourceKind != "access-trial" || g.Revoked || i > 0 && (g.OfferID != original.OfferID || g.OfferVersion != original.OfferVersion) {
					return ErrAccess
				}
				target := g.Terms.Game + "/" + g.Terms.Variant
				if seen[target] {
					return ErrAccess
				}
				seen[target] = true
				g.OwnerID, g.SourceID = p.OwnerID, p.OwnerID
				g.ID, e = freshID()
				if e != nil {
					return e
				}
				g.ValidFrom, g.ValidUntil = now, &expires
				g = normalizeGrant(g)
				if e = validateGrant(g); e != nil {
					return e
				}
				if e = s.checkBucketTerms(ctx, tx, g); e != nil {
					return e
				}
				raw, e := json.Marshal(g.Terms)
				if e != nil {
					return e
				}
				if e = s.insertGrant(ctx, tx, g, raw); e != nil {
					return e
				}
				if i == 0 {
					original = g
				}
			}
			activation = TrialActivation{OwnerID: p.OwnerID, TrialKey: "access-trial", GrantID: original.ID, ActivatedAt: original.ValidFrom, ExpiresAt: *original.ValidUntil}
			if _, e = tx.Exec(ctx, "INSERT INTO "+s.table("m03_access_trials")+"(owner_id,trial_key,grant_id,activated_at,expires_at) VALUES($1,$2,$3,$4,$5)", activation.OwnerID, activation.TrialKey, activation.GrantID, activation.ActivatedAt, activation.ExpiresAt); e != nil {
				return e
			}
			if e = s.bumpAccess(ctx, tx, p.OwnerID); e != nil {
				return e
			}
			generation++
		}
		receipt := ConfiguredTrialReceipt{CommandID: c.ID, AccessGeneration: generation, ActivatedAt: activation.ActivatedAt.UTC().Format(time.RFC3339Nano), ExpiresAt: activation.ExpiresAt.UTC().Format(time.RFC3339Nano)}
		receipt.Offer.ID, receipt.Offer.Version = original.OfferID, original.OfferVersion
		raw, e := json.Marshal(receipt)
		if e != nil {
			return e
		}
		out = AcceptedOutcome{ReceiptSchema: "LocalServiceTrialReceipt", Receipt: raw}
		return s.saveServiceTx(ctx, tx, p.OwnerID, out)
	})
	return out, err
}
