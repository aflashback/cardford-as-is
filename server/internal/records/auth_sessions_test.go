package records

import (
	"context"
	"errors"
	"testing"
	"time"
)

func renewableTestLogin(t *testing.T, s *Store, subject, sid string) Identity {
	t.Helper()
	token, err := freshID()
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.LoginRenewable(context.Background(), RenewableLogin{Token: token, Issuer: "https://issuer.example", Subject: subject, Name: "Player", ProviderSID: sid, KeyID: "test", Ciphertext: []byte("authenticated-ciphertext-fixture"), AccessExpiresAt: time.Now().Add(time.Hour), ProviderExpiresAt: time.Now().Add(365 * 24 * time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	return out
}
func TestAuthRenewableBoundariesPassiveAndStableRefresh(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	id := renewableTestLogin(t, s, "boundary", "sid")
	before, err := s.RememberedSession(ctx, id.Token)
	if err != nil {
		t.Fatal(err)
	}
	if delta := before.AccessExpiresAt.Sub(before.ServerTime); delta > AccessLifetime || delta < AccessLifetime-time.Second {
		t.Fatal("access not fifteen minutes", delta)
	}
	if delta := before.IdleExpiresAt.Sub(before.ServerTime); delta > IdleLifetime || delta < IdleLifetime-time.Second {
		t.Fatal("idle not ninety days", delta)
	}
	if delta := before.AbsoluteExpiresAt.Sub(before.ServerTime); delta > AbsoluteLifetime || delta < AbsoluteLifetime-time.Second {
		t.Fatal("absolute not 180 days", delta)
	}
	again, err := s.RememberedSession(ctx, id.Token)
	if err != nil || !again.IdleExpiresAt.Equal(before.IdleExpiresAt) {
		t.Fatal("status extended idle", err)
	}
	_, claimed, err := s.ClaimRefresh(ctx, id.Token, "too-early")
	if err != nil || claimed {
		t.Fatal("early passive refresh called provider", err)
	}
	if _, err = s.pool.Exec(ctx, "UPDATE "+s.table("m04_sessions")+" SET expires_at=clock_timestamp() WHERE token_hash=$1", id.Principal.sessionHash); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Authenticate(ctx, id.Token); !errors.Is(err, ErrRenewalRequired) {
		t.Fatal("expired access admitted", err)
	}
	if err = s.currentRead(WithPrincipal(ctx, id.Principal), id.Principal.OwnerID); !errors.Is(err, ErrRenewalRequired) {
		t.Fatal("access expiry during a decoded read lost its renewable outcome", err)
	}
	f, claimed, err := s.ClaimRefresh(ctx, id.Token, "one")
	if err != nil || !claimed {
		t.Fatal(err)
	}
	if _, _, err = s.ClaimRefresh(ctx, id.Token, "two"); !errors.Is(err, ErrRefreshBusy) {
		t.Fatal("overlap redeemed same token", err)
	}
	if err = s.CompleteRefresh(ctx, f, "test", []byte("rotated"), time.Now().Add(time.Hour), time.Now().Add(IdleLifetime)); err != nil {
		t.Fatal(err)
	}
	after, err := s.RememberedSession(ctx, id.Token)
	if err != nil || after.ID != before.ID || !after.AbsoluteExpiresAt.Equal(before.AbsoluteExpiresAt) || after.Generation != before.Generation {
		t.Fatal("refresh changed family", err)
	}
	if _, err = s.Authenticate(ctx, id.Token); err != nil {
		t.Fatal("stable cookie lost-response recovery", err)
	}
	if _, err = s.RevokeRemembered(ctx, id.Token); err != nil {
		t.Fatal(err)
	}
	if _, err = s.RevokeRemembered(ctx, id.Token); err != nil {
		t.Fatal("logout not idempotent", err)
	}
}
func TestAuthRenewableReplacementLogoutAndUncertainFence(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	for _, mode := range []string{"replacement", "logout", "uncertain", "abandoned"} {
		t.Run(mode, func(t *testing.T) {
			id := renewableTestLogin(t, s, mode, "sid-"+mode)
			_, err := s.pool.Exec(ctx, "UPDATE "+s.table("m04_sessions")+" SET expires_at=clock_timestamp() WHERE token_hash=$1", id.Principal.sessionHash)
			if err != nil {
				t.Fatal(err)
			}
			f, claimed, err := s.ClaimRefresh(ctx, id.Token, "claimed")
			if err != nil || !claimed {
				t.Fatal(err)
			}
			switch mode {
			case "replacement":
				renewableTestLogin(t, s, mode, "new-sid")
			case "logout":
				_, err = s.RevokeRemembered(ctx, id.Token)
			case "uncertain":
				err = s.MarkRefreshUncertain(ctx, f)
			case "abandoned":
				_, err = s.pool.Exec(ctx, "UPDATE "+s.table("auth_session_families")+" SET refresh_lease_until=clock_timestamp() WHERE token_hash=$1", f.ID)
			}
			if err != nil {
				t.Fatal(err)
			}
			if err = s.CompleteRefresh(ctx, f, "test", []byte("late-rotation"), time.Now().Add(time.Hour), time.Now().Add(IdleLifetime)); !errors.Is(err, ErrUnauthenticated) {
				t.Fatal("stale completion accepted", err)
			}
			if _, _, err = s.ClaimRefresh(ctx, id.Token, "retry"); !errors.Is(err, ErrUnauthenticated) {
				t.Fatal("unsafe replay", err)
			}
		})
	}
}
func TestAuthRenewableIdleAbsoluteAndProviderBoundaries(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	for _, column := range []string{"idle_expires_at", "absolute_expires_at", "provider_expires_at"} {
		t.Run(column, func(t *testing.T) {
			id := renewableTestLogin(t, s, column, "sid")
			set := column + "=clock_timestamp()"
			if column == "absolute_expires_at" {
				set += ",idle_expires_at=clock_timestamp()"
			}
			if _, err := s.pool.Exec(ctx, "UPDATE "+s.table("auth_session_families")+" SET "+set+" WHERE token_hash=$1", id.Principal.sessionHash); err != nil {
				t.Fatal(err)
			}
			if _, err := s.RememberedSession(ctx, id.Token); !errors.Is(err, ErrUnauthenticated) {
				t.Fatal("deadline accepted", err)
			}
			if _, _, err := s.ClaimRefresh(ctx, id.Token, "late"); !errors.Is(err, ErrUnauthenticated) {
				t.Fatal("deadline renewed", err)
			}
		})
	}
}
func TestAuthProviderLogoutSIDReplayAndSharedReplacement(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	first := renewableTestLogin(t, s, "same-owner", "old-sid")
	current := renewableTestLogin(t, s, "same-owner", "new-sid")
	if _, err := s.RevokeProviderSession(ctx, "https://issuer.example", "old-sid", "old-event"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, current.Token); err != nil {
		t.Fatal("old sid killed current", err)
	}
	next := renewableTestLogin(t, s, "same-owner", "new-sid")
	if _, err := s.RevokeProviderSession(ctx, "https://issuer.example", "new-sid", "shared-event"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, next.Token); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal("shared sid remained active", err)
	}
	replacement := renewableTestLogin(t, s, "same-owner", "after-logout-sid")
	if _, err := s.RevokeProviderSession(ctx, "https://issuer.example", "new-sid", "shared-event"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, replacement.Token); err != nil {
		t.Fatal("replayed event revoked replacement", err)
	}
	events, err := s.SessionChanges(ctx, 0)
	if err != nil || len(events) < 2 || events[0].Principal.SessionID() != first.Principal.SessionID() {
		t.Fatal("missing durable invalidation", err)
	}
}

func TestAuthLateRefreshPausesWithoutMovingRetention(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	id := renewableTestLogin(t, s, "late-play", "sid")
	pctx := WithPrincipal(ctx, id.Principal)
	template := configuredTemplate(3)
	if err := s.EnsureConfiguredFreeGrants(pctx, []Grant{template}); err != nil {
		t.Fatal(err)
	}
	template.OwnerID = id.Principal.OwnerID
	template.ID = configuredFreeID(id.Principal.OwnerID, template)
	id.Grants = []Grant{template}
	_, _, _ = configuredOpening(t, s, id, "renewal-game")
	_, err := s.pool.Exec(ctx, "INSERT INTO "+s.table("m05_playback")+"(game_id,owner_id,running,generation,control_generation,instance_id,phase,policy_version,retention_seconds,foreground_lease_until) VALUES('renewal-game',$1,true,1,1,'auth-test','running','pause-v1',300,clock_timestamp()+interval '30 seconds')", id.Principal.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.pool.Exec(ctx, "UPDATE "+s.table("m04_sessions")+" SET expires_at=clock_timestamp() WHERE token_hash=$1", id.Principal.sessionHash); err != nil {
		t.Fatal(err)
	}
	f, claimed, err := s.ClaimRefresh(ctx, id.Token, "late")
	if err != nil || !claimed {
		t.Fatal(err)
	}
	if err = s.CompleteRefresh(ctx, f, "test", []byte("rotated"), time.Now().Add(time.Minute), time.Now().Add(IdleLifetime)); err != nil {
		t.Fatal(err)
	}
	var phase string
	var expiry time.Time
	if err = s.pool.QueryRow(ctx, "SELECT phase,expires_at FROM "+s.table("m05_playback")+" WHERE game_id='renewal-game'").Scan(&phase, &expiry); err != nil || phase != "paused" {
		t.Fatal("late refresh revived game", phase, err)
	}
	f, claimed, err = s.ClaimRefresh(ctx, id.Token, "second")
	if err != nil || !claimed {
		t.Fatal(err)
	}
	if err = s.CompleteRefresh(ctx, f, "test", []byte("rotated-again"), time.Now().Add(time.Minute), time.Now().Add(IdleLifetime)); err != nil {
		t.Fatal(err)
	}
	var second time.Time
	if err = s.pool.QueryRow(ctx, "SELECT expires_at FROM "+s.table("m05_playback")+" WHERE game_id='renewal-game'").Scan(&second); err != nil || !second.Equal(expiry) {
		t.Fatal("renewal extended pause retention", err)
	}
}
func TestAuthCleanupRemovesRevokedAndExpiredSecrets(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	id := renewableTestLogin(t, s, "cleanup", "sid")
	if _, err := s.RevokeRemembered(ctx, id.Token); err != nil {
		t.Fatal(err)
	}
	var size int
	if err := s.pool.QueryRow(ctx, "SELECT octet_length(token_ciphertext) FROM "+s.table("auth_session_families")+" WHERE token_hash=$1", id.Principal.sessionHash).Scan(&size); err != nil || size != 0 {
		t.Fatal("revocation retained secret", err)
	}
	live := renewableTestLogin(t, s, "cleanup", "other")
	if _, err := s.pool.Exec(ctx, "UPDATE "+s.table("auth_session_families")+" SET idle_expires_at=clock_timestamp() WHERE token_hash=$1", live.Principal.sessionHash); err != nil {
		t.Fatal(err)
	}
	if err := s.CleanupAuthSecrets(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.pool.QueryRow(ctx, "SELECT octet_length(token_ciphertext) FROM "+s.table("auth_session_families")+" WHERE token_hash=$1", live.Principal.sessionHash).Scan(&size); err != nil || size != 0 {
		t.Fatal("expiry retained secret", err)
	}
}

func TestAuthProviderLogoutFencesPendingVerifiedLogin(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	// The provider proof was obtained, but the callback has not committed a family.
	token, _ := freshID()
	pending := RenewableLogin{Token: token, Issuer: "https://issuer.example", Subject: "pending", Name: "Player", ProviderSID: "logged-out-sid", KeyID: "test", Ciphertext: []byte("ciphertext"), AccessExpiresAt: time.Now().Add(time.Minute), ProviderExpiresAt: time.Now().Add(IdleLifetime)}
	if _, err := s.RevokeProviderSession(ctx, pending.Issuer, pending.ProviderSID, "before-callback"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LoginRenewable(ctx, pending); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal("pending callback restored logged-out sid", err)
	}
	pending.ProviderSID = "fresh-provider-session"
	if _, err := s.LoginRenewable(ctx, pending); err != nil {
		t.Fatal("different sid blocked", err)
	}
}
