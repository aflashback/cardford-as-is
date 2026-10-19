package records_test

import (
	"context"
	"errors"
	"testing"

	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"cardford/server/internal/service"
)

func TestAuthServiceAdmissionPreservesRenewableExpiry(t *testing.T) {
	store, codec, identity, expire := records.AuthServiceFixture(t)
	app, err := service.New(store, codec)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	ctx := context.Background()
	// Model a valid transport preflight followed by expiry before service admission.
	if _, err := store.Authenticate(ctx, identity.Token); err != nil {
		t.Fatal(err)
	}
	expire()
	request := transport.Request{Operation: "identity", Token: identity.Token}
	_, err = app.Call(ctx, request)
	var failure *transport.LocalError
	if !errors.As(err, &failure) || failure.Status != 401 || failure.Code != "session_renewal_required" {
		t.Fatalf("renewable admission returned %v; want typed renewal-required 401", err)
	}
	if _, err := store.RevokeRemembered(ctx, identity.Token); err != nil {
		t.Fatal(err)
	}
	_, err = app.Call(ctx, request)
	if !errors.As(err, &failure) || failure.Status != 401 || failure.Code != "UNAUTHENTICATED" {
		t.Fatalf("revoked admission returned %v; want terminal 401", err)
	}
}
