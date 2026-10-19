package trix

import (
	"fmt"
	"reflect"
	"sort"
)

const layoutHistoryVersion = "1.0.0"
const maxLayoutTurns = 208

func cloneTwos(a *TwoAnnouncements) *TwoAnnouncements {
	if a == nil {
		return nil
	}
	out := *a
	if a.Counts != nil {
		counts := *a.Counts
		out.Counts = &counts
	}
	if a.Cards != nil {
		out.Cards = append([]Play{}, a.Cards...)
	}
	return &out
}

func cloneLayoutHistory(h *LayoutHistory) *LayoutHistory {
	if h == nil {
		return nil
	}
	out := *h
	if h.Turns == nil {
		return &out
	}
	out.Turns = make([]LayoutTurn, len(h.Turns))
	for i, turn := range h.Turns {
		out.Turns[i] = turn
		out.Turns[i].BoardBefore = append([]Row{}, turn.BoardBefore...)
		out.Turns[i].TwoAnnouncementsBefore = cloneTwos(turn.TwoAnnouncementsBefore)
	}
	return &out
}

// LayoutChronology makes absence explicit for native consumers without adding
// fields to immutable historical wire observations or inventing missing turns.
func LayoutChronology(o Observation) LayoutHistory {
	if o.LayoutHistory == nil {
		return LayoutHistory{Version: layoutHistoryVersion, Status: "legacy-unavailable", Turns: []LayoutTurn{}}
	}
	return *cloneLayoutHistory(o.LayoutHistory)
}

func historyDealNumber(o Observation) int {
	if o.Phase == "chance" {
		return o.DealNumber - 1
	}
	return o.DealNumber
}

func validatePublicTwos(a *TwoAnnouncements) error {
	if a == nil {
		return nil
	}
	counts := [4]int{}
	switch a.Status {
	case "hidden":
		if a.Counts == nil || a.Cards != nil {
			return fmt.Errorf("invalid hidden Trix twos snapshot")
		}
		counts = *a.Counts
	case "revealed":
		if a.Counts != nil || len(a.Cards) != 4 {
			return fmt.Errorf("invalid revealed Trix twos snapshot")
		}
		for i, p := range a.Cards {
			if p.Card != twoCards[i] || p.Seat < 0 || p.Seat > 3 {
				return fmt.Errorf("invalid Trix twos ownership snapshot")
			}
			counts[p.Seat]++
		}
	default:
		return fmt.Errorf("invalid Trix twos snapshot status")
	}
	total := 0
	for _, n := range counts {
		if n < 0 || n > 4 {
			return fmt.Errorf("invalid Trix twos snapshot count")
		}
		total += n
	}
	if total != 4 || counts[0]+counts[2] == 0 || counts[1]+counts[3] == 0 {
		return fmt.Errorf("invalid Trix twos snapshot teams")
	}
	return nil
}

func twosBefore(current *TwoAnnouncements, accepted int) *TwoAnnouncements {
	if current == nil {
		return nil
	}
	if accepted >= 4 || current.Status == "hidden" {
		return cloneTwos(current)
	}
	counts := [4]int{}
	for _, p := range current.Cards {
		counts[p.Seat]++
	}
	return &TwoAnnouncements{Status: "hidden", Counts: &counts}
}

// ValidateLayoutHistoryObservation replays only public facts. It can prove
// frontier/count/turn chronology and some impossible passes, but never invents
// the other hands or infers that a voluntary play was a forced choice.
func ValidateLayoutHistoryObservation(o Observation) error {
	h := o.LayoutHistory
	if h == nil {
		if o.publicSchemaVersion == "1.2.0" {
			return fmt.Errorf("missing current Trix layout history")
		}
		return nil
	}
	if h.Version != layoutHistoryVersion || h.Status != "available" || h.Turns == nil || len(h.Turns) > maxLayoutTurns {
		return fmt.Errorf("invalid Trix layout history envelope")
	}
	if o.Request == nil || *o.Request != "trix" {
		if len(h.Turns) != 0 {
			return fmt.Errorf("layout history outside Trix Jacks")
		}
		return nil
	}
	if o.Owner < 0 || o.Owner > 3 || o.DealNumber < 1 {
		return fmt.Errorf("invalid Trix layout history identity")
	}
	if err := validatePublicTwos(o.TwoAnnouncements); err != nil {
		return err
	}
	if o.TwoAnnouncements != nil {
		if !partners(o.VariantID) || (len(h.Turns) < 4) != (o.TwoAnnouncements.Status == "hidden") {
			return fmt.Errorf("invalid Trix layout history reveal timing")
		}
	}
	deck := map[string]bool{}
	for _, card := range Deck() {
		deck[card] = true
	}
	played := map[string]int{}
	for i, turn := range h.Turns {
		if turn.Ordinal != i+1 || turn.Seat < 0 || turn.Seat > 3 {
			return fmt.Errorf("invalid Trix layout turn identity")
		}
		switch turn.Kind {
		case "layout-card":
			if !deck[turn.Card] {
				return fmt.Errorf("invalid Trix layout history card")
			}
			if _, ok := played[turn.Card]; ok {
				return fmt.Errorf("duplicate Trix layout history card")
			}
			played[turn.Card] = turn.Seat
		case "layout-pass":
			if turn.Card != "" {
				return fmt.Errorf("card on Trix layout pass")
			}
		default:
			return fmt.Errorf("invalid Trix layout history action")
		}
		if err := validatePublicTwos(turn.TwoAnnouncementsBefore); err != nil {
			return err
		}
	}
	board := []Row{{Suit: "C"}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}}
	counts := [4]int{13, 13, 13, 13}
	finished := []int{}
	passes := []LayoutPass{}
	actor := o.Owner
	// Continuation can rotate the next kingdom's owner while retaining the
	// completed previous layout until the next private deal is supplied.
	if o.Phase == "chance" && len(h.Turns) > 0 {
		actor = h.Turns[0].Seat
	}
	for i, turn := range h.Turns {
		if counts[actor] == 0 || turn.Seat != actor || !reflect.DeepEqual(turn.BoardBefore, board) || turn.HandCountsBefore != counts {
			return fmt.Errorf("Trix layout history pre-turn mismatch")
		}
		if !reflect.DeepEqual(turn.TwoAnnouncementsBefore, twosBefore(o.TwoAnnouncements, i)) {
			return fmt.Errorf("Trix layout history public twos timing mismatch")
		}
		if turn.Kind == "layout-pass" {
			// A subsequently played card was already held at this pass. The
			// actor's own still-held cards are likewise known at every past turn.
			for _, later := range h.Turns[i+1:] {
				if later.Seat == actor && later.Kind == "layout-card" && placeable(board, later.Card) {
					return fmt.Errorf("Trix pass contradicts public played ownership")
				}
			}
			if actor == o.Seat {
				for _, card := range o.Hand {
					if !deck[card] {
						return fmt.Errorf("invalid Trix actor hand card")
					}
					if placeable(board, card) {
						return fmt.Errorf("Trix pass contradicts actor hand")
					}
				}
			}
			passes = append(passes, LayoutPass{Seat: actor, Board: append([]Row{}, board...), Ref: fmt.Sprintf("deal:%d:pass:%d", historyDealNumber(o), len(passes)+1)})
		} else {
			if !placeable(board, turn.Card) {
				return fmt.Errorf("illegal public Trix layout placement")
			}
			if o.TwoAnnouncements != nil && o.TwoAnnouncements.Status == "revealed" && rank(turn.Card) == 2 {
				for _, two := range o.TwoAnnouncements.Cards {
					if two.Card == turn.Card && two.Seat != actor {
						return fmt.Errorf("Trix played two contradicts public owner")
					}
				}
			}
			for row, r := range board {
				if r.Suit != turn.Card[:1] {
					continue
				}
				v := rank(turn.Card)
				if r.Low == 0 {
					board[row].Low = v
					board[row].High = v
				} else if v < r.Low {
					board[row].Low = v
				} else {
					board[row].High = v
				}
			}
			counts[actor]--
			if counts[actor] == 0 {
				finished = append(finished, actor)
			}
		}
		if len(finished) == 4 && i != len(h.Turns)-1 {
			return fmt.Errorf("Trix layout history after completion")
		}
		if len(finished) < 4 {
			for skipped := 0; skipped < 4; skipped++ {
				actor = NextSeat(actor)
				if counts[actor] > 0 {
					break
				}
			}
		}
	}
	if !reflect.DeepEqual(board, o.Board) || counts != o.HandCounts || !reflect.DeepEqual(finished, o.FinishOrder) || !reflect.DeepEqual(passes, o.Passes) {
		return fmt.Errorf("Trix layout history disagrees with public position")
	}
	if o.Phase == "layout" {
		if len(finished) == 4 || o.Turn == nil || *o.Turn != actor {
			return fmt.Errorf("Trix layout history current turn mismatch")
		}
	} else if o.Phase == "round-complete" || o.Phase == "chance" || o.Phase == "session-complete" {
		if len(finished) != 4 {
			return fmt.Errorf("unfinished Trix layout history boundary")
		}
	} else {
		return fmt.Errorf("invalid phase for Trix layout history")
	}
	return nil
}

// replayLayoutHistory restores recorded public cards to their original owners
// and asks the native engine to replay every action. Incompatible private
// holdings return false; malformed public chronology returns an error.
func replayLayoutHistory(o Observation, c Config, currentHands [4][]string) (State, bool, error) {
	if o.LayoutHistory == nil {
		return State{}, false, fmt.Errorf("Trix layout chronology unavailable")
	}
	if err := ValidateLayoutHistoryObservation(o); err != nil {
		return State{}, false, err
	}
	if o.Request == nil || *o.Request != "trix" {
		return State{}, false, fmt.Errorf("no active Trix layout chronology")
	}
	hands := [4][]string{}
	all := []string{}
	for seat, hand := range currentHands {
		hands[seat] = append([]string{}, hand...)
	}
	for _, turn := range o.LayoutHistory.Turns {
		if turn.Kind == "layout-card" {
			hands[turn.Seat] = append(hands[turn.Seat], turn.Card)
		}
	}
	for seat, hand := range hands {
		if len(hand) != 13 {
			return State{}, false, nil
		}
		all = append(all, hand...)
		sort.Slice(hands[seat], func(i, j int) bool { return cardLess(hands[seat][i], hands[seat][j]) })
	}
	if err := validDeck(all); err != nil {
		return State{}, false, nil
	}
	owner := o.Owner
	if o.Phase == "chance" && len(o.LayoutHistory.Turns) > 0 {
		owner = o.LayoutHistory.Turns[0].Seat
	}
	if historyDealNumber(o) == 1 && !contains(hands[owner], "H7") {
		return State{}, false, nil
	}
	s := State{Config: c, Phase: "layout", Turn: owner, Kingdom: o.Kingdom, DealNumber: historyDealNumber(o), Owner: owner, Request: "trix", RemainingRequests: append([]string{}, o.RemainingRequests...), Hands: hands, Trick: []Play{}, Tricks: []Trick{}, Declarations: []Declaration{}, Board: []Row{{Suit: "C"}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}}, FinishOrder: []int{}, Passes: []LayoutPass{}, Ledger: []LedgerEntry{}, WithheldBonuses: []WithheldBonus{}, LayoutHistory: &LayoutHistory{Version: layoutHistoryVersion, Status: "available", Turns: []LayoutTurn{}}}
	for _, entry := range o.Ledger {
		if entry.DealNumber == s.DealNumber {
			continue
		}
		if entry.Recipient.Seat != nil {
			seat := *entry.Recipient.Seat
			entry.Recipient.Seat = &seat
		}
		s.Ledger = append(s.Ledger, entry)
	}
	for _, entry := range o.WithheldBonuses {
		if entry.DealNumber != s.DealNumber {
			s.WithheldBonuses = append(s.WithheldBonuses, entry)
		}
	}
	s.TwoAnnouncement = openingTwos(s)
	if !reflect.DeepEqual(publicTwos(s), twosBefore(o.TwoAnnouncements, 0)) {
		return State{}, false, nil
	}
	for _, turn := range o.LayoutHistory.Turns {
		var err error
		s, err = applyOwned(s, turn.Seat, Action{Kind: turn.Kind, Card: turn.Card})
		if err != nil {
			return State{}, false, nil
		}
		if !reflect.DeepEqual(s.LayoutHistory.Turns[len(s.LayoutHistory.Turns)-1], turn) {
			return State{}, false, nil
		}
	}
	if !reflect.DeepEqual(publicTwos(s), o.TwoAnnouncements) {
		return State{}, false, nil
	}
	return s, true, nil
}

func validateLayoutHistory(s State) error {
	if s.Config.LayoutHistoryVersion == "" {
		if s.LayoutHistory != nil {
			return fmt.Errorf("layout history on historical Trix configuration")
		}
		return nil
	}
	if s.LayoutHistory == nil {
		return fmt.Errorf("missing current Trix layout history")
	}
	o := Observe(s, 0)
	if err := ValidateLayoutHistoryObservation(o); err != nil {
		return err
	}
	if s.Request != "trix" {
		return nil
	}
	witness, ok, err := replayLayoutHistory(o, s.Config, s.Hands)
	if err != nil {
		return err
	}
	if !ok || witness.Turn != s.Turn {
		return fmt.Errorf("Trix layout history incompatible with native replay")
	}
	return nil
}
