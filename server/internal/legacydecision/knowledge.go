package legacydecision

import (
	"slices"
	"sort"
)

// BuildFacts preserves the original V1 compatibility facts shared by the two
// legacy defaults. This is not a generic platform or V2 session facts contract.
// Every inference is limited to the actor hand and public/retained knowledge.
func BuildFacts(o Observation) Facts {
	nilStatus := func(b *int, t int) string {
		if b != nil && *b == 0 {
			if t == 0 {
				return "live"
			}
			return "failed"
		}
		return "none"
	}
	f := Facts{
		Mode: o.Mode, Seat: o.Seat, LegalCount: len(o.LegalActions),
		OwnBid: clonePtr(o.Bids[o.Seat]), OwnTricks: o.Tricks[o.Seat],
		OwnNil:      nilStatus(o.Bids[o.Seat], o.Tricks[o.Seat]),
		ActorsAfter: []int{}, TricksRemaining: 13 - len(o.History),
		SuitLengths: map[string]int{"C": 0, "D": 0, "H": 0, "S": 0},
		Voids:       map[string][]int{"C": {}, "D": {}, "H": {}, "S": {}},
		PlayedCards: []string{}, OutstandingCards: []string{},
		PossibleOwners: []PossibleOwner{}, CardOutcomes: []CardOutcome{},
	}
	if o.Mode == "spades-partners" {
		f.Partner = Ptr((o.Seat + 2) % 4)
		f.PartnerNil = Ptr(nilStatus(o.Bids[*f.Partner], o.Tricks[*f.Partner]))
	}
	if len(o.Trick) > 0 {
		f.LedSuit = Ptr(CardSuit(o.Trick[0].Card))
		f.CurrentWinner = Ptr(TrickWinner(o.Trick, o.Mode))
	}
	if o.Phase == "play" {
		s := (o.Seat + 1) % 4
		for i := len(o.Trick) + 1; i < 4; i++ {
			f.ActorsAfter = append(f.ActorsAfter, s)
			s = (s + 1) % 4
		}
	}
	public := []Play{}
	for _, t := range o.History {
		public = append(public, t.Plays...)
	}
	public = append(public, o.Trick...)
	seen := map[string]bool{}
	own := map[string]bool{}
	for _, p := range public {
		seen[p.Card] = true
	}
	for _, c := range o.Hand {
		own[c] = true
	}
	complete := len(seen) == len(public)
	for _, c := range o.Hand {
		if seen[c] {
			complete = false
		}
	}
	for _, s := range Seats() {
		count := 0
		for _, p := range public {
			if p.Seat == s {
				count++
			}
		}
		if o.HandSizes[s]+count != 13 {
			complete = false
		}
	}
	for c := range seen {
		f.PlayedCards = append(f.PlayedCards, c)
	}
	f.PlayedCards = Sorted(f.PlayedCards)
	for _, c := range FullDeck() {
		if !seen[c] {
			f.OutstandingCards = append(f.OutstandingCards, c)
		}
	}
	for _, m := range GetMemory(o) {
		f.Voids[m.Suit] = append([]int{}, m.VoidSeats...)
	}
	if o.Mode != "hearts" && complete {
		broken := false
		tricks := [][]Play{}
		for _, t := range o.History {
			tricks = append(tricks, t.Plays)
		}
		tricks = append(tricks, o.Trick)
		for _, t := range tricks {
			if len(t) == 0 {
				continue
			}
			if !broken && CardSuit(t[0].Card) == "S" {
				for _, s := range []string{"C", "D", "H"} {
					if !slices.Contains(f.Voids[s], t[0].Seat) {
						f.Voids[s] = append(f.Voids[s], t[0].Seat)
					}
				}
			}
			for _, p := range t {
				if CardSuit(p.Card) == "S" {
					broken = true
				}
			}
		}
	}
	for _, s := range Suits() {
		sort.Ints(f.Voids[s])
	}
	f.KnowledgeComplete = complete
	for _, c := range f.OutstandingCards {
		if own[c] {
			f.PossibleOwners = append(f.PossibleOwners, PossibleOwner{c, []int{o.Seat}})
			continue
		}
		retained := []int{}
		for _, h := range o.KnownHoldings {
			if h.Card == c {
				retained = append(retained, h.Seat)
			}
		}
		if len(retained) > 1 {
			f.KnowledgeComplete = false
		}
		ss := []int{}
		for _, s := range Seats() {
			if s != o.Seat && o.HandSizes[s] > 0 && !slices.Contains(f.Voids[CardSuit(c)], s) && (len(retained) == 0 || slices.Contains(retained, s)) {
				ss = append(ss, s)
			}
		}
		if len(ss) == 0 {
			f.KnowledgeComplete = false
		}
		f.PossibleOwners = append(f.PossibleOwners, PossibleOwner{c, ss})
	}
	for _, s := range Seats() {
		certain, possible := 0, 0
		for _, p := range f.PossibleOwners {
			if len(p.Seats) == 1 && p.Seats[0] == s {
				certain++
			}
			if slices.Contains(p.Seats, s) {
				possible++
			}
		}
		if certain > o.HandSizes[s] || possible < o.HandSizes[s] {
			f.KnowledgeComplete = false
		}
	}
	if !f.KnowledgeComplete {
		for i, p := range f.PossibleOwners {
			if !own[p.Card] {
				ss := []int{}
				for _, s := range Seats() {
					if s != o.Seat && !slices.Contains(f.Voids[CardSuit(p.Card)], s) {
						ss = append(ss, s)
					}
				}
				f.PossibleOwners[i].Seats = ss
			}
		}
	}
	possibleAt := func(s int, suit string) bool {
		for _, p := range f.PossibleOwners {
			if CardSuit(p.Card) == suit && slices.Contains(p.Seats, s) {
				return true
			}
		}
		return false
	}
	certainlyHas := func(s int, suit string) bool {
		if !f.KnowledgeComplete {
			return false
		}
		for _, p := range f.PossibleOwners {
			if CardSuit(p.Card) == suit && len(p.Seats) == 1 && p.Seats[0] == s {
				return true
			}
		}
		return false
	}
	members := []int{o.Seat}
	if f.Partner != nil {
		members = append(members, *f.Partner)
	}
	bidComplete := true
	for _, s := range members {
		if o.Bids[s] == nil {
			bidComplete = false
		}
	}
	if o.Mode != "hearts" && bidComplete {
		bid, credited := 0, 0
		for _, s := range members {
			bid += Value(o.Bids[s])
			if Value(o.Bids[s]) > 0 {
				credited += o.Tricks[s]
			}
		}
		f.ContractBid = Ptr(bid)
		f.CreditedTricks = Ptr(credited)
		f.ContractNeeded = Ptr(max(0, bid-credited))
	}
	failed, ordinary := 0, 0
	for _, s := range members {
		if o.Bids[s] != nil && *o.Bids[s] == 0 {
			failed += o.Tricks[s]
		}
	}
	if f.ContractBid != nil && f.CreditedTricks != nil {
		ordinary = max(0, *f.CreditedTricks-*f.ContractBid)
	}
	projected := o.Bags[o.Seat] + ordinary + failed
	if o.Mode != "hearts" {
		f.OldBags = Ptr(o.Bags[o.Seat])
		f.BagRoom = Ptr(10 - projected%10)
		f.ScoreToTarget = Ptr(max(0, 500-o.Scores[o.Seat]))
		if f.ContractNeeded != nil && *f.ContractNeeded == 0 && Value(f.ContractBid) > 0 {
			f.NextOrdinaryBagDelta = Ptr(1)
			if projected%10 == 9 {
				f.NextOrdinaryBagDelta = Ptr(-99)
			}
		}
	}
	for _, c := range o.Hand {
		f.SuitLengths[CardSuit(c)]++
	}
	for _, a := range o.LegalActions {
		if a.Kind != "play" {
			continue
		}
		ps := append(append([]Play{}, o.Trick...), Play{o.Seat, a.Card})
		winner := TrickWinner(ps, o.Mode)
		winningCard := ""
		for _, p := range ps {
			if p.Seat == winner {
				winningCard = p.Card
				break
			}
		}
		lead := CardSuit(ps[0].Card)
		over := []int{}
		for _, s := range f.ActorsAfter {
			for _, p := range f.PossibleOwners {
				if !slices.Contains(p.Seats, s) || CardSuit(p.Card) != lead && certainlyHas(s, lead) {
					continue
				}
				test := append(append([]Play{}, ps...), Play{s, p.Card})
				if TrickWinner(test, o.Mode) == s {
					over = append(over, s)
					break
				}
			}
		}
		risk := []int{}
		if o.Mode != "hearts" && CardSuit(winningCard) != "S" {
			for _, s := range f.ActorsAfter {
				if possibleAt(s, "S") && !certainlyHas(s, lead) {
					risk = append(risk, s)
				}
			}
		}
		master := true
		for _, c := range f.OutstandingCards {
			if CardSuit(c) == CardSuit(a.Card) && CardRank(c) > CardRank(a.Card) {
				master = false
			}
		}
		var guaranteed *int
		if len(f.ActorsAfter) == 0 || f.KnowledgeComplete && len(over) == 0 {
			guaranteed = Ptr(winner)
		}
		cover := f.Partner != nil && Value(f.PartnerNil) == "live" && f.CurrentWinner != nil && *f.CurrentWinner == *f.Partner && winner != *f.Partner
		f.CardOutcomes = append(f.CardOutcomes, CardOutcome{ActionID(a), winner, guaranteed, over, cover, risk, master})
	}
	return f
}
func clonePtr[T any](p *T) *T {
	if p == nil {
		return nil
	}
	return Ptr(*p)
}
