package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"slices"
)

type entryRoute struct {
	suit          string
	weight        float64
	certain, risk bool
}

func assessEntry(o d.Observation, f d.Facts, a d.Action) *entryRoute {
	if o.Mode != "spades-partners" || o.Phase != "play" || a.Kind != "play" || f.Partner == nil || !eq(f.PartnerNil, "none") || d.Value(f.ContractNeeded) <= 0 || d.Value(f.OwnBid) <= 0 || len(o.Trick) == 0 {
		return nil
	}
	var outcome *d.CardOutcome
	for i := range f.CardOutcomes {
		if f.CardOutcomes[i].ActionID == d.ActionID(a) {
			outcome = &f.CardOutcomes[i]
			break
		}
	}
	if outcome == nil || outcome.CurrentWinner != o.Seat || !canHold(f, *f.Partner, "S") {
		return nil
	}
	suit := ""
	for _, s := range []string{"C", "D", "H"} {
		if slices.Contains(f.Voids[s], *f.Partner) && any(o.Hand, func(c string) bool { return c != a.Card && d.CardSuit(c) == s }) {
			suit = s
			break
		}
	}
	if suit == "" {
		return nil
	}
	risk := any(d.Seats(), func(s int) bool {
		return s != o.Seat && s != *f.Partner && slices.Contains(f.Voids[suit], s) && canHold(f, s, "S")
	})
	certain := eq(outcome.GuaranteedWinner, o.Seat)
	return &entryRoute{suit, tern(certain, 45.0, 15.0) - tern(risk, 20.0, 0.0), certain, risk}
}
