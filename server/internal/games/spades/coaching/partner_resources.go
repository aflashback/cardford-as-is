package coaching

import (
	"cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"fmt"
	"slices"
	"strings"
)

// RenderPartnerResources explains the saved selection and rechecks the exact
// public predicate. An alternative card never inherits the old card's reason.
func RenderPartnerResources(obs d.Observation, analysis d.Analysis) (d.Advice, error) {
	if analysis.PolicyVersion != reasoning.PartnerResourcePolicy {
		return d.Advice{}, fmt.Errorf("unsupported partner-resource analysis")
	}
	selected := d.ActionID(analysis.Action)
	base := analysis
	base.PolicyVersion = reasoning.PolicyVersion
	base.Candidates = append([]d.Candidate{}, analysis.Candidates...)
	for i := range base.Candidates {
		base.Candidates[i].ReasonIDs = []string{}
		for _, id := range analysis.Candidates[i].ReasonIDs {
			if !strings.HasPrefix(id, "CASE-01.") {
				base.Candidates[i].ReasonIDs = append(base.Candidates[i].ReasonIDs, id)
			}
		}
		base.Candidates[i].Disposition = "alternative"
		if d.ActionID(base.Candidates[i].Action) == selected {
			base.Candidates[i].Disposition = "selected"
		}
	}
	advice, err := Render(obs, base)
	if err != nil {
		return advice, err
	}
	advice.PolicyVersion = reasoning.PartnerResourcePolicy
	version := "spades-partner-resource-cues-2.0.0"
	advice.CueVersion = &version
	if analysis.Action.Kind != "play" || analysis.Provenance == "forced" {
		return advice, nil
	}
	assessment := reasoning.AssessPartnerResources(obs, d.BuildFacts(obs))
	permits := func(reasonID string, ids []string) bool {
		if !slices.Contains(ids, selected) {
			return false
		}
		for _, reason := range analysis.Reasons {
			if reason.ID == reasonID && slices.Contains(reason.ActionIDs, selected) {
				return true
			}
		}
		return false
	}
	if offer := assessment.Offer; offer != nil && permits("CASE-01.offer-safe-ruff", offer.ActionIDs) {
		suit := map[string]string{"C": "clubs", "D": "diamonds", "H": "hearts"}[offer.Suit]
		advice.Focus = "Let partner use a spade"
		advice.Notice = "Partner is out of " + suit + " and has a spade that can win."
		advice.Reason = "Keep your " + d.CardLabel(offer.Entry) + " to regain the lead. Partner may choose to discard instead; later tricks still depend on play."
		advice.Suggestion = "Consider " + d.CardLabel(analysis.Action.Card) + " to give partner that chance."
		advice.ReasonIDs = []string{"CASE-01.offer-safe-ruff"}
		advice.Evidence = "heuristic"
		advice.Outcome = "suggestion"
		advice.Explanation = "supported"
	} else if conserve := assessment.Conserve; conserve != nil && permits("CASE-01.partner-secure", conserve.ActionIDs) {
		advice.Focus = "Partner’s trick is secure"
		advice.Notice = "No remaining reply can beat partner’s card."
		advice.Reason = "Taking the same trick adds no team trick. Keep your extra winner for later; its future use remains uncertain."
		advice.Suggestion = "Consider " + d.CardLabel(analysis.Action.Card) + " to leave partner in control."
		advice.ReasonIDs = []string{"CASE-01.partner-secure"}
		advice.Evidence = "heuristic"
		advice.Outcome = "suggestion"
		advice.Explanation = "supported"
	}
	return advice, nil
}
