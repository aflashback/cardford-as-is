package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"cardford/server/internal/access"
	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

func platformAccountError(err error) error {
	var e *records.PlatformAccountFailure
	if errors.As(err, &e) {
		return &transport.LocalError{Status: e.Status, Code: e.Code, Message: e.Message}
	}
	return err
}
func platformTargets() []access.Target {
	return []access.Target{{GameID: "hearts", VariantID: "solo"}, {GameID: "spades", VariantID: "solo"}, {GameID: "spades", VariantID: "partners"}, {GameID: "trix", VariantID: "basic-solo"}, {GameID: "trix", VariantID: "basic-partners"}, {GameID: "trix", VariantID: "complex-solo"}, {GameID: "trix", VariantID: "complex-partners"}}
}
func fixtureDecision(v records.FixturePlatformAccess, c records.AccessContext, target access.Target, game, unit, kind, tool string) access.Decision {
	d := access.Decision{AccessGeneration: c.Access.Generation, Applied: []access.Applied{}, Continuation: "pause-at-expiry", Reason: "no-grant"}
	if !c.Access.CanRead || kind == "play" && !c.Access.CanPlay || kind == "coach" && !c.Access.CanCoach {
		d.Reason = "revoked"
		return d
	}
	if !v.Covered {
		d.Reason = "expired"
		return d
	}
	if kind == "coach" && !access.SupportedTool(tool) {
		d.Reason = "wrong-tool"
		return d
	}
	var grant *records.Grant
	for i := range c.Grants {
		g := &c.Grants[i]
		if g.ID == records.LocalGrantID(c.Access.OwnerID, target.GameID, target.VariantID) {
			grant = g
			break
		}
	}
	if grant == nil {
		return d
	}
	if grant.Revoked {
		d.Reason = "revoked"
		return d
	}
	if c.Now.Before(grant.ValidFrom) || grant.ValidUntil != nil && !c.Now.Before(*grant.ValidUntil) {
		d.Reason = "expired"
		return d
	}
	if kind == "play" && !grant.Terms.CanPlay || kind == "coach" && !grant.Terms.CanCoach {
		return d
	}
	if kind == "coach" {
		found := false
		for _, candidate := range grant.Terms.Tools {
			found = found || candidate == tool
		}
		if !found {
			d.Reason = "wrong-tool"
			return d
		}
	}
	d.Applied = []access.Applied{{Offer: access.Component{ID: grant.OfferID, Version: grant.OfferVersion}, GrantID: grant.ID}}
	d.BucketID = grant.Terms.BucketID
	d.PeriodKey = "lifetime"
	if kind == "coach" {
		d.Remaining = v.Remaining
		if !v.HandUnlocked && v.Remaining != nil && *v.Remaining == 0 {
			d.Reason = "exhausted"
			return d
		}
		d.Reason = "grant"
		if v.HandUnlocked {
			d.Reason = "existing-unlock"
		}
	} else {
		d.Reason = "grant"
	}
	d.Allowed = true
	return d
}

// The full fixture app overlays its persisted individual/family coverage and
// UTC-day usage on the unchanged original fixture source grants. Store hooks
// repeat this permission check under the publication lock.
func (s *Service) fixturePlatformDecision(ctx context.Context, owner string, b gamekernel.BoundSession, id, unit, kind, intent, tool string) (access.Decision, error) {
	v, err := s.store.FixturePlatformAccess(ctx, owner, id, unit)
	if err != nil {
		return access.Decision{}, err
	}
	c, err := s.store.ReadAccessContext(ctx, owner, id, unit)
	if err != nil {
		return access.Decision{}, err
	}
	if v.Generation != c.Access.Generation {
		return access.Decision{}, records.ErrAccess
	}
	pin := b.Pin()
	return fixtureDecision(v, c, access.Target{GameID: pin.GameID, VariantID: pin.VariantID}, id, unit, kind, tool), nil
}
func (s *Service) fixturePlatformAdmission(ctx context.Context, owner string, b gamekernel.BoundSession, id, unit, kind, intent, tool string) (records.AccessAdmission, access.Decision, error) {
	d, err := s.fixturePlatformDecision(ctx, owner, b, id, unit, kind, intent, tool)
	if err != nil {
		return records.AccessAdmission{}, d, err
	}
	c, err := s.store.ReadAccessContext(ctx, owner, id, unit)
	if err != nil {
		return records.AccessAdmission{}, d, err
	}
	if d.AccessGeneration != c.Access.Generation {
		return records.AccessAdmission{}, d, records.ErrAccess
	}
	a, err := chosenAdmission(c, d, unit)
	return a, d, err
}
func fixtureCoachAccess(v records.FixturePlatformAccess) map[string]any {
	coverage := "expired"
	if v.Covered {
		coverage = "active"
	}
	var reset any
	if v.ResetsAt != nil {
		reset = v.ResetsAt.UTC().Format(time.RFC3339Nano)
	}
	coach := v.Covered && (v.HandUnlocked || v.Remaining == nil || *v.Remaining > 0)
	return map[string]any{"plan": v.Plan, "coverage": coverage, "canPlay": v.Covered, "canCoach": coach, "remainingHands": v.Remaining, "resetsAt": reset, "handUnlocked": v.HandUnlocked, "canStartWork": coach, "localMock": true}
}
func fixtureAccount(profile records.PlatformProfile, v records.FixturePlatformAccess) map[string]any {
	end := profile.CurrentPeriodEnd.UTC().Format(time.RFC3339Nano)
	return map[string]any{"authMode": "local-test", "player": map[string]any{"id": profile.OwnerID, "displayName": profile.DisplayName}, "access": fixtureCoachAccess(v), "subscription": map[string]any{"status": "local-mock", "plan": *profile.Plan, "cancelAtPeriodEnd": profile.CancelAtPeriodEnd, "currentPeriodEnd": end, "billingAvailable": false}, "offers": []map[string]any{
		{"id": "practice", "name": "Practice", "description": "Local fixture: four coached hands each UTC day.", "price": nil, "currency": nil},
		{"id": "unlimited", "name": "Unlimited", "description": "Local fixture: unlimited coached hands.", "price": nil, "currency": nil},
		{"id": "family", "name": "Family", "description": "Local fixture: five separate players, including the payer.", "price": nil, "currency": nil},
	}}
}
func (s *Service) platformAccountValue(ctx context.Context, owner string) (map[string]any, error) {
	profile, err := s.store.GetPlatformProfile(ctx, owner)
	if err != nil {
		return nil, err
	}
	if s.policy != nil {
		templates, e := offerTemplates(s.policy.Offers, "free", time.Now())
		if e != nil {
			return nil, e
		}
		if e = s.store.EnsureConfiguredFreeGrants(ctx, templates); e != nil {
			return nil, e
		}
	}
	c, err := s.store.ReadAccessContext(ctx, owner, "", "")
	if err != nil {
		return nil, err
	}
	used, err := s.store.PlatformTrialUsed(ctx, owner)
	if err != nil {
		return nil, err
	}
	availability := []map[string]any{}
	var fixture any
	var offers any
	mode := "configured"
	if s.policy == nil {
		mode = "fixture"
		activeGame, unit := c.Access.ActiveGameID, ""
		if activeGame != "" {
			l, e := s.store.Load(ctx, owner, activeGame)
			if e != nil {
				return nil, e
			}
			unit, e = s.codec.CurrentUnitID(l.Document, l.Snapshot)
			if e != nil {
				return nil, e
			}
		}
		v, e := s.store.FixturePlatformAccess(ctx, owner, activeGame, unit)
		if e != nil {
			return nil, e
		}
		if v.Generation != c.Access.Generation {
			return nil, records.ErrAccess
		}
		f := fixtureAccount(profile, v)
		legacyAccess := f["access"].(map[string]any)
		legacyAccess["canPlay"] = v.Covered && c.Access.CanRead && c.Access.CanPlay
		legacyAccess["canCoach"] = legacyAccess["canCoach"].(bool) && c.Access.CanRead && c.Access.CanCoach
		legacyAccess["canStartWork"] = legacyAccess["canCoach"]
		fixture = f
	} else {
		offers = *s.policy
	}
	for _, target := range platformTargets() {
		var play, coach access.Decision
		eligible := []string{}
		if s.policy == nil {
			v, e := s.store.FixturePlatformAccess(ctx, owner, "", "")
			if e != nil {
				return nil, e
			}
			if v.Generation != c.Access.Generation {
				return nil, records.ErrAccess
			}
			play = fixtureDecision(v, c, target, "prospective-session", "prospective-unit", "play", "")
			coach = fixtureDecision(v, c, target, "prospective-session", "prospective-unit", "coach", "advice")
		} else {
			play, err = s.resolver.Resolve(policyInput(c, target, access.Operation{Kind: "play", Intent: "start", SessionID: "prospective-session", UnitID: "prospective-unit", UnitKind: access.SupportedUnit(target), AtAdmissionBoundary: true}))
			if err != nil {
				return nil, err
			}
			coach, err = s.resolver.Resolve(policyInput(c, target, access.Operation{Kind: "coach", SessionID: "prospective-session", UnitID: "prospective-unit", UnitKind: access.SupportedUnit(target), AtAdmissionBoundary: true, ToolID: "advice"}))
			if err != nil {
				return nil, err
			}
			if !used && c.Access.CanRead {
				for _, offer := range s.policy.Offers {
					if offer.Enabled && offer.Kind == "access-trial" {
						for _, t := range offer.Targets {
							if t == target {
								eligible = append(eligible, offer.ID)
								break
							}
						}
					}
				}
			}
		}
		availability = append(availability, map[string]any{"target": target, "play": play, "coach": coach, "trialEligibleOfferIds": eligible})
	}
	return map[string]any{"schemaVersion": "1.0.0", "mode": mode, "accessGeneration": c.Access.Generation, "player": map[string]any{"id": profile.OwnerID, "displayName": profile.DisplayName}, "preferences": profile.PreferenceView(), "fixtureAccount": fixture, "offers": offers, "availability": availability, "billingAvailable": s.policy == nil, "familyAvailable": s.policy == nil}, nil
}
func (s *Service) platformAccount(ctx context.Context, owner string) (transport.Response, error) {
	v, err := s.platformAccountValue(ctx, owner)
	if err != nil {
		return transport.Response{}, platformAccountError(err)
	}
	return result("PlatformAccountView", v)
}
func (s *Service) platformPreferences(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	if len(r.Body) == 0 {
		view, err := s.store.GetPlatformPreferences(ctx, owner)
		if err != nil {
			return transport.Response{}, err
		}
		return result("PlatformPreferencesView", view)
	}
	var q struct {
		CommandID                   string                      `json:"commandId"`
		ExpectedPreferencesRevision int64                       `json:"expectedPreferencesRevision"`
		Preferences                 records.PlatformPreferences `json:"preferences"`
	}
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	ctx, prior, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if prior != nil {
		return accepted(*prior)
	}
	out, err := s.store.UpdatePlatformPreferences(ctx, q.ExpectedPreferencesRevision, q.Preferences)
	if err != nil {
		return transport.Response{}, err
	}
	return accepted(out)
}
func (s *Service) platformBillingPreview(ctx context.Context, _ string, r transport.Request) (transport.Response, error) {
	var q records.PlatformBillingRequest
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	v, err := s.store.PreviewPlatformBilling(ctx, q)
	if err != nil {
		return transport.Response{}, platformAccountError(err)
	}
	return result("BillingPreview", v)
}
func (s *Service) platformBillingChange(ctx context.Context, _ string, r transport.Request) (transport.Response, error) {
	var q struct {
		CommandID string `json:"commandId"`
		PreviewID string `json:"previewId"`
	}
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	ctx, prior, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if prior != nil {
		return accepted(*prior)
	}
	v, err := s.store.ConfirmPlatformBilling(ctx, q.PreviewID)
	if err != nil {
		return transport.Response{}, platformAccountError(err)
	}
	return accepted(v)
}
func (s *Service) platformFamily(ctx context.Context, _ string) (transport.Response, error) {
	v, err := s.store.GetPlatformFamily(ctx)
	if err != nil {
		return transport.Response{}, platformAccountError(err)
	}
	return result("FamilyView", v)
}
func (s *Service) platformFamilyCommand(ctx context.Context, _ string, r transport.Request) (transport.Response, error) {
	var q records.PlatformFamilyCommand
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	ctx, prior, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if prior != nil {
		return accepted(*prior)
	}
	v, err := s.store.MutatePlatformFamily(ctx, q)
	if err != nil {
		return transport.Response{}, platformAccountError(err)
	}
	return accepted(v)
}
func (s *Service) platformExport(ctx context.Context, owner string) (transport.Response, error) {
	account, err := s.platformAccountValue(ctx, owner)
	if err != nil {
		return transport.Response{}, platformAccountError(err)
	}
	inventory, err := s.store.PlatformExportInventory(ctx, owner)
	if err != nil {
		return transport.Response{}, err
	}
	games := []map[string]any{}
	decisions := []map[string]any{}
	for _, id := range inventory.GameIDs {
		l, e := s.store.Load(ctx, owner, id)
		if e != nil {
			return transport.Response{}, e
		}
		b, e := s.codec.Session(l.Document, l.Snapshot)
		if e != nil {
			return transport.Response{}, e
		}
		view, e := b.View(0)
		if e != nil {
			return transport.Response{}, e
		}
		games = append(games, map[string]any{"id": id, "revision": l.Document.Revision, "view": view})
	}
	for _, id := range inventory.DecisionIDs {
		d, e := s.store.ReadDecision(ctx, owner, id)
		if errors.Is(e, records.ErrAccess) || errors.Is(e, records.ErrReadDenied) {
			continue
		}
		if e != nil {
			return transport.Response{}, e
		}
		if d.Actor != 0 || d.Purpose != "coach-advice" && d.Purpose != "human-analysis" {
			continue
		}
		analysis, advice, e := records.OriginalDecision(d)
		if e != nil {
			return transport.Response{}, e
		}
		decisions = append(decisions, map[string]any{"decisionId": d.ID, "gameId": d.GameID, "revision": d.Revision, "policy": map[string]any{"id": d.Policy.ID, "version": d.Policy.Version}, "packetVersion": d.PacketVersion, "analysis": analysis.Registered, "advice": advice.Levels})
	}
	coachSessions, coachFeedback, err := s.store.ExportCoachUI(ctx, owner)
	if err != nil {
		return transport.Response{}, err
	}
	return result("PlatformExportView", map[string]any{"formatVersion": "platform-export-1", "exportedAt": time.Now().UTC().Format(time.RFC3339Nano), "mode": "local-test", "account": account, "games": games, "decisions": decisions, "coachedUnits": inventory.CoachedUnits, "billing": inventory.Billing, "coachSessions": coachSessions, "coachFeedback": coachFeedback})
}
