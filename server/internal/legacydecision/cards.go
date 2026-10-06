package legacydecision

import (
	"fmt"
	"slices"
	"sort"
	"strconv"
	"strings"
)

// These return fresh slices so callers cannot modify package-global card data.
func Suits() []string { return []string{"C", "D", "H", "S"} }
func Seats() []int    { return []int{0, 1, 2, 3} }
func CardSuit(c string) string {
	if len(c) == 0 {
		return ""
	}
	return c[:1]
}
func CardRank(c string) int {
	if len(c) < 2 {
		return 0
	}
	switch c[1:] {
	case "J":
		return 11
	case "Q":
		return 12
	case "K":
		return 13
	case "A":
		return 14
	}
	n, _ := strconv.Atoi(c[1:])
	return n
}
func ValidCard(c string) bool {
	if len(c) < 2 || !slices.Contains(Suits(), CardSuit(c)) {
		return false
	}
	return slices.Contains([]string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"}, c[1:])
}
func FullDeck() []string {
	v := []string{}
	for _, s := range Suits() {
		for _, r := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			v = append(v, s+r)
		}
	}
	return v
}
func Sorted(cards []string) []string {
	v := append([]string{}, cards...)
	sort.SliceStable(v, func(i, j int) bool {
		a, b := v[i], v[j]
		return CardSuit(a) < CardSuit(b) || CardSuit(a) == CardSuit(b) && CardRank(a) < CardRank(b)
	})
	return v
}
func CardLabel(c string) string {
	rank := c[1:]
	switch rank {
	case "J":
		rank = "Jack"
	case "Q":
		rank = "Queen"
	case "K":
		rank = "King"
	case "A":
		rank = "Ace"
	}
	return rank + " of " + map[string]string{"C": "Clubs", "D": "Diamonds", "H": "Hearts", "S": "Spades"}[CardSuit(c)]
}
func ActionID(a Action) string {
	switch a.Kind {
	case "pass":
		return "pass:" + strings.Join(Sorted(a.Cards), ",")
	case "bid":
		return fmt.Sprintf("bid:%d", a.Bid)
	default:
		return "play:" + a.Card
	}
}
func CloneAction(a Action) Action {
	if a.Cards != nil {
		a.Cards = append([]string{}, a.Cards...)
	}
	return a
}
func TrickWinner(plays []Play, mode string) int {
	s := CardSuit(plays[0].Card)
	if mode != "hearts" {
		for _, p := range plays {
			if CardSuit(p.Card) == "S" {
				s = "S"
			}
		}
	}
	best := -1
	rank := 0
	for _, p := range plays {
		if CardSuit(p.Card) == s && CardRank(p.Card) > rank {
			best = p.Seat
			rank = CardRank(p.Card)
		}
	}
	return best
}
func GetMemory(obs Observation) []SuitMemory {
	seen := map[string]bool{}
	voids := map[string][]int{}
	for _, s := range Suits() {
		voids[s] = []int{}
	}
	tricks := [][]Play{}
	for _, t := range obs.History {
		tricks = append(tricks, t.Plays)
	}
	tricks = append(tricks, obs.Trick)
	for _, t := range tricks {
		if len(t) == 0 {
			continue
		}
		led := CardSuit(t[0].Card)
		for _, p := range t {
			seen[p.Card] = true
			if CardSuit(p.Card) != led && !slices.Contains(voids[led], p.Seat) {
				voids[led] = append(voids[led], p.Seat)
			}
		}
	}
	result := []SuitMemory{}
	for _, s := range Suits() {
		n := 0
		for c := range seen {
			if CardSuit(c) == s {
				n++
			}
		}
		sort.Ints(voids[s])
		result = append(result, SuitMemory{s, n, 13 - n, voids[s]})
	}
	return result
}

// ActionsFor is the frozen V1 legal-reference projection, not a policy.
func ActionsFor(o Observation) []Action {
	out := []Action{}
	hand := Sorted(o.Hand)
	if o.Phase == "pass" && o.Mode == "hearts" {
		for a := 0; a < len(hand)-2; a++ {
			for b := a + 1; b < len(hand)-1; b++ {
				for c := b + 1; c < len(hand); c++ {
					out = append(out, Action{Kind: "pass", Seat: o.Seat, Cards: []string{hand[a], hand[b], hand[c]}})
				}
			}
		}
		return out
	}
	if o.Turn == nil || *o.Turn != o.Seat {
		return out
	}
	if o.Phase == "bid" {
		for b := 0; b < 14; b++ {
			out = append(out, Action{Kind: "bid", Seat: o.Seat, Bid: b})
		}
		return out
	}
	if o.Phase != "play" {
		return out
	}
	filter := func(pred func(string) bool) []string {
		v := []string{}
		for _, c := range hand {
			if pred(c) {
				v = append(v, c)
			}
		}
		return v
	}
	cards := hand
	if len(o.Trick) > 0 {
		following := filter(func(c string) bool { return CardSuit(c) == CardSuit(o.Trick[0].Card) })
		if len(following) > 0 {
			cards = following
		} else if o.Mode == "hearts" && len(o.History) == 0 {
			safe := filter(func(c string) bool { return CardSuit(c) != "H" && c != "SQ" })
			if len(safe) > 0 {
				cards = safe
			}
		}
	} else if o.Mode == "hearts" && len(o.History) == 0 {
		cards = filter(func(c string) bool { return c == "C2" })
	} else {
		s := "S"
		broken := o.SpadesBroken
		if o.Mode == "hearts" {
			s = "H"
			broken = o.HeartsBroken
		}
		others := filter(func(c string) bool { return CardSuit(c) != s })
		if !broken && len(others) > 0 {
			cards = others
		}
	}
	for _, c := range cards {
		out = append(out, Action{Kind: "play", Seat: o.Seat, Card: c})
	}
	return out
}
