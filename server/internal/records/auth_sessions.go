package records

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

var ErrRenewalRequired = errors.New("session_renewal_required")
var ErrRefreshBusy = errors.New("session refresh in progress")

const AccessLifetime = 15 * time.Minute
const IdleLifetime = 90 * 24 * time.Hour
const AbsoluteLifetime = 180 * 24 * time.Hour

type RenewableLogin struct {
	Token, Issuer, Subject, Name, ProviderSID, KeyID string
	Ciphertext                                       []byte
	AccessExpiresAt, ProviderExpiresAt               time.Time
}
type SessionFamily struct {
	Principal                           Principal
	ID                                  string    `json:"id"`
	ServerTime                          time.Time `json:"serverTime"`
	AccessExpiresAt                     time.Time `json:"accessExpiresAt"`
	IdleExpiresAt                       time.Time `json:"idleExpiresAt"`
	AbsoluteExpiresAt                   time.Time `json:"absoluteExpiresAt"`
	ProviderExpiresAt                   time.Time `json:"-"`
	Issuer, Subject, ProviderSID, KeyID string
	Ciphertext                          []byte
	Generation                          int64
	Operation                           string
	LeaseUntil                          *time.Time
	Uncertain                           bool
}

func (p Principal) SessionID() string { return p.sessionHash }
func SessionID(token string) string   { return tokenHash(token) }
func (s *Store) LoginRenewable(ctx context.Context, in RenewableLogin) (Identity, error) {
	return s.loginExternal(ctx, in.Issuer, in.Subject, in.Name, &in)
}
func (s *Store) installFamily(ctx context.Context, tx pgx.Tx, p Principal, in RenewableLogin) error {
	var now time.Time
	var generation int64
	if err := tx.QueryRow(ctx, "UPDATE "+s.table("m03_access")+" SET auth_generation=auth_generation+1,active_auth_family=$2 WHERE owner_id=$1 RETURNING auth_generation,clock_timestamp()", p.OwnerID, p.sessionHash).Scan(&generation, &now); err != nil {
		return err
	}
	absolute := now.Add(AbsoluteLifetime)
	provider := in.ProviderExpiresAt
	if provider.IsZero() || provider.After(absolute) {
		provider = absolute
	}
	idle := minTime(now.Add(IdleLifetime), absolute, provider)
	access := minTime(now.Add(AccessLifetime), in.AccessExpiresAt, idle)
	if !access.After(now) || len(in.Ciphertext) == 0 || in.KeyID == "" || in.ProviderSID == "" {
		return ErrUnauthenticated
	}
	_, err := tx.Exec(ctx, "UPDATE "+s.table("m04_sessions")+" SET expires_at=$2 WHERE token_hash=$1", p.sessionHash, access)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO "+s.table("auth_session_families")+"(token_hash,owner_id,generation,issuer,subject,provider_sid,idle_expires_at,absolute_expires_at,provider_expires_at,token_key_id,token_ciphertext) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", p.sessionHash, p.OwnerID, generation, in.Issuer, in.Subject, in.ProviderSID, idle, absolute, provider, in.KeyID, in.Ciphertext)
	return err
}
func minTime(times ...time.Time) time.Time {
	v := times[0]
	for _, t := range times[1:] {
		if t.Before(v) {
			v = t
		}
	}
	return v
}
func (s *Store) family(ctx context.Context, q grantReader, hash string) (SessionFamily, error) {
	f := SessionFamily{ID: hash, Principal: Principal{sessionHash: hash}}
	err := q.QueryRow(ctx, "SELECT f.owner_id,a.configured_offers,clock_timestamp(),s.expires_at,f.idle_expires_at,f.absolute_expires_at,f.provider_expires_at,f.issuer,f.subject,f.provider_sid,f.token_key_id,f.token_ciphertext,f.generation,COALESCE(f.refresh_operation,''),f.refresh_lease_until,f.refresh_uncertain FROM "+s.table("auth_session_families")+" f JOIN "+s.table("m04_sessions")+" s ON s.token_hash=f.token_hash JOIN "+s.table("m03_access")+" a ON a.owner_id=f.owner_id WHERE f.token_hash=$1 AND s.revoked_at IS NULL AND a.active_auth_family=f.token_hash AND a.auth_generation=f.generation AND LEAST(f.idle_expires_at,f.absolute_expires_at,f.provider_expires_at)>clock_timestamp()", hash).Scan(&f.Principal.OwnerID, &f.Principal.Configured, &f.ServerTime, &f.AccessExpiresAt, &f.IdleExpiresAt, &f.AbsoluteExpiresAt, &f.ProviderExpiresAt, &f.Issuer, &f.Subject, &f.ProviderSID, &f.KeyID, &f.Ciphertext, &f.Generation, &f.Operation, &f.LeaseUntil, &f.Uncertain)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrUnauthenticated
	}
	return f, err
}
func (s *Store) RememberedSession(ctx context.Context, token string) (SessionFamily, error) {
	if len(token) < 32 || len(token) > 256 {
		return SessionFamily{}, ErrUnauthenticated
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	return s.family(ctx, s.pool, tokenHash(token))
}
func (s *Store) SessionAccessDeadline(ctx context.Context, p Principal) (time.Time, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var deadline time.Time
	err := s.pool.QueryRow(ctx, "SELECT expires_at FROM "+s.table("m04_sessions")+" WHERE token_hash=$1 AND owner_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()", p.sessionHash, p.OwnerID).Scan(&deadline)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrUnauthenticated
	}
	return deadline, err
}

// Claim is committed before the caller redeems the provider credential.
// An abandoned lease is terminal: rotation may have succeeded upstream.
func (s *Store) ClaimRefresh(ctx context.Context, token, operation string) (SessionFamily, bool, error) {
	var f SessionFamily
	claimed := false
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		hash := tokenHash(token)
		if _, err := tx.Exec(ctx, "SELECT a.owner_id FROM "+s.table("m03_access")+" a JOIN "+s.table("m04_sessions")+" s ON s.owner_id=a.owner_id WHERE s.token_hash=$1 FOR UPDATE OF a", hash); err != nil {
			return err
		}
		var err error
		f, err = s.family(ctx, tx, hash)
		if err != nil {
			return err
		}
		if f.Uncertain {
			return ErrUnauthenticated
		}
		if f.Operation != "" {
			if f.LeaseUntil != nil && f.LeaseUntil.After(f.ServerTime) {
				return ErrRefreshBusy
			}
			return ErrUnauthenticated
		}
		if f.AccessExpiresAt.After(f.ServerTime.Add(time.Minute)) {
			return nil
		}
		_, err = tx.Exec(ctx, "UPDATE "+s.table("auth_session_families")+" SET refresh_operation=$2,refresh_lease_until=clock_timestamp()+interval '20 seconds' WHERE token_hash=$1", hash, operation)
		f.Operation = operation
		claimed = err == nil
		return err
	})
	return f, claimed, err
}
func (s *Store) CompleteRefresh(ctx context.Context, f SessionFamily, keyID string, ciphertext []byte, access, provider time.Time) error {
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT owner_id FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", f.Principal.OwnerID); err != nil {
			return err
		}
		current, err := s.family(ctx, tx, f.ID)
		if err != nil {
			return err
		}
		if current.Generation != f.Generation || current.Operation != f.Operation || current.Uncertain || current.LeaseUntil == nil || !current.LeaseUntil.After(current.ServerTime) {
			return ErrUnauthenticated
		}
		// Expired play is paused before a renewed lease can make it live again.
		if !current.AccessExpiresAt.After(current.ServerTime) {
			if err = s.pauseAuthPlayback(ctx, tx, f.Principal.OwnerID); err != nil {
				return err
			}
		}
		if provider.IsZero() {
			provider = current.ProviderExpiresAt
		}
		provider = minTime(provider, current.AbsoluteExpiresAt)
		idle := minTime(current.ServerTime.Add(IdleLifetime), current.AbsoluteExpiresAt, provider)
		access = minTime(access, current.ServerTime.Add(AccessLifetime), idle)
		if !access.After(current.ServerTime) {
			return ErrUnauthenticated
		}
		if _, err = tx.Exec(ctx, "UPDATE "+s.table("auth_session_families")+" SET token_key_id=$2,token_ciphertext=$3,idle_expires_at=$4,provider_expires_at=$5,refresh_operation=NULL,refresh_lease_until=NULL WHERE token_hash=$1", f.ID, keyID, ciphertext, idle, provider); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "UPDATE "+s.table("m04_sessions")+" SET expires_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL", f.ID, access)
		return err
	})
}
func (s *Store) MarkRefreshUncertain(ctx context.Context, f SessionFamily) error {
	_, err := s.pool.Exec(ctx, "UPDATE "+s.table("auth_session_families")+" SET refresh_uncertain=true WHERE token_hash=$1 AND refresh_operation=$2", f.ID, f.Operation)
	return err
}

// Remembered-cookie logout is independent of the short access deadline.
func (s *Store) RevokeRemembered(ctx context.Context, token string) (Principal, error) {
	var p Principal
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		hash := tokenHash(token)
		err := tx.QueryRow(ctx, "SELECT a.owner_id,a.configured_offers FROM "+s.table("m03_access")+" a JOIN "+s.table("m04_sessions")+" s ON s.owner_id=a.owner_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND a.active_auth_family=$1 FOR UPDATE OF a", hash).Scan(&p.OwnerID, &p.Configured)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		p.sessionHash = hash
		return s.fenceAuthSessions(ctx, tx, p.OwnerID)
	})
	return p, err
}
func (s *Store) RevokeProviderSession(ctx context.Context, issuer, sid, eventID string) ([]Principal, error) {
	var revoked []Principal
	err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if err := s.lockProviderSession(ctx, tx, issuer, sid); err != nil {
			return err
		}
		result, err := tx.Exec(ctx, "INSERT INTO "+s.table("auth_logout_events")+"(issuer,event_id,provider_sid) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", issuer, eventID, sid)
		if err != nil || result.RowsAffected() == 0 {
			return err
		}
		rows, err := tx.Query(ctx, "SELECT DISTINCT f.owner_id,f.token_hash FROM "+s.table("auth_session_families")+" f JOIN "+s.table("m04_sessions")+" s ON s.token_hash=f.token_hash WHERE f.issuer=$1 AND f.provider_sid=$2 AND s.revoked_at IS NULL ORDER BY f.owner_id", issuer, sid)
		if err != nil {
			return err
		}
		for rows.Next() {
			var p Principal
			if err = rows.Scan(&p.OwnerID, &p.sessionHash); err != nil {
				rows.Close()
				return err
			}
			revoked = append(revoked, p)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, p := range revoked {
			if _, err = tx.Exec(ctx, "SELECT owner_id FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", p.OwnerID); err != nil {
				return err
			}
			// Recheck after taking the owner lock: different-sid replacement is isolated.
			var same bool
			if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("auth_session_families")+" f JOIN "+s.table("m03_access")+" a ON a.active_auth_family=f.token_hash WHERE a.owner_id=$1 AND f.issuer=$2 AND f.provider_sid=$3)", p.OwnerID, issuer, sid).Scan(&same); err != nil {
				return err
			}
			if same {
				if err = s.fenceAuthSessions(ctx, tx, p.OwnerID); err != nil {
					return err
				}
			}
		}
		return nil
	})
	return revoked, err
}
func (s *Store) lockProviderSession(ctx context.Context, tx pgx.Tx, issuer, sid string) error {
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,1))", tokenHash(issuer+"\x00"+sid))
	return err
}

// SessionChanges is a bounded durable invalidation stream. Consumers recheck
// authority, so delayed or duplicate delivery cannot grant access.
type SessionChange struct {
	Sequence  int64
	Principal Principal
	Kind      string
}

func (s *Store) SessionChanges(ctx context.Context, after int64) ([]SessionChange, error) {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	rows, err := s.pool.Query(ctx, "SELECT id,owner_id,token_hash,kind FROM "+s.table("auth_session_events")+" WHERE id>$1 ORDER BY id LIMIT 256", after)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SessionChange
	for rows.Next() {
		var e SessionChange
		if err = rows.Scan(&e.Sequence, &e.Principal.OwnerID, &e.Principal.sessionHash, &e.Kind); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// CleanupAuthSecrets is bounded and indexed; expired credentials never need a
// per-player timer and are removed without deleting game or account history.
func (s *Store) CleanupAuthSecrets(ctx context.Context) error {
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	for _, query := range []string{
		"WITH expired AS (SELECT f.token_hash FROM " + s.table("auth_session_families") + " f WHERE octet_length(f.token_ciphertext)>0 AND LEAST(f.idle_expires_at,f.absolute_expires_at,f.provider_expires_at)<=clock_timestamp() ORDER BY LEAST(f.idle_expires_at,f.absolute_expires_at,f.provider_expires_at) LIMIT 256) UPDATE " + s.table("auth_session_families") + " f SET token_ciphertext=''::bytea,refresh_uncertain=true FROM expired e WHERE e.token_hash=f.token_hash",
		"DELETE FROM " + s.table("auth_login_attempts") + " WHERE state_hash IN (SELECT state_hash FROM " + s.table("auth_login_attempts") + " WHERE expires_at<=clock_timestamp() LIMIT 256)",
		"DELETE FROM " + s.table("auth_logout_events") + " WHERE (issuer,event_id) IN (SELECT issuer,event_id FROM " + s.table("auth_logout_events") + " WHERE received_at<clock_timestamp()-interval '10 minutes' LIMIT 256)",
		"DELETE FROM " + s.table("auth_session_events") + " WHERE id IN (SELECT id FROM " + s.table("auth_session_events") + " WHERE created_at<clock_timestamp()-interval '7 days' LIMIT 256)",
	} {
		if _, err := s.pool.Exec(ctx, query); err != nil {
			return err
		}
	}
	return nil
}
