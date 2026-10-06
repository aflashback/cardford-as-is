package spades

import (
	"encoding/json"
	"fmt"
)

func seatName(seat int) string { return []string{"You", "West", "North", "East"}[seat] }
func emit(s *State, kind, message string, seat *int, card *string, bid *int) {
	s.Events = append(s.Events, Event{ID: len(s.Events) + 1, Type: kind, Message: message, Seat: seat, Card: card, Bid: bid})
}
func deal(s *State, deck []string) error {
	if err := validateDeal(deck); err != nil {
		return err
	}
	first := (s.Dealer + 1) % 4
	for seat := 0; seat < 4; seat++ {
		s.Hands[seat] = []string{}
		s.Passes[seat] = PassMemory{Outgoing: []string{}, Incoming: []string{}}
	}
	for i, c := range deck {
		s.Hands[(first+i)%4] = append(s.Hands[(first+i)%4], c)
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
	s.PassDirection = []string{"left", "right", "across", "hold"}[(s.HandNumber-1)%4]
	s.Phase = "bid"
	s.Turn = ptr(first)
	emit(s, "hand-started", fmt.Sprintf("Hand %d dealt. %s bid first.", s.HandNumber, seatName(first)), nil, nil, nil)
	return nil
}

// Create creates the original V1 shape from recorded actual chance material.
// Secure random dealing is supplied by orchestration, never invented from a seed.
func Create(config json.RawMessage, deck []string) (json.RawMessage, error) {
	s, err := createState(config, deck)
	if err != nil {
		return nil, err
	}
	return EncodeState(s)
}
func createState(config json.RawMessage, deck []string) (*State, error) {
	var c Config
	if err := strictDecode(config, &c); err != nil {
		return nil, err
	}
	if textLength(c.ID) < 1 || textLength(c.ID) > 256 || ruleProfile(c.Mode) == "" || !seatOK(c.Dealer) {
		return nil, fmt.Errorf("invalid game configuration")
	}
	s := &State{ID: c.ID, Mode: c.Mode, ModuleVersion: "1.0.0", EventSchemaVersion: "1.0.0", RuleProfileID: ruleProfile(c.Mode), Dealer: c.Dealer, HandNumber: 1, Events: []Event{}}
	if err := deal(s, deck); err != nil {
		return nil, err
	}
	return s, nil
}

// Apply consumes one recorded accepted action, collection, or next-hand command.
// The source bytes remain unchanged on both success and failure.
func Apply(state, command json.RawMessage) (json.RawMessage, error) {
	s, err := DecodeState(state)
	if err != nil {
		return nil, err
	}
	if err = applyCommand(s, command); err != nil {
		return nil, err
	}
	return EncodeState(s)
}
func applyCommand(s *State, command json.RawMessage) error {
	var c savedCommand
	if err := strictDecode(command, &c); err != nil {
		return err
	}
	switch c.Type {
	case "action":
		if c.Deal != nil {
			return fmt.Errorf("unexpected action deal")
		}
		if err := validateAction(c.Action); err != nil {
			return err
		}
		if err := applyAction(s, *c.Action); err != nil {
			return err
		}
	case "collect-trick":
		if c.Action != nil || c.Deal != nil {
			return fmt.Errorf("unexpected collection fields")
		}
		if s.Phase != "trick-end" || len(s.Trick) != 4 {
			return fmt.Errorf("the trick is not complete")
		}
		s.Trick = []Play{}
		s.Phase = "play"
		if s.HandResult != nil {
			s.Phase = "hand-end"
			if s.HandResult.Winner != nil {
				s.Phase = "match-end"
			}
		}
		emit(s, "trick-collected", "Completed trick cleared from the table.", nil, nil, nil)
	case "next-hand":
		if c.Action != nil || c.Deal == nil {
			return fmt.Errorf("next hand requires only a deal")
		}
		if s.Phase != "hand-end" {
			return fmt.Errorf("finish and review this hand before dealing another")
		}
		if s.HandNumber == maxSafeInteger {
			return fmt.Errorf("unsafe next hand number")
		}
		s.Dealer = (s.Dealer + 1) % 4
		s.HandNumber++
		if err := deal(s, c.Deal); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported Spades command")
	}
	return nil
}
func applyAction(s *State, a Action) error {
	found := false
	for _, candidate := range actionsFor(s.Phase, s.Turn, s.Hands[a.Seat], s.Trick, s.SpadesBroken, a.Seat) {
		if actionID(candidate) == actionID(a) {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("action is not legal for this seat and phase")
	}
	if a.Kind == "bid" {
		s.Bids[a.Seat] = ptr(*a.Bid)
		label := fmt.Sprint(*a.Bid)
		if *a.Bid == 0 {
			label = "Nil"
		}
		emit(s, "bid-placed", fmt.Sprintf("%s bid %s.", seatName(a.Seat), label), ptr(a.Seat), nil, ptr(*a.Bid))
		s.Turn = ptr((a.Seat + 1) % 4)
		complete := true
		for _, b := range s.Bids {
			if b == nil {
				complete = false
			}
		}
		if complete {
			s.Phase = "play"
			s.Turn = ptr((s.Dealer + 1) % 4)
		}
		return nil
	}
	card := *a.Card
	for i, c := range s.Hands[a.Seat] {
		if c == card {
			s.Hands[a.Seat] = append(s.Hands[a.Seat][:i], s.Hands[a.Seat][i+1:]...)
			break
		}
	}
	s.Trick = append(s.Trick, Play{Seat: a.Seat, Card: card})
	if card[0] == 'H' {
		s.HeartsBroken = true
	}
	if card[0] == 'S' {
		s.SpadesBroken = true
	}
	emit(s, "card-played", fmt.Sprintf("%s played %s.", seatName(a.Seat), cardLabel(card)), ptr(a.Seat), ptr(card), nil)
	if len(s.Trick) == 4 {
		winner := trickWinner(s.Trick)
		s.Phase = "trick-end"
		s.Turn = ptr(winner)
		s.History = append(s.History, Trick{Plays: append([]Play{}, s.Trick...), Winner: winner})
		s.Tricks[winner]++
		emit(s, "trick-resolved", fmt.Sprintf("%s won trick %d.", seatName(winner), len(s.History)), ptr(winner), nil, nil)
		if len(s.History) == 13 {
			return scoreHand(s)
		}
	} else {
		s.Turn = ptr((a.Seat + 1) % 4)
	}
	return nil
}
func scoreHand(s *State) error {
	result := &HandResult{}
	for _, group := range groups(s.Mode) {
		bids, tricks := []int{}, []int{}
		for _, seat := range group {
			bids = append(bids, *s.Bids[seat])
			tricks = append(tricks, s.Tricks[seat])
		}
		delta, bags, err := ScoreCompetitor(bids, tricks, s.Bags[group[0]])
		if err != nil {
			return err
		}
		score := s.Scores[group[0]] + delta
		if !safeInt(score) {
			return fmt.Errorf("unsafe cumulative score")
		}
		for _, seat := range group {
			result.Points[seat] = delta
			s.Scores[seat] = score
			s.Bags[seat] = bags
		}
	}
	result.Bags = s.Bags
	result.Winner = matchWinner(s)
	s.HandResult = result
	ending := "Review the result before the next deal."
	if result.Winner != nil {
		ending = "Match complete."
	}
	emit(s, "hand-scored", fmt.Sprintf("Hand %d scored. %s", s.HandNumber, ending), nil, nil, nil)
	return nil
}
func Legal(state json.RawMessage, seat int) (json.RawMessage, error) {
	s, err := DecodeState(state)
	if err != nil {
		return nil, err
	}
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	return json.Marshal(actionsFor(s.Phase, s.Turn, s.Hands[seat], s.Trick, s.SpadesBroken, seat))
}
func CandidateIDs(state json.RawMessage, seat int) ([]string, error) {
	s, err := DecodeState(state)
	if err != nil {
		return nil, err
	}
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	ids := []string{}
	for _, a := range actionsFor(s.Phase, s.Turn, s.Hands[seat], s.Trick, s.SpadesBroken, seat) {
		ids = append(ids, actionID(a))
	}
	return ids, nil
}
