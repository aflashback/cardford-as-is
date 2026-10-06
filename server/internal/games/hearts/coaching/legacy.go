package coaching

import (
	"fmt"

	d "cardford/server/internal/legacydecision"
)

// Render preserves the original Hearts wording; legacy advice intentionally has
// no cueVersion, outcome or claims fields.
func Render(obs d.Observation, analysis d.Analysis) (d.Advice, error) {
	if analysis.PolicyVersion != "hearts-baseline-1.0.0" {
		return d.Advice{}, fmt.Errorf("Unsupported coaching policy: %s", analysis.PolicyVersion)
	}
	advice := d.Advice{Provenance: analysis.Provenance, PolicyVersion: analysis.PolicyVersion, ReasonIDs: []string{}, Evidence: "heuristic"}
	for _, c := range analysis.Candidates {
		if c.Disposition == "selected" {
			advice.ReasonIDs = append([]string{}, c.ReasonIDs...)
			advice.Evidence = c.Evidence
			break
		}
	}
	action := analysis.Action
	if action.Kind == "pass" {
		advice.Focus = "Plan the whole pass"
		advice.Notice = "Choose three cards before committing."
		advice.Reason = "This local starting plan favors passing high cards. Keeping queen protection, a short suit or a possible moon plan can favor another. Received cards can change your suits."
		advice.Suggestion = "Consider these three together. Recheck your suits after receiving."
		advice.Pass = append([]string{}, action.Cards...)
		return advice, nil
	}
	if action.Kind != "play" {
		return d.Advice{}, fmt.Errorf("Hearts has no bid.")
	}
	advice.Card = action.Card
	if len(obs.Trick) > 0 {
		led := d.CardSuit(obs.Trick[0].Card)
		advice.HighlightSuit = led
		name := map[string]string{"C": "clubs", "D": "diamonds", "H": "hearts", "S": "spades"}[led]
		advice.Focus = name + " were led"
		advice.Notice = "You have no " + name + " to follow."
		for _, c := range obs.Hand {
			if d.CardSuit(c) == led {
				advice.Notice = name + " were led. You must follow suit."
				break
			}
		}
	} else {
		advice.Focus = "Choose your lead"
		advice.Notice = fmt.Sprintf("%d cards are legal to lead.", len(obs.LegalActions))
	}
	advice.Reason = "Hearts and the queen carry points. A lower card does not always avoid taking the trick."
	advice.Suggestion = "Consider " + d.CardLabel(action.Card) + ". Other plans can be reasonable."
	return advice, nil
}
