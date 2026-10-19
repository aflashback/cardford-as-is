package records

import (
	"bytes"
	"cardford/server/internal/coachui"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func coachTestItems(t *testing.T, id string) (CoachUISummary, []CoachUIStoredItem) {
	t.Helper()
	raw, e := os.ReadFile("../contracts/testdata/validation-fixtures.json")
	if e != nil {
		t.Fatal(e)
	}
	var fixtures []struct {
		ID  string `json:"id"`
		Raw string `json:"raw"`
	}
	_ = json.Unmarshal(raw, &fixtures)
	var frame json.RawMessage
	for _, f := range fixtures {
		if f.ID == "witness-ReviewFrame" {
			frame = json.RawMessage(f.Raw)
		}
	}
	if frame == nil {
		t.Fatal("missing actor frame")
	}
	meta := (coachui.MockProvider{}).Metadata()
	summary := CoachUISummary{SessionID: id, GameID: "game", GameType: "spades", VariantID: "solo", SourceUnitID: "hand-1", DecisionID: PlatformDecisionID("game", 0), SourceRevision: 0, Kind: "cue", Provider: meta}
	item := CoachUIItem{ItemID: id + "-item", SessionID: id, Kind: "cue", Title: "Mock cue", Body: "Preview only", Explanation: "Saved actor context", SourceRevision: 0, DecisionID: summary.DecisionID, Provider: meta, ReplayAvailable: true}
	return summary, []CoachUIStoredItem{{Item: item, Frames: []json.RawMessage{frame}}}
}
func TestCoachUIAtomicQuotaRecoveryAndIndependentAllowance(t *testing.T) {
	s, other, _, _, a := workFixture(t, 0, true)
	ctx := context.Background()
	if _, e := s.GetPlatformProfile(ctx, "owner"); e != nil {
		t.Fatal(e)
	}
	if _, e := s.pool.Exec(ctx, "UPDATE "+s.table("m04_profiles")+" SET plan='practice' WHERE owner_id='owner'"); e != nil {
		t.Fatal(e)
	}
	access, _, e := s.CoachUIAccess(ctx, "owner", "spades", "solo")
	if e != nil || access.Unlimited || access.Remaining == nil || *access.Remaining != 2 {
		t.Fatalf("initial access: %+v %v", access, e)
	}
	seed, seedItems := coachTestItems(t, "seed-session")
	if _, e = s.SaveCoachUISession(localCommand(ctx, "seed-session"), a, 0, seed, seedItems, true); e != nil {
		t.Fatal(e)
	}
	// Two independent connections compete for the final daily slot.
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := fmt.Sprintf("session-%d", i)
			summary, items := coachTestItems(t, id)
			store := s
			if i%2 == 1 {
				store = other
			}
			_, e := store.SaveCoachUISession(localCommand(ctx, id), a, 0, summary, items, true)
			errs <- e
		}(i)
	}
	wg.Wait()
	close(errs)
	success, exhausted := 0, 0
	for e := range errs {
		if e == nil {
			success++
		} else if errors.Is(e, ErrAllowance) {
			exhausted++
		} else {
			t.Fatal(e)
		}
	}
	if success != 1 || exhausted != 1 {
		t.Fatalf("success=%d exhausted=%d", success, exhausted)
	}
	recent, e := s.RecentCoachUISessions(ctx, "owner", 20)
	if e != nil || len(recent) != 2 {
		t.Fatalf("saved sessions: %d %v", len(recent), e)
	}
	summary, items := coachTestItems(t, recent[0].SessionID)
	receipt, e := other.SaveCoachUISession(localCommand(ctx, summary.SessionID), a, 0, summary, items, true)
	if e != nil || !receipt.Reconciled {
		t.Fatalf("recover: %v", e)
	}
	again, e := s.SaveCoachUISession(localCommand(ctx, summary.SessionID), a, 0, summary, items, true)
	if e != nil || !bytes.Equal(receipt.Receipt, again.Receipt) {
		t.Fatal("receipt changed", e)
	}
	if _, e = s.ReadCoachUIReplay(ctx, "owner", summary.SessionID+"-item"); e != nil {
		t.Fatal(e)
	}
	items[0].Item.ItemID += "-selection"
	items[0].Item.Kind = "selection"
	if _, e = s.SaveCoachUISession(localCommand(ctx, "related-after-exhaustion"), a, 0, summary, items, false); e != nil {
		t.Fatal("existing session closed by quota", e)
	}
	if _, e = s.SaveCoachUIFeedback(localCommand(ctx, "feedback-1"), "owner", summary.SessionID+"-item", 0, "helpful", "clear", "saved locally on server"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.SaveCoachUIFeedback(localCommand(ctx, "feedback-2"), "owner", summary.SessionID+"-item", 0, "not-helpful", "", ""); !errors.Is(e, ErrConflict) {
		t.Fatalf("stale feedback accepted: %v", e)
	}
	var oldCharges, used int
	if e = s.pool.QueryRow(ctx, "SELECT count(*) FROM "+s.table("m03_allowance_charges")).Scan(&oldCharges); e != nil {
		t.Fatal(e)
	}
	if oldCharges != 0 {
		t.Fatal("old allowance charged")
	}
	if e = s.pool.QueryRow(ctx, "SELECT used FROM "+s.table("coach_ui_daily_usage")+" WHERE owner_id='owner'").Scan(&used); e != nil || used != 2 {
		t.Fatal("feedback or retry changed quota", used, e)
	}
	// Previous-day usage must not follow the user into a new UTC day.
	if _, e = s.pool.Exec(ctx, "UPDATE "+s.table("coach_ui_daily_usage")+" SET quota_day=quota_day-1 WHERE owner_id='owner'"); e != nil {
		t.Fatal(e)
	}
	access, now, e := s.CoachUIAccess(ctx, "owner", "spades", "solo")
	if e != nil || *access.Remaining != 2 {
		t.Fatal("UTC rollover", access, e)
	}
	reset, e := time.Parse(time.RFC3339Nano, access.ResetAt)
	if e != nil || reset.Hour() != 0 || !reset.After(now) {
		t.Fatal("UTC reset", reset, e)
	}
}
func TestCoachUIFeedbackExportImmutableAndErasure(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	identity, e := s.NewLocalIdentity(context.Background())
	if e != nil {
		t.Fatal(e)
	}
	opening, ctx := localOpening(t, s, identity, "game")
	if _, e = s.CreateAccepted(localCommand(ctx, "bootstrap"), opening); e != nil {
		t.Fatal(e)
	}
	ctx = WithControl(ctx, "tab-a", opening.NewControlToken)
	access, e := s.ReadAccess(ctx, identity.Principal.OwnerID)
	if e != nil {
		t.Fatal(e)
	}
	a := opening.Admission
	a.Generation = access.Generation
	a.ControlRevision = access.ControlGeneration
	summary, items := coachTestItems(t, "session")
	summary.GameType = "spades"
	summary.VariantID = "partners"
	if _, e = s.SaveCoachUISession(localCommand(ctx, "start"), a, 0, summary, items, true); e != nil {
		t.Fatal(e)
	}
	for revision := int64(0); revision < 2; revision++ {
		if _, e = s.SaveCoachUIFeedback(localCommand(ctx, fmt.Sprint("f", revision)), a.OwnerID, "session-item", revision, "helpful", "reason", "note"); e != nil {
			t.Fatal(e)
		}
	}
	if _, e = s.SaveCoachUIFeedback(localCommand(ctx, "escaped-feedback"), a.OwnerID, "session-item", 2, "not-helpful", strings.Repeat("<", 200), strings.Repeat("<", 2000)); e != nil {
		t.Fatal("schema-valid escaped feedback rejected", e)
	}
	sessions, feedback, e := s.ExportCoachUI(ctx, a.OwnerID)
	if e != nil || len(sessions) != 1 || len(feedback) != 3 || sessions[0].Items[0].FeedbackRevision != 3 {
		t.Fatalf("export %d/%d: %v", len(sessions), len(feedback), e)
	}
	if _, e = s.pool.Exec(ctx, "UPDATE "+s.table("coach_ui_items")+" SET content=content WHERE owner_id=$1", a.OwnerID); e == nil {
		t.Fatal("immutable item changed")
	}
	foreign, e := s.NewLocalIdentity(context.Background())
	if e != nil {
		t.Fatal(e)
	}
	foreignCtx := WithPrincipal(context.Background(), foreign.Principal)
	if _, e = s.ReadCoachUIReplay(foreignCtx, foreign.Principal.OwnerID, "session-item"); !errors.Is(e, ErrReadDenied) {
		t.Fatal("foreign replay", e)
	}
	if e = s.EraseOwner(ctx); e != nil {
		t.Fatal(e)
	}
	for _, table := range []string{"coach_ui_sessions", "coach_ui_items", "coach_ui_feedback", "coach_ui_daily_usage"} {
		var count int
		if e = s.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+s.table(table)+" WHERE owner_id=$1", a.OwnerID).Scan(&count); e != nil || count != 0 {
			t.Fatal("erasure", table, count, e)
		}
	}
}

func TestCoachUIConfiguredPaidTargetsExpiryAndLeaseFences(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	identity, e := s.NewConfiguredIdentity(context.Background(), []Grant{configuredTemplate(0)})
	if e != nil {
		t.Fatal(e)
	}
	_, a, ctx := configuredOpening(t, s, identity, "game")
	check := func(game, variant, mode string, unlimited bool) {
		t.Helper()
		v, _, e := s.CoachUIAccess(ctx, a.OwnerID, game, variant)
		if e != nil || v.Mode != mode || v.Unlimited != unlimited {
			t.Fatalf("access %+v %v", v, e)
		}
	}
	check("spades", "partners", "free", false)
	grant := Grant{ID: "paid", OwnerID: a.OwnerID, OfferID: "paid-test", OfferVersion: "1", SourceKind: "purchase", SourceID: "verified-fixture", ValidFrom: time.Now().Add(-time.Hour), Terms: GrantTerms{Version: RecordVersion, Game: "spades", Variant: "partners", CanPlay: true, CanCoach: true, Tools: []string{"advice"}, BucketID: "paid-coaching", Period: "lifetime", Timezone: "UTC", Unlimited: true, ExpiryRule: "pause-at-expiry"}}
	if e = s.PutGrant(ctx, grant); e != nil {
		t.Fatal(e)
	}
	check("spades", "partners", "paid", true)
	check("hearts", "solo", "free", false)
	check("", "", "free", false)
	current, e := s.ReadAccess(ctx, a.OwnerID)
	if e != nil {
		t.Fatal(e)
	}
	a.Generation = current.Generation
	for i := 0; i < 3; i++ {
		summary, items := coachTestItems(t, fmt.Sprint("paid-", i))
		summary.VariantID = "partners"
		if _, e = s.SaveCoachUISession(localCommand(ctx, summary.SessionID), a, 0, summary, items, true); e != nil {
			t.Fatal("paid request", e)
		}
	}
	var usage int
	if e = s.pool.QueryRow(ctx, "SELECT count(*) FROM "+s.table("coach_ui_daily_usage")+" WHERE owner_id=$1", a.OwnerID).Scan(&usage); e != nil || usage != 0 {
		t.Fatal("paid consumed free bucket", usage, e)
	}
	if e = s.RevokeGrant(ctx, a.OwnerID, grant.ID); e != nil {
		t.Fatal(e)
	}
	check("spades", "partners", "free", false)
	expired := grant
	expired.ID = "expired"
	expired.SourceID = "expired-fixture"
	end := time.Now().Add(-time.Minute)
	expired.ValidUntil = &end
	if e = s.PutGrant(ctx, expired); e != nil {
		t.Fatal(e)
	}
	check("spades", "partners", "free", false)
	current, e = s.ReadAccess(ctx, a.OwnerID)
	if e != nil {
		t.Fatal(e)
	}
	a.Generation = current.Generation
	summary, items := coachTestItems(t, "stale")
	summary.VariantID = "partners"
	if _, e = s.SaveCoachUISession(localCommand(WithControl(ctx, "tab-a", "incorrect"), "bad-lease"), a, 0, summary, items, true); !errors.Is(e, ErrControl) {
		t.Fatal("stale lease", e)
	}
	if _, e = s.SaveCoachUISession(localCommand(ctx, "bad-revision"), a, 1, summary, items, true); !errors.Is(e, ErrConflict) {
		t.Fatal("stale revision", e)
	}
	if v, _, e := s.CoachUIAccess(ctx, a.OwnerID, "spades", "partners"); e != nil || v.Remaining == nil || *v.Remaining != 2 {
		t.Fatal("rejected commands spent quota", v, e)
	}
}
