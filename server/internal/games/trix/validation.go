package trix

import (
	"fmt"
	"reflect"
)

func validateState(s State) error {
	if err := validateProfile(s.Config); err != nil {
		return err
	}
	if !validVariant(s.Config.Variant) || s.Config.ID == "" || s.Kingdom < 1 || s.Kingdom > 4 || s.DealNumber < 1 || s.DealNumber > 4*len(requests(s.Config.Variant)) || s.Owner < 0 || s.Owner > 3 || s.Turn < 0 || s.Turn > 3 {
		return fmt.Errorf("invalid Trix state identity")
	}
	if err := validateFixtures(s.Config); err != nil {
		return err
	}
	pool := map[string]bool{}
	for _, r := range s.RemainingRequests {
		if !contains(requests(s.Config.Variant), r) || pool[r] {
			return fmt.Errorf("invalid Trix request pool")
		}
		pool[r] = true
	}
	if s.Phase == "choose-request" {
		if s.Request != "" || s.Turn != s.Owner || len(s.Trick)+len(s.Tricks)+len(s.Declarations)+len(s.FinishOrder)+len(s.Passes) != 0 {
			return fmt.Errorf("invalid Trix selection phase")
		}
	} else if !contains(requests(s.Config.Variant), s.Request) {
		return fmt.Errorf("invalid active Trix request")
	}
	if len(s.Trick) > 3 || len(s.Tricks) > 13 || len(s.Declarations) > 4 || len(s.FinishOrder) > 4 {
		return fmt.Errorf("invalid Trix history lengths")
	}
	if s.Phase == "declare-doubles" {
		if s.Request != "queens" && s.Request != "king" && s.Request != "complex" || len(s.Declarations) >= 4 || len(s.Tricks)+len(s.Trick) > 0 {
			return fmt.Errorf("invalid Trix declaration phase")
		}
		actor := s.Owner
		for range s.Declarations {
			actor = NextSeat(actor)
		}
		if s.Turn != actor {
			return fmt.Errorf("invalid declaration turn")
		}
	}
	if s.Phase == "playing" && (s.Request == "trix" || len(s.Tricks) == 13) {
		return fmt.Errorf("invalid Trix playing phase")
	}
	if s.Phase == "layout" && (s.Request != "trix" || len(s.FinishOrder) == 4 || len(s.Hands[s.Turn]) == 0) {
		return fmt.Errorf("invalid Trix layout phase")
	}
	if s.Phase == "round-complete" || s.Phase == "chance" || s.Phase == "session-complete" {
		if s.Request == "trix" {
			if len(s.FinishOrder) != 4 {
				return fmt.Errorf("unfinished layout boundary")
			}
		} else if len(s.Tricks) != 13 {
			return fmt.Errorf("unfinished penalty boundary")
		}
	}
	if s.Phase == "session-complete" && (s.Kingdom != 4 || len(s.RemainingRequests) != 0) {
		return fmt.Errorf("premature Trix completion")
	}
	switch s.Phase {
	case "choose-request", "declare-doubles", "playing", "layout", "round-complete", "chance", "session-complete":
	default:
		return fmt.Errorf("invalid Trix phase")
	}
	cards := []string{}
	cardSet := map[string]bool{}
	for _, c := range Deck() {
		cardSet[c] = true
	}
	for _, h := range s.Hands {
		cards = append(cards, h...)
	}
	for _, p := range s.Trick {
		if !cardSet[p.Card] || p.Seat < 0 || p.Seat > 3 {
			return fmt.Errorf("invalid Trix play")
		}
		cards = append(cards, p.Card)
	}
	lead := s.Owner
	if s.Phase == "chance" && len(s.Tricks) > 0 {
		lead = s.Tricks[0].Leader
	}
	var sources [4]*LeadSource
	for i, t := range s.Tricks {
		for _, p := range t.Plays {
			if !cardSet[p.Card] || p.Seat < 0 || p.Seat > 3 {
				return fmt.Errorf("invalid Trix trick card")
			}
		}
		if len(t.Plays) != 4 || winner(t.Plays) != t.Winner || t.Leader != t.Plays[0].Seat {
			return fmt.Errorf("invalid Trix trick")
		}
		if t.Number != i+1 || t.Leader != lead {
			return fmt.Errorf("invalid Trix trick chronology")
		}
		actor := lead
		for _, p := range t.Plays {
			if p.Seat != actor {
				return fmt.Errorf("invalid Trix trick direction")
			}
			actor = NextSeat(actor)
		}
		if t.Leader != t.Winner {
			sources[t.Winner] = &LeadSource{Seat: t.Leader, Trick: t.Number}
		}
		lead = t.Winner
		for _, p := range t.Plays {
			cards = append(cards, p.Card)
		}
	}
	if !reflect.DeepEqual(sources, s.LastExternalLeader) {
		return fmt.Errorf("invalid Trix lead provenance")
	}
	actor := lead
	for _, p := range s.Trick {
		if p.Seat != actor {
			return fmt.Errorf("invalid current Trix trick order")
		}
		actor = NextSeat(actor)
	}
	if s.Phase == "playing" && s.Turn != actor {
		return fmt.Errorf("invalid Trix play turn")
	}
	finished := map[int]bool{}
	for _, seat := range s.FinishOrder {
		if seat < 0 || seat > 3 || finished[seat] || len(s.Hands[seat]) != 0 {
			return fmt.Errorf("invalid Trix finish order")
		}
		finished[seat] = true
	}
	if len(s.Board) != 4 {
		return fmt.Errorf("invalid Trix board")
	}
	for i, r := range s.Board {
		if r.Suit != []string{"C", "D", "H", "S"}[i] {
			return fmt.Errorf("invalid Trix board suits")
		}
		if s.Request != "trix" && (r.Low != 0 || r.High != 0) {
			return fmt.Errorf("layout in penalty phase")
		}
		if r.Low == 0 && r.High != 0 || r.Low != 0 && (r.Low < 2 || r.Low > 11 || r.High < 11 || r.High > 14) {
			return fmt.Errorf("invalid Trix frontier")
		}
		if r.Low > 0 {
			for _, c := range Deck() {
				if c[:1] == r.Suit && rank(c) >= r.Low && rank(c) <= r.High {
					cards = append(cards, c)
				}
			}
		}
	}
	if e := validDeck(cards); e != nil {
		return e
	}
	if err := validateTwos(s); err != nil {
		return err
	}
	if err := validateLayoutHistory(s); err != nil {
		return err
	}
	return nil
}
