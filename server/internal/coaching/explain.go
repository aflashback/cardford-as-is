package coaching

import (
	"fmt"

	heartscoaching "cardford/server/internal/games/hearts/coaching"
	heartsreasoning "cardford/server/internal/games/hearts/reasoning"
	spadescoaching "cardford/server/internal/games/spades/coaching"
	spadesreasoning "cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
)

// Explain validates the actor-scoped decision, retains the original shared
// envelopes and dispatches only to the two executable original policy pins.
// Unsupported historical policy records remain readable as stored advice; this
// entry point never rerenders them with a different policy's cues.
func Explain(obs d.Observation, supplied *d.Analysis) (d.Advice, error) {
	if err := d.ValidateObservation(obs); err != nil {
		return d.Advice{}, err
	}
	policyVersion := spadesreasoning.PolicyVersion
	if obs.Mode == "hearts" {
		policyVersion = heartsreasoning.PolicyVersion
	}
	if len(obs.LegalActions) == 0 {
		focus := "Watch the table"
		if obs.Phase == "hand-end" || obs.Phase == "match-end" {
			focus = "Hand complete"
		}
		return d.Advice{
			Provenance:    "code",
			PolicyVersion: policyVersion,
			ReasonIDs:     []string{},
			Evidence:      "exact",
			Focus:         focus,
			Notice:        "No decision for you right now.",
			Reason:        "The memory aid shows facts from this hand’s public plays.",
			Suggestion:    "",
		}, nil
	}
	var analysis d.Analysis
	if supplied != nil {
		analysis = *supplied
	} else {
		var err error
		if obs.Mode == "hearts" {
			analysis, err = heartsreasoning.Analyze(obs)
		} else {
			analysis, err = spadesreasoning.Analyze(obs)
		}
		if err != nil {
			return d.Advice{}, err
		}
	}
	legal := false
	if analysis.Action.Seat == obs.Seat {
		for _, action := range obs.LegalActions {
			if d.ActionID(action) == d.ActionID(analysis.Action) {
				legal = true
				break
			}
		}
	}
	if !legal {
		return d.Advice{}, fmt.Errorf("Analysis does not match this legal decision.")
	}
	if analysis.PolicyVersion != policyVersion {
		return d.Advice{}, fmt.Errorf("Unsupported coaching policy: %s", analysis.PolicyVersion)
	}
	action := analysis.Action
	if analysis.Provenance == "forced" && action.Kind == "play" {
		advice := d.Advice{
			Provenance:    analysis.Provenance,
			PolicyVersion: analysis.PolicyVersion,
			ReasonIDs:     []string{},
			Evidence:      "heuristic",
			Card:          action.Card,
			Focus:         "One legal play",
			Notice:        d.CardLabel(action.Card) + " is your only legal card.",
			Reason:        "The rules leave no strategic choice on this turn.",
			Suggestion:    "Play " + d.CardLabel(action.Card) + ".",
		}
		for _, candidate := range analysis.Candidates {
			if candidate.Disposition == "selected" {
				advice.ReasonIDs = append([]string{}, candidate.ReasonIDs...)
				advice.Evidence = candidate.Evidence
				break
			}
		}
		if len(obs.Trick) > 0 {
			advice.HighlightSuit = d.CardSuit(obs.Trick[0].Card)
		}
		return advice, nil
	}
	if obs.Mode == "hearts" {
		return heartscoaching.Render(obs, analysis)
	}
	return spadescoaching.Render(obs, analysis)
}
