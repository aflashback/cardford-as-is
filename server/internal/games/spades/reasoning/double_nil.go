package reasoning

import d "cardford/server/internal/legacydecision"

func assessDoubleNil(o d.Observation, f d.Facts) map[string]string {
	r := map[string]string{}
	if o.Mode != "spades-partners" || o.Phase != "play" || f.OwnNil != "live" || !eq(f.PartnerNil, "live") || f.Partner == nil {
		return r
	}
	for _, a := range o.LegalActions {
		id := d.ActionID(a)
		result := "unresolved"
		for _, out := range f.CardOutcomes {
			if out.ActionID != id || out.GuaranteedWinner == nil {
				continue
			}
			if *out.GuaranteedWinner == o.Seat {
				result = "own-nil-fails"
			} else if *out.GuaranteedWinner == *f.Partner {
				result = "partner-nil-fails"
			} else {
				result = "both-survive-this-trick"
			}
		}
		r[id] = result
	}
	return r
}
