package records

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrUnauthenticated = errors.New("local session is unavailable")
var ErrControl = errors.New("control lease is unavailable")

// Principal can only acquire its credential binding through Authenticate or
// NewLocalIdentity. OwnerID alone is never an authentication credential.
type Principal struct {
	OwnerID     string
	Configured  bool
	sessionHash string
}
type Identity struct {
	Token     string
	Principal Principal
	Access    AccessState
	Grants    []Grant
}
type principalKey struct{}
type controlKey struct{}
type controlProof struct{ tab, leaseHash string }

func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}
func WithControl(ctx context.Context, tab, rawLease string) context.Context {
	return context.WithValue(ctx, controlKey{}, controlProof{tab, tokenHash(rawLease)})
}
func tokenHash(raw string) string { v := sha256.Sum256([]byte(raw)); return hex.EncodeToString(v[:]) }
func (s *Store) authenticated(ctx context.Context) bool {
	_, ok := ctx.Value(principalKey{}).(Principal)
	return s.localService || s.requirePrincipal || ok
}
func principalFrom(ctx context.Context) (Principal, error) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	if !ok || !recordID(p.OwnerID) || !validDigest(p.sessionHash) {
		return Principal{}, ErrUnauthenticated
	}
	return p, nil
}

func (s *Store) authorize(ctx context.Context, q grantReader, owner string) error {
	if !s.authenticated(ctx) {
		return nil
	}
	p, err := principalFrom(ctx)
	if err != nil || p.OwnerID != owner {
		return ErrUnauthenticated
	}
	var valid bool
	err = q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_sessions")+" WHERE token_hash=$1 AND owner_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp())", p.sessionHash, owner).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid {
		if s.requirePrincipal {
			if f, e := s.family(ctx, q, p.sessionHash); e == nil && !f.Uncertain && !f.AccessExpiresAt.After(f.ServerTime) {
				return ErrRenewalRequired
			}
		}
		return ErrUnauthenticated
	}
	return nil
}

// Recheck authorization after CPU decoding/replay, using current committed
// session and privacy state. It never retains a database connection for CPU work.
func (s *Store) currentRead(ctx context.Context, owner string) error {
	if !s.authenticated(ctx) {
		return nil
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var allowed bool
	query := "SELECT EXISTS(SELECT 1 FROM " + s.table("m03_access") + " a WHERE a.owner_id=$1 AND a.can_read)"
	args := []any{owner}
	if s.authenticated(ctx) {
		p, err := principalFrom(ctx)
		if err != nil || p.OwnerID != owner {
			return ErrUnauthenticated
		}
		query = "SELECT EXISTS(SELECT 1 FROM " + s.table("m03_access") + " a JOIN " + s.table("m04_sessions") + " s ON s.owner_id=a.owner_id WHERE a.owner_id=$1 AND a.can_read AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp())"
		args = append(args, p.sessionHash)
	}
	if err := s.pool.QueryRow(ctx, query, args...).Scan(&allowed); err != nil {
		return err
	}
	if !allowed {
		// A lease can expire during CPU decoding. Preserve renewable expiry
		// instead of presenting it as a definite permission denial to callers.
		if err := s.authorize(ctx, s.pool, owner); err != nil {
			return err
		}
		return ErrReadDenied
	}
	return nil
}
func (s *Store) authorizeControl(ctx context.Context, q grantReader, owner string) error {
	if !s.authenticated(ctx) {
		return nil
	}
	if err := s.authorize(ctx, q, owner); err != nil {
		return err
	}
	p, _ := principalFrom(ctx)
	proof, ok := ctx.Value(controlKey{}).(controlProof)
	if !ok || !recordID(proof.tab) || !validDigest(proof.leaseHash) {
		return ErrControl
	}
	var valid bool
	err := q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m04_controls")+" WHERE owner_id=$1 AND session_hash=$2 AND tab_id=$3 AND lease_hash=$4 AND expires_at>clock_timestamp())", owner, p.sessionHash, proof.tab, proof.leaseHash).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid {
		return ErrControl
	}
	return nil
}

// CheckControl rechecks the original work credential without reserving a
// connection for CPU work. Publication still repeats its transactional fence.
func (s *Store) CheckControl(ctx context.Context, owner string) error {
	bounded, cancel := s.bounded(ctx)
	defer cancel()
	return s.authorizeControl(bounded, s.pool, owner)
}
func (s *Store) Authenticate(ctx context.Context, token string) (Principal, error) {
	if len(token) < 32 || len(token) > 256 {
		return Principal{}, ErrUnauthenticated
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	p := Principal{sessionHash: tokenHash(token)}
	err := s.pool.QueryRow(ctx, "SELECT s.owner_id,a.configured_offers FROM "+s.table("m04_sessions")+" s JOIN "+s.table("m03_access")+" a ON a.owner_id=s.owner_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()", p.sessionHash).Scan(&p.OwnerID, &p.Configured)
	if errors.Is(err, pgx.ErrNoRows) {
		if s.requirePrincipal {
			if f, e := s.family(ctx, s.pool, p.sessionHash); e == nil && !f.Uncertain && !f.AccessExpiresAt.After(f.ServerTime) {
				return Principal{}, ErrRenewalRequired
			}
		}
		return Principal{}, ErrUnauthenticated
	}
	return p, err
}

func LocalGrantID(owner, game, variant string) string {
	return "local-" + owner + "-" + game + "-" + variant
}

// NewLocalIdentity creates a durable local fixture identity. This is not hosted
// login or a commercial offer resolver; its exact-target terms are server-owned.
func (s *Store) NewLocalIdentity(ctx context.Context) (Identity, error) {
	return s.newLocalIdentity(ctx, [][2]string{{"hearts", "solo"}, {"spades", "solo"}, {"spades", "partners"}, {"trix", "basic-solo"}, {"trix", "basic-partners"}, {"trix", "complex-solo"}, {"trix", "complex-partners"}})
}
func (s *Store) newLocalIdentity(ctx context.Context, targets [][2]string) (Identity, error) {
	var out Identity
	if s.requirePrincipal {
		return out, ErrAccess
	}
	owner, err := freshID()
	if err != nil {
		return out, err
	}
	token, err := freshID()
	if err != nil {
		return out, err
	}
	out.Token = token
	out.Principal = Principal{OwnerID: owner, sessionHash: tokenHash(token)}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "INSERT INTO "+s.table("m03_access")+"(owner_id,generation,control_generation,can_read,can_play,can_coach) VALUES($1,1,1,true,true,true)", owner); err != nil {
			return err
		}
		var now time.Time
		if err := tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "INSERT INTO "+s.table("m04_sessions")+"(token_hash,owner_id,expires_at) VALUES($1,$2,$3)", out.Principal.sessionHash, owner, now.Add(30*24*time.Hour)); err != nil {
			return err
		}
		for _, target := range targets {
			g := Grant{ID: LocalGrantID(owner, target[0], target[1]), OwnerID: owner, OfferID: "local-fixture", OfferVersion: "1.0.0", SourceKind: "free", SourceID: owner, ValidFrom: now, Terms: GrantTerms{Version: "1.0.0", Game: target[0], Variant: target[1], CanPlay: true, CanCoach: true, Tools: []string{"advice", "review-alternative"}, BucketID: "local-fixture", Period: "lifetime", Timezone: "UTC", Unlimited: true, ExpiryRule: "pause-at-expiry"}}
			if err := validateGrant(g); err != nil {
				return fmt.Errorf("local fixture terms: %w", err)
			}
			raw, _ := json.Marshal(g.Terms)
			if err := s.insertGrant(ctx, tx, g, raw); err != nil {
				return err
			}
			out.Grants = append(out.Grants, g)
		}
		out.Access = AccessState{OwnerID: owner, Generation: 1, ControlGeneration: 1, CanRead: true, CanPlay: true, CanCoach: true}
		return nil
	})
	return out, err
}

// NewConfiguredIdentity atomically installs only server-selected free terms.
// An empty configuration issues no grants and never implies fixture coverage.
func (s *Store) NewConfiguredIdentity(ctx context.Context, templates []Grant) (Identity, error) {
	var out Identity
	if s.requirePrincipal {
		return out, ErrAccess
	}
	owner, err := freshID()
	if err != nil {
		return out, err
	}
	token, err := freshID()
	if err != nil {
		return out, err
	}
	out.Token = token
	out.Principal = Principal{OwnerID: owner, Configured: true, sessionHash: tokenHash(token)}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "INSERT INTO "+s.table("m03_access")+"(owner_id,generation,control_generation,can_read,can_play,can_coach,configured_offers) VALUES($1,1,1,true,true,true,true)", owner); err != nil {
			return err
		}
		var now time.Time
		if err := tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "INSERT INTO "+s.table("m04_sessions")+"(token_hash,owner_id,expires_at) VALUES($1,$2,$3)", out.Principal.sessionHash, owner, now.Add(30*24*time.Hour)); err != nil {
			return err
		}
		for _, template := range templates {
			g := template
			if g.SourceKind != "free" || g.Revoked {
				return ErrAccess
			}
			g.OwnerID, g.SourceID = owner, owner
			g.ID = configuredFreeID(owner, g)
			if g.ValidFrom.IsZero() {
				g.ValidFrom = now
			}
			g = normalizeGrant(g)
			if err = validateGrant(g); err != nil {
				return err
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
			out.Grants = append(out.Grants, g)
		}
		out.Access = AccessState{OwnerID: owner, Generation: 1, ControlGeneration: 1, CanRead: true, CanPlay: true, CanCoach: true}
		return nil
	})
	return out, err
}

func (s *Store) RevokeSession(ctx context.Context) error {
	p, err := principalFrom(ctx)
	if err != nil {
		return err
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT 1 FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", p.OwnerID); err != nil {
			return err
		}
		if err := s.authorize(ctx, tx, p.OwnerID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, "UPDATE "+s.table("m04_sessions")+" SET revoked_at=clock_timestamp() WHERE token_hash=$1", p.sessionHash)
		return err
	})
}
