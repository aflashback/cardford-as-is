package spades

import (
	"fmt"
	"sort"
	"strings"
)

var ranks = []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"}

func cardValue(card string) int {
	if len(card) < 2 || len(card) > 3 {
		return -1
	}
	suit := strings.IndexByte("CDHS", card[0])
	if suit < 0 {
		return -1
	}
	for rank, r := range ranks {
		if card[1:] == r {
			return suit*13 + rank
		}
	}
	return -1
}
func sorted(cards []string) []string {
	result := append([]string{}, cards...)
	sort.Slice(result, func(i, j int) bool { return cardValue(result[i]) < cardValue(result[j]) })
	return result
}
func cardLabel(card string) string {
	rank := card[1:]
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
	return rank + " of " + []string{"Clubs", "Diamonds", "Hearts", "Spades"}[cardValue(card)/13]
}
func validateDeal(deck []string) error {
	if len(deck) != 52 {
		return fmt.Errorf("a deal requires 52 unique cards")
	}
	seen := map[string]bool{}
	for _, c := range deck {
		if cardValue(c) < 0 || seen[c] {
			return fmt.Errorf("invalid or duplicate card")
		}
		seen[c] = true
	}
	return nil
}
func actionsFor(phase string, turn *int, hand []string, trick []Play, broken bool, seat int) []Action {
	result := []Action{}
	if turn == nil || *turn != seat {
		return result
	}
	if phase == "bid" {
		for bid := 0; bid <= 13; bid++ {
			result = append(result, Action{Kind: "bid", Seat: seat, Bid: ptr(bid)})
		}
		return result
	}
	if phase != "play" {
		return result
	}
	cards := sorted(hand)
	filtered := []string{}
	if len(trick) > 0 {
		for _, c := range cards {
			if c[0] == trick[0].Card[0] {
				filtered = append(filtered, c)
			}
		}
	} else if !broken {
		for _, c := range cards {
			if c[0] != 'S' {
				filtered = append(filtered, c)
			}
		}
	}
	if len(filtered) > 0 {
		cards = filtered
	}
	for _, c := range cards {
		result = append(result, Action{Kind: "play", Seat: seat, Card: ptr(c)})
	}
	return result
}
func actionID(a Action) string {
	if a.Kind == "bid" && a.Bid != nil {
		return fmt.Sprintf("bid:%d", *a.Bid)
	}
	if a.Kind == "play" && a.Card != nil {
		return "play:" + *a.Card
	}
	return ""
}
func trickWinner(plays []Play) int {
	best := plays[0]
	for _, p := range plays[1:] {
		if (p.Card[0] == 'S' && best.Card[0] != 'S') || (p.Card[0] == best.Card[0] && cardValue(p.Card) > cardValue(best.Card)) {
			best = p
		}
	}
	return best.Seat
}
func matchWinner(s *State) *int {
	best := s.Scores[0]
	for _, n := range s.Scores[1:] {
		if n > best {
			best = n
		}
	}
	if best < 500 {
		return nil
	}
	limit := 4
	if s.Mode == "spades-partners" {
		limit = 2
	}
	var winner *int
	for seat := 0; seat < limit; seat++ {
		if s.Scores[seat] == best {
			if winner != nil {
				return nil
			}
			winner = ptr(seat)
		}
	}
	return winner
}
func groups(mode string) [][]int {
	if mode == "spades-partners" {
		return [][]int{{0, 2}, {1, 3}}
	}
	return [][]int{{0}, {1}, {2}, {3}}
}

// ScoreCompetitor implements the pinned profile: failed Nil tricks count as
// bags, never contract credit or +1 overtrick points.
func ScoreCompetitor(bids, tricks []int, oldBags int) (delta, bags int, err error) {
	if len(bids) == 0 || len(bids) != len(tricks) || oldBags < 0 || oldBags > 9 {
		return 0, 0, fmt.Errorf("invalid scoring input")
	}
	contract, credit, failed, nilScore := 0, 0, 0, 0
	for i, bid := range bids {
		if bid < 0 || bid > 13 || tricks[i] < 0 || tricks[i] > 13 {
			return 0, 0, fmt.Errorf("invalid scoring input")
		}
		if bid == 0 {
			if tricks[i] == 0 {
				nilScore += 100
			} else {
				nilScore -= 100
			}
			failed += tricks[i]
		} else {
			contract += bid
			credit += tricks[i]
		}
	}
	over := 0
	contractScore := -10 * contract
	if credit >= contract {
		over = credit - contract
		contractScore = 10 * contract
	}
	total := oldBags + over + failed
	return contractScore + nilScore + over - 100*(total/10), total % 10, nil
}
