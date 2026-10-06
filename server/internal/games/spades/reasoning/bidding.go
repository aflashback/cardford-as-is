// Package reasoning executes only the unchanged original Spades tactics policy.
package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"fmt"
	"math"
	"slices"
	"sort"
)

const PolicyVersion = "spades-tactics-2.1.0"

type bidCandidate struct {
	bid                           int
	contractFeasible, nilFeasible bool
	distance                      float64
}
type bidAssessment struct {
	selected             int
	candidates           []bidCandidate
	reasons, limitations []string
}

func suggestBid(hand []string) int {
	estimate := 0.0
	trumps := 0
	highTrump := false
	for _, s := range d.Suits() {
		cards := []string{}
		for _, c := range hand {
			if d.CardSuit(c) == s {
				cards = append(cards, c)
			}
		}
		has := func(r int) bool {
			for _, c := range cards {
				if d.CardRank(c) == r {
					return true
				}
			}
			return false
		}
		if s == "S" {
			trumps = len(cards)
			for _, c := range cards {
				r := d.CardRank(c)
				if r > 9 {
					highTrump = true
				}
				if r >= 12 {
					estimate += 1
				} else if r >= 10 {
					estimate += .65
				} else {
					estimate += .25
				}
			}
			if len(cards) > 4 {
				estimate += float64(len(cards)-4) * .4
			}
		} else {
			if has(14) {
				estimate++
			}
			if len(cards) >= 2 && has(13) {
				estimate += .55
			}
			if len(cards) >= 3 && has(12) {
				estimate += .2
			}
		}
	}
	if estimate < .9 && !highTrump && trumps <= 2 {
		return 0
	}
	return max(1, min(13, int(math.Floor(estimate+.5))))
}
func assessBids(o d.Observation) (bidAssessment, error) {
	r := bidAssessment{candidates: []bidCandidate{}, reasons: []string{}, limitations: []string{}}
	if o.Phase != "bid" || (o.Mode != "spades-solo" && o.Mode != "spades-partners") {
		return r, fmt.Errorf("Contextual bids require a Spades bidding observation.")
	}
	if len(o.LegalActions) != 14 {
		return r, fmt.Errorf("Spades bid assessment requires the complete legal set.")
	}
	for i, a := range o.LegalActions {
		if a.Kind != "bid" || a.Bid != i || a.Seat != o.Seat {
			return r, fmt.Errorf("Spades bid assessment requires the complete legal set.")
		}
	}
	baseline := suggestBid(o.Hand)
	var partnerBid *int
	partner := -1
	if o.Mode == "spades-partners" {
		partner = (o.Seat + 2) % 4
		partnerBid = o.Bids[partner]
	}
	claims := 0
	for _, s := range d.Seats() {
		if s != o.Seat && s != partner {
			claims += d.Value(o.Bids[s])
		}
	}
	spades := map[int]bool{}
	for _, c := range o.Hand {
		if d.CardSuit(c) == "S" {
			spades[d.CardRank(c)] = true
		}
	}
	guaranteed := 0
	for rank := 14; rank >= 2 && spades[rank]; rank-- {
		guaranteed++
	}
	r.reasons = append(r.reasons, fmt.Sprintf("Hand structure suggests bid %d; this is an uncalibrated heuristic.", baseline))
	target := max(baseline, guaranteed)
	if guaranteed > 0 && baseline == 0 {
		r.reasons = append(r.reasons, "A held top spade guarantees at least one own trick, so Nil cannot succeed.")
	}
	if partnerBid != nil && *partnerBid > 0 && target+*partnerBid > 13 {
		target = max(0, 13-*partnerBid)
		r.reasons = append(r.reasons, "The public positive team bids cannot total more than 13 tricks and remain makeable.")
	}
	if claims >= 9 && target > 1 && target > 13-claims {
		target--
		r.reasons = append(r.reasons, "High public opponent bids conflict with this hand estimate if those contracts are made; one cautious bid step is heuristic.")
	}
	if eq(partnerBid, 0) {
		r.reasons = append(r.reasons, "Partner Nil gives no positive contract credit; whether it succeeds is unknown.")
	}
	if o.Bags[o.Seat] == 9 {
		r.reasons = append(r.reasons, "The next ordinary bag would cross the ten-bag penalty, but trick count remains uncertain at bidding.")
	}
	if any(o.Scores, func(s int) bool { return s >= 400 }) {
		r.reasons = append(r.reasons, "Current scores are public; match victory is assessed after all players finish the hand.")
	}
	eligible := []bidCandidate{}
	for _, a := range o.LegalActions {
		c := bidCandidate{a.Bid, a.Bid == 0 || partnerBid == nil || *partnerBid == 0 || a.Bid+*partnerBid <= 13, a.Bid != 0 || guaranteed == 0, math.Abs(float64(a.Bid - target))}
		r.candidates = append(r.candidates, c)
		if c.contractFeasible && c.nilFeasible {
			eligible = append(eligible, c)
		}
	}
	none := len(eligible) == 0
	if none && eq(partnerBid, 13) && guaranteed > 0 {
		r.selected = 1
	} else {
		if none {
			eligible = append(eligible, r.candidates...)
		}
		sort.SliceStable(eligible, func(i, j int) bool {
			return eligible[i].distance < eligible[j].distance || eligible[i].distance == eligible[j].distance && eligible[i].bid < eligible[j].bid
		})
		r.selected = eligible[0].bid
	}
	r.limitations = []string{"Public bids are unverified commitments, not proof of concealed cards or future tricks.", "Bag and match context are recorded, but do not change a bid without a supported trick estimate.", "Nil feasibility only excludes a proven winner; all other Nil outcomes remain uncertain."}
	if none {
		r.limitations = append(r.limitations, "Neither a successful Nil nor a makeable positive team contract is supported by the known constraints.")
	}
	return r, nil
}
func eq[T comparable](p *T, v T) bool { return p != nil && *p == v }
func same[T comparable](a, b *T) bool { return a != nil && b != nil && *a == *b }
func any[T interface{}](vs []T, f func(T) bool) bool {
	for _, v := range vs {
		if f(v) {
			return true
		}
	}
	return false
}
func all[T interface{}](vs []T, f func(T) bool) bool {
	for _, v := range vs {
		if !f(v) {
			return false
		}
	}
	return true
}
func tern[T interface{}](v bool, a, b T) T {
	if v {
		return a
	}
	return b
}
func canHold(f d.Facts, s int, suit string) bool {
	return any(f.PossibleOwners, func(p d.PossibleOwner) bool { return d.CardSuit(p.Card) == suit && slices.Contains(p.Seats, s) })
}
