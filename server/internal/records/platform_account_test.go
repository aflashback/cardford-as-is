package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestM04EPlatformBillingScheduleAndRenewal(t *testing.T) {
	now := time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC)
	end, plan := now.Add(24*time.Hour), "unlimited"
	p := PlatformProfile{Plan: &plan, CurrentPeriodEnd: &end}
	v, err := platformBillingPreview(p, PlatformBillingRequest{Action: "select-plan", Plan: "practice"}, "preview", now)
	if err != nil || v.EffectiveAt != end.Format(time.RFC3339Nano) || v.AmountDueNow != nil || v.Currency != nil {
		t.Fatalf("preview: %+v %v", v, err)
	}
	next, operation, err := applyPlatformBilling(p, v, "change", now)
	if err != nil || *next.Plan != "unlimited" || next.ScheduledPlan == nil || *next.ScheduledPlan != "practice" || operation.Status != "scheduled" {
		t.Fatalf("scheduled downgrade: %+v %+v %v", next, operation, err)
	}
	p.CurrentPeriodEnd = &now
	v, err = platformBillingPreview(p, PlatformBillingRequest{Action: "select-plan", Plan: "practice"}, "renew", now)
	if err != nil {
		t.Fatal(err)
	}
	next, operation, err = applyPlatformBilling(p, v, "renew", now)
	if err != nil || *next.Plan != "practice" || !next.CurrentPeriodEnd.Equal(now.Add(30*24*time.Hour)) || operation.Status != "confirmed" {
		t.Fatalf("expired selection renewal: %+v %+v %v", next, operation, err)
	}
	p.Configured = true
	if _, err = platformBillingPreview(p, PlatformBillingRequest{Action: "cancel"}, "blocked", now); err == nil {
		t.Fatal("configured policy received fixture billing")
	}
}

func platformTestIdentity(t *testing.T, s *Store) (Identity, context.Context) {
	t.Helper()
	i, err := s.NewLocalIdentity(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return i, WithPrincipal(context.Background(), i.Principal)
}
func platformTestBilling(t *testing.T, s *Store, ctx context.Context, id, plan string) AcceptedOutcome {
	t.Helper()
	v, err := s.PreviewPlatformBilling(ctx, PlatformBillingRequest{Action: "select-plan", Plan: plan})
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.ConfirmPlatformBilling(localCommand(ctx, id), v.PreviewID)
	if err != nil {
		t.Fatal(err)
	}
	return out
}
func platformTestFamily(t *testing.T, s *Store, ctx context.Context, q PlatformFamilyCommand) PlatformFamilyView {
	t.Helper()
	out, err := s.MutatePlatformFamily(localCommand(ctx, q.CommandID), q)
	if err != nil {
		t.Fatal(err)
	}
	var view PlatformFamilyView
	if err = json.Unmarshal(out.Receipt, &view); err != nil {
		t.Fatal(err)
	}
	return view
}

func TestM04EPlatformPreferencesReceiptsAndConfiguredIsolation(t *testing.T) {
	s, other := storeTestOpen(t, storeTestCodec())
	s.localService = true
	other.localService = true
	i, ctx := platformTestIdentity(t, s)
	p, err := s.GetPlatformProfile(ctx, i.Principal.OwnerID)
	if err != nil || p.Preferences != (PlatformPreferences{"asked", 1}) || p.PreferencesRevision != 0 || *p.Plan != "unlimited" {
		t.Fatalf("defaults: %+v %v", p, err)
	}
	command := localCommand(ctx, "preferences-one")
	accepted, err := s.UpdatePlatformPreferences(command, 0, PlatformPreferences{"nudges", 1.4})
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := other.UpdatePlatformPreferences(command, 0, PlatformPreferences{"nudges", 1.4})
	if err != nil || !replayed.Reconciled || !bytes.Equal(accepted.Receipt, replayed.Receipt) {
		t.Fatalf("durable exact receipt: %+v %v", replayed, err)
	}
	if _, err = s.UpdatePlatformPreferences(localCommand(ctx, "stale-preferences"), 0, PlatformPreferences{"asked", 1}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale revision: %v", err)
	}
	if _, err = other.ReconcileService(ctx, "preferences-one", tokenHash("changed")); !errors.Is(err, ErrCommandDigest) {
		t.Fatalf("changed intent: %v", err)
	}
	configured, err := s.NewConfiguredIdentity(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	configuredCtx := WithPrincipal(context.Background(), configured.Principal)
	cp, err := s.GetPlatformProfile(configuredCtx, configured.Principal.OwnerID)
	if err != nil || !cp.Configured || cp.Plan != nil || cp.CurrentPeriodEnd != nil {
		t.Fatalf("configured profile: %+v %v", cp, err)
	}
	if _, err = s.PreviewPlatformBilling(configuredCtx, PlatformBillingRequest{Action: "select-plan", Plan: "family"}); err == nil {
		t.Fatal("configured identity got local billing")
	}
	if _, err = s.GetPlatformFamily(configuredCtx); err == nil {
		t.Fatal("configured identity got local family")
	}
	c, err := s.ReadAccessContext(configuredCtx, configured.Principal.OwnerID, "", "")
	if err != nil || len(c.Grants) != 0 {
		t.Fatalf("configured broad grants: %+v %v", c, err)
	}
	if _, err = s.GetPlatformProfile(configuredCtx, i.Principal.OwnerID); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("foreign profile: %v", err)
	}
}

func TestM04EPlatformFamilyCoverageHeldSeatsAndPayerErasure(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.localService = true
	payer, payerCtx := platformTestIdentity(t, s)
	member, memberCtx := platformTestIdentity(t, s)
	stranger, strangerCtx := platformTestIdentity(t, s)
	platformTestBilling(t, s, payerCtx, "choose-family", "family")
	platformTestFamily(t, s, payerCtx, PlatformFamilyCommand{CommandID: "create-family", Action: "create"})
	invite := platformTestFamily(t, s, payerCtx, PlatformFamilyCommand{CommandID: "invite-member", Action: "invite", InviteeID: member.Principal.OwnerID, SeatClass: "limited"})
	if len(invite.Invitations) != 1 || invite.Invitations[0].Token == "" {
		t.Fatal("invitation token missing from original command")
	}
	token := invite.Invitations[0].Token
	q := PlatformFamilyCommand{CommandID: "foreign-accept", Action: "accept", Token: token, AcknowledgeIndividualCoverage: true}
	if _, err := s.MutatePlatformFamily(localCommand(strangerCtx, q.CommandID), q); err == nil {
		t.Fatal("foreign invitation accepted")
	}
	q.CommandID = "accept-member"
	view := platformTestFamily(t, s, memberCtx, q)
	if view.Role != "member" || len(view.Members) != 1 || view.Members[0].PlayerID != member.Principal.OwnerID || len(view.Invitations) != 0 {
		t.Fatalf("member privacy: %+v", view)
	}
	if _, err := s.pool.Exec(context.Background(), "UPDATE "+s.table("m04_profiles")+" SET current_period_end=clock_timestamp()-interval '1 second' WHERE owner_id=$1", member.Principal.OwnerID); err != nil {
		t.Fatal(err)
	}
	a, err := s.FixturePlatformAccess(memberCtx, member.Principal.OwnerID, "", "")
	if err != nil || !a.Covered || a.Plan != "practice" || a.Remaining == nil || *a.Remaining != 4 {
		t.Fatalf("limited family authority: %+v %v", a, err)
	}
	before, err := s.ReadAccess(memberCtx, member.Principal.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	platformTestBilling(t, s, payerCtx, "payer-cancel", "family")
	after, err := s.ReadAccess(memberCtx, member.Principal.OwnerID)
	if err != nil || after.Generation <= before.Generation {
		t.Fatalf("payer billing member fence: %+v %v", after, err)
	}
	platformTestFamily(t, s, payerCtx, PlatformFamilyCommand{CommandID: "remove-member", Action: "remove", AssignmentID: view.Members[0].AssignmentID})
	read, err := s.GetPlatformFamily(payerCtx)
	if err != nil {
		t.Fatal(err)
	}
	if len(read.Members) != 2 || read.Members[1].Status != "held" {
		t.Fatalf("held seat missing: %+v", read)
	}
	a, err = s.FixturePlatformAccess(memberCtx, member.Principal.OwnerID, "", "")
	if err != nil || a.Covered {
		t.Fatalf("removed member retained family coverage: %+v %v", a, err)
	}
	_ = stranger
	platformTestFamily(t, s, payerCtx, PlatformFamilyCommand{CommandID: "second-limited", Action: "invite", InviteeID: stranger.Principal.OwnerID, SeatClass: "limited"})
	fourth, _ := platformTestIdentity(t, s)
	full := PlatformFamilyCommand{CommandID: "held-full", Action: "invite", InviteeID: fourth.Principal.OwnerID, SeatClass: "limited"}
	if _, err = s.MutatePlatformFamily(localCommand(payerCtx, full.CommandID), full); err == nil {
		t.Fatal("held seat was recycled before renewal")
	}
	if err = s.EraseOwner(payerCtx); err != nil {
		t.Fatal(err)
	}
	p, err := s.GetPlatformProfile(memberCtx, member.Principal.OwnerID)
	if err != nil || p.Preferences != (PlatformPreferences{"asked", 1}) {
		t.Fatalf("payer erasure damaged member profile: %+v %v", p, err)
	}
	read, err = s.GetPlatformFamily(memberCtx)
	if err != nil || read.Role != "none" {
		t.Fatalf("payer erasure left family membership: %+v %v", read, err)
	}
	if _, err = s.GetPlatformProfile(payerCtx, payer.Principal.OwnerID); err == nil {
		t.Fatal("erased payer can read profile")
	}
}

func TestM04EPlatformFixtureQuotaUsesOriginalLifetimeGrant(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	s.localService = true
	i, ctx := platformTestIdentity(t, s)
	// Reuse the setup helper with the unchanged Spades Partners fixture grant.
	i.Grants = []Grant{i.Grants[2]}
	if _, err := s.GetPlatformProfile(ctx, i.Principal.OwnerID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(context.Background(), "UPDATE "+s.table("m04_profiles")+" SET plan='practice' WHERE owner_id=$1", i.Principal.OwnerID); err != nil {
		t.Fatal(err)
	}
	for n := 0; n < 5; n++ {
		id := []string{"quota-a", "quota-b", "quota-c", "quota-d", "quota-e"}[n]
		loaded, a, nextCtx := configuredOpening(t, s, i, id, ctx)
		ctx = nextCtx
		request := configuredUnlockRequest(a, i.Grants[0], id)
		request.ExpectedRevision = loaded.Document.Revision
		out, err := s.UnlockCoaching(localCommand(ctx, "unlock-"+id), request)
		if n == 4 {
			if !errors.Is(err, ErrAllowance) {
				t.Fatalf("fifth quota: %v", err)
			}
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		var receipt CoachingUnlockReceipt
		if err = json.Unmarshal(out.Receipt, &receipt); err != nil {
			t.Fatal(err)
		}
		if receipt.PeriodKey != "lifetime" || receipt.BucketID != i.Grants[0].Terms.BucketID {
			t.Fatalf("rewrote original grant: %+v", receipt)
		}
		v, err := s.FixturePlatformAccess(ctx, i.Principal.OwnerID, id, a.UnitID)
		if err != nil || !v.HandUnlocked || *v.Remaining != int64(3-n) {
			t.Fatalf("daily fixture usage: %+v %v", v, err)
		}
		if n == 3 {
			if _, err = s.UnlockCoaching(localCommand(ctx, "repeat-fourth"), request); err != nil {
				t.Fatalf("unlocked hand blocked at zero: %v", err)
			}
		}
	}
}
