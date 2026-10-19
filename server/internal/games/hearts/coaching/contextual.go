package coaching

import (
	"cardford/server/internal/contracts"
	d "cardford/server/internal/legacydecision"
	"fmt"
	"slices"
)

// Contextual adds an exact current-trick consequence to the frozen baseline's
// recorded avoidance branch. It makes no moon, opponent-hand or match-optimality claim.
func Contextual(o d.Observation, a d.Analysis) (string, contracts.CoachReason, bool) {
	empty := contracts.CoachReason{}
	if a.PolicyVersion != "hearts-baseline-1.0.0" || a.Action.Kind != "play" || len(o.Trick) != 3 {
		return "", empty, false
	}
	supported := false
	for _, r := range a.Reasons {
		if r.ID == "hearts.baseline" {
			supported = true
		}
	}
	if !supported {
		return "", empty, false
	}
	selected := a.Action.Card
	plays := append(slices.Clone(o.Trick), d.Play{Seat: o.Seat, Card: selected})
	winner := d.TrickWinner(plays, o.Mode)
	points := 0
	for _, p := range plays {
		if p.Card == "SQ" {
			points += 13
		}
		if d.CardSuit(p.Card) == "H" {
			points++
		}
	}
	if winner == o.Seat || points == 0 {
		return "", empty, false
	}
	alternatives := []string{}
	for _, option := range o.LegalActions {
		if option.Kind != "play" || option.Card == selected {
			continue
		}
		p := append(slices.Clone(o.Trick), d.Play{Seat: o.Seat, Card: option.Card})
		if d.TrickWinner(p, o.Mode) == o.Seat {
			n := points
			if d.CardSuit(selected) == "H" {
				n--
			}
			if selected == "SQ" {
				n -= 13
			}
			if d.CardSuit(option.Card) == "H" {
				n++
			}
			if option.Card == "SQ" {
				n += 13
			}
			alternatives = append(alternatives, fmt.Sprintf("%s would take this trick and its %d penalty points.", d.CardLabel(option.Card), n))
		}
	}
	if len(alternatives) == 0 {
		return "", empty, false
	}
	winningCard := ""
	for _, p := range o.Trick {
		if p.Seat == winner {
			winningCard = p.Card
		}
	}
	summary := fmt.Sprintf("%s is winning and you are last to play. %s leaves this trick and its %d penalty points with seat %d.", d.CardLabel(winningCard), d.CardLabel(selected), points, winner)
	reason := contracts.CoachReason{Summary: summary, Support: []contracts.CoachSupport{{ID: "current-trick", Kind: "exact", Text: summary}, {ID: "hearts.baseline", Kind: "policy", Text: "The saved baseline selected a card that stays below the current winner."}}, Alternatives: alternatives, Limitations: []string{"This explains immediate penalty avoidance; it does not establish the best whole-game choice or rule out a moon-prevention plan."}}
	return fmt.Sprintf("avoid taking this trick's %d penalty points", points), reason, true
}
