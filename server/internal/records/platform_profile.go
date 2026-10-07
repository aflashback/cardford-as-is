package records

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"cardford/server/internal/contracts"
	"github.com/jackc/pgx/v5"
)

type PlatformPreferences struct {
	CoachMode string  `json:"coachMode"`
	GameSpeed float64 `json:"gameSpeed"`
}
type PlatformPreferencesView struct {
	SchemaVersion string              `json:"schemaVersion"`
	Revision      int64               `json:"revision"`
	Preferences   PlatformPreferences `json:"preferences"`
}
type PlatformProfile struct {
	OwnerID, Version, DisplayName string
	PreferencesRevision           int64
	Preferences                   PlatformPreferences
	Plan, ScheduledPlan           *string
	CurrentPeriodEnd              *time.Time
	CancelAtPeriodEnd             bool
	Configured                    bool
}

func (p PlatformProfile) PreferenceView() PlatformPreferencesView {
	return PlatformPreferencesView{"1.0.0", p.PreferencesRevision, p.Preferences}
}

// Profile creation is lazy and owner-authorized. Configured identities receive
// preferences only; a fixture profile never installs grants in configured mode.
func (s *Store) platformProfileTx(ctx context.Context, tx pgx.Tx, owner string, create bool) (PlatformProfile, error) {
	var p PlatformProfile
	var read bool
	if err := tx.QueryRow(ctx, "SELECT configured_offers,can_read FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&p.Configured, &read); err != nil {
		return p, err
	}
	if err := s.authorize(ctx, tx, owner); err != nil {
		return p, err
	}
	if !read {
		return p, ErrReadDenied
	}
	if create {
		if _, err := tx.Exec(ctx, "INSERT INTO "+s.table("m04_profiles")+"(owner_id,plan,current_period_end) VALUES($1,CASE WHEN $2 THEN NULL ELSE 'unlimited' END,CASE WHEN $2 THEN NULL ELSE clock_timestamp()+interval '30 days' END) ON CONFLICT DO NOTHING", owner, p.Configured); err != nil {
			return p, err
		}
	}
	var raw []byte
	err := tx.QueryRow(ctx, "SELECT owner_id,profile_version,display_name,preferences_revision,preferences,plan,current_period_end,cancel_at_period_end,scheduled_plan FROM "+s.table("m04_profiles")+" WHERE owner_id=$1", owner).Scan(&p.OwnerID, &p.Version, &p.DisplayName, &p.PreferencesRevision, &raw, &p.Plan, &p.CurrentPeriodEnd, &p.CancelAtPeriodEnd, &p.ScheduledPlan)
	if err != nil {
		return p, err
	}
	// The public Preferences schema allows fractional speed enums. The private
	// record decoder deliberately supports integer fields only, so validate the
	// closed public schema before decoding these persisted preferences.
	if p.Version != "1.0.0" || p.PreferencesRevision < 0 || p.PreferencesRevision > maxRecordInteger || !recordID(p.DisplayName) || len(p.DisplayName) > 128 || contracts.Validate("Preferences", raw) != nil || json.Unmarshal(raw, &p.Preferences) != nil {
		return p, ErrStorage
	}
	if p.Configured && (p.Plan != nil || p.CurrentPeriodEnd != nil || p.ScheduledPlan != nil) {
		return p, ErrStorage
	}
	if !p.Configured && (p.Plan == nil || !platformPlan(*p.Plan) || p.CurrentPeriodEnd == nil || p.ScheduledPlan != nil && !platformPlan(*p.ScheduledPlan)) {
		return p, ErrStorage
	}
	if !p.Configured && p.ScheduledPlan != nil {
		var now time.Time
		if err := tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return p, err
		}
		if !now.Before(*p.CurrentPeriodEnd) {
			p.Plan = p.ScheduledPlan
			p.ScheduledPlan = nil
			if _, err := tx.Exec(ctx, "UPDATE "+s.table("m04_profiles")+" SET plan=$2,scheduled_plan=NULL WHERE owner_id=$1", owner, *p.Plan); err != nil {
				return p, err
			}
			if err := s.bumpAccess(ctx, tx, owner); err != nil {
				return p, err
			}
		}
	}
	return p, nil
}
func platformPlan(p string) bool { return p == "practice" || p == "unlimited" || p == "family" }
func (s *Store) GetPlatformProfile(ctx context.Context, owner string) (PlatformProfile, error) {
	var p PlatformProfile
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var e error
		p, e = s.platformProfileTx(ctx, tx, owner, true)
		return e
	})
	return p, err
}
func (s *Store) GetPlatformPreferences(ctx context.Context, owner string) (PlatformPreferencesView, error) {
	p, err := s.GetPlatformProfile(ctx, owner)
	return p.PreferenceView(), err
}
func (s *Store) UpdatePlatformPreferences(ctx context.Context, expected int64, prefs PlatformPreferences) (AcceptedOutcome, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return AcceptedOutcome{}, err
	}
	c, ok, err := serviceCommandFrom(ctx)
	if err != nil || !ok {
		return AcceptedOutcome{}, ErrCommandDigest
	}
	raw, err := json.Marshal(prefs)
	if err != nil || contracts.Validate("Preferences", raw) != nil || expected < 0 || expected >= maxRecordInteger {
		return AcceptedOutcome{}, ErrStorage
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
		profile, e := s.platformProfileTx(ctx, tx, p.OwnerID, true)
		if e != nil {
			return e
		}
		if profile.PreferencesRevision != expected {
			return ErrConflict
		}
		if _, e = tx.Exec(ctx, "UPDATE "+s.table("m04_profiles")+" SET preferences=$2,preferences_revision=preferences_revision+1 WHERE owner_id=$1", p.OwnerID, raw); e != nil {
			return e
		}
		view := PlatformPreferencesView{"1.0.0", expected + 1, prefs}
		receipt, e := json.Marshal(view)
		if e != nil {
			return e
		}
		out = AcceptedOutcome{ReceiptSchema: "PlatformPreferencesView", Receipt: receipt}
		return s.saveServiceTx(ctx, tx, p.OwnerID, out)
	})
	return out, err
}

type FixturePlatformAccess struct {
	Profile               PlatformProfile
	Plan                  string
	CurrentPeriodEnd      time.Time
	Covered, HandUnlocked bool
	Remaining             *int64
	ResetsAt              *time.Time
	Generation            int64
}

func (s *Store) fixturePlatformAccessTx(ctx context.Context, tx pgx.Tx, p PlatformProfile, game, unit string) (FixturePlatformAccess, error) {
	out := FixturePlatformAccess{Profile: p}
	if p.Configured || p.Plan == nil || p.CurrentPeriodEnd == nil {
		return out, ErrAccess
	}
	var now time.Time
	if err := tx.QueryRow(ctx, "SELECT generation,clock_timestamp() FROM "+s.table("m03_access")+" WHERE owner_id=$1", p.OwnerID).Scan(&out.Generation, &now); err != nil {
		return out, err
	}
	out.Plan = *p.Plan
	out.CurrentPeriodEnd = *p.CurrentPeriodEnd
	out.Covered = now.Before(*p.CurrentPeriodEnd)
	var familyPlan string
	var familyEnd time.Time
	err := tx.QueryRow(ctx, "SELECT CASE WHEN a.seat_class='limited' THEN 'practice' ELSE 'unlimited' END,LEAST(a.period_end,g.period_end,p.current_period_end) FROM "+s.table("m04_family_assignments")+" a JOIN "+s.table("m04_family_groups")+" g ON g.family_id=a.family_id JOIN "+s.table("m04_profiles")+" p ON p.owner_id=g.payer_id WHERE a.owner_id=$1 AND a.status='active' AND a.period_end>$2 AND g.period_end>$2 AND p.plan='family' AND p.current_period_end>$2 LIMIT 1", p.OwnerID, now).Scan(&familyPlan, &familyEnd)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}
	if err == nil && (!out.Covered || out.Plan == "practice" && familyPlan == "unlimited") {
		out.Plan = familyPlan
		out.CurrentPeriodEnd = familyEnd
		out.Covered = true
	}
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_coaching_unlocks")+" WHERE owner_id=$1 AND game_id=$2 AND unit_id=$3)", p.OwnerID, game, unit).Scan(&out.HandUnlocked); err != nil {
		return out, err
	}
	if out.Plan == "practice" {
		day := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
		var used int64
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM "+s.table("m04_coaching_unlocks")+" WHERE owner_id=$1 AND unlocked_at >= $2 AND unlocked_at < $3", p.OwnerID, day, day.Add(24*time.Hour)).Scan(&used); err != nil {
			return out, err
		}
		remaining := int64(4) - used
		if remaining < 0 {
			remaining = 0
		}
		out.Remaining = &remaining
		reset := day.Add(24 * time.Hour)
		out.ResetsAt = &reset
	}
	return out, nil
}
func (s *Store) FixturePlatformAccess(ctx context.Context, owner, game, unit string) (FixturePlatformAccess, error) {
	var out FixturePlatformAccess
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		p, e := s.platformProfileTx(ctx, tx, owner, true)
		if e != nil {
			return e
		}
		out, e = s.fixturePlatformAccessTx(ctx, tx, p, game, unit)
		return e
	})
	return out, err
}

// Called under the same owner lock as publication. Absence retains the earlier
// narrow M04C harness; once activated, fixture billing affects real permission.
func (s *Store) checkPlatformFixtureAccessTx(ctx context.Context, tx pgx.Tx, a AccessAdmission, game string, coach bool) error {
	var exists, configured bool
	if err := tx.QueryRow(ctx, "SELECT configured_offers,EXISTS(SELECT 1 FROM "+s.table("m04_profiles")+" p WHERE p.owner_id=a.owner_id) FROM "+s.table("m03_access")+" a WHERE owner_id=$1", a.OwnerID).Scan(&configured, &exists); err != nil {
		return err
	}
	if configured || !exists {
		return nil
	}
	p, err := s.platformProfileTx(ctx, tx, a.OwnerID, false)
	if err != nil {
		return err
	}
	v, err := s.fixturePlatformAccessTx(ctx, tx, p, game, a.UnitID)
	if err != nil {
		return err
	}
	// A scheduled plan may have become due while obtaining the profile. That
	// lazy application bumps generation under this lock and must invalidate
	// the previously checked admission before any publication.
	if v.Generation != a.Generation {
		return ErrAccess
	}
	if !v.Covered {
		return ErrAccess
	}
	if coach && !v.HandUnlocked && v.Remaining != nil && *v.Remaining == 0 {
		return ErrAllowance
	}
	return nil
}

// Original unit unlocks are required before delivery/preparation on the full
// fixture app. Existing narrow M04C accounts remain separate and unchanged.
func (s *Store) checkPlatformFixtureUnlockTx(ctx context.Context, tx pgx.Tx, a AccessAdmission, game, tool string) error {
	var exists bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_profiles")+" WHERE owner_id=$1)", a.OwnerID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return nil
	}
	if err := s.checkPlatformFixtureAccessTx(ctx, tx, a, game, true); err != nil {
		return err
	}
	u, err := s.readUnlock(ctx, tx, a.OwnerID, game, a.UnitID)
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
