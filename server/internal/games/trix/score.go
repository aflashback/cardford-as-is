package trix

import "fmt"

func seatRecipient(seat int) Recipient { return Recipient{Kind: "seat", Seat: &seat} }
func teamID(seat int) string {
	if seat%2 == 0 {
		return "NS"
	}
	return "EW"
}
func addScore(s *State, r Recipient, component, card string, delta, trick, finish int, declaration, source string) {
	s.Ledger = append(s.Ledger, LedgerEntry{DealNumber: s.DealNumber, Kingdom: s.Kingdom, Request: s.Request, Trick: trick, Finish: finish, Recipient: r, Component: component, Card: card, Delta: delta, DeclarationRef: declaration, LeadSourceRef: source})
}
func scoreTrick(s *State, t Trick) {
	taker := seatRecipient(t.Winner)
	if s.Request == "lutoosh" || s.Request == "complex" {
		addScore(s, taker, "trick", "", -15, t.Number, 0, "", "")
	}
	for _, p := range t.Plays {
		if (s.Request == "diamonds" || s.Request == "complex") && p.Card[0] == 'D' {
			addScore(s, taker, "diamond", p.Card, -10, t.Number, 0, "", "")
		}
		value, component := 0, ""
		if (s.Request == "queens" || s.Request == "complex") && rank(p.Card) == 12 {
			value = 25
			component = "queen"
		}
		if (s.Request == "king" || s.Request == "complex") && p.Card == "HK" {
			value = 75
			component = "king"
		}
		if value == 0 {
			continue
		}
		var declared *Declaration
		for i := range s.Declarations {
			if contains(s.Declarations[i].Cards, p.Card) {
				declared = &s.Declarations[i]
				break
			}
		}
		if declared == nil {
			addScore(s, taker, component, p.Card, -value, t.Number, 0, "", "")
			continue
		}
		addScore(s, taker, component, p.Card, -2*value, t.Number, 0, declared.Ref, "")
		var recipient Recipient
		source := ""
		if partners(s.Config.Variant) {
			recipient = Recipient{Kind: "competitor", Competitor: teamID(NextSeat(t.Winner))}
		} else if declared.Seat != t.Winner {
			recipient = seatRecipient(declared.Seat)
		} else if t.Leader != t.Winner {
			recipient = seatRecipient(t.Leader)
			source = fmt.Sprintf("deal:%d:trick:%d", s.DealNumber, t.Number)
		} else if giver := s.LastExternalLeader[t.Winner]; giver != nil {
			recipient = seatRecipient(giver.Seat)
			source = fmt.Sprintf("deal:%d:trick:%d", s.DealNumber, giver.Trick)
		} else {
			s.WithheldBonuses = append(s.WithheldBonuses, WithheldBonus{DealNumber: s.DealNumber, Trick: t.Number, Card: p.Card, BonusValue: value, Reason: "no_previous_external_leader", DeclarationRef: declared.Ref})
			continue
		}
		addScore(s, recipient, "double-bonus", p.Card, value, t.Number, 0, declared.Ref, source)
	}
}
func scores(s State, deal, kingdom int) []Score {
	out := []Score{}
	if partners(s.Config.Variant) {
		out = []Score{{ID: "NS", Seats: []int{0, 2}}, {ID: "EW", Seats: []int{1, 3}}}
	} else {
		for seat := 0; seat < 4; seat++ {
			out = append(out, Score{ID: fmt.Sprintf("seat-%d", seat), Seats: []int{seat}})
		}
	}
	for _, e := range s.Ledger {
		if deal > 0 && e.DealNumber != deal || kingdom > 0 && e.Kingdom != kingdom {
			continue
		}
		for i := range out {
			matches := e.Recipient.Kind == "competitor" && out[i].ID == e.Recipient.Competitor
			if e.Recipient.Kind == "seat" && e.Recipient.Seat != nil {
				for _, seat := range out[i].Seats {
					if seat == *e.Recipient.Seat {
						matches = true
					}
				}
			}
			if matches {
				out[i].Total += e.Delta
			}
		}
	}
	return out
}
