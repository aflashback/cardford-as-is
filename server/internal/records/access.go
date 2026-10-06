package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrAccess = errors.New("access admission is no longer valid")
var ErrAllowance = errors.New("allowance exhausted or mismatched")

type AccessState struct {
	OwnerID, ActiveGameID         string
	Generation, ControlGeneration int64
	CanRead, CanPlay, CanCoach    bool
}
type AccessChange struct {
	ActiveGameID                              string
	CanRead, CanPlay, CanCoach, ChangeControl bool
}

func (s *Store) CreateAccess(ctx context.Context, owner string) error {
	if !recordID(owner) {
		return ErrAccess
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	_, err := s.pool.Exec(ctx, "INSERT INTO "+s.table("m03_access")+" (owner_id,generation,control_generation,can_read,can_play,can_coach) VALUES ($1,1,1,false,false,false) ON CONFLICT DO NOTHING", owner)
	return err
}

// ChangeAccess never resets a generation. Revoke/regrant, game changes and
// control changes therefore invalidate work admitted before either mutation.
func (s *Store) ChangeAccess(ctx context.Context, owner string, expected int64, change AccessChange) (AccessState, error) {
	var result AccessState
	if !recordID(owner) || expected < 1 || expected >= maxRecordInteger || change.ActiveGameID != "" && !recordID(change.ActiveGameID) {
		return result, ErrAccess
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	err := s.pool.QueryRow(ctx, "UPDATE "+s.table("m03_access")+" SET generation=generation+1,control_generation=control_generation+CASE WHEN $7 THEN 1 ELSE 0 END,active_game_id=NULLIF($3,''),can_read=$4,can_play=$5,can_coach=$6 WHERE owner_id=$1 AND generation=$2 AND control_generation<9007199254740991 RETURNING owner_id,COALESCE(active_game_id,''),generation,control_generation,can_read,can_play,can_coach", owner, expected, change.ActiveGameID, change.CanRead, change.CanPlay, change.CanCoach, change.ChangeControl).Scan(&result.OwnerID, &result.ActiveGameID, &result.Generation, &result.ControlGeneration, &result.CanRead, &result.CanPlay, &result.CanCoach)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrAccess
	}
	return result, err
}

func (s *Store) ReadAccess(ctx context.Context, owner string) (AccessState, error) {
	var result AccessState
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err := s.authorize(ctx, s.pool, owner); err != nil {
		return result, err
	}
	err := s.pool.QueryRow(ctx, "SELECT owner_id,COALESCE(active_game_id,''),generation,control_generation,can_read,can_play,can_coach FROM "+s.table("m03_access")+" WHERE owner_id=$1", owner).Scan(&result.OwnerID, &result.ActiveGameID, &result.Generation, &result.ControlGeneration, &result.CanRead, &result.CanPlay, &result.CanCoach)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrAccess
	}
	return result, err
}

func (s *Store) checkCommitAccess(ctx context.Context, tx pgx.Tx, a AccessAdmission, gameID string, coach bool) error {
	if !recordID(a.OwnerID) || a.Generation < 1 || a.ControlRevision < 1 {
		return ErrAccess
	}
	var generation, control int64
	var active string
	var play, canCoach bool
	err := tx.QueryRow(ctx, "SELECT generation,control_generation,COALESCE(active_game_id,''),can_play,can_coach FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", a.OwnerID).Scan(&generation, &control, &active, &play, &canCoach)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAccess
	}
	if err != nil {
		return err
	}
	if err = s.authorizeControl(ctx, tx, a.OwnerID); err != nil {
		return err
	}
	if generation != a.Generation || control != a.ControlRevision || active != gameID || !play || coach && !canCoach {
		return ErrAccess
	}
	return nil
}

// GrantTerms are immutable purchased/configured terms. This seam deliberately
// supports only UTC day and lifetime buckets; other calendars fail closed.
type GrantTerms struct {
	Version    string   `json:"version"`
	Game       string   `json:"game"`
	Variant    string   `json:"variant"`
	CanPlay    bool     `json:"canPlay"`
	CanCoach   bool     `json:"canCoach"`
	Tools      []string `json:"tools"`
	BucketID   string   `json:"bucketId"`
	Period     string   `json:"period"`
	Timezone   string   `json:"timezone"`
	Limit      int64    `json:"limit"`
	Unlimited  bool     `json:"unlimited"`
	ExpiryRule string   `json:"expiryRule"`
}
type Grant struct {
	ID, OwnerID, OfferID, OfferVersion, SourceKind, SourceID string
	Terms                                                    GrantTerms
	ValidFrom                                                time.Time
	ValidUntil                                               *time.Time
	Revoked                                                  bool
}
type AllowanceCharge struct {
	Admission                                  AccessAdmission
	BucketID, PeriodKey, OfferID, OfferVersion string
	Units                                      int64
}

func recordID(s string) bool { return validText(s) }
func validateGrant(g Grant) error {
	t := g.Terms
	if !recordID(g.ID) || !recordID(g.OwnerID) || !recordID(g.OfferID) || !recordID(g.OfferVersion) || !recordID(g.SourceID) || t.Version != RecordVersion || !recordID(t.BucketID) || t.Timezone != "UTC" || (t.Period != "day" && t.Period != "lifetime") || t.Limit < 0 || t.Limit > maxRecordInteger || t.Unlimited && t.Limit != 0 || (!t.Unlimited && t.CanCoach && t.Limit == 0) || t.Tools == nil || len(t.Tools) > 16 || g.ValidFrom.IsZero() || g.ValidUntil != nil && !g.ValidUntil.After(g.ValidFrom) {
		return ErrAccess
	}
	if t.ExpiryRule != "pause-at-expiry" && t.ExpiryRule != "finish-admitted-unit" {
		return ErrAccess
	}
	if !(t.Game == "hearts" && t.Variant == "solo" || t.Game == "spades" && (t.Variant == "solo" || t.Variant == "partners")) {
		return ErrAccess
	}
	if g.SourceKind != "free" && g.SourceKind != "access-trial" && g.SourceKind != "purchase" && g.SourceKind != "family" {
		return ErrAccess
	}
	seen := map[string]bool{}
	for _, tool := range t.Tools {
		if !recordID(tool) || seen[tool] {
			return ErrAccess
		}
		seen[tool] = true
	}
	if !t.CanCoach && len(t.Tools) > 0 {
		return ErrAccess
	}
	return nil
}

func decodeTerms(raw []byte) (GrantTerms, error) {
	var terms GrantTerms
	err := strictRecord(raw, &terms)
	return terms, err
}

func (s *Store) PutGrant(ctx context.Context, g Grant) error {
	g = normalizeGrant(g)
	if err := validateGrant(g); err != nil {
		return err
	}
	if g.Revoked {
		return ErrAccess
	}
	raw, _ := json.Marshal(g.Terms)
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var generation int64
		if err := tx.QueryRow(ctx, "SELECT generation FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", g.OwnerID).Scan(&generation); err != nil {
			return err
		}
		var original []byte
		err := tx.QueryRow(ctx, "SELECT terms FROM "+s.table("m03_grants")+" WHERE grant_id=$1", g.ID).Scan(&original)
		if err == nil {
			existing, e := s.readGrant(ctx, tx, g.ID, g.OwnerID)
			if e != nil {
				return e
			}
			if !sameGrant(existing, g) {
				return ErrCommandDigest
			}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err = s.checkBucketTerms(ctx, tx, g); err != nil {
			return err
		}
		if err = s.insertGrant(ctx, tx, g, raw); err != nil {
			return err
		}
		return s.bumpAccess(ctx, tx, g.OwnerID)
	})
}
func sameGrant(a, b Grant) bool {
	a.Revoked = false
	b.Revoked = false
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return bytes.Equal(x, y)
}
func normalizeGrant(g Grant) Grant {
	g.ValidFrom = g.ValidFrom.UTC().Truncate(time.Microsecond)
	if g.ValidUntil != nil {
		v := g.ValidUntil.UTC().Truncate(time.Microsecond)
		g.ValidUntil = &v
	}
	return g
}
func (s *Store) checkBucketTerms(ctx context.Context, tx pgx.Tx, g Grant) error {
	var raw []byte
	err := tx.QueryRow(ctx, "SELECT terms FROM "+s.table("m03_grants")+" WHERE owner_id=$1 AND bucket_id=$2 LIMIT 1", g.OwnerID, g.Terms.BucketID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	t, err := decodeTerms(raw)
	if err != nil {
		return err
	}
	if t.Period != g.Terms.Period || t.Timezone != g.Terms.Timezone {
		return ErrAllowance
	}
	return nil
}
func (s *Store) insertGrant(ctx context.Context, tx pgx.Tx, g Grant, raw []byte) error {
	_, err := tx.Exec(ctx, "INSERT INTO "+s.table("m03_grants")+" (grant_id,owner_id,offer_id,offer_version,game,variant,bucket_id,terms,valid_from,valid_until,revoked,source_kind,source_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,$12)", g.ID, g.OwnerID, g.OfferID, g.OfferVersion, g.Terms.Game, g.Terms.Variant, g.Terms.BucketID, raw, g.ValidFrom, g.ValidUntil, g.SourceKind, g.SourceID)
	return err
}
func (s *Store) bumpAccess(ctx context.Context, tx pgx.Tx, owner string) error {
	tag, err := tx.Exec(ctx, "UPDATE "+s.table("m03_access")+" SET generation=generation+1 WHERE owner_id=$1 AND generation<9007199254740991", owner)
	if err == nil && tag.RowsAffected() != 1 {
		return ErrAccess
	}
	return err
}
func (s *Store) RevokeGrant(ctx context.Context, owner, id string) error {
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var generation int64
		if err := tx.QueryRow(ctx, "SELECT generation FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&generation); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, "UPDATE "+s.table("m03_grants")+" SET revoked=true WHERE grant_id=$1 AND owner_id=$2 AND NOT revoked", id, owner)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrAccess
		}
		return s.bumpAccess(ctx, tx, owner)
	})
}

type grantReader interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (s *Store) readGrant(ctx context.Context, q grantReader, id, owner string) (Grant, error) {
	var g Grant
	var raw []byte
	var game, variant, bucket string
	err := q.QueryRow(ctx, "SELECT grant_id,owner_id,offer_id,offer_version,source_kind,source_id,terms,valid_from,valid_until,revoked,game,variant,bucket_id FROM "+s.table("m03_grants")+" WHERE grant_id=$1 AND owner_id=$2", id, owner).Scan(&g.ID, &g.OwnerID, &g.OfferID, &g.OfferVersion, &g.SourceKind, &g.SourceID, &raw, &g.ValidFrom, &g.ValidUntil, &g.Revoked, &game, &variant, &bucket)
	if errors.Is(err, pgx.ErrNoRows) {
		return g, ErrAccess
	}
	if err != nil {
		return g, err
	}
	g.Terms, err = decodeTerms(raw)
	if err != nil {
		return g, err
	}
	if validateGrant(g) != nil || game != g.Terms.Game || variant != g.Terms.Variant || bucket != g.Terms.BucketID {
		return g, ErrStorage
	}
	return g, nil
}
func (s *Store) ReadGrant(ctx context.Context, owner, id string) (Grant, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err := s.authorize(ctx, s.pool, owner); err != nil {
		return Grant{}, err
	}
	return s.readGrant(ctx, s.pool, id, owner)
}

func (s *Store) checkGrant(ctx context.Context, tx pgx.Tx, a AccessAdmission, gameID, game, variant string, coach bool) (Grant, time.Time, error) {
	g, err := s.readGrant(ctx, tx, a.GrantID, a.OwnerID)
	if err != nil {
		return g, time.Time{}, err
	}
	var now time.Time
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
		return g, now, err
	}
	if g.Revoked || g.Terms.Game != game || g.Terms.Variant != variant || !coach && !g.Terms.CanPlay || coach && !g.Terms.CanCoach || now.Before(g.ValidFrom) {
		return g, now, ErrAccess
	}
	if g.ValidUntil != nil && !now.Before(*g.ValidUntil) {
		if g.Terms.ExpiryRule != "finish-admitted-unit" || !recordID(a.UnitID) {
			return g, now, ErrAccess
		}
		var admitted bool
		// Generation fences authorize this fresh request, while the immutable
		// admission proves purchased continuation across device/control changes.
		err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_unit_admissions")+" WHERE owner_id=$1 AND game_id=$2 AND unit_id=$3 AND grant_id=$4 AND admitted_at<$5)", a.OwnerID, gameID, a.UnitID, g.ID, *g.ValidUntil).Scan(&admitted)
		if err != nil {
			return g, now, err
		}
		if !admitted {
			return g, now, ErrAccess
		}
	}
	return g, now, nil
}

// chargeAllowance runs only in the accepted-command transaction, after the
// owner's access lock. A unit has one charge across command IDs and grant edits.
func (s *Store) chargeAllowance(ctx context.Context, tx pgx.Tx, owner, commandID, gameID, game, variant string, c AllowanceCharge) error {
	if c.Admission.OwnerID != owner || c.Units != 1 || !recordID(c.Admission.UnitID) {
		return ErrAllowance
	}
	g, now, err := s.checkGrant(ctx, tx, c.Admission, gameID, game, variant, true)
	if err != nil {
		return err
	}
	period := "lifetime"
	if g.Terms.Period == "day" {
		period = now.UTC().Format("2006-01-02")
	}
	if c.BucketID != g.Terms.BucketID || c.PeriodKey != period || c.OfferID != g.OfferID || c.OfferVersion != g.OfferVersion {
		return ErrAllowance
	}
	var charged bool
	err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_allowance_charges")+" WHERE owner_id=$1 AND bucket_id=$2 AND game_id=$3 AND unit_id=$4)", owner, c.BucketID, gameID, c.Admission.UnitID).Scan(&charged)
	if err != nil {
		return err
	}
	if charged {
		return nil
	}
	_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_allowance")+" (owner_id,bucket_id,period_key,used) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING", owner, c.BucketID, c.PeriodKey)
	if err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, "UPDATE "+s.table("m03_allowance")+" SET used=used+1 WHERE owner_id=$1 AND bucket_id=$2 AND period_key=$3 AND used<9007199254740991 AND ($4 OR used<$5)", owner, c.BucketID, c.PeriodKey, g.Terms.Unlimited, g.Terms.Limit)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrAllowance
	}
	_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_allowance_charges")+" (owner_id,command_id,bucket_id,period_key,grant_id,offer_id,offer_version,units,game_id,unit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", owner, commandID, c.BucketID, c.PeriodKey, g.ID, g.OfferID, g.OfferVersion, c.Units, gameID, c.Admission.UnitID)
	return err
}

func (s *Store) AdmitUnit(ctx context.Context, gameID, game, variant string, a AccessAdmission) error {
	if !recordID(a.UnitID) {
		return ErrAccess
	}
	loaded, err := s.Load(ctx, a.OwnerID, gameID)
	if err != nil {
		return err
	}
	if !loaded.Disposition.Playable || loaded.Document.Metadata.Pin.GameID != game || loaded.Document.Metadata.Pin.VariantID != variant {
		return ErrAccess
	}
	unit, err := s.codec.CurrentUnitID(loaded.Document, loaded.Snapshot)
	if err != nil {
		return err
	}
	if unit != a.UnitID {
		return ErrAccess
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.checkCommitAccess(ctx, tx, a, gameID, false); err != nil {
			return err
		}
		var revision int64
		if err := tx.QueryRow(ctx, "SELECT revision FROM "+s.table("m03_games")+" WHERE game_id=$1 AND owner_id=$2 FOR UPDATE", gameID, a.OwnerID).Scan(&revision); err != nil {
			return err
		}
		if revision != loaded.Document.Revision {
			return ErrWorkStale
		}
		g, now, err := s.checkGrant(ctx, tx, a, gameID, game, variant, false)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_unit_admissions")+" (owner_id,game_id,unit_id,grant_id,access_generation,admitted_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", a.OwnerID, gameID, a.UnitID, g.ID, a.Generation, now, g.ValidUntil)
		return err
	})
}

func (s *Store) AllowanceUsed(ctx context.Context, owner, bucket, period string) (int64, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var used int64
	err := s.pool.QueryRow(ctx, "SELECT used FROM "+s.table("m03_allowance")+" WHERE owner_id=$1 AND bucket_id=$2 AND period_key=$3", owner, bucket, period).Scan(&used)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if used < 0 {
		return 0, fmt.Errorf("%w: negative usage", ErrStorage)
	}
	return used, err
}
