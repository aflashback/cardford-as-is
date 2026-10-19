package access

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

// Resolver holds a private validated configuration snapshot for repeated reads.
// Caller edits to the original slices cannot change an installed resolver.
type Resolver struct{ policy Policy }

func NewResolver(policy Policy) (*Resolver, error) {
	if err := ValidatePolicy(policy); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(policy)
	if err != nil {
		return nil, err
	}
	var snapshot Policy
	if err = json.Unmarshal(raw, &snapshot); err != nil {
		return nil, err
	}
	return &Resolver{policy: snapshot}, nil
}
func (r *Resolver) Resolve(in Input) (Decision, error) {
	if r == nil {
		return Decision{}, ErrInvalid
	}
	return resolvePolicy(r.policy, in)
}

// Resolve never activates grants or spends allowance. The caller must recheck
// the selected grant, access generation and usage in its commit transaction.
func Resolve(policy Policy, in Input) (Decision, error) {
	if err := ValidatePolicy(policy); err != nil {
		return Decision{}, err
	}
	return resolvePolicy(policy, in)
}
func resolvePolicy(policy Policy, in Input) (Decision, error) {
	d := Decision{AccessGeneration: in.Generation, Applied: []Applied{}, Continuation: "pause-at-expiry", Reason: "no-grant"}
	if err := validateInput(in); err != nil {
		return d, err
	}
	if in.Revoked {
		d.Reason = "revoked"
		return d, nil
	}
	if !SupportedTarget(in.Target) {
		d.Reason = "wrong-target"
		return d, nil
	}
	op := in.Operation
	if op.Kind == "read-saved" {
		r := op.SavedResult
		d.Continuation = "owned-result"
		d.Reason = "not-owned"
		if r.OwnerID != in.OwnerID || r.Target != in.Target || !r.Delivered {
			return d, nil
		}
		if r.GrantID != "" {
			g, ok := findGrant(in.Grants, r.GrantID)
			if !ok {
				return d, fmt.Errorf("%w: saved result grant missing", ErrInvalid)
			}
			if g.Revoked {
				d.Reason = "revoked"
				return d, nil
			}
			if (Target{g.Terms.Game, g.Terms.Variant}) != r.Target {
				return d, ErrInvalid
			}
		}
		if r.Scope == "current-game" && r.SessionID != in.ActiveSessionID {
			return d, nil
		}
		if r.RetainedUntil != nil && !in.Now.Before(*r.RetainedUntil) {
			d.Reason = "expired"
			return d, nil
		}
		d.Allowed = true
		d.Reason = "owned-result"
		return d, nil
	}
	if op.Kind == "coach" && !SupportedTool(op.ToolID) {
		d.Reason = "wrong-tool"
		return d, nil
	}
	// Security revocation of this unit cannot be bypassed by another offer.
	for _, a := range in.Admissions {
		if a.SessionID == op.SessionID && a.UnitID == op.UnitID && a.Revoked {
			d.Reason = "revoked"
			return d, nil
		}
	}
	for _, u := range in.Unlocks {
		if u.SessionID != op.SessionID || u.UnitID != op.UnitID {
			continue
		}
		if u.Revoked {
			d.Reason = "revoked"
			return d, nil
		}
		if op.Kind != "coach" {
			continue
		}
		// A recorded unlock pins its original tools and offer, even if another
		// grant could now provide additional tools for this same unit.
		g, ok := findGrant(in.Grants, u.GrantID)
		if !ok {
			return d, fmt.Errorf("%w: unlock grant missing", ErrInvalid)
		}
		d = selected(d, g, in.Now)
		d.BucketID = u.BucketID
		d.PeriodKey = u.PeriodKey
		if g.Revoked {
			d.Reason = "revoked"
			return d, nil
		}
		if (Target{g.Terms.Game, g.Terms.Variant}) != in.Target {
			d.Reason = "wrong-target"
			return d, nil
		}
		if !g.Terms.CanCoach || !contains(u.Tools, op.ToolID) || !contains(g.Terms.Tools, op.ToolID) {
			d.Reason = "wrong-tool"
			return d, nil
		}
		if reason := validity(g, in); reason != "" {
			d.Reason = reason
			return d, nil
		}
		d.Allowed = true
		d.Reason = "existing-unlock"
		setRemaining(&d, g, in.Usage)
		return d, nil
	}
	grants := append([]Grant(nil), in.Grants...)
	ranks := map[string]int{}
	for i, id := range policy.Precedence {
		ranks[id] = i
	}
	sort.Slice(grants, func(i, j int) bool {
		ri, ok := ranks[grants[i].OfferID]
		if !ok {
			ri = len(ranks)
		}
		rj, ok := ranks[grants[j].OfferID]
		if !ok {
			rj = len(ranks)
		}
		if ri != rj {
			return ri < rj
		}
		return grants[i].ID < grants[j].ID
	})
	matchedTarget, matchedPermission := false, false
	for _, g := range grants {
		if (Target{g.Terms.Game, g.Terms.Variant}) != in.Target {
			continue
		}
		matchedTarget = true
		if op.Kind == "play" && !g.Terms.CanPlay || op.Kind == "coach" && (!g.Terms.CanCoach || !contains(g.Terms.Tools, op.ToolID)) {
			continue
		}
		matchedPermission = true
		candidate := selected(d, g, in.Now)
		if g.Revoked {
			candidate.Reason = "revoked"
			d = candidate
			continue
		}
		if reason := validity(g, in); reason != "" {
			candidate.Reason = reason
			d = candidate
			continue
		}
		// Disabling/removing free/trial offers stops future admissions. A
		// recorded unit may finish on its original terms; purchases survive edits.
		if g.SourceKind == "free" || g.SourceKind == "access-trial" {
			if !(op.Kind == "play" && op.Intent == "continue" && admitted(g, in)) {
				current, enabled := policy.EnabledOffer(g.OfferID)
				reason := ""
				switch {
				case !enabled:
					reason = "disabled"
				case !targets(current.Targets, in.Target):
					reason = "wrong-target"
				case op.Kind == "play" && !current.Play:
					reason = "no-grant"
				case op.Kind == "coach" && !contains(current.Coach.Tools, op.ToolID):
					reason = "wrong-tool"
				}
				if reason != "" {
					candidate.Reason = reason
					d = candidate
					continue
				}
			}
		}
		candidate.Reason = "grant"
		if g.ValidUntil != nil && !in.Now.Before(*g.ValidUntil) {
			candidate.Reason = "admitted-unit"
		}
		if op.Kind == "coach" {
			setRemaining(&candidate, g, in.Usage)
			if candidate.Remaining != nil && *candidate.Remaining == 0 {
				candidate.Reason = "exhausted"
				return candidate, nil
			}
		}
		candidate.Allowed = true
		return candidate, nil
	}
	if !matchedTarget && len(grants) > 0 {
		d.Reason = "wrong-target"
	} else if matchedTarget && !matchedPermission && op.Kind == "coach" {
		d.Reason = "wrong-tool"
	}
	return d, nil
}
func selected(d Decision, g Grant, now time.Time) Decision {
	d.Applied = []Applied{{Component{g.OfferID, g.OfferVersion}, g.ID}}
	d.Continuation = g.Terms.ExpiryRule
	d.BucketID = g.Terms.BucketID
	d.PeriodKey = PeriodKey(g.Terms, now)
	d.Remaining = nil
	return d
}

// PeriodKey must also be checked by storage against its own transaction time.
func PeriodKey(t GrantTerms, now time.Time) string {
	if t.Period == "day" {
		return now.UTC().Format("2006-01-02")
	}
	return "lifetime"
}
func setRemaining(d *Decision, g Grant, usage []BucketUsage) {
	if g.Terms.Unlimited {
		return
	}
	remaining := g.Terms.Limit
	for _, u := range usage {
		if u.OwnerID == g.OwnerID && u.BucketID == d.BucketID && u.PeriodKey == d.PeriodKey {
			remaining -= u.Used
			remaining -= u.Reserved
			break
		}
	}
	if remaining < 0 {
		remaining = 0
	}
	d.Remaining = &remaining
}
func admitted(g Grant, in Input) bool {
	for _, a := range in.Admissions {
		if a.GrantID == g.ID && a.SessionID == in.Operation.SessionID && a.UnitID == in.Operation.UnitID && !a.Revoked && !a.AdmittedAt.Before(g.ValidFrom) && !a.AdmittedAt.After(in.Now) && (g.ValidUntil == nil || a.AdmittedAt.Before(*g.ValidUntil)) {
			return true
		}
	}
	return false
}
func validity(g Grant, in Input) string {
	if in.Now.Before(g.ValidFrom) {
		return "no-grant"
	}
	if g.ValidUntil == nil || in.Now.Before(*g.ValidUntil) {
		return ""
	}
	if g.Terms.ExpiryRule != "finish-admitted-unit" {
		return "expired"
	}
	if in.Operation.Kind == "play" && in.Operation.Intent == "start" {
		return "expired"
	}
	if !admitted(g, in) {
		return "not-admitted"
	}
	return ""
}
func findGrant(grants []Grant, id string) (Grant, bool) {
	for _, g := range grants {
		if g.ID == id {
			return g, true
		}
	}
	return Grant{}, false
}

func validateInput(in Input) error {
	if !textID(in.OwnerID) || in.Generation < 0 || in.Generation > MaxInteger || in.Now.IsZero() {
		return ErrInvalid
	}
	op := in.Operation
	if op.Kind == "read-saved" {
		if op.SavedResult == nil || !textID(op.SavedResult.ID) || !textID(op.SavedResult.OwnerID) || !textID(op.SavedResult.SessionID) || (op.SavedResult.Scope != "current-game" && op.SavedResult.Scope != "retained") {
			return ErrInvalid
		}
	} else {
		if (op.Kind != "play" && op.Kind != "coach") || !textID(op.SessionID) || !textID(op.UnitID) || (SupportedTarget(in.Target) && op.UnitKind != SupportedUnit(in.Target)) || op.SavedResult != nil {
			return ErrInvalid
		}
		if op.Kind == "play" && (op.Intent != "start" && op.Intent != "continue" || op.ToolID != "") || op.Kind == "coach" && (!textID(op.ToolID) || op.Intent != "") {
			return ErrInvalid
		}
	}
	seen := map[string]bool{}
	for _, g := range in.Grants {
		t := g.Terms
		if seen[g.ID] || !textID(g.ID) || g.OwnerID != in.OwnerID || !textID(g.OfferID) || !textID(g.OfferVersion) || !textID(g.SourceID) || !contains([]string{"free", "access-trial", "purchase", "family", "operator-test"}, g.SourceKind) || t.Version != "1.0.0" || !SupportedTarget(Target{t.Game, t.Variant}) || !textID(t.BucketID) || t.Timezone != "UTC" || !contains([]string{"day", "lifetime"}, t.Period) || t.Limit < 0 || t.Limit > MaxInteger || t.Unlimited && t.Limit != 0 || !contains([]string{"pause-at-expiry", "finish-admitted-unit"}, t.ExpiryRule) || g.ValidFrom.IsZero() || g.ValidUntil != nil && !g.ValidUntil.After(g.ValidFrom) || t.Tools == nil || !t.CanCoach && len(t.Tools) > 0 {
			return ErrInvalid
		}
		seen[g.ID] = true
		tools := map[string]bool{}
		for _, tool := range t.Tools {
			if tools[tool] || !textID(tool) {
				return ErrInvalid
			}
			tools[tool] = true
		}
	}
	seen = map[string]bool{}
	for _, u := range in.Usage {
		key := u.BucketID + "\x00" + u.PeriodKey
		if u.OwnerID != in.OwnerID || !textID(u.BucketID) || !textID(u.PeriodKey) || seen[key] || u.Used < 0 || u.Reserved < 0 || u.Used > MaxInteger || u.Reserved > MaxInteger {
			return ErrInvalid
		}
		seen[key] = true
	}
	for _, a := range in.Admissions {
		if !textID(a.GrantID) || !textID(a.SessionID) || !textID(a.UnitID) || a.AdmittedAt.IsZero() || a.ExpiresAt != nil && !a.ExpiresAt.After(a.AdmittedAt) {
			return ErrInvalid
		}
	}
	seen = map[string]bool{}
	for _, u := range in.Unlocks {
		key := u.SessionID + "\x00" + u.UnitID
		g, ok := findGrant(in.Grants, u.GrantID)
		if seen[key] || !ok || !textID(u.SessionID) || !textID(u.UnitID) || u.BucketID != g.Terms.BucketID || u.OfferID != g.OfferID || u.OfferVersion != g.OfferVersion || !textID(u.PeriodKey) {
			return ErrInvalid
		}
		seen[key] = true
		for _, tool := range u.Tools {
			if !contains(g.Terms.Tools, tool) {
				return ErrInvalid
			}
		}
	}
	return nil
}
