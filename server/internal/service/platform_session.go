package service

import (
	"context"
	"time"

	"cardford/server/internal/access"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
)

// platformSession composes actor-safe projections supplied by installed games.
// The legacy presentation is only the preserved current-game UI adapter; the
// registered view and server-issued candidate packet remain explicit boundaries.
func (s *Service) platformSession(ctx context.Context, owner, tab string) (transport.Response, error) {
	prefs, err := s.store.GetPlatformPreferences(ctx, owner)
	if err != nil {
		return transport.Response{}, err
	}
	c, err := s.store.ReadAccessContext(ctx, owner, "", "")
	if err != nil {
		return transport.Response{}, err
	}
	registry := s.registry
	handlers := sessions.DefaultHandlers()
	catalog := []map[string]any{}
	var fixture records.FixturePlatformAccess
	if s.policy == nil {
		fixture, err = s.store.FixturePlatformAccess(ctx, owner, "", "")
		if err != nil {
			return transport.Response{}, err
		}
		if fixture.Generation != c.Access.Generation {
			return transport.Response{}, records.ErrAccess
		}
	}
	for _, descriptor := range registry.Catalog(handlers.Engine, handlers.UI) {
		for _, variant := range descriptor.Variants {
			target := access.Target{GameID: descriptor.GameID, VariantID: variant.ID}
			var start access.Decision
			if s.policy == nil {
				start = fixtureDecision(fixture, c, target, "prospective-session", "prospective-unit", "play", "")
			} else {
				start, err = s.resolver.Resolve(policyInput(c, target, access.Operation{Kind: "play", Intent: "start", SessionID: "prospective-session", UnitID: "prospective-unit", UnitKind: access.SupportedUnit(target), AtAdmissionBoundary: true}))
				if err != nil {
					return transport.Response{}, err
				}
			}
			mode := descriptor.GameID
			if mode == "spades" {
				mode += "-" + variant.ID
			}
			catalog = append(catalog, map[string]any{"mode": mode, "selector": sessions.Selector{GameID: descriptor.GameID, VariantID: variant.ID, ModuleVersion: descriptor.ModuleVersion, RuleProfileID: variant.RuleProfileID}, "start": start})
		}
	}
	var active any
	if c.Access.ActiveGameID != "" {
		active = c.Access.ActiveGameID
	}
	out := map[string]any{"platformSchemaVersion": "1.0.0", "playerId": owner, "activeGameId": active, "session": nil, "preferences": prefs, "catalog": catalog}
	id := c.Access.ActiveGameID
	if id == "" {
		return result("PlatformSessionView", out)
	}
	loaded, err := s.store.Load(ctx, owner, id)
	if err != nil {
		return transport.Response{}, err
	}
	b, err := s.codec.Session(loaded.Document, loaded.Snapshot)
	if err != nil {
		return transport.Response{}, fail(422, "saved-module-reader-unavailable")
	}
	view, err := b.View(0)
	if err != nil {
		return transport.Response{}, err
	}
	presentation, err := b.Presentation(0)
	if err != nil {
		return transport.Response{}, err
	}
	n, err := b.Node()
	if err != nil {
		return transport.Response{}, err
	}
	var actor any
	human := n.Kind == "actor" && n.Seat != nil && *n.Seat == 0
	if n.Kind == "sealed" {
		for _, seat := range n.Actors {
			human = human || seat == 0
		}
	}
	if human {
		packet, e := b.Packet(0)
		if e != nil {
			return transport.Response{}, e
		}
		actor = packet
	}
	owned, generation, err := s.store.ControlStatus(ctx, tab)
	if err != nil {
		return transport.Response{}, err
	}
	unit, err := s.codec.CurrentUnitID(loaded.Document, loaded.Snapshot)
	if err != nil {
		return transport.Response{}, err
	}
	c, err = s.store.ReadAccessContext(ctx, owner, id, unit)
	if err != nil {
		return transport.Response{}, err
	}
	if c.Access.ActiveGameID != id {
		return transport.Response{}, records.ErrConflict
	}
	target, op, err := sessionOperation(b, id, unit, "play", "continue", "")
	if err != nil {
		return transport.Response{}, err
	}
	var play, coach access.Decision
	unlocked := false
	allowance := map[string]any{"kind": "none", "unit": nil, "remaining": nil, "resetsAt": nil, "expiresAt": nil}
	if s.policy == nil {
		fixture, err = s.store.FixturePlatformAccess(ctx, owner, id, unit)
		if err != nil {
			return transport.Response{}, err
		}
		if fixture.Generation != c.Access.Generation {
			return transport.Response{}, records.ErrAccess
		}
		play = fixtureDecision(fixture, c, target, id, unit, "play", "")
		coach = fixtureDecision(fixture, c, target, id, unit, "coach", "advice")
		unlocked = fixture.HandUnlocked
		if coach.Allowed || coach.Reason == "exhausted" {
			allowance["kind"] = "unlimited"
			allowance["unit"] = "hand"
			if fixture.Remaining != nil {
				allowance["kind"] = "limited"
				allowance["remaining"] = fixture.Remaining
			}
			if fixture.ResetsAt != nil {
				allowance["resetsAt"] = fixture.ResetsAt.UTC().Format(time.RFC3339Nano)
			}
			allowance["expiresAt"] = fixture.CurrentPeriodEnd.UTC().Format(time.RFC3339Nano)
		}
	} else {
		play, err = s.resolver.Resolve(policyInput(c, target, op))
		if err != nil {
			return transport.Response{}, err
		}
		op.Kind, op.Intent, op.ToolID = "coach", "", "advice"
		coach, err = s.resolver.Resolve(policyInput(c, target, op))
		if err != nil {
			return transport.Response{}, err
		}
		for _, u := range c.Unlocks {
			if !u.Revoked {
				for _, tool := range u.Tools {
					unlocked = unlocked || tool == "advice"
				}
			}
		}
		if coach.Allowed || coach.Reason == "exhausted" {
			allowance["kind"] = "unlimited"
			allowance["unit"] = op.UnitKind
			allowance["remaining"] = coach.Remaining
			if coach.Remaining != nil {
				allowance["kind"] = "limited"
			}
			for _, applied := range coach.Applied {
				for _, grant := range c.Grants {
					if grant.ID == applied.GrantID {
						if grant.ValidUntil != nil {
							allowance["expiresAt"] = grant.ValidUntil.UTC().Format(time.RFC3339Nano)
						}
						if grant.Terms.Period == "day" {
							now := c.Now.UTC()
							allowance["resetsAt"] = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
						}
					}
				}
			}
		}
	}
	stats, err := s.store.PlatformStats(ctx, owner, id)
	if err != nil {
		return transport.Response{}, err
	}
	node := map[string]any{"kind": n.Kind, "phase": n.Phase}
	if n.Seat != nil {
		node["actor"] = *n.Seat
	}
	if n.WindowID != "" {
		node["windowId"] = n.WindowID
	}
	if n.TransitionID != "" {
		node["transitionId"] = n.TransitionID
	}
	if n.RequestID != "" {
		node["requestId"] = n.RequestID
	}
	var blocked any
	if !loaded.Disposition.Playable {
		blocked = loaded.Disposition.Reason
	}
	pin := loaded.Document.Metadata.Pin
	out["session"] = map[string]any{"gameId": id, "revision": loaded.Document.Revision, "playable": loaded.Disposition.Playable, "blockedReason": blocked, "selector": sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}, "pin": pin, "competition": loaded.Document.Metadata.Competition, "controllers": loaded.Document.Metadata.Controllers, "view": view, "presentation": presentation, "actor": actor, "node": node, "control": map[string]any{"owned": owned, "leaseToken": nil, "controlGeneration": generation}, "decisionId": records.PlatformDecisionID(id, loaded.Document.Revision), "stats": stats, "access": map[string]any{"play": play, "coach": coach, "handUnlocked": unlocked, "canStartWork": coach.Allowed, "localMock": s.policy == nil, "allowance": allowance}}
	return result("PlatformSessionView", out)
}
