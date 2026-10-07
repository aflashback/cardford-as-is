package service

import (
	"context"
	"encoding/json"
	"time"

	"cardford/server/internal/access"
	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

// NewConfigured installs one immutable, validated policy. No default fixture
// grant is issued on this path; billing evidence remains a separate authority.
func NewConfigured(store *records.Store, codec *records.DocumentCodec, policy access.Policy) (*Service, error) {
	raw, err := json.Marshal(policy)
	if err != nil {
		return nil, err
	}
	snapshot, err := access.DecodePolicy(raw)
	if err != nil {
		return nil, err
	}
	resolver, err := access.NewResolver(snapshot)
	if err != nil {
		return nil, err
	}
	s, err := New(store, codec)
	if err != nil {
		return nil, err
	}
	s.policy, s.resolver = &snapshot, resolver
	return s, nil
}

func (s *Service) identityMode(_ context.Context, p records.Principal) error {
	if p.Configured != (s.policy != nil) {
		return records.ErrAccess
	}
	return nil
}

func offerTemplates(offers []access.Offer, kind string, now time.Time) ([]records.Grant, error) {
	out := []records.Grant{}
	for _, o := range offers {
		if !o.Enabled || o.Kind != kind {
			continue
		}
		for _, target := range o.Targets {
			terms, err := o.Terms(target)
			if err != nil {
				return nil, err
			}
			g := records.Grant{OfferID: o.ID, OfferVersion: o.Version, SourceKind: kind, Terms: records.GrantTerms(terms), ValidFrom: now}
			if o.ValiditySeconds != nil {
				end := now.Add(time.Duration(*o.ValiditySeconds) * time.Second)
				g.ValidUntil = &end
			}
			out = append(out, g)
		}
	}
	return out, nil
}

func policyInput(c records.AccessContext, target access.Target, op access.Operation) access.Input {
	in := access.Input{OwnerID: c.Access.OwnerID, Generation: c.Access.Generation, Revoked: !c.Access.CanRead || op.Kind == "play" && !c.Access.CanPlay || op.Kind == "coach" && !c.Access.CanCoach, ActiveSessionID: c.Access.ActiveGameID, Target: target, Operation: op, Now: c.Now}
	for _, g := range c.Grants {
		in.Grants = append(in.Grants, access.Grant{ID: g.ID, OwnerID: g.OwnerID, OfferID: g.OfferID, OfferVersion: g.OfferVersion, SourceKind: g.SourceKind, SourceID: g.SourceID, Terms: access.GrantTerms(g.Terms), ValidFrom: g.ValidFrom, ValidUntil: g.ValidUntil, Revoked: g.Revoked})
	}
	for _, a := range c.Admissions {
		in.Admissions = append(in.Admissions, access.Admission{GrantID: a.GrantID, SessionID: a.GameID, UnitID: a.UnitID, AdmittedAt: a.AdmittedAt, ExpiresAt: a.ExpiresAt})
	}
	for _, u := range c.Unlocks {
		in.Unlocks = append(in.Unlocks, access.Unlock{GrantID: u.GrantID, SessionID: u.GameID, UnitID: u.UnitID, Tools: u.Tools, BucketID: u.BucketID, PeriodKey: u.PeriodKey, OfferID: u.OfferID, OfferVersion: u.OfferVersion, Revoked: u.Revoked})
	}
	for _, u := range c.Usage {
		in.Usage = append(in.Usage, access.BucketUsage{OwnerID: u.OwnerID, BucketID: u.BucketID, PeriodKey: u.PeriodKey, Used: u.Used})
	}
	return in
}

func denied(d access.Decision) error {
	if d.Reason == "exhausted" {
		return &transport.LocalError{Status: 403, Code: "QUOTA_EXHAUSTED"}
	}
	return records.ErrAccess
}
func chosenAdmission(c records.AccessContext, d access.Decision, unit string) (records.AccessAdmission, error) {
	if !d.Allowed || len(d.Applied) != 1 {
		return records.AccessAdmission{}, denied(d)
	}
	return records.AccessAdmission{OwnerID: c.Access.OwnerID, Generation: c.Access.Generation, ControlRevision: c.Access.ControlGeneration, GrantID: d.Applied[0].GrantID, UnitID: unit}, nil
}

func sessionOperation(b gamekernel.BoundSession, id, unit, kind, intent, tool string) (access.Target, access.Operation, error) {
	p := b.Pin()
	target := access.Target{GameID: p.GameID, VariantID: p.VariantID}
	u, err := b.AccessUnit()
	if err != nil {
		return target, access.Operation{}, err
	}
	op := access.Operation{Kind: kind, Intent: intent, SessionID: id, UnitID: unit, UnitKind: access.SupportedUnit(target), ToolID: tool}
	if u != nil {
		op.UnitKind = u.Kind
		op.AtAdmissionBoundary = u.AtAdmissionBoundary
	}
	return target, op, nil
}

func (s *Service) chooseAccess(ctx context.Context, owner string, b gamekernel.BoundSession, id, unit, kind, intent, tool string) (records.AccessAdmission, access.Decision, error) {
	if s.policy == nil {
		return s.fixturePlatformAdmission(ctx, owner, b, id, unit, kind, intent, tool)
	}
	c, err := s.store.ReadAccessContext(ctx, owner, id, unit)
	if err != nil {
		return records.AccessAdmission{}, access.Decision{}, err
	}
	target, op, err := sessionOperation(b, id, unit, kind, intent, tool)
	if err != nil {
		return records.AccessAdmission{}, access.Decision{}, err
	}
	d, err := s.resolver.Resolve(policyInput(c, target, op))
	if err != nil {
		return records.AccessAdmission{}, d, err
	}
	a, err := chosenAdmission(c, d, unit)
	return a, d, err
}

func (s *Service) accessRequest(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	if s.policy == nil {
		return transport.Response{}, fail(403, "configured-policy-required")
	}
	if r.Operation == "access-offers" {
		return result("AccessOfferPolicy", *s.policy)
	}
	var q struct {
		Kind, GameID, ToolID, DecisionID string
		Target                           access.Target
	}
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	target := q.Target
	op := access.Operation{Kind: "play", Intent: "start", SessionID: "prospective-session", UnitID: "prospective-unit", UnitKind: access.SupportedUnit(target), AtAdmissionBoundary: true}
	var err error
	if q.Kind == "read-saved" {
		saved, e := s.store.ReadSavedAccess(ctx, owner, q.DecisionID)
		if e != nil {
			return transport.Response{}, e
		}
		q.GameID = saved.GameID
		target = access.Target{GameID: saved.Game, VariantID: saved.Variant}
		op = access.Operation{Kind: "read-saved", SavedResult: &access.SavedResult{ID: saved.ID, OwnerID: saved.OwnerID, SessionID: saved.GameID, GrantID: saved.GrantID, Target: target, Delivered: saved.Delivered, Scope: "retained"}}
	} else if q.Kind != "play-start" {
		l, e := s.store.Load(ctx, owner, q.GameID)
		if e != nil {
			return transport.Response{}, e
		}
		b, e := s.codec.Session(l.Document, l.Snapshot)
		if e != nil {
			return transport.Response{}, e
		}
		unit, e := s.codec.CurrentUnitID(l.Document, l.Snapshot)
		if e != nil {
			return transport.Response{}, e
		}
		kind, intent := "play", "continue"
		if q.Kind == "coach" {
			kind, intent = "coach", ""
		}
		target, op, err = sessionOperation(b, q.GameID, unit, kind, intent, q.ToolID)
		if err != nil {
			return transport.Response{}, err
		}
	}
	c, err := s.store.ReadAccessContext(ctx, owner, q.GameID, op.UnitID)
	if err != nil {
		return transport.Response{}, err
	}
	if q.Kind != "play-start" && q.Kind != "read-saved" && c.Access.ActiveGameID != q.GameID {
		return transport.Response{}, records.ErrAccess
	}
	d, err := s.resolver.Resolve(policyInput(c, target, op))
	if err != nil {
		return transport.Response{}, err
	}
	return result("AccessDecision", d)
}

func (s *Service) activateTrial(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	if s.policy == nil {
		return transport.Response{}, records.ErrAccess
	}
	var q struct {
		CommandID, OfferID, OfferVersion string
		ExpectedAccessGeneration         int64
	}
	_ = json.Unmarshal(r.Body, &q)
	ctx, prior, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if prior != nil {
		return accepted(*prior)
	}
	o, ok := s.policy.EnabledOffer(q.OfferID)
	if !ok || o.Version != q.OfferVersion || o.Kind != "access-trial" || o.ValiditySeconds == nil {
		return transport.Response{}, records.ErrAccess
	}
	templates, err := offerTemplates([]access.Offer{o}, "access-trial", time.Now())
	if err != nil {
		return transport.Response{}, err
	}
	out, err := s.store.ActivateConfiguredTrial(ctx, templates, time.Duration(*o.ValiditySeconds)*time.Second, q.ExpectedAccessGeneration)
	if err != nil {
		return transport.Response{}, err
	}
	return accepted(out)
}

func (s *Service) unlock(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q struct {
		CommandID, GameID, ControlLeaseToken, ToolID string
		ExpectedRevision                             int64
	}
	_ = json.Unmarshal(r.Body, &q)
	ctx, prior, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if prior != nil {
		return accepted(*prior)
	}
	ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
	l, b, play, err := s.loadOwnedCommand(ctx, owner, commandRequest{GameID: q.GameID, ExpectedRevision: q.ExpectedRevision}, false)
	if err != nil {
		return transport.Response{}, err
	}
	a, d, err := s.chooseAccess(ctx, owner, b, q.GameID, play.UnitID, "coach", "", q.ToolID)
	if err != nil {
		return transport.Response{}, err
	}
	charge := records.AllowanceCharge{Admission: a, BucketID: d.BucketID, PeriodKey: d.PeriodKey, OfferID: d.Applied[0].Offer.ID, OfferVersion: d.Applied[0].Offer.Version, Units: 1}
	out, err := s.store.UnlockCoaching(ctx, records.CoachingUnlockRequest{Admission: a, GameID: q.GameID, ExpectedRevision: l.Document.Revision, ToolID: q.ToolID, Charge: charge})
	if err != nil {
		return transport.Response{}, err
	}
	return accepted(out)
}
