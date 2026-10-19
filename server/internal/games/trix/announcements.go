package trix

import "fmt"

const announcedTwosProfile = "1.1.0"

var twoCards = [4]string{"C2", "D2", "H2", "S2"}

// Owners are fixed in suit order, independent of card sort/play order. Turns
// counts accepted layout moves, including passes, saturating at the reveal.
type twoAnnouncement struct {
	Owners [4]int `json:"owners"`
	Turns  int    `json:"turns"`
}

func validateProfile(c Config) error {
	if c.LayoutHistoryVersion != "" && c.LayoutHistoryVersion != layoutHistoryVersion {
		return fmt.Errorf("unsupported Trix layout history version")
	}
	if c.LayoutHistoryVersion == layoutHistoryVersion && partners(c.Variant) && c.ProfileVersion != announcedTwosProfile {
		return fmt.Errorf("current Trix Partners layout history requires the announced rules profile")
	}
	if c.ProfileVersion != "" && (c.ProfileVersion != announcedTwosProfile || !partners(c.Variant)) {
		return fmt.Errorf("unsupported Trix profile version")
	}
	return nil
}
func openingTwos(s State) *twoAnnouncement {
	if s.Config.ProfileVersion != announcedTwosProfile || !partners(s.Config.Variant) || s.Request != "trix" {
		return nil
	}
	a := &twoAnnouncement{}
	teams := [2]bool{}
	for i, card := range twoCards {
		for seat, hand := range s.Hands {
			if contains(hand, card) {
				a.Owners[i] = seat
				teams[seat%2] = true
				break
			}
		}
	}
	if !teams[0] || !teams[1] {
		return nil
	}
	return a
}
func publicTwos(s State) *TwoAnnouncements {
	if s.TwoAnnouncement == nil {
		return nil
	}
	if s.TwoAnnouncement.Turns < 4 {
		counts := [4]int{}
		for _, seat := range s.TwoAnnouncement.Owners {
			counts[seat]++
		}
		return &TwoAnnouncements{Status: "hidden", Counts: &counts}
	}
	cards := make([]Play, 4)
	for i, card := range twoCards {
		cards[i] = Play{Seat: s.TwoAnnouncement.Owners[i], Card: card}
	}
	return &TwoAnnouncements{Status: "revealed", Cards: cards}
}

func validateTwos(s State) error {
	if s.TwoAnnouncement == nil {
		// During the opening all twos are still held; absence must agree with
		// the both-teams condition. Later absence is checked by full replay.
		if s.Request == "trix" && layoutMoves(s) < 4 && openingTwos(s) != nil {
			return fmt.Errorf("missing Trix twos announcement")
		}
		return nil
	}
	a := s.TwoAnnouncement
	if s.Config.ProfileVersion != announcedTwosProfile || !partners(s.Config.Variant) || s.Request != "trix" || a.Turns < 0 || a.Turns > 4 {
		return fmt.Errorf("invalid Trix twos announcement")
	}
	teams := [2]bool{}
	for i, seat := range a.Owners {
		if seat < 0 || seat > 3 {
			return fmt.Errorf("invalid Trix two holder")
		}
		teams[seat%2] = true
		for heldSeat, hand := range s.Hands {
			if contains(hand, twoCards[i]) && heldSeat != seat {
				return fmt.Errorf("Trix two holder disagrees with held card")
			}
		}
	}
	if !teams[0] || !teams[1] {
		return fmt.Errorf("single-team Trix twos announcement")
	}
	want := layoutMoves(s)
	if want > 4 {
		want = 4
	}
	if a.Turns != want {
		return fmt.Errorf("Trix twos reveal chronology mismatch")
	}
	return nil
}
func layoutMoves(s State) int {
	placed := 0
	for _, r := range s.Board {
		if r.Low > 0 {
			placed += r.High - r.Low + 1
		}
	}
	return placed + len(s.Passes)
}
