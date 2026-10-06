package hearts

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

func rank(c string) int {
	if len(c) < 2 {
		return -1
	}
	for i, r := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
		if c[1:] == r {
			return i + 2
		}
	}
	return -1
}
func cardOK(c string) bool { return len(c) >= 2 && strings.Contains("CDHS", c[:1]) && rank(c) > 0 }
func sorted(v []string) []string {
	r := append([]string{}, v...)
	sort.Slice(r, func(i, j int) bool {
		if r[i][0] != r[j][0] {
			return strings.IndexByte("CDHS", r[i][0]) < strings.IndexByte("CDHS", r[j][0])
		}
		return rank(r[i]) < rank(r[j])
	})
	return r
}
func has(v []string, c string) bool {
	for _, a := range v {
		if a == c {
			return true
		}
	}
	return false
}
func without(v []string, removed []string) []string {
	out := []string{}
	for _, c := range v {
		if !has(removed, c) {
			out = append(out, c)
		}
	}
	return out
}
func seatName(seat int) string { return []string{"You", "West", "North", "East"}[seat] }
func cardLabel(c string) string {
	r := c[1:]
	switch r {
	case "J":
		r = "Jack"
	case "Q":
		r = "Queen"
	case "K":
		r = "King"
	case "A":
		r = "Ace"
	}
	return r + " of " + []string{"Clubs", "Diamonds", "Hearts", "Spades"}[strings.IndexByte("CDHS", c[0])]
}
func passDirection(hand int) string { return []string{"left", "right", "across", "hold"}[(hand-1)%4] }
func passOffset(direction string) int {
	switch direction {
	case "left":
		return 1
	case "right":
		return 3
	case "across":
		return 2
	}
	return 0
}
func trickWinner(plays []Play) int {
	winner := plays[0]
	for _, p := range plays[1:] {
		if p.Card[0] == winner.Card[0] && rank(p.Card) > rank(winner.Card) {
			winner = p
		}
	}
	return winner.Seat
}
func scorePoints(history []Trick) [4]int {
	points := [4]int{}
	for _, t := range history {
		for _, p := range t.Plays {
			if p.Card == "SQ" {
				points[t.Winner] += 13
			} else if p.Card[0] == 'H' {
				points[t.Winner]++
			}
		}
	}
	for seat, p := range points {
		if p == 26 {
			points = [4]int{26, 26, 26, 26}
			points[seat] = 0
			break
		}
	}
	return points
}
func matchWinner(scores [4]int) *int {
	max, min := scores[0], scores[0]
	for _, v := range scores {
		if v > max {
			max = v
		}
		if v < min {
			min = v
		}
	}
	if max < 100 {
		return nil
	}
	winner := -1
	for seat, v := range scores {
		if v == min {
			if winner >= 0 {
				return nil
			}
			winner = seat
		}
	}
	return ptr(winner)
}
func actions(s *state, seat int) []action {
	a := []action{}
	h := s.Hands[seat]
	if s.Phase == "pass" {
		for i := 0; i < len(h)-2; i++ {
			for j := i + 1; j < len(h)-1; j++ {
				for k := j + 1; k < len(h); k++ {
					a = append(a, action{Kind: "pass", Seat: seat, Cards: []string{h[i], h[j], h[k]}})
				}
			}
		}
		return a
	}
	if s.Phase != "play" || s.Turn == nil || *s.Turn != seat {
		return a
	}
	cards := []string{}
	if len(s.Trick) > 0 {
		following, safe := []string{}, []string{}
		for _, c := range h {
			if c[0] == s.Trick[0].Card[0] {
				following = append(following, c)
			}
			if c[0] != 'H' && c != "SQ" {
				safe = append(safe, c)
			}
		}
		if len(following) > 0 {
			cards = following
		} else if len(s.History) == 0 && len(safe) > 0 {
			cards = safe
		} else {
			cards = h
		}
	} else if len(s.History) == 0 {
		if has(h, "C2") {
			cards = append(cards, "C2")
		}
	} else {
		other := []string{}
		for _, c := range h {
			if c[0] != 'H' {
				other = append(other, c)
			}
		}
		if !s.HeartsBroken && len(other) > 0 {
			cards = other
		} else {
			cards = h
		}
	}
	for _, c := range cards {
		a = append(a, action{Kind: "play", Seat: seat, Card: c})
	}
	return a
}
func actionID(a action) string {
	if a.Kind == "pass" {
		return "pass:" + strings.Join(a.Cards, ",")
	}
	return "play:" + a.Card
}
func Legal(raw json.RawMessage, seat int) (json.RawMessage, error) {
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	s, err := read(raw)
	if err != nil {
		return nil, err
	}
	return json.Marshal(actions(s, seat))
}
func CandidateIDs(raw json.RawMessage, seat int) ([]string, error) {
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	s, err := read(raw)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, a := range actions(s, seat) {
		ids = append(ids, actionID(a))
	}
	return ids, nil
}
