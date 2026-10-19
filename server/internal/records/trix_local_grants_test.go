package records

import (
	"context"
	"testing"
)

func TestTrixLocalGrantBackfillPreservesRevocationAndConfiguredIdentity(t *testing.T) {
	store, _ := storeTestOpen(t, trixCodec(t))
	ctx := context.Background()
	identity, err := store.newLocalIdentity(ctx, [][2]string{{"hearts", "solo"}, {"spades", "solo"}, {"spades", "partners"}})
	if err != nil {
		t.Fatal(err)
	}
	owner := identity.Principal.OwnerID
	ctx = WithPrincipal(ctx, identity.Principal)
	if err = store.EnsureLocalTrixGrants(ctx, owner); err != nil {
		t.Fatal(err)
	}
	grants, err := store.ReadAccessContext(ctx, owner, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(grants.Grants) != 7 {
		t.Fatalf("old fixture has %d grants", len(grants.Grants))
	}
	revoked := LocalGrantID(owner, "trix", "basic-solo")
	if err = store.RevokeGrant(ctx, owner, revoked); err != nil {
		t.Fatal(err)
	}
	if err = store.EnsureLocalTrixGrants(ctx, owner); err != nil {
		t.Fatal(err)
	}
	var remains bool
	if err = store.pool.QueryRow(ctx, "SELECT revoked FROM "+store.table("m03_grants")+" WHERE grant_id=$1", revoked).Scan(&remains); err != nil || !remains {
		t.Fatal("revoked grant revived", err)
	}
	configured, err := store.NewConfiguredIdentity(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	cctx := WithPrincipal(context.Background(), configured.Principal)
	if err = store.EnsureLocalTrixGrants(cctx, configured.Principal.OwnerID); err != nil {
		t.Fatal(err)
	}
	state, err := store.ReadAccessContext(cctx, configured.Principal.OwnerID, "", "")
	if err != nil || len(state.Grants) != 0 {
		t.Fatal("configured identity gained fixture access", err)
	}
}
