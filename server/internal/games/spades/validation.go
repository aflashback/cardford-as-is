package spades

import (
	"encoding/json"
	"fmt"
	"reflect"
	"unicode/utf16"
)

func textLength(s string) int { return len(utf16.Encode([]rune(s))) }

// Validate is the repository load/save gate for the private V1 payload.
func Validate(raw json.RawMessage) error { _, err := DecodeState(raw); return err }
func validateAction(a *Action) error {
	if a == nil || !seatOK(a.Seat) {
		return fmt.Errorf("invalid action actor")
	}
	switch a.Kind {
	case "bid":
		if a.Bid == nil || *a.Bid < 0 || *a.Bid > 13 || a.Card != nil {
			return fmt.Errorf("invalid bid")
		}
	case "play":
		if a.Card == nil || cardValue(*a.Card) < 0 || a.Bid != nil {
			return fmt.Errorf("invalid play")
		}
	default:
		return fmt.Errorf("unsupported Spades action")
	}
	return nil
}
func validateEvent(e Event, index int) error {
	return validateEventWithTextLength(e, index, textLength)
}
func validateEventWithTextLength(e Event, index int, measureText func(string) int) error {
	if e.ID != index+1 || measureText(e.Message) > 2000 {
		return fmt.Errorf("invalid event identity or message")
	}
	seatRequired, cardRequired, bidRequired := false, false, false
	switch e.Type {
	case "hand-started", "trick-collected", "hand-scored":
	case "bid-placed":
		seatRequired = true
		bidRequired = true
	case "card-played":
		seatRequired = true
		cardRequired = true
	case "trick-resolved":
		seatRequired = true
	default:
		return fmt.Errorf("unsupported Spades event")
	}
	if (e.Seat != nil) != seatRequired || (e.Card != nil) != cardRequired || (e.Bid != nil) != bidRequired {
		return fmt.Errorf("invalid Spades event details")
	}
	if e.Seat != nil && !seatOK(*e.Seat) || e.Card != nil && cardValue(*e.Card) < 0 || e.Bid != nil && (*e.Bid < 0 || *e.Bid > 13) {
		return fmt.Errorf("invalid Spades event value")
	}
	return nil
}
func validateState(s *State) error {
	return validateStateWithTextLength(s, textLength)
}
func validateStateWithTextLength(s *State, measureText func(string) int) error {
	if s == nil || measureText(s.ID) < 1 || measureText(s.ID) > 256 || ruleProfile(s.Mode) == "" || s.ModuleVersion != "1.0.0" || s.EventSchemaVersion != "1.0.0" || s.RuleProfileID != ruleProfile(s.Mode) {
		return fmt.Errorf("unsupported Spades identity")
	}
	if !seatOK(s.Dealer) || s.Turn == nil || !seatOK(*s.Turn) || s.HandNumber < 1 || !safeInt(s.HandNumber) {
		return fmt.Errorf("invalid Spades turn or hand number")
	}
	switch s.Phase {
	case "bid", "play", "trick-end", "hand-end", "match-end":
	default:
		return fmt.Errorf("invalid Spades phase")
	}
	switch s.PassDirection {
	case "left", "right", "across", "hold":
	default:
		return fmt.Errorf("invalid historical pass direction")
	}
	if s.Trick == nil || s.History == nil || len(s.History) > 13 || s.Events == nil || len(s.Events) < 1 || len(s.Events) > 100000 {
		return fmt.Errorf("invalid Spades collections")
	}
	for seat := 0; seat < 4; seat++ {
		p := s.Passes[seat]
		if s.Hands[seat] == nil || len(s.Hands[seat]) > 13 || p.Outgoing == nil || p.Incoming == nil || len(p.Outgoing) != 0 || len(p.Incoming) != 0 || p.To != nil || p.From != nil {
			return fmt.Errorf("invalid Spades hand/pass metadata")
		}
		if !safeInt(s.Scores[seat]) || s.Bags[seat] < 0 || s.Bags[seat] > 9 || s.Tricks[seat] < 0 || s.Tricks[seat] > 13 || (s.Bids[seat] != nil && (*s.Bids[seat] < 0 || *s.Bids[seat] > 13)) {
			return fmt.Errorf("invalid Spades score/bid/trick range")
		}
	}
	if s.Phase == "trick-end" {
		if len(s.Trick) != 4 || len(s.History) == 0 || !reflect.DeepEqual(s.Trick, s.History[len(s.History)-1].Plays) {
			return fmt.Errorf("completed Spades trick mismatch")
		}
	} else if len(s.Trick) > 3 || (s.Phase != "play" && len(s.Trick) != 0) {
		return fmt.Errorf("unexpected Spades trick")
	}
	seen := map[string]bool{}
	counts := [4]int{}
	wins := [4]int{}
	var original [4][]string
	addCard := func(c string, seat int) error {
		if !seatOK(seat) || cardValue(c) < 0 || seen[c] {
			return fmt.Errorf("Spades card conservation failed")
		}
		seen[c] = true
		counts[seat]++
		original[seat] = append(original[seat], c)
		return nil
	}
	for seat, h := range s.Hands {
		for _, c := range h {
			if err := addCard(c, seat); err != nil {
				return err
			}
		}
	}
	leader := (s.Dealer + 1) % 4
	for _, trick := range s.History {
		if len(trick.Plays) != 4 || !seatOK(trick.Winner) {
			return fmt.Errorf("invalid completed trick")
		}
		for i, p := range trick.Plays {
			if p.Seat != (leader+i)%4 {
				return fmt.Errorf("Spades history turn order mismatch")
			}
			if err := addCard(p.Card, p.Seat); err != nil {
				return err
			}
		}
		if trickWinner(trick.Plays) != trick.Winner {
			return fmt.Errorf("Spades trick winner mismatch")
		}
		wins[trick.Winner]++
		leader = trick.Winner
	}
	if s.Phase != "trick-end" {
		for i, p := range s.Trick {
			if p.Seat != (leader+i)%4 {
				return fmt.Errorf("Spades current trick turn order mismatch")
			}
			if err := addCard(p.Card, p.Seat); err != nil {
				return err
			}
		}
	}
	if len(seen) != 52 {
		return fmt.Errorf("Spades card conservation failed")
	}
	for seat := 0; seat < 4; seat++ {
		if counts[seat] != 13 || wins[seat] != s.Tricks[seat] {
			return fmt.Errorf("Spades seat card or trick count mismatch")
		}
	}
	// Reconstruct the original deal and verify every public play was legal with
	// the cards the actor actually held at that point.
	broken := false
	playLeader := (s.Dealer + 1) % 4
	playTricks := make([][]Play, 0, len(s.History)+1)
	for _, t := range s.History {
		playTricks = append(playTricks, t.Plays)
	}
	if s.Phase != "trick-end" && len(s.Trick) > 0 {
		playTricks = append(playTricks, s.Trick)
	}
	for _, trick := range playTricks {
		current := []Play{}
		for _, p := range trick {
			actor := (playLeader + len(current)) % 4
			found := false
			for _, a := range actionsFor("play", &actor, original[actor], current, broken, actor) {
				if a.Card != nil && *a.Card == p.Card {
					found = true
					break
				}
			}
			if !found || actor != p.Seat {
				return fmt.Errorf("illegal play in Spades history")
			}
			for i, c := range original[actor] {
				if c == p.Card {
					original[actor] = append(original[actor][:i], original[actor][i+1:]...)
					break
				}
			}
			current = append(current, p)
			if p.Card[0] == 'S' {
				broken = true
			}
		}
		if len(current) == 4 {
			playLeader = trickWinner(current)
		}
	}
	if broken != s.SpadesBroken {
		return fmt.Errorf("Spades broken flag mismatch")
	}
	if s.Phase == "bid" {
		count := 0
		for _, b := range s.Bids {
			if b != nil {
				count++
			}
		}
		if count == 4 || len(s.History) > 0 || *s.Turn != (s.Dealer+1+count)%4 {
			return fmt.Errorf("invalid Spades bidding phase")
		}
		for offset := 0; offset < 4; offset++ {
			if (s.Bids[(s.Dealer+1+offset)%4] != nil) != (offset < count) {
				return fmt.Errorf("Spades bid order mismatch")
			}
		}
	} else {
		for _, b := range s.Bids {
			if b == nil {
				return fmt.Errorf("missing Spades bids")
			}
		}
		expected := leader
		if s.Phase == "play" {
			expected = (leader + len(s.Trick)) % 4
		}
		if *s.Turn != expected {
			return fmt.Errorf("Spades turn mismatch")
		}
	}
	if (s.HandResult != nil) != (len(s.History) == 13) {
		return fmt.Errorf("Spades score boundary mismatch")
	}
	if len(s.History) == 13 && (s.Phase == "bid" || s.Phase == "play") {
		return fmt.Errorf("completed Spades hand still accepting actions")
	}
	if (s.Phase == "hand-end" || s.Phase == "match-end") && s.HandResult == nil {
		return fmt.Errorf("unscored Spades hand")
	}
	if s.Mode == "spades-partners" && (s.Scores[0] != s.Scores[2] || s.Scores[1] != s.Scores[3] || s.Bags[0] != s.Bags[2] || s.Bags[1] != s.Bags[3]) {
		return fmt.Errorf("Spades partnership score mismatch")
	}
	if err := validateScoredResult(s); err != nil {
		return err
	}
	for i, e := range s.Events {
		if err := validateEventWithTextLength(e, i, measureText); err != nil {
			return err
		}
	}
	return nil
}
func validateScoredResult(s *State) error {
	if s.HandResult == nil {
		if s.HandNumber == 1 {
			for seat := 0; seat < 4; seat++ {
				if s.Scores[seat] != 0 || s.Bags[seat] != 0 {
					return fmt.Errorf("Spades first hand must begin with zero scores and bags")
				}
			}
		}
		return nil
	}
	r := s.HandResult
	if r.Winner != nil && !seatOK(*r.Winner) {
		return fmt.Errorf("invalid match winner")
	}
	for seat := 0; seat < 4; seat++ {
		if !safeInt(r.Points[seat]) || r.Bags[seat] != s.Bags[seat] {
			return fmt.Errorf("invalid hand result")
		}
	}
	for _, group := range groups(s.Mode) {
		bids, tricks := []int{}, []int{}
		contract, credit, failed := 0, 0, 0
		for _, seat := range group {
			bid := *s.Bids[seat]
			bids = append(bids, bid)
			tricks = append(tricks, s.Tricks[seat])
			contract += bid
			if bid == 0 {
				failed += s.Tricks[seat]
			} else {
				credit += s.Tricks[seat]
			}
		}
		earned := failed
		if credit > contract {
			earned += credit - contract
		}
		previous := 0
		if s.HandNumber > 1 {
			previous = ((s.Bags[group[0]]-earned)%10 + 10) % 10
		}
		delta, bags, err := ScoreCompetitor(bids, tricks, previous)
		if err != nil {
			return err
		}
		for _, seat := range group {
			if r.Points[seat] != delta || s.Bags[seat] != bags || !safeInt(s.Scores[seat]-delta) || (s.HandNumber == 1 && s.Scores[seat] != delta) {
				return fmt.Errorf("Spades hand score mismatch")
			}
		}
	}
	winner := matchWinner(s)
	if !reflect.DeepEqual(winner, r.Winner) {
		return fmt.Errorf("Spades match winner mismatch")
	}
	phase := "hand-end"
	if winner != nil {
		phase = "match-end"
	}
	if s.Phase != "trick-end" && s.Phase != phase {
		return fmt.Errorf("Spades scored phase mismatch")
	}
	return nil
}
