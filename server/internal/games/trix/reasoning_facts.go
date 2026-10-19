package trix

import (
	"cardford/server/internal/contracts"
	"fmt"
	"strings"
)

func support(id, kind, text string) contracts.CoachSupport {
	return contracts.CoachSupport{ID: id, Kind: kind, Text: text}
}

func contextSupport(o Observation) []contracts.CoachSupport {
	out := []contracts.CoachSupport{support("trix-legal-count", "exact", fmt.Sprintf("%d legal choices.", len(Legal(o)))), support("trix-hand-counts", "exact", fmt.Sprintf("Public remaining hand counts by seat: %d, %d, %d, %d; your hand contains %d cards.", o.HandCounts[0], o.HandCounts[1], o.HandCounts[2], o.HandCounts[3], len(o.Hand)))}
	if partners(o.VariantID) {
		out = append(out, support("trix-team-objective", "exact", fmt.Sprintf("Seat %d is your teammate; both seats' penalties and layout finish points contribute to the same team total.", (o.Seat+2)%4)))
	} else {
		out = append(out, support("trix-solo-objective", "exact", "Each seat has its own score; every other seat is an opponent."))
	}
	if len(o.Trick) > 0 {
		w := winner(o.Trick)
		out = append(out, support("trix-current-winner", "exact", fmt.Sprintf("Seat %d currently leads this trick with %s; there is no trump.", w, cardLabel(winningCard(o.Trick)))))
	}
	voids := publicVoids(o)
	for seat := 0; seat < 4; seat++ {
		for _, suit := range []byte{'C', 'D', 'H', 'S'} {
			if voids[seat][suit] {
				out = append(out, support(fmt.Sprintf("trix-void-%d-%c", seat, suit), "exact", fmt.Sprintf("Seat %d showed no %s by discarding off suit in a public trick.", seat, suitLabel(suit))))
			}
		}
	}
	if o.TwoAnnouncements != nil {
		if o.TwoAnnouncements.Status == "revealed" {
			for _, p := range o.TwoAnnouncements.Cards {
				out = append(out, support("trix-revealed-two-"+p.Card, "exact", fmt.Sprintf("The public announcement identifies seat %d as the original holder of %s; current board placement determines whether it remains held.", p.Seat, cardLabel(p.Card))))
			}
		} else if o.TwoAnnouncements.Status == "hidden" {
			out = append(out, support("trix-hidden-twos", "exact", "Public counts identify how many twos each seat holds, but do not identify which suits they hold."))
		}
	}
	for _, p := range o.Passes {
		excluded := []string{}
		for _, c := range Deck() {
			if placeable(p.Board, c) {
				excluded = append(excluded, c)
			}
		}
		out = append(out, support("trix-layout-pass-"+p.Ref, "exact", fmt.Sprintf("Seat %d passed when %s were placeable, so that seat cannot still hold those cards; layout hands only shrink.", p.Seat, strings.Join(excluded, ", "))))
	}
	// Keep one fact per seat/suit even after a long layout request.
	if len(out) > 48 {
		out = compactPassSupport(o, out)
	}
	return out
}

// The private catalog retains all exact context. The player sees facts relevant
// to the selected action rather than a recital of every previous pass.
func relevantSupport(o Observation, a Action) []contracts.CoachSupport {
	out := []contracts.CoachSupport{}
	for _, s := range contextSupport(o) {
		keep := s.ID == "trix-legal-count" || s.ID == "trix-team-objective" || s.ID == "trix-solo-objective"
		if a.Kind == "layout-card" || a.Kind == "layout-pass" {
			keep = keep || s.ID == "trix-hand-counts" || s.ID == "trix-hidden-twos"
		}
		if a.Kind == "play-card" {
			keep = keep || s.ID == "trix-current-winner"
			suit := a.Card[0]
			if len(o.Trick) > 0 {
				suit = o.Trick[0].Card[0]
			}
			keep = keep || strings.HasPrefix(s.ID, "trix-void-") && strings.HasSuffix(s.ID, "-"+string(suit))
		}
		if a.Kind == "layout-card" && strings.HasPrefix(s.ID, "trix-revealed-two-") {
			card := strings.TrimPrefix(s.ID, "trix-revealed-two-")
			keep = keep || card[0] == a.Card[0]
		}
		if keep {
			out = append(out, s)
		}
	}
	return out
}

func compactPassSupport(o Observation, in []contracts.CoachSupport) []contracts.CoachSupport {
	out := []contracts.CoachSupport{}
	for _, s := range in {
		if !strings.HasPrefix(s.ID, "trix-layout-pass-") {
			out = append(out, s)
		}
	}
	for seat := 0; seat < 4; seat++ {
		excluded := []string{}
		for _, c := range Deck() {
			if passExcludes(o, seat, c) {
				excluded = append(excluded, c)
			}
		}
		if len(excluded) > 0 {
			out = append(out, support(fmt.Sprintf("trix-layout-pass-exclusions-%d", seat), "exact", fmt.Sprintf("Public forced passes exclude seat %d from holding: %s.", seat, strings.Join(excluded, ", "))))
		}
	}
	return out
}

func suitLabel(suit byte) string {
	return map[byte]string{'C': "clubs", 'D': "diamonds", 'H': "hearts", 'S': "spades"}[suit]
}
func winningCard(plays []Play) string {
	best := plays[0].Card
	for _, p := range plays[1:] {
		if p.Card[0] == best[0] && rank(p.Card) > rank(best) {
			best = p.Card
		}
	}
	return best
}
func publicVoids(o Observation) [4]map[byte]bool {
	var out [4]map[byte]bool
	for seat := range out {
		out[seat] = map[byte]bool{}
	}
	check := func(plays []Play) {
		if len(plays) == 0 {
			return
		}
		led := plays[0].Card[0]
		for _, p := range plays {
			if p.Card[0] != led && p.Seat >= 0 && p.Seat < 4 {
				out[p.Seat][led] = true
			}
		}
	}
	for _, t := range o.Tricks {
		check(t.Plays)
	}
	check(o.Trick)
	return out
}
func boardHas(board []Row, c string) bool {
	for _, r := range board {
		if r.Suit == c[:1] && r.Low > 0 && rank(c) >= r.Low && rank(c) <= r.High {
			return true
		}
	}
	return false
}
func publiclyPlayed(o Observation, c string) bool {
	if boardHas(o.Board, c) {
		return true
	}
	for _, p := range o.Trick {
		if p.Card == c {
			return true
		}
	}
	for _, t := range o.Tricks {
		for _, p := range t.Plays {
			if p.Card == c {
				return true
			}
		}
	}
	return false
}
func publicHolder(o Observation, c string) (int, bool) {
	if publiclyPlayed(o, c) {
		return 0, false
	}
	if contains(o.Hand, c) {
		return o.Seat, true
	}
	for _, d := range o.Declarations {
		if contains(d.Cards, c) {
			return d.Seat, true
		}
	}
	if o.TwoAnnouncements != nil && o.TwoAnnouncements.Status == "revealed" {
		for _, p := range o.TwoAnnouncements.Cards {
			if p.Card == c {
				return p.Seat, true
			}
		}
	}
	return 0, false
}
func passExcludes(o Observation, seat int, c string) bool {
	for _, p := range o.Passes {
		if p.Seat == seat && placeable(p.Board, c) {
			return true
		}
	}
	return false
}
func possibleHolders(o Observation, c string) []int {
	if publiclyPlayed(o, c) {
		return []int{}
	}
	if seat, ok := publicHolder(o, c); ok {
		return []int{seat}
	}
	voids := publicVoids(o)
	out := []int{}
	for seat := 0; seat < 4; seat++ {
		if seat != o.Seat && o.HandCounts[seat] > 0 && !voids[seat][c[0]] && !passExcludes(o, seat, c) {
			out = append(out, seat)
		}
	}
	return out
}
func remainingHigher(o Observation, c string) []string {
	out := []string{}
	for _, h := range Deck() {
		if h[0] == c[0] && rank(h) > rank(c) && !contains(o.Hand, h) && !publiclyPlayed(o, h) {
			out = append(out, h)
		}
	}
	return out
}

func possibleOvertakingSeats(o Observation, plays []Play) []int {
	if len(plays) >= 4 {
		return []int{}
	}
	best := winningCard(plays)
	out := []int{}
	seat := NextSeat(o.Seat)
	for left := 4 - len(plays); left > 0; left-- {
		possible := false
		for _, c := range remainingHigher(o, best) {
			for _, holder := range possibleHolders(o, c) {
				if holder == seat {
					possible = true
				}
			}
		}
		if possible {
			out = append(out, seat)
		}
		seat = NextSeat(seat)
	}
	return out
}

// prefixScore computes a conditional ledger for the publicly played prefix.
// Only a four-card trick makes that ledger an actual resolved result.
func prefixScore(o Observation, plays []Play) (int, int) {
	if o.Request == nil || len(plays) == 0 {
		return 0, 0
	}
	t := Trick{Number: len(o.Tricks) + 1, Leader: plays[0].Seat, Winner: winner(plays), Plays: plays}
	s := State{Config: Config{Variant: o.VariantID}, Request: *o.Request, DealNumber: o.DealNumber, Kingdom: o.Kingdom, Declarations: o.Declarations, LastExternalLeader: o.LastExternalLeader, Ledger: []LedgerEntry{}, WithheldBonuses: []WithheldBonus{}}
	if t.Leader != t.Winner {
		s.LastExternalLeader[t.Winner] = &LeadSource{Seat: t.Leader, Trick: t.Number}
	}
	scoreTrick(&s, t)
	own, other := 0, 0
	for _, v := range scores(s, 0, 0) {
		mine := false
		for _, seat := range v.Seats {
			if seat == o.Seat {
				mine = true
			}
		}
		if mine {
			own = v.Total
		} else {
			other += v.Total
		}
	}
	return own, other
}
