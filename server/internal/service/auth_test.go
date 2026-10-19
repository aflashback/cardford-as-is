package service

import (
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"context"
	"testing"
	"time"
)

func TestAuthConfiguredBootstrapInstallsFreeBeforeCatalog(t *testing.T) {
	store, _, codec := serviceStores(t)
	policy := scopedOffers(t)
	app, err := NewConfigured(store, codec, policy)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	for _, operation := range []string{"identity", "realtime-snapshot"} {
		identity, err := store.NewConfiguredIdentity(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		r := transport.Request{Operation: operation, Token: identity.Token, Tab: "test-auth-tab"}
		if operation == "realtime-snapshot" {
			r.Body = []byte(`{"streamId":null,"workIds":[]}`)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, err = app.Call(ctx, r)
		cancel()
		if err != nil {
			t.Fatalf("%s bootstrap: %v", operation, err)
		}
		access, err := store.ReadAccessContext(records.WithPrincipal(context.Background(), identity.Principal), identity.Principal.OwnerID, "", "")
		if err != nil || len(access.Grants) == 0 {
			t.Fatalf("%s missing free bootstrap grants: %v", operation, err)
		}
	}
}
