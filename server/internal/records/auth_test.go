package records

import (
	"context"
	"errors"
	"sync"
	"testing"
)

// AuthServiceFixture exposes only a test fixture to external service-boundary tests.
// The existing helper owns the disposable schema; no development account data is used.
func AuthServiceFixture(t *testing.T) (*Store, *DocumentCodec, Identity, func()) {
	t.Helper()
	codec, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	s, _ := storeTestOpen(t, codec)
	s.requirePrincipal = true
	id := renewableTestLogin(t, s, "service-admission", "sid")
	return s, codec, id, func() {
		t.Helper()
		_, err := s.pool.Exec(context.Background(), "UPDATE "+s.table("m04_sessions")+" SET expires_at=clock_timestamp() WHERE token_hash=$1", id.Principal.sessionHash)
		if err != nil {
			t.Fatal(err)
		}
	}
}

func TestAuthRequiredAndConcurrentLogin(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	first, err := s.LoginExternal(ctx, "https://issuer.example", "stable-subject", "Alice")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ReadAccess(ctx, first.Principal.OwnerID); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("missing principal accepted: %v", err)
	}
	if _, err = s.AllowanceUsed(ctx, first.Principal.OwnerID, "bucket", "period"); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal("allowance read accepted without principal", err)
	}
	if _, err = s.NewLocalIdentity(ctx); !errors.Is(err, ErrAccess) {
		t.Fatalf("fixture identity accepted: %v", err)
	}
	if _, err = s.NewConfiguredIdentity(ctx, nil); !errors.Is(err, ErrAccess) {
		t.Fatalf("fixture configured identity accepted: %v", err)
	}
	var wg sync.WaitGroup
	results := make(chan Identity, 2)
	failures := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, e := s.LoginExternal(ctx, "https://issuer.example", "stable-subject", "Changed name")
			if e != nil {
				failures <- e
			} else {
				results <- v
			}
		}()
	}
	wg.Wait()
	close(results)
	close(failures)
	for e := range failures {
		t.Fatal(e)
	}
	valid := 0
	for v := range results {
		if v.Principal.OwnerID != first.Principal.OwnerID {
			t.Fatal("subject remapped")
		}
		if _, e := s.Authenticate(ctx, v.Token); e == nil {
			valid++
		}
	}
	if valid != 1 {
		t.Fatalf("latest login count=%d", valid)
	}
	if _, e := s.Authenticate(ctx, first.Token); !errors.Is(e, ErrUnauthenticated) {
		t.Fatalf("old token live: %v", e)
	}
	foreign, e := s.LoginExternal(ctx, "https://issuer.example", "other-subject", "Alice")
	if e != nil || foreign.Principal.OwnerID == first.Principal.OwnerID {
		t.Fatal("name merged identities", e)
	}
}
func TestAuthLoginStateBindingOneUse(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	state := "abcdefghijklmnopqrstuvwxyz01234567890123456"
	binding := "ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890123456"
	a := LoginAttempt{State: state, Binding: binding, Verifier: "verifier", Nonce: "nonce"}
	if e := s.SaveLoginAttempt(ctx, a); e != nil {
		t.Fatal(e)
	}
	if _, e := s.ConsumeLoginAttempt(ctx, state, state); !errors.Is(e, ErrUnauthenticated) {
		t.Fatal("binding bypass", e)
	}
	got, e := s.ConsumeLoginAttempt(ctx, state, binding)
	if e != nil || got.Nonce != "nonce" {
		t.Fatal("valid state", e)
	}
	if _, e = s.ConsumeLoginAttempt(ctx, state, binding); !errors.Is(e, ErrUnauthenticated) {
		t.Fatal("replay accepted", e)
	}
}
func TestAuthIsolatedStoreGuard(t *testing.T) {
	for _, dsn := range []string{"postgres://x@127.0.0.1/cardford_windows", "postgres://x@203.0.113.1/cardford_auth_local_dev", "postgres://x@127.0.0.1/cardford_auth_local_dev_test"} {
		if _, err := OpenAuthLocalStore(context.Background(), dsn, storeTestCodec()); err == nil {
			t.Fatal("unsafe DB accepted")
		}
	}
}

func TestAuthFreshLoginCannotExtendExpiredForeground(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.requirePrincipal = true
	ctx := context.Background()
	identity, e := s.LoginExternal(ctx, "https://issuer.example", "expiry-subject", "Player")
	if e != nil {
		t.Fatal(e)
	}
	pctx := WithPrincipal(ctx, identity.Principal)
	template := configuredTemplate(3)
	if e = s.EnsureConfiguredFreeGrants(pctx, []Grant{template}); e != nil {
		t.Fatal(e)
	}
	template.OwnerID = identity.Principal.OwnerID
	template.ID = configuredFreeID(identity.Principal.OwnerID, template)
	identity.Grants = []Grant{template}
	_, _, _ = configuredOpening(t, s, identity, "auth-expired-game")
	_, e = s.pool.Exec(ctx, "INSERT INTO "+s.table("m05_playback")+"(game_id,owner_id,running,generation,control_generation,instance_id,phase,policy_version,retention_seconds,foreground_lease_until) VALUES('auth-expired-game',$1,true,1,1,'auth-test','running','pause-v1',300,clock_timestamp()-interval '301 seconds')", identity.Principal.OwnerID)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.LoginExternal(ctx, "https://issuer.example", "expiry-subject", "Player"); e != nil {
		t.Fatal(e)
	}
	var phase string
	var stillExpired bool
	e = s.pool.QueryRow(ctx, "SELECT phase,expires_at<clock_timestamp() FROM "+s.table("m05_playback")+" WHERE game_id='auth-expired-game'").Scan(&phase, &stillExpired)
	if e != nil || phase != "expired" || !stillExpired {
		t.Fatal("fresh login resurrected expiry", phase, e)
	}
}
