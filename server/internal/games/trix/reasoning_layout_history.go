package trix

import (
	"cardford/server/internal/contracts"
	"fmt"
	"sort"
	"strings"
)

type layoutChoiceEvidence struct {
	turn         LayoutTurn
	status       string
	alternatives []string
}

// A later play here means a play already present in this frozen public prefix,
// never a future event read from authoritative state. Only same-seat ownership
// or the actor's own current cards can prove an earlier alternative.
func layoutChoices(o Observation) []layoutChoiceEvidence {
	out := []layoutChoiceEvidence{}
	if o.LayoutHistory == nil || o.LayoutHistory.Status != "available" {
		return out
	}
	for i, turn := range o.LayoutHistory.Turns {
		choice := layoutChoiceEvidence{turn: turn, status: "unknown", alternatives: []string{}}
		if turn.Kind == "layout-pass" || turn.HandCountsBefore[turn.Seat] == 1 {
			choice.status = "forced"
		} else {
			known := map[string]bool{}
			for _, later := range o.LayoutHistory.Turns[i+1:] {
				if later.Seat == turn.Seat && later.Kind == "layout-card" {
					known[later.Card] = true
				}
			}
			if turn.Seat == o.Seat {
				for _, card := range o.Hand {
					known[card] = true
				}
			}
			for card := range known {
				if card != turn.Card && placeable(turn.BoardBefore, card) {
					choice.alternatives = append(choice.alternatives, card)
				}
			}
			sort.Slice(choice.alternatives, func(i, j int) bool { return cardLess(choice.alternatives[i], choice.alternatives[j]) })
			if len(choice.alternatives) > 0 {
				choice.status = "voluntary"
			}
		}
		out = append(out, choice)
	}
	return out
}

func layoutHistoryFacts(o Observation) []contracts.CoachSupport {
	out := []contracts.CoachSupport{}
	if o.LayoutHistory == nil {
		return out
	}
	out = append(out, support("trix-history-layout-provenance", "exact", fmt.Sprintf("This frozen request prefix contains %d accepted Trix Jacks turns with public placement ownership, passes, board and remaining counts before each action, and the twos information public at that moment. Known alternative cards are a proved subset; another seat's complete legal set and intention are unavailable.", len(o.LayoutHistory.Turns))))
	for _, choice := range layoutChoices(o) {
		turn := choice.turn
		text := fmt.Sprintf("Layout turn %d: seat %d played %s with %d cards remaining before the action; choice status: %s.", turn.Ordinal, turn.Seat, turn.Card, turn.HandCountsBefore[turn.Seat], choice.status)
		if turn.Kind == "layout-pass" {
			text = fmt.Sprintf("Layout turn %d: seat %d passed with %d cards remaining before the action; choice status: forced. An accepted native pass means that seat had no legal placement on the recorded board.", turn.Ordinal, turn.Seat, turn.HandCountsBefore[turn.Seat])
		} else if choice.status == "voluntary" {
			text += " Publicly proved legal alternative subset at that board: " + strings.Join(choice.alternatives, ", ") + ". Each card is already placed later by this same seat in this frozen prefix, or remains in the observing actor's own hand. This does not enumerate another seat's complete legal set."
		} else if choice.status == "forced" {
			text += " The public pre-turn hand count is one, so this last-card placement offers no alternative."
		} else {
			text += " No alternative is proved by this frozen prefix; an empty known subset does not prove that the placement was forced."
		}
		out = append(out, support(fmt.Sprintf("trix-history-layout-turn-%d", turn.Ordinal), "exact", text))
	}
	return out
}

func layoutHistorySignals(o Observation) []HistorySignal {
	out := []HistorySignal{}
	upper := [4][]layoutChoiceEvidence{}
	for _, choice := range layoutChoices(o) {
		if choice.status != "voluntary" {
			continue
		}
		turn := choice.turn
		ref := fmt.Sprintf("deal:%d:layout-turn:%d", historyDealNumber(o), turn.Ordinal)
		out = append(out, HistorySignal{ID: fmt.Sprintf("trix-history-layout-voluntary-%d", turn.Ordinal), Seat: turn.Seat, Ref: ref, Chosen: turn.Card, KnownAlternatives: append([]string{}, choice.alternatives...), Interpretation: "This placement was voluntary among at least two proved legal placements. It may reflect a preferred opening, releasing connected cards, helping another seat, or another plan. The known alternatives are a public subset, not another seat's complete legal set; hidden holdings and intention remain unknown. This signal changes no action score."})
		for _, row := range turn.BoardBefore {
			if row.Suit == turn.Card[:1] && row.Low > 0 && rank(turn.Card) == row.High+1 {
				upper[turn.Seat] = append(upper[turn.Seat], choice)
			}
		}
	}
	for seat, choices := range upper {
		if len(choices) < 2 {
			continue
		}
		last := choices[len(choices)-1]
		ordinals := []string{}
		for _, choice := range choices {
			ordinals = append(ordinals, fmt.Sprint(choice.turn.Ordinal))
		}
		out = append(out, HistorySignal{ID: fmt.Sprintf("trix-history-layout-repeated-upper-%d", seat), Seat: seat, Ref: fmt.Sprintf("deal:%d:layout-turn:%d", historyDealNumber(o), last.turn.Ordinal), Chosen: last.turn.Card, KnownAlternatives: append([]string{}, last.alternatives...), Interpretation: fmt.Sprintf("Seat %d made %d proved voluntary upper-side extensions at public turns %s. This pattern may reflect an upper-side plan, releasing a sequence, assisting another seat, or other motives; it does not prove absence of low cards or predict the next action. The listed alternatives belong only to the latest referenced turn and are a proved subset. This signal changes no action score.", seat, len(choices), strings.Join(ordinals, ", "))})
	}
	return out
}
