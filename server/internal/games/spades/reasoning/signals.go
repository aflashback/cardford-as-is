package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"fmt"
)

type partnerHint struct{ evidence, counterexample string }

func inferPartner(o d.Observation) []partnerHint {
	hints := []partnerHint{}
	if o.Mode != "spades-partners" {
		return hints
	}
	partner := (o.Seat + 2) % 4
	sequences := [][]d.Play{}
	for _, t := range o.History {
		sequences = append(sequences, t.Plays)
	}
	if o.Phase != "trick-end" {
		sequences = append(sequences, o.Trick)
	}
	for i, plays := range sequences {
		if len(plays) == 0 {
			continue
		}
		var pp *d.Play
		for j := range plays {
			if plays[j].Seat == partner {
				pp = &plays[j]
				break
			}
		}
		if pp == nil {
			continue
		}
		lead := d.CardSuit(plays[0].Card)
		played := d.CardSuit(pp.Card)
		if played != lead {
			hints = append(hints, partnerHint{fmt.Sprintf("Partner failed to follow %s in trick %d.", lead, i+1), "None under the current no-draw rule profile."}, partnerHint{fmt.Sprintf("Partner discarded %s in trick %d.", played, i+1), "The discard may have been forced or chosen to shed risk; no signal convention is established."})
		}
		if plays[0].Seat == partner && i < len(o.History) && o.History[i].Winner == partner {
			hints = append(hints, partnerHint{fmt.Sprintf("Partner led and won %s in trick %d.", lead, i+1), "An unplayed higher card may be held by another seat, and partner may have no more cards of this suit."})
		}
	}
	return hints
}
