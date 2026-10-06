package hearts

import (
	"fmt"
	"reflect"
)

// checkedState is an untrusted import boundary only. It reconstructs the
// current hand and verifies archived public chronology once. Trusted immutable
// transitions use the reducer's bounded checks instead of replaying history.
func checkedState(s state) (*state, error) {
	if textLength(s.ID) < 1 || textLength(s.ID) > 256 || s.Mode != "hearts" || s.ModuleVersion != "1.0.0" || s.RuleProfileID != "hearts-training-1.0.0" || s.EventSchemaVersion != "1.0.0" {
		return nil, fmt.Errorf("unsupported Hearts identity")
	}
	if !seatOK(s.Dealer) || s.HandNumber < 1 || !safeInt(s.HandNumber) || (s.Turn != nil && !seatOK(*s.Turn)) || s.PassDirection != passDirection(s.HandNumber) {
		return nil, fmt.Errorf("invalid Hearts hand or turn")
	}
	switch s.Phase {
	case "pass", "play", "trick-end", "hand-end", "match-end":
	default:
		return nil, fmt.Errorf("invalid Hearts phase")
	}
	if s.Trick == nil || len(s.Trick) > 4 || s.History == nil || len(s.History) > 13 || s.Events == nil || len(s.Events) < 1 || len(s.Events) > maxEvents {
		return nil, fmt.Errorf("invalid Hearts collections")
	}
	for seat := 0; seat < 4; seat++ {
		p := s.Passes[seat]
		if s.Hands[seat] == nil || len(s.Hands[seat]) > 13 || p.Outgoing == nil || p.Incoming == nil || len(p.Outgoing) > 3 || len(p.Incoming) > 3 || (p.To != nil && !seatOK(*p.To)) || (p.From != nil && !seatOK(*p.From)) {
			return nil, fmt.Errorf("invalid Hearts hand or pass memory")
		}
		if s.Bids[seat] != nil || s.Bags[seat] != 0 || s.Scores[seat] < 0 || !safeInt(s.Scores[seat]) || s.Tricks[seat] < 0 || s.Tricks[seat] > 13 {
			return nil, fmt.Errorf("invalid Hearts score metadata")
		}
		for _, cards := range [][]string{s.Hands[seat], p.Outgoing, p.Incoming} {
			seen := map[string]bool{}
			for _, c := range cards {
				if !cardOK(c) || seen[c] {
					return nil, fmt.Errorf("invalid Hearts cards")
				}
				seen[c] = true
			}
			if !reflect.DeepEqual(cards, sorted(cards)) {
				return nil, fmt.Errorf("noncanonical Hearts cards")
			}
		}
	}
	if s.HandResult != nil {
		if s.HandResult.Winner != nil && !seatOK(*s.HandResult.Winner) {
			return nil, fmt.Errorf("invalid Hearts winner")
		}
		for seat, p := range s.HandResult.Points {
			if p < 0 || p > 26 || s.HandResult.Bags[seat] != 0 {
				return nil, fmt.Errorf("invalid Hearts result")
			}
		}
	}
	if s.Phase == "trick-end" {
		if len(s.Trick) != 4 || len(s.History) == 0 || !reflect.DeepEqual(s.Trick, s.History[len(s.History)-1].Plays) {
			return nil, fmt.Errorf("completed Hearts trick mismatch")
		}
	} else if len(s.Trick) > 3 || (s.Phase != "play" && len(s.Trick) != 0) {
		return nil, fmt.Errorf("unexpected Hearts trick")
	}
	original := [4][]string{}
	for seat, h := range s.Hands {
		original[seat] = append([]string{}, h...)
	}
	for _, t := range s.History {
		if len(t.Plays) != 4 || !seatOK(t.Winner) {
			return nil, fmt.Errorf("invalid Hearts history")
		}
		for _, p := range t.Plays {
			if !seatOK(p.Seat) || !cardOK(p.Card) {
				return nil, fmt.Errorf("invalid Hearts play")
			}
			original[p.Seat] = append(original[p.Seat], p.Card)
		}
	}
	if s.Phase != "trick-end" {
		for _, p := range s.Trick {
			if !seatOK(p.Seat) || !cardOK(p.Card) {
				return nil, fmt.Errorf("invalid Hearts play")
			}
			original[p.Seat] = append(original[p.Seat], p.Card)
		}
	}
	if err := validateHands(original); err != nil {
		return nil, err
	}
	for seat := 0; seat < 4; seat++ {
		original[seat] = sorted(original[seat])
	}
	prior, start, err := archiveScores(&s)
	if err != nil {
		return nil, err
	}
	expected := initial(s.ID, s.Dealer)
	expected.HandNumber = s.HandNumber
	expected.Scores = prior
	expected.Hands = original
	passed := s.Phase != "pass" && s.PassDirection != "hold"
	if passed {
		offset := passOffset(s.PassDirection)
		for seat, p := range s.Passes {
			to, from := (seat+offset)%4, (seat+4-offset)%4
			if p.To == nil || *p.To != to || p.From == nil || *p.From != from || len(p.Outgoing) != 3 || len(p.Incoming) != 3 || !reflect.DeepEqual(p.Incoming, s.Passes[from].Outgoing) {
				return nil, fmt.Errorf("inconsistent Hearts exchange")
			}
			for _, c := range p.Incoming {
				if !has(original[seat], c) {
					return nil, fmt.Errorf("received card ownership mismatch")
				}
			}
			for _, c := range p.Outgoing {
				if !has(original[to], c) {
					return nil, fmt.Errorf("passed card ownership mismatch")
				}
			}
			expected.Hands[seat] = sorted(append(without(original[seat], p.Incoming), p.Outgoing...))
		}
		if err := validateHands(expected.Hands); err != nil {
			return nil, err
		}
	}
	startHand(expected)
	if passed {
		var passes [4][]string
		for seat, p := range s.Passes {
			passes[seat] = p.Outgoing
		}
		if err := applyPass(expected, passes); err != nil {
			return nil, err
		}
	}
	for index, t := range s.History {
		for _, p := range t.Plays {
			if err := applyPlay(expected, p.Seat, p.Card); err != nil {
				return nil, fmt.Errorf("illegal Hearts history: %w", err)
			}
		}
		if index < len(s.History)-1 || s.Phase != "trick-end" {
			if err := collect(expected); err != nil {
				return nil, err
			}
		}
	}
	if s.Phase != "trick-end" {
		for _, p := range s.Trick {
			if err := applyPlay(expected, p.Seat, p.Card); err != nil {
				return nil, fmt.Errorf("illegal current Hearts trick: %w", err)
			}
		}
	}
	for i := range expected.Events {
		expected.Events[i].ID += start
	}
	expected.Events = append(append([]event{}, s.Events[:start]...), expected.Events...)
	if !reflect.DeepEqual(s, *expected) {
		return nil, fmt.Errorf("inconsistent Hearts state or event history")
	}
	return &s, nil
}

func validateHands(hands [4][]string) error {
	seen := map[string]bool{}
	for _, hand := range hands {
		if len(hand) != 13 {
			return fmt.Errorf("Hearts seat card conservation failed")
		}
		for _, c := range hand {
			if !cardOK(c) || seen[c] {
				return fmt.Errorf("Hearts card conservation failed")
			}
			seen[c] = true
		}
	}
	return nil
}

// Original events retain the actual publicly played cards. Earlier complete
// hands can therefore verify cumulative scores and legal chronology without
// inventing concealed opening deals or exposing an opponent's pass memory.
func archiveScores(s *state) ([4]int, int, error) {
	starts := []int{}
	for i, e := range s.Events {
		if e.ID != i+1 || textLength(e.Message) > 2000 {
			return [4]int{}, 0, fmt.Errorf("invalid Hearts event identity")
		}
		seat, card := false, false
		switch e.Type {
		case "hand-started":
			starts = append(starts, i)
		case "cards-passed", "trick-collected", "hand-scored":
		case "card-played":
			seat = true
			card = true
		case "trick-resolved":
			seat = true
		default:
			return [4]int{}, 0, fmt.Errorf("invalid Hearts event kind")
		}
		if (e.Seat != nil) != seat || (e.Card != nil) != card || (e.Seat != nil && !seatOK(*e.Seat)) || (e.Card != nil && !cardOK(*e.Card)) {
			return [4]int{}, 0, fmt.Errorf("invalid Hearts event details")
		}
	}
	if len(starts) != s.HandNumber || starts[0] != 0 {
		return [4]int{}, 0, fmt.Errorf("Hearts hand archive mismatch")
	}
	scores := [4]int{}
	for hand := 1; hand < s.HandNumber; hand++ {
		start, end := starts[hand-1], starts[hand]
		span := s.Events[start:end]
		hands := [4][]string{}
		for seat := 0; seat < 4; seat++ {
			hands[seat] = []string{}
		}
		plays := []Play{}
		for _, e := range span {
			if e.Type == "card-played" {
				p := Play{*e.Seat, *e.Card}
				plays = append(plays, p)
				hands[p.Seat] = append(hands[p.Seat], p.Card)
			}
		}
		if err := validateHands(hands); err != nil {
			return scores, 0, err
		}
		for seat := 0; seat < 4; seat++ {
			hands[seat] = sorted(hands[seat])
		}
		dealer := (s.Dealer - (s.HandNumber-hand)%4 + 4) % 4
		r := initial(s.ID, dealer)
		r.HandNumber = hand
		r.Hands = hands
		r.Scores = scores
		startHand(r)
		if r.PassDirection != "hold" {
			r.Phase = "play"
			r.Turn = openingSeat(r.Hands)
			emit(r, "cards-passed", fmt.Sprintf("Three cards passed %s. %s lead with the 2 of Clubs.", r.PassDirection, seatName(*r.Turn)), nil, nil)
		}
		for _, p := range plays {
			if err := applyPlay(r, p.Seat, p.Card); err != nil {
				return scores, 0, fmt.Errorf("illegal archived Hearts play: %w", err)
			}
			if r.Phase == "trick-end" {
				if err := collect(r); err != nil {
					return scores, 0, err
				}
			}
		}
		if r.Phase != "hand-end" {
			return scores, 0, fmt.Errorf("archived Hearts hand cannot continue")
		}
		for i := range r.Events {
			r.Events[i].ID += start
		}
		if !reflect.DeepEqual(r.Events, span) {
			return scores, 0, fmt.Errorf("invalid archived Hearts chronology")
		}
		scores = r.Scores
	}
	return scores, starts[len(starts)-1], nil
}
