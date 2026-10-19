package trix

// Observe copies only own cards and public history. In particular it never
// serializes a State and removes fields, and it cannot disclose future deals.
func Observe(s State, seat int) Observation {
	o := Observation{ID: s.Config.ID, GameID: "trix", VariantID: s.Config.Variant, Seat: seat, Phase: s.Phase, Kingdom: s.Kingdom, DealNumber: s.DealNumber, Owner: s.Owner, RemainingRequests: append([]string{}, s.RemainingRequests...), Hand: []string{}, Trick: append([]Play{}, s.Trick...), Tricks: []Trick{}, Declarations: []Declaration{}, Board: append([]Row{}, s.Board...), FinishOrder: append([]int{}, s.FinishOrder...), Passes: []LayoutPass{}, Ledger: []LedgerEntry{}, WithheldBonuses: append([]WithheldBonus{}, s.WithheldBonuses...), Totals: scores(s, 0, 0), RequestTotals: scores(s, s.DealNumber, 0), KingdomTotals: scores(s, 0, s.Kingdom), Winners: []string{}}
	o.publicSchemaVersion = pinForConfig(s.Config).PublicSchemaVersion
	o.TwoAnnouncements = publicTwos(s)
	o.LayoutHistory = cloneLayoutHistory(s.LayoutHistory)
	if s.Phase == "choose-request" || s.Phase == "declare-doubles" || s.Phase == "playing" || s.Phase == "layout" {
		turn := s.Turn
		o.Turn = &turn
	}
	if s.Request != "" {
		r := s.Request
		o.Request = &r
	}
	if seat >= 0 && seat < 4 {
		o.Hand = append([]string{}, s.Hands[seat]...)
	}
	for i := 0; i < 4; i++ {
		o.HandCounts[i] = len(s.Hands[i])
		if s.LastExternalLeader[i] != nil {
			v := *s.LastExternalLeader[i]
			o.LastExternalLeader[i] = &v
		}
	}
	for _, t := range s.Tricks {
		t.Plays = append([]Play{}, t.Plays...)
		o.Tricks = append(o.Tricks, t)
	}
	for _, d := range s.Declarations {
		d.Cards = append([]string{}, d.Cards...)
		o.Declarations = append(o.Declarations, d)
	}
	for _, p := range s.Passes {
		p.Board = append([]Row{}, p.Board...)
		o.Passes = append(o.Passes, p)
	}
	for _, e := range s.Ledger {
		if e.Recipient.Seat != nil {
			v := *e.Recipient.Seat
			e.Recipient.Seat = &v
		}
		o.Ledger = append(o.Ledger, e)
	}
	if s.Phase == "session-complete" {
		best := o.Totals[0].Total
		for _, v := range o.Totals {
			if v.Total > best {
				best = v.Total
			}
		}
		for _, v := range o.Totals {
			if v.Total == best {
				o.Winners = append(o.Winners, v.ID)
			}
		}
	}
	return o
}
