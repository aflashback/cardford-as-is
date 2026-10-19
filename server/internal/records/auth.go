package records

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

// OpenAuthLocalStore is distinct from fixture and test constructors; it never
// enables the historical no-principal test seam.
func OpenAuthLocalStore(ctx context.Context, url string, codec *DocumentCodec) (*Store, error) {
	return OpenStore(ctx, url, StoreOptions{authLocal: true, Schema: "cardford_auth_local", CreateSchema: true, Codec: codec})
}

type LoginAttempt struct{ State, Binding, Verifier, Nonce string }

func (s *Store) SaveLoginAttempt(ctx context.Context, a LoginAttempt) error {
	if !s.requirePrincipal {
		return ErrAccess
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(784103)"); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "DELETE FROM "+s.table("auth_login_attempts")+" WHERE expires_at<=clock_timestamp()"); err != nil {
			return err
		}
		var n int
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM "+s.table("auth_login_attempts")).Scan(&n); err != nil {
			return err
		}
		if n >= 4096 {
			return ErrAccess
		}
		_, err := tx.Exec(ctx, "INSERT INTO "+s.table("auth_login_attempts")+"(state_hash,binding_hash,verifier,nonce,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '5 minutes')", tokenHash(a.State), tokenHash(a.Binding), a.Verifier, a.Nonce)
		return err
	})
}
func (s *Store) ConsumeLoginAttempt(ctx context.Context, state, binding string) (LoginAttempt, error) {
	if !s.requirePrincipal || len(state) != 43 || len(binding) != 43 {
		return LoginAttempt{}, ErrUnauthenticated
	}
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	var a LoginAttempt
	err := s.pool.QueryRow(ctx, "DELETE FROM "+s.table("auth_login_attempts")+" WHERE state_hash=$1 AND binding_hash=$2 AND expires_at>clock_timestamp() RETURNING verifier,nonce", tokenHash(state), tokenHash(binding)).Scan(&a.Verifier, &a.Nonce)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrUnauthenticated
	}
	return a, err
}

// LoginExternal consumes verified issuer/subject only, never email. Provider
// verification is completed before this transaction. Serializing the immutable
// identity makes concurrent callbacks keep one owner and only the latest session.
func (s *Store) LoginExternal(ctx context.Context, issuer, subject, name string) (Identity, error) {
	return s.loginExternal(ctx, issuer, subject, name, nil)
}
func (s *Store) loginExternal(ctx context.Context, issuer, subject, name string, renewable *RenewableLogin) (Identity, error) {
	var out Identity
	if !s.requirePrincipal || issuer == "" || subject == "" || len(subject) > 512 || len(name) > 200 {
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
	if renewable != nil {
		token = renewable.Token
	}
	out.Token = token
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if renewable != nil {
			if err := s.lockProviderSession(ctx, tx, issuer, renewable.ProviderSID); err != nil {
				return err
			}
			var loggedOut bool
			if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("auth_logout_events")+" WHERE issuer=$1 AND provider_sid=$2 AND received_at>clock_timestamp()-interval '10 minutes')", issuer, renewable.ProviderSID).Scan(&loggedOut); err != nil {
				return err
			}
			if loggedOut {
				return ErrUnauthenticated
			}
		}
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", tokenHash(issuer+"\x00"+subject)); err != nil {
			return err
		}
		err := tx.QueryRow(ctx, "SELECT owner_id FROM "+s.table("auth_external_identities")+" WHERE issuer=$1 AND subject=$2", issuer, subject).Scan(&owner)
		if errors.Is(err, pgx.ErrNoRows) {
			if _, err = tx.Exec(ctx, "INSERT INTO "+s.table("m03_access")+"(owner_id,generation,control_generation,can_read,can_play,can_coach,configured_offers) VALUES($1,1,1,true,true,true,true)", owner); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, "INSERT INTO "+s.table("auth_external_identities")+"(issuer,subject,owner_id,display_name) VALUES($1,$2,$3,$4)", issuer, subject, owner, name); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "SELECT owner_id FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner); err != nil {
			return err
		}
		if err = s.fenceAuthSessions(ctx, tx, owner); err != nil {
			return err
		}
		out.Principal = Principal{OwnerID: owner, Configured: true, sessionHash: tokenHash(token)}
		_, err = tx.Exec(ctx, "INSERT INTO "+s.table("m04_sessions")+"(token_hash,owner_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '12 hours')", out.Principal.sessionHash, owner)
		if err == nil && renewable != nil {
			err = s.installFamily(ctx, tx, out.Principal, *renewable)
		}
		return err
	})
	return out, err
}
func (s *Store) fenceAuthSessions(ctx context.Context, tx pgx.Tx, owner string) error {
	for _, q := range []string{
		"INSERT INTO " + s.table("auth_session_events") + "(owner_id,token_hash,kind) SELECT owner_id,token_hash,'revoked' FROM " + s.table("m04_sessions") + " WHERE owner_id=$1 AND revoked_at IS NULL",
		"UPDATE " + s.table("m03_access") + " SET active_auth_family=NULL WHERE owner_id=$1",
		"UPDATE " + s.table("m04_sessions") + " SET revoked_at=clock_timestamp() WHERE owner_id=$1 AND revoked_at IS NULL",
		"UPDATE " + s.table("auth_session_families") + " SET token_ciphertext=''::bytea,refresh_uncertain=true WHERE owner_id=$1 AND octet_length(token_ciphertext)>0",
		"DELETE FROM " + s.table("m04_controls") + " WHERE owner_id=$1",
		"UPDATE " + s.table("m03_access") + " SET control_generation=control_generation+1 WHERE owner_id=$1",
	} {
		if _, err := tx.Exec(ctx, q, owner); err != nil {
			return err
		}
	}
	return s.pauseAuthPlayback(ctx, tx, owner)
}
func (s *Store) LogoutExternal(ctx context.Context) error {
	p, err := principalFrom(ctx)
	if err != nil {
		return err
	}
	return s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT owner_id FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", p.OwnerID); err != nil {
			return err
		}
		if err := s.authorize(ctx, tx, p.OwnerID); err != nil {
			return err
		}
		return s.fenceAuthSessions(ctx, tx, p.OwnerID)
	})
}
func (s *Store) AuthDisplayName(ctx context.Context, p Principal) (string, error) {
	ctx = WithPrincipal(ctx, p)
	if err := s.currentRead(ctx, p.OwnerID); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var name string
	err := s.pool.QueryRow(ctx, "SELECT display_name FROM "+s.table("auth_external_identities")+" WHERE owner_id=$1", p.OwnerID).Scan(&name)
	return name, err
}

// GrantOperatorPaid is a local operator seam, never reachable over HTTP. Its
// provenance is explicitly synthetic and cannot be mistaken for purchase proof.
func (s *Store) GrantOperatorPaid(ctx context.Context, owner, reason string, duration time.Duration) (string, error) {
	if !s.requirePrincipal || s.schema != "cardford_auth_local" || !recordID(owner) || len(reason) < 1 || len(reason) > 500 || duration < time.Minute || duration > 7*24*time.Hour {
		return "", ErrAccess
	}
	id, err := freshID()
	if err != nil {
		return "", err
	}
	err = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var now time.Time
		if err := tx.QueryRow(ctx, "SELECT clock_timestamp() FROM "+s.table("m03_access")+" WHERE owner_id=$1 FOR UPDATE", owner).Scan(&now); err != nil {
			return err
		}
		until := now.Add(duration)
		if _, err := tx.Exec(ctx, "INSERT INTO "+s.table("auth_operator_grants")+"(id,owner_id,reason,expires_at) VALUES($1,$2,$3,$4)", id, owner, reason, until); err != nil {
			return err
		}
		for _, target := range [][2]string{{"hearts", "solo"}, {"spades", "solo"}, {"spades", "partners"}, {"trix", "basic-solo"}, {"trix", "basic-partners"}, {"trix", "complex-solo"}, {"trix", "complex-partners"}} {
			g := Grant{ID: id + "-" + target[0] + "-" + target[1], OwnerID: owner, OfferID: "operator-local-paid", OfferVersion: "1.0.0", SourceKind: "operator-test", SourceID: id, ValidFrom: now, ValidUntil: &until, Terms: GrantTerms{Version: RecordVersion, Game: target[0], Variant: target[1], CanPlay: true, CanCoach: true, Tools: []string{"advice", "review-alternative"}, BucketID: "operator-local-paid", Period: "lifetime", Timezone: "UTC", Unlimited: true, ExpiryRule: "pause-at-expiry"}}
			if err := validateGrant(g); err != nil {
				return err
			}
			raw, _ := json.Marshal(g.Terms)
			if err := s.insertGrant(ctx, tx, g, raw); err != nil {
				return err
			}
		}
		return s.bumpAccess(ctx, tx, owner)
	})
	return id, err
}
func (s *Store) AuthPlan(ctx context.Context, p Principal) (string, error) {
	ctx = WithPrincipal(ctx, p)
	ctx, cancel := s.bounded(ctx)
	defer cancel()
	if err := s.authorize(ctx, s.pool, p.OwnerID); err != nil {
		return "", err
	}
	var paid bool
	err := s.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+s.table("m03_grants")+" WHERE owner_id=$1 AND source_kind IN ('purchase','family','operator-test') AND NOT revoked AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp())", p.OwnerID).Scan(&paid)
	if paid {
		return "paid", err
	}
	return "free", err
}
func (s *Store) pauseAuthPlayback(ctx context.Context, tx pgx.Tx, owner string) error {
	rows, err := tx.Query(ctx, "SELECT game_id FROM "+s.table("m05_playback")+" WHERE owner_id=$1 AND phase IN ('running','held','paused')", owner)
	if err != nil {
		return err
	}
	var games []string
	for rows.Next() {
		var game string
		if err = rows.Scan(&game); err != nil {
			rows.Close()
			return err
		}
		games = append(games, game)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, game := range games {
		row, err := s.readLifecycleTx(ctx, tx, owner, game)
		if err != nil {
			return err
		}
		if _, err = s.materializeLifecycleTx(ctx, tx, owner, game, &row); err != nil {
			return err
		}
		if row.Phase == "running" || row.Phase == "held" {
			pauseLifecycle(&row, row.ServerNow, "control_lost")
			if err = s.saveLifecycleTx(ctx, tx, owner, game, row); err != nil {
				return err
			}
			if err = s.cancelLifecycleWorkTx(ctx, tx, owner, game, true); err != nil {
				return err
			}
		}
	}
	return nil
}
