package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"context"
	"fmt"
	"slices"
	"sort"
)

// A new experimental pin: retained public-resource predicates layered onto the
// frozen 2.1 tactical scorer. This is not the older TS 4.1 plan-layer policy.
const PartnerResourcePolicy = "spades-partner-resource-5.0.0"
const PartnerResourceCatalog = "spades-partner-resource-2.0.0"

type PartnerGuard struct {
	ID    string `json:"id"`
	Holds bool   `json:"holds"`
}
type PartnerOffer struct {
	Partner    int      `json:"partner"`
	Suit       string   `json:"suit"`
	Entry      string   `json:"entry"`
	TrumpFloor int      `json:"trumpFloor"`
	ActionIDs  []string `json:"actionIds"`
}
type PartnerConserve struct {
	Partner   int      `json:"partner"`
	ActionIDs []string `json:"actionIds"`
}
type PartnerResources struct {
	Offer    *PartnerOffer    `json:"offer"`
	Conserve *PartnerConserve `json:"conserve"`
	Checks   []PartnerGuard   `json:"checks"`
}

// AssessPartnerResources uses own cards and public feasible ownership domains.
// Passing up a trick or a signal never proves a concealed card's owner.
func AssessPartnerResources(o d.Observation, f d.Facts) PartnerResources {
	r := PartnerResources{Checks: []PartnerGuard{}}
	if o.Phase != "play" || o.Mode != "spades-partners" || f.Partner == nil {
		return r
	}
	p := *f.Partner
	opponents := []int{}
	for s := 0; s < 4; s++ {
		if s != o.Seat && s != p {
			opponents = append(opponents, s)
		}
	}
	check := func(id string, holds bool) bool { r.Checks = append(r.Checks, PartnerGuard{id, holds}); return holds }
	complete := check("complete-public-history", f.KnowledgeComplete)
	own := check("own-positive", d.Value(o.Bids[o.Seat]) > 0)
	partner := check("partner-positive", d.Value(o.Bids[p]) > 0)
	noNil := true
	for _, s := range opponents {
		if o.Bids[s] != nil && *o.Bids[s] == 0 && o.Tricks[s] == 0 {
			noNil = false
		}
	}
	check("no-live-opponent-nil", noNil)
	needed := check("contract-needed", d.Value(f.ContractNeeded) > 0)
	if !complete || !own || !partner || !noNil || !needed {
		return r
	}
	if len(o.Trick) > 0 {
		ids := []string{}
		for _, v := range f.CardOutcomes {
			if f.CurrentWinner != nil && *f.CurrentWinner == p && v.GuaranteedWinner != nil && *v.GuaranteedWinner == p {
				ids = append(ids, v.ActionID)
			}
		}
		if len(ids) > 0 && len(o.LegalActions) > len(ids) {
			r.Conserve = &PartnerConserve{p, ids}
		}
		check("partner-secure", r.Conserve != nil)
		return r
	}
	entry := ""
	for _, card := range o.Hand {
		if d.CardSuit(card) != "S" {
			continue
		}
		master := true
		for _, other := range f.OutstandingCards {
			if d.CardSuit(other) == "S" && d.CardRank(other) > d.CardRank(card) {
				master = false
			}
		}
		if master {
			entry = card
			break
		}
	}
	check("retained-master-entry", entry != "")
	possible := func(seat int) []d.PossibleOwner {
		out := []d.PossibleOwner{}
		for _, v := range f.PossibleOwners {
			if slices.Contains(v.Seats, seat) {
				out = append(out, v)
			}
		}
		return out
	}
	mustHold := func(seat int, suit string) bool {
		outside := 0
		for _, v := range possible(seat) {
			if d.CardSuit(v.Card) != suit {
				outside++
			} else if len(v.Seats) == 1 {
				return true
			}
		}
		return o.HandSizes[seat] > outside
	}
	trumps := []d.PossibleOwner{}
	outside := 0
	floor := 0
	for _, v := range possible(p) {
		if d.CardSuit(v.Card) == "S" {
			trumps = append(trumps, v)
			if len(v.Seats) == 1 && d.CardRank(v.Card) > floor {
				floor = d.CardRank(v.Card)
			}
		} else {
			outside++
		}
	}
	sort.Slice(trumps, func(i, j int) bool { return d.CardRank(trumps[i].Card) < d.CardRank(trumps[j].Card) })
	forced := o.HandSizes[p] - outside
	if forced > 0 && forced <= len(trumps) && d.CardRank(trumps[forced-1].Card) > floor {
		floor = d.CardRank(trumps[forced-1].Card)
	}
	check("partner-trump-proved", floor > 0)
	suits := []string{}
	for _, card := range o.Hand {
		s := d.CardSuit(card)
		if s != "S" && !slices.Contains(suits, s) {
			suits = append(suits, s)
		}
	}
	voids := []string{}
	for _, s := range suits {
		if slices.Contains(f.Voids[s], p) {
			voids = append(voids, s)
		}
	}
	check("partner-void-proved", len(voids) > 0)
	for _, suit := range voids {
		safe := true
		for _, s := range opponents {
			if mustHold(s, suit) {
				continue
			}
			for _, v := range possible(s) {
				if d.CardSuit(v.Card) == "S" && d.CardRank(v.Card) >= floor {
					safe = false
				}
			}
		}
		check("ruff-safe-"+suit, floor > 0 && safe)
		if entry == "" || floor == 0 || !safe || r.Offer != nil {
			continue
		}
		ids := []string{}
		for _, a := range o.LegalActions {
			if a.Kind == "play" && d.CardSuit(a.Card) == suit {
				ids = append(ids, d.ActionID(a))
			}
		}
		if len(ids) > 0 {
			r.Offer = &PartnerOffer{p, suit, entry, floor, ids}
		}
	}
	return r
}

func AnalyzePartnerResourcesContext(ctx context.Context, o d.Observation) (d.Analysis, error) {
	a, err := AnalyzeContext(ctx, o)
	if err != nil {
		return a, err
	}
	a.PolicyVersion = PartnerResourcePolicy
	a.Trace.PolicyVersion = PartnerResourcePolicy
	a.Trace.CatalogVersion = PartnerResourceCatalog
	a.Limitations = append(a.Limitations, "Experimental partner-resource ordering; no independent strength or learning result.")
	r := AssessPartnerResources(o, a.Facts)
	ids := []string{}
	reasonID := ""
	text := ""
	if a.Provenance != "forced" {
		if r.Offer != nil {
			ids = r.Offer.ActionIDs
			reasonID = "CASE-01.offer-safe-ruff"
			text = "Public resources allow a winning partner ruff while retaining a master trump entry. Partner may discard instead; future team tricks remain uncertain."
		} else if r.Conserve != nil {
			ids = r.Conserve.ActionIDs
			reasonID = "CASE-01.partner-secure"
			text = "Partner has a secure credited winner. Retain the extra winning resource; its later usefulness remains conditional."
		}
	}
	if len(ids) > 0 {
		a.ScenarioIDs = append(a.ScenarioIDs, "CASE-01")
		a.Reasons = append(a.Reasons, d.Reason{ID: reasonID, Kind: "heuristic", Text: text, ActionIDs: append([]string{}, ids...)})
		for i := range a.Candidates {
			if slices.Contains(ids, d.ActionID(a.Candidates[i].Action)) {
				a.Candidates[i].ReasonIDs = append([]string{reasonID}, a.Candidates[i].ReasonIDs...)
			}
		}
		for i := range a.Trace.Candidates {
			c := &a.Trace.Candidates[i]
			if slices.Contains(ids, c.ActionID) {
				value := d.Value(c.Score) + 200
				c.Score = &value
				c.Effects = append(c.Effects, d.Effect{ID: reasonID, Delta: 200})
			}
		}
		ranked := append([]d.TraceCandidate{}, a.Trace.Candidates...)
		sort.SliceStable(ranked, func(i, j int) bool {
			return d.Value(ranked[i].Score) > d.Value(ranked[j].Score) || d.Value(ranked[i].Score) == d.Value(ranked[j].Score) && ranked[i].TieOrder < ranked[j].TieOrder
		})
		for _, action := range o.LegalActions {
			if d.ActionID(action) == ranked[0].ActionID {
				a.Action = d.CloneAction(action)
				break
			}
		}
	}
	selected := d.ActionID(a.Action)
	for i := range a.Candidates {
		a.Candidates[i].Disposition = "alternative"
		if d.ActionID(a.Candidates[i].Action) == selected {
			a.Candidates[i].Disposition = "selected"
		}
	}
	sort.SliceStable(a.Candidates, func(i, j int) bool {
		return a.Candidates[i].Disposition == "selected" && a.Candidates[j].Disposition != "selected"
	})
	a.Trace.SelectedActionID = selected
	a.Trace.ScenarioChecks = append(a.Trace.ScenarioChecks, d.ScenarioCheck{ID: "CASE-01", Result: tern(len(ids) > 0, "matched", "not-matched")})
	for _, guard := range r.Checks {
		a.Trace.ScenarioChecks = append(a.Trace.ScenarioChecks, d.ScenarioCheck{ID: "CASE-01." + guard.ID, Result: tern(guard.Holds, "matched", "not-matched")})
		if !guard.Holds {
			a.Limitations = append(a.Limitations, fmt.Sprintf("Partner-resource guard not established: %s.", guard.ID))
		}
	}
	return a, ctx.Err()
}
