package hearts

import (
	"encoding/json"
	"fmt"
)

func emit(s *state, kind, message string, seat *int, card *string) {
	s.Events = append(s.Events, event{ID: len(s.Events) + 1, Type: kind, Message: message, Seat: seat, Card: card})
}
func initial(id string, dealer int) *state {
	s := &state{ID: id, Mode: "hearts", ModuleVersion: "1.0.0", RuleProfileID: "hearts-training-1.0.0", EventSchemaVersion: "1.0.0", Dealer: dealer, HandNumber: 1, Trick: []Play{}, History: []Trick{}, Events: []event{}}
	for i := 0; i < 4; i++ {
		s.Hands[i] = []string{}
		s.Passes[i] = pass{Outgoing: []string{}, Incoming: []string{}}
	}
	return s
}
func createState(raw json.RawMessage, deck []string) (*state, error) {
	var c config
	if err := decode(raw, &c); err != nil {
		return nil, err
	}
	if textLength(c.ID) < 1 || textLength(c.ID) > 256 || c.Mode != "hearts" || !seatOK(c.Dealer) {
		return nil, fmt.Errorf("invalid Hearts configuration")
	}
	s := initial(c.ID, c.Dealer)
	if err := deal(s, deck); err != nil {
		return nil, err
	}
	return s, nil
}
func deal(s *state, deck []string) error {
	if len(deck) != 52 {
		return fmt.Errorf("expected recorded full deck")
	}
	seen := map[string]bool{}
	for _, c := range deck {
		if !cardOK(c) || seen[c] {
			return fmt.Errorf("invalid deal")
		}
		seen[c] = true
	}
	if len(s.Events) >= maxEvents {
		return fmt.Errorf("Hearts event limit reached")
	}
	for seat := 0; seat < 4; seat++ {
		s.Hands[seat] = []string{}
		s.Passes[seat] = pass{Outgoing: []string{}, Incoming: []string{}}
	}
	for i, c := range deck {
		seat := (s.Dealer + 1 + i) % 4
		s.Hands[seat] = append(s.Hands[seat], c)
	}
	for seat := 0; seat < 4; seat++ {
		s.Hands[seat] = sorted(s.Hands[seat])
	}
	s.Bids = [4]*int{}
	s.Tricks = [4]int{}
	s.Trick = []Play{}
	s.History = []Trick{}
	s.HeartsBroken = false
	s.SpadesBroken = false
	s.HandResult = nil
	startHand(s)
	return nil
}
func startHand(s *state) {
	s.PassDirection = passDirection(s.HandNumber)
	s.Phase = "pass"
	s.Turn = nil
	message := fmt.Sprintf("Pass three cards %s.", s.PassDirection)
	if s.PassDirection == "hold" {
		s.Phase = "play"
		s.Turn = openingSeat(s.Hands)
		message = "No pass this hand."
	}
	emit(s, "hand-started", fmt.Sprintf("Hand %d dealt. %s", s.HandNumber, message), nil, nil)
}
func openingSeat(hands [4][]string) *int {
	for seat, h := range hands {
		if has(h, "C2") {
			return ptr(seat)
		}
	}
	return nil
}
func applyTo(s *state, raw json.RawMessage) (*state, error) {
	var c command
	if err := decode(raw, &c); err != nil {
		return nil, err
	}
	switch c.Type {
	case "action":
		if len(c.Action) == 0 || c.Deal != nil {
			return nil, fmt.Errorf("unexpected Hearts action fields")
		}
		var kind struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(c.Action, &kind); err != nil {
			return nil, err
		}
		switch kind.Kind {
		case "pass-bundle":
			var a struct {
				Kind   string      `json:"kind"`
				Passes [4][]string `json:"passes"`
			}
			if err := decode(c.Action, &a); err != nil {
				return nil, err
			}
			if err := applyPass(s, a.Passes); err != nil {
				return nil, err
			}
		case "play":
			var a struct {
				Kind string `json:"kind"`
				Seat int    `json:"seat"`
				Card string `json:"card"`
			}
			if err := decode(c.Action, &a); err != nil {
				return nil, err
			}
			if err := applyPlay(s, a.Seat, a.Card); err != nil {
				return nil, err
			}
		default:
			return nil, fmt.Errorf("unsupported Hearts action")
		}
	case "collect-trick":
		if c.Action != nil || c.Deal != nil {
			return nil, fmt.Errorf("unexpected collection fields")
		}
		if err := collect(s); err != nil {
			return nil, err
		}
	case "next-hand":
		if c.Action != nil || c.Deal == nil || s.Phase != "hand-end" {
			return nil, fmt.Errorf("finish and review this hand before dealing another")
		}
		if s.HandNumber >= maxSafeInteger {
			return nil, fmt.Errorf("unsafe next hand number")
		}
		s.Dealer = (s.Dealer + 1) % 4
		s.HandNumber++
		if err := deal(s, c.Deal); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported Hearts command")
	}
	return s, nil
}
func applyPass(s *state, passes [4][]string) error {
	if s.Phase != "pass" || s.PassDirection == "hold" {
		return fmt.Errorf("there is no pass to make")
	}
	if len(s.Events) >= maxEvents {
		return fmt.Errorf("Hearts event limit reached")
	}
	for seat, p := range passes {
		if len(p) != 3 {
			return fmt.Errorf("pass needs three cards")
		}
		seen := map[string]bool{}
		for _, c := range p {
			if !has(s.Hands[seat], c) || seen[c] {
				return fmt.Errorf("illegal pass")
			}
			seen[c] = true
		}
	}
	offset := passOffset(s.PassDirection)
	for seat := 0; seat < 4; seat++ {
		s.Hands[seat] = without(s.Hands[seat], passes[seat])
	}
	for seat := 0; seat < 4; seat++ {
		to, from := (seat+offset)%4, (seat+4-offset)%4
		s.Hands[to] = append(s.Hands[to], passes[seat]...)
		s.Passes[seat] = pass{Outgoing: sorted(passes[seat]), Incoming: sorted(passes[from]), To: ptr(to), From: ptr(from)}
	}
	for seat := 0; seat < 4; seat++ {
		s.Hands[seat] = sorted(s.Hands[seat])
	}
	s.Phase = "play"
	s.Turn = openingSeat(s.Hands)
	emit(s, "cards-passed", fmt.Sprintf("Three cards passed %s. %s lead with the 2 of Clubs.", s.PassDirection, seatName(*s.Turn)), nil, nil)
	return nil
}
func applyPlay(s *state, seat int, card string) error {
	if !seatOK(seat) || !cardOK(card) {
		return fmt.Errorf("invalid play")
	}
	legal := false
	for _, a := range actions(s, seat) {
		if a.Kind == "play" && a.Card == card {
			legal = true
			break
		}
	}
	if !legal {
		return fmt.Errorf("action is not legal for this seat and phase")
	}
	extra := 1
	if len(s.Trick) == 3 {
		extra++
		if len(s.History) == 12 {
			extra++
		}
	}
	if len(s.Events) > maxEvents-extra {
		return fmt.Errorf("Hearts event limit reached")
	}
	// Check exact arithmetic before mutation; never silently narrow the safe range.
	if len(s.Trick) == 3 && len(s.History) == 12 {
		last := append(append([]Play{}, s.Trick...), Play{seat, card})
		history := append(append([]Trick{}, s.History...), Trick{last, trickWinner(last)})
		for actor, points := range scorePoints(history) {
			if s.Scores[actor] > maxSafeInteger-points {
				return fmt.Errorf("unsafe Hearts score")
			}
		}
	}
	s.Hands[seat] = without(s.Hands[seat], []string{card})
	s.Trick = append(s.Trick, Play{seat, card})
	if card[0] == 'H' {
		s.HeartsBroken = true
	}
	if card[0] == 'S' {
		s.SpadesBroken = true
	}
	emit(s, "card-played", fmt.Sprintf("%s played %s.", seatName(seat), cardLabel(card)), ptr(seat), ptr(card))
	if len(s.Trick) == 4 {
		winner := trickWinner(s.Trick)
		s.Phase = "trick-end"
		s.Turn = ptr(winner)
		s.History = append(s.History, Trick{Plays: append([]Play{}, s.Trick...), Winner: winner})
		s.Tricks[winner]++
		emit(s, "trick-resolved", fmt.Sprintf("%s won trick %d.", seatName(winner), len(s.History)), ptr(winner), nil)
		if len(s.History) == 13 {
			points := scorePoints(s.History)
			for actor, p := range points {
				s.Scores[actor] += p
			}
			s.HandResult = &handResult{Points: points, Bags: s.Bags, Winner: matchWinner(s.Scores)}
			message := "Review the result before the next deal."
			if s.HandResult.Winner != nil {
				message = "Match complete."
			}
			emit(s, "hand-scored", fmt.Sprintf("Hand %d scored. %s", s.HandNumber, message), nil, nil)
		}
	} else {
		s.Turn = ptr((seat + 1) % 4)
	}
	return nil
}
func collect(s *state) error {
	if s.Phase != "trick-end" || len(s.Trick) != 4 {
		return fmt.Errorf("the trick is not complete")
	}
	if len(s.Events) >= maxEvents {
		return fmt.Errorf("Hearts event limit reached")
	}
	s.Trick = []Play{}
	s.Phase = "play"
	if s.HandResult != nil {
		s.Phase = "hand-end"
		if s.HandResult.Winner != nil {
			s.Phase = "match-end"
		}
	}
	emit(s, "trick-collected", "Completed trick cleared from the table.", nil, nil)
	return nil
}
