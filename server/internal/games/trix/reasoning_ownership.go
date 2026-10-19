package trix

import (
	"cardford/server/internal/contracts"
	"fmt"
)

const OwnershipPolicyID = "trix-ownership-1.0.0"
const OwnershipTraceSchemaVersion = "trix-decision-trace-1.3.0"
const OwnershipCueVersion = "trix-ownership-cues-1.0.0"

// OwnershipEvidence exhausts assignments of four twos under the recorded
// constraints. It does not enumerate complete deals or assign probabilities.
type OwnershipEvidence struct {
	Version           string         `json:"version"`
	Coverage          string         `json:"coverage"`
	Eligible          bool           `json:"eligible"`
	Assignments       int            `json:"assignments"`
	PriorCandidateID  string         `json:"priorCandidateId"`
	SelectedChanged   bool           `json:"selectedChanged"`
	SuppressedOneTeam bool           `json:"suppressedOneTeam"`
	Twos              []TwoOwnership `json:"twos"`
	OriginalCountMin  [4]int         `json:"originalCountMin"`
	OriginalCountMax  [4]int         `json:"originalCountMax"`
	RemainingCountMin [4]int         `json:"remainingCountMin"`
	RemainingCountMax [4]int         `json:"remainingCountMax"`
}

type TwoOwnership struct {
	Card            string `json:"card"`
	Played          bool   `json:"played"`
	OriginalOwners  []int  `json:"originalOwners"`
	PossibleHolders []int  `json:"possibleHolders"`
}

func candidatesWithOwnership(o Observation, policy string) ([]DecisionCandidate, *HistoryEvidence, *FrontierEvidence, *OwnershipEvidence, error) {
	if !usesOwnershipPolicy(policy) {
		c, h, f := decisionTraceCandidates(o, policy)
		return c, h, f, nil, nil
	}
	candidates, history := traceCandidates(o, HistoryPolicyID)
	prior := strongestCandidateIndex(candidates)
	e, err := fourTwosOwnership(o)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	e.PriorCandidateID = candidates[prior].CandidateID
	if e.Eligible {
		holders := func(view Observation, card string) []int {
			for _, two := range e.Twos {
				if card == two.Card {
					return two.PossibleHolders
				}
			}
			return possibleHolders(view, card)
		}
		for i := range candidates {
			if candidates[i].Action.Kind != "layout-card" {
				continue
			}
			c := DecisionCandidate{CandidateID: candidates[i].CandidateID, Action: candidates[i].Action, Support: []contracts.CoachSupport{}}
			layoutCandidateWithHolders(o, &c, holders, true)
			candidates[i] = c
		}
	}
	e.SelectedChanged = strongestCandidateIndex(candidates) != prior
	return candidates, history, nil, e, nil
}

// Only trusted observation metadata enables absence-as-suppression. A parsed
// packet must have its pin rebound by the native caller; tracePin's legacy
// convenience inference is deliberately not authority for this deduction.
func fourTwosOwnership(o Observation) (*OwnershipEvidence, error) {
	e := &OwnershipEvidence{Version: "trix-ownership-evidence-1.0.0", Coverage: "outside-scope", Twos: []TwoOwnership{}}
	if o.Phase != "layout" || !partners(o.VariantID) {
		return e, nil
	}
	if o.publicSchemaVersion == "" {
		return nil, fmt.Errorf("Trix ownership requires a trusted observation profile")
	}
	if o.publicSchemaVersion == "1.0.0" {
		e.Coverage = "historical-profile"
		return e, nil
	}
	if o.publicSchemaVersion != "1.1.0" && o.publicSchemaVersion != "1.2.0" {
		return nil, fmt.Errorf("unsupported Trix ownership profile")
	}
	if o.Seat < 0 || o.Seat > 3 || len(o.Hand) != o.HandCounts[o.Seat] {
		return nil, fmt.Errorf("invalid Trix ownership actor counts")
	}
	if err := validatePublicTwos(o.TwoAnnouncements); err != nil {
		return nil, err
	}
	playedOwners := map[string]int{}
	if o.LayoutHistory != nil {
		for _, turn := range o.LayoutHistory.Turns {
			if turn.Kind == "layout-card" {
				playedOwners[turn.Card] = turn.Seat
			}
		}
	}
	seen := map[string]bool{}
	deck := map[string]bool{}
	for _, card := range Deck() {
		deck[card] = true
	}
	for _, card := range o.Hand {
		if !deck[card] || seen[card] || publiclyPlayed(o, card) {
			return nil, fmt.Errorf("invalid Trix ownership hand")
		}
		seen[card] = true
	}
	capacity := o.HandCounts
	remainingTotal := 0
	for _, n := range capacity {
		if n < 0 || n > 13 {
			return nil, fmt.Errorf("invalid Trix ownership capacity")
		}
		remainingTotal += n
	}
	placed := 0
	for _, card := range Deck() {
		if publiclyPlayed(o, card) {
			placed++
			continue
		}
		if rank(card) == 2 {
			continue
		}
		owners := possibleHolders(o, card)
		if len(owners) == 1 {
			if passExcludes(o, owners[0], card) {
				return nil, fmt.Errorf("Trix ownership public card contradicts pass")
			}
			capacity[owners[0]]--
		}
	}
	if remainingTotal+placed != 52 {
		return nil, fmt.Errorf("invalid Trix ownership remaining counts")
	}
	for _, n := range capacity {
		if n < 0 {
			return nil, fmt.Errorf("Trix ownership known cards exceed capacity")
		}
	}
	if a := o.TwoAnnouncements; a != nil && (placed+len(o.Passes) < 4) != (a.Status == "hidden") {
		return nil, fmt.Errorf("invalid Trix ownership announcement timing")
	}
	e.Eligible, e.Coverage, e.SuppressedOneTeam = true, "four-twos-constraints", o.TwoAnnouncements == nil
	domains := [4][]int{}
	for i, card := range twoCards {
		played := publiclyPlayed(o, card)
		e.Twos = append(e.Twos, TwoOwnership{Card: card, Played: played, OriginalOwners: []int{}, PossibleHolders: []int{}})
		for seat := 0; seat < 4; seat++ {
			if owner, known := playedOwners[card]; known && owner != seat {
				continue
			}
			if !played {
				if contains(o.Hand, card) != (seat == o.Seat) || !hasSeat(possibleHolders(o, card), seat) || passExcludes(o, seat, card) {
					continue
				}
			}
			if a := o.TwoAnnouncements; a != nil && a.Status == "revealed" && a.Cards[i].Seat != seat {
				continue
			}
			domains[i] = append(domains[i], seat)
		}
	}
	originalSupport, heldSupport := [4][4]bool{}, [4][4]bool{}
	for code := 0; code < 256; code++ {
		owners, original, held := [4]int{}, [4]int{}, [4]int{}
		valid := true
		for i := range twoCards {
			seat := (code >> (2 * i)) & 3
			owners[i] = seat
			if !hasSeat(domains[i], seat) {
				valid = false
				break
			}
			original[seat]++
			if !e.Twos[i].Played {
				held[seat]++
			}
		}
		if !valid {
			continue
		}
		if e.SuppressedOneTeam && original[0]+original[2] != 0 && original[1]+original[3] != 0 {
			continue
		}
		for seat := 0; seat < 4; seat++ {
			if held[seat] > capacity[seat] {
				valid = false
			}
			if a := o.TwoAnnouncements; a != nil && a.Status == "hidden" && original[seat] != a.Counts[seat] {
				valid = false
			}
		}
		if !valid {
			continue
		}
		for i, seat := range owners {
			originalSupport[i][seat] = true
			if !e.Twos[i].Played {
				heldSupport[i][seat] = true
			}
		}
		for seat := 0; seat < 4; seat++ {
			if e.Assignments == 0 || original[seat] < e.OriginalCountMin[seat] {
				e.OriginalCountMin[seat] = original[seat]
			}
			if original[seat] > e.OriginalCountMax[seat] {
				e.OriginalCountMax[seat] = original[seat]
			}
			if e.Assignments == 0 || held[seat] < e.RemainingCountMin[seat] {
				e.RemainingCountMin[seat] = held[seat]
			}
			if held[seat] > e.RemainingCountMax[seat] {
				e.RemainingCountMax[seat] = held[seat]
			}
		}
		e.Assignments++
	}
	if e.Assignments == 0 {
		return nil, fmt.Errorf("inconsistent Trix four-twos ownership constraints")
	}
	for i := range e.Twos {
		for seat := 0; seat < 4; seat++ {
			if originalSupport[i][seat] {
				e.Twos[i].OriginalOwners = append(e.Twos[i].OriginalOwners, seat)
			}
			if heldSupport[i][seat] {
				e.Twos[i].PossibleHolders = append(e.Twos[i].PossibleHolders, seat)
			}
		}
	}
	return e, nil
}

func hasSeat(seats []int, seat int) bool {
	for _, s := range seats {
		if s == seat {
			return true
		}
	}
	return false
}

func ownershipSupport(e *OwnershipEvidence) []contracts.CoachSupport {
	out := []contracts.CoachSupport{support("trix-ownership-coverage", "policy", fmt.Sprintf("Four-twos constraint coverage: %s; %d supported joint assignments. Only four-two ownership and remaining seat capacity are checked, not complete non-two deals. These counts are not probabilities. The existing immediate-opening weights remain unchanged.", e.Coverage, e.Assignments))}
	if !e.Eligible {
		return out
	}
	if e.SuppressedOneTeam {
		out = append(out, support("trix-ownership-suppressed", "exact", "On this pinned Partners profile, the absent announcement means one team originally owned all four twos. An actor who originally held none does not by that fact alone identify the owning team."))
	}
	for _, two := range e.Twos {
		out = append(out, support("trix-ownership-"+two.Card, "exact", fmt.Sprintf("%s: possible original owners %v; possible holders now %v; publicly played: %t. Owners excluded by every supported four-two assignment cannot hold this card.", cardLabel(two.Card), two.OriginalOwners, two.PossibleHolders, two.Played)))
	}
	return out
}
