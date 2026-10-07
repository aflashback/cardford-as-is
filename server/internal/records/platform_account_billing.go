package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"cardford/server/internal/contracts"
	"github.com/jackc/pgx/v5"
)

type PlatformAccountFailure struct {
	Status        int
	Code, Message string
}

func (e *PlatformAccountFailure) Error() string { return e.Code }
func accountFailure(status int, code, message string) error {
	return &PlatformAccountFailure{status, code, message}
}

type PlatformBillingRequest struct {
	Action string `json:"action"`
	Plan   string `json:"plan,omitempty"`
}
type PlatformBillingPreview struct {
	PreviewID    string  `json:"previewId"`
	Action       string  `json:"action"`
	Plan         string  `json:"plan"`
	EffectiveAt  string  `json:"effectiveAt"`
	ExpiresAt    string  `json:"expiresAt"`
	AmountDueNow *int64  `json:"amountDueNow"`
	Currency     *string `json:"currency"`
	Mode         string  `json:"mode"`
	Notice       string  `json:"notice"`
}
type PlatformBillingOperation struct {
	OperationID       string `json:"operationId"`
	Status            string `json:"status"`
	EffectiveAt       string `json:"effectiveAt"`
	Plan              string `json:"plan"`
	CancelAtPeriodEnd bool   `json:"cancelAtPeriodEnd"`
	Mode              string `json:"mode"`
	Message           string `json:"message"`
}

func requirePlatformFixture(p PlatformProfile) error {
	if p.Configured || p.Plan == nil || p.CurrentPeriodEnd == nil {
		return accountFailure(403, "FORBIDDEN", "This operation requires local fixture billing.")
	}
	return nil
}
func platformBillingFingerprint(p PlatformProfile) (string, error) {
	raw, err := json.Marshal(struct {
		Plan      *string    `json:"plan"`
		Cancel    bool       `json:"cancel"`
		End       *time.Time `json:"end"`
		Scheduled *string    `json:"scheduled"`
	}{p.Plan, p.CancelAtPeriodEnd, p.CurrentPeriodEnd, p.ScheduledPlan})
	if err != nil {
		return "", err
	}
	return JSONDigest(raw)
}
func billingRank(plan string) int {
	switch plan {
	case "practice":
		return 0
	case "unlimited":
		return 1
	case "family":
		return 2
	}
	return -1
}
func platformBillingPreview(p PlatformProfile, r PlatformBillingRequest, id string, now time.Time) (PlatformBillingPreview, error) {
	if err := requirePlatformFixture(p); err != nil {
		return PlatformBillingPreview{}, err
	}
	if r.Action != "select-plan" && r.Action != "cancel" && r.Action != "resume" || r.Action == "select-plan" && !platformPlan(r.Plan) {
		return PlatformBillingPreview{}, ErrStorage
	}
	plan := *p.Plan
	if r.Action == "select-plan" {
		plan = r.Plan
	}
	effective := now
	if r.Action == "cancel" || r.Action == "select-plan" && billingRank(plan) < billingRank(*p.Plan) && now.Before(*p.CurrentPeriodEnd) {
		effective = *p.CurrentPeriodEnd
	}
	return PlatformBillingPreview{PreviewID: id, Action: r.Action, Plan: plan, EffectiveAt: effective.UTC().Format(time.RFC3339Nano), ExpiresAt: now.Add(10 * time.Minute).UTC().Format(time.RFC3339Nano), Mode: "fixture", Notice: "Local billing simulation. No payment is collected. Prices and currency are not approved."}, nil
}
func (s *Store) PreviewPlatformBilling(ctx context.Context, r PlatformBillingRequest) (PlatformBillingPreview, error) {
	var out PlatformBillingPreview
	p, err := principalFrom(ctx)
	if err != nil {
		return out, err
	}
	id, err := freshID()
	if err != nil {
		return out, err
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		profile, e := s.platformProfileTx(ctx, tx, p.OwnerID, true)
		if e != nil {
			return e
		}
		var now time.Time
		if e = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); e != nil {
			return e
		}
		out, e = platformBillingPreview(profile, r, id, now)
		if e != nil {
			return e
		}
		fingerprint, e := platformBillingFingerprint(profile)
		if e != nil {
			return e
		}
		raw, e := json.Marshal(out)
		if e != nil {
			return e
		}
		if contracts.Validate("BillingPreview", raw) != nil {
			return ErrStorage
		}
		_, e = tx.Exec(ctx, "INSERT INTO "+s.table("m04_billing_previews")+"(preview_id,owner_id,view,profile_fingerprint,expires_at) VALUES($1,$2,$3,$4,$5)", id, p.OwnerID, raw, fingerprint, now.Add(10*time.Minute))
		return e
	})
	return out, err
}
func applyPlatformBilling(p PlatformProfile, v PlatformBillingPreview, id string, now time.Time) (PlatformProfile, PlatformBillingOperation, error) {
	if err := requirePlatformFixture(p); err != nil {
		return p, PlatformBillingOperation{}, err
	}
	effective, err := time.Parse(time.RFC3339Nano, v.EffectiveAt)
	if err != nil || !platformPlan(v.Plan) {
		return p, PlatformBillingOperation{}, ErrStorage
	}
	scheduled := v.Action == "select-plan" && billingRank(v.Plan) < billingRank(*p.Plan) && now.Before(effective)
	if v.Action == "select-plan" {
		if scheduled {
			p.ScheduledPlan = &v.Plan
		} else {
			p.Plan = &v.Plan
			p.ScheduledPlan = nil
			p.CancelAtPeriodEnd = false
			if !now.Before(*p.CurrentPeriodEnd) {
				end := now.Add(30 * 24 * time.Hour)
				p.CurrentPeriodEnd = &end
			}
		}
	} else if v.Action == "cancel" || v.Action == "resume" {
		p.CancelAtPeriodEnd = v.Action == "cancel"
	} else {
		return p, PlatformBillingOperation{}, ErrStorage
	}
	status, message := "confirmed", "Local subscription simulation updated. No payment taken."
	if scheduled {
		status = "scheduled"
		message = "Local plan change scheduled at the current period end. No payment taken."
	}
	return p, PlatformBillingOperation{id, status, v.EffectiveAt, v.Plan, p.CancelAtPeriodEnd, "fixture", message}, nil
}
func (s *Store) ConfirmPlatformBilling(ctx context.Context, previewID string) (AcceptedOutcome, error) {
	var out AcceptedOutcome
	p, err := principalFrom(ctx)
	if err != nil {
		return out, err
	}
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok {
		return out, ErrCommandDigest
	}
	id, err := freshID()
	if err != nil {
		return out, err
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if e := s.LockPlatformFamilyErasureTx(ctx, tx, p.OwnerID); e != nil {
			return e
		}
		prior, e := s.reconcileServiceTx(ctx, tx, p.OwnerID, c.ID, c.Digest)
		if e == nil {
			out = prior
			return nil
		}
		if !errors.Is(e, ErrConflict) {
			return e
		}
		profile, e := s.platformProfileTx(ctx, tx, p.OwnerID, true)
		if e != nil {
			return e
		}
		if e = requirePlatformFixture(profile); e != nil {
			return e
		}
		var raw []byte
		var fingerprint string
		var valid bool
		var now time.Time
		e = tx.QueryRow(ctx, "SELECT CASE WHEN octet_length(view)<=65536 THEN view ELSE NULL END,profile_fingerprint,expires_at>clock_timestamp() AND used_at IS NULL,clock_timestamp() FROM "+s.table("m04_billing_previews")+" WHERE preview_id=$1 AND owner_id=$2 FOR UPDATE", previewID, p.OwnerID).Scan(&raw, &fingerprint, &valid, &now)
		current, e2 := platformBillingFingerprint(profile)
		if errors.Is(e, pgx.ErrNoRows) || e == nil && (!valid || fingerprint != current) {
			return accountFailure(409, "INVALID_COMMAND", "This preview has expired or the subscription changed. Request another preview.")
		}
		if e != nil {
			return e
		}
		if e2 != nil {
			return e2
		}
		var preview PlatformBillingPreview
		if strictRecord(raw, &preview) != nil || contracts.Validate("BillingPreview", raw) != nil {
			return ErrStorage
		}
		next, operation, e := applyPlatformBilling(profile, preview, id, now)
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "UPDATE "+s.table("m04_profiles")+" SET plan=$2,current_period_end=$3,cancel_at_period_end=$4,scheduled_plan=$5 WHERE owner_id=$1", p.OwnerID, next.Plan, next.CurrentPeriodEnd, next.CancelAtPeriodEnd, next.ScheduledPlan); e != nil {
			return e
		}
		if e = s.bumpAccess(ctx, tx, p.OwnerID); e != nil {
			return e
		}
		if e = s.platformFamilyFenceMembersTx(ctx, tx, p.OwnerID); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "UPDATE "+s.table("m04_billing_previews")+" SET used_at=clock_timestamp() WHERE preview_id=$1", previewID); e != nil {
			return e
		}
		receipt, e := json.Marshal(operation)
		if e != nil {
			return e
		}
		out = AcceptedOutcome{ReceiptSchema: "BillingOperation", Receipt: receipt}
		return s.saveServiceTx(ctx, tx, p.OwnerID, out)
	})
	return out, err
}
