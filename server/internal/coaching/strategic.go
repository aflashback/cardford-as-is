package coaching

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"cardford/server/internal/contracts"
	hc "cardford/server/internal/games/hearts/coaching"
	sc "cardford/server/internal/games/spades/coaching"
	d "cardford/server/internal/legacydecision"
)

const ContextualCueVersion = "contextual-cues-1.0.0"

// BuildCoachMessage explains one saved analysis. It never selects an action or
// calls a policy. Missing support is an explicit content gap, not fabricated prose.
func BuildCoachMessage(obs d.Observation, original d.Analysis, decisionID, cueVersion string) (contracts.CoachMessage, error) {
	m := contracts.CoachMessage{}
	if cueVersion != ContextualCueVersion || decisionID == "" {
		return m, fmt.Errorf("unsupported cue version or decision identity")
	}
	if err := d.ValidateObservation(obs); err != nil {
		return m, err
	}
	if original.Facts.Mode != obs.Mode || original.Facts.Seat != obs.Seat || original.Action.Seat != obs.Seat {
		return m, fmt.Errorf("analysis actor/variant mismatch")
	}
	if !reflect.DeepEqual(original.Facts, d.BuildFacts(obs)) {
		return m, fmt.Errorf("analysis belongs to different decision facts")
	}
	selected := d.ActionID(original.Action)
	if original.Trace == nil || original.Trace.SelectedActionID != selected || original.Trace.PolicyVersion != original.PolicyVersion {
		return m, fmt.Errorf("analysis trace mismatch")
	}
	legal := map[string]bool{}
	for _, a := range obs.LegalActions {
		legal[d.ActionID(a)] = true
	}
	if !legal[selected] || len(original.Candidates) != len(legal) {
		return m, fmt.Errorf("analysis legal set mismatch")
	}
	seen := map[string]bool{}
	count := 0
	for _, c := range original.Candidates {
		id := d.ActionID(c.Action)
		if !legal[id] || seen[id] || c.Action.Seat != obs.Seat {
			return m, fmt.Errorf("analysis candidate mismatch")
		}
		seen[id] = true
		if c.Disposition == "selected" {
			count++
			if id != selected {
				return m, fmt.Errorf("analysis selection mismatch")
			}
		}
	}
	if count != 1 {
		return m, fmt.Errorf("analysis must select exactly one action")
	}
	action := actionText(original.Action)
	m = contracts.CoachMessage{PresentationVersion: "coach-advice-2.0.0", DecisionID: decisionID, PolicyVersion: original.PolicyVersion, CueVersion: cueVersion, SelectedAction: selected, Status: "insufficient-reason", Cue: action + ". The saved analysis has no complete tactical reason.", Reason: contracts.CoachReason{Summary: "This is the deterministic policy's selected action. Its recorded evidence does not establish a specific strategic advantage here.", Support: []contracts.CoachSupport{}, Alternatives: []string{}, Limitations: []string{"Treat this as an explanation gap, not a claim that this is the best move."}}}
	if len(legal) == 1 {
		m.Status = "only-option"
		m.Cue = action + " - the only legal option."
		m.Reason = contracts.CoachReason{Summary: "Only one legal action is available at this position; there is no strategic choice to compare.", Support: []contracts.CoachSupport{{ID: "legal-count", Kind: "exact", Text: "One legal action."}}, Alternatives: []string{}, Limitations: []string{}}
	} else if tiedSelection(original) {
		m.Status = "no-clear-preference"
		m.Cue = action + ". The recorded scores do not distinguish the leading choices."
		m.Reason.Summary = "The policy selected this action using its fixed tie order. A tie in this analysis does not establish that the choices have equal value over the whole game."
		m.Reason.Limitations = []string{"No unique strategic advantage is established by the tie-break."}
	} else {
		var purpose string
		var reason contracts.CoachReason
		var ok bool
		switch obs.Mode {
		case "hearts":
			purpose, reason, ok = hc.Contextual(obs, original)
		case "spades-solo", "spades-partners":
			purpose, reason, ok = sc.Contextual(obs, original)
		default:
			return m, fmt.Errorf("unsupported contextual game")
		}
		if ok {
			m.Status = "tactical"
			m.Cue = action + " - " + purpose + "."
			m.Reason = reason
		}
	}
	// Oversized content is a visible gap. Never silently trim a material caveat.
	if _, err := json.Marshal(m); err != nil {
		m.Status = "insufficient-reason"
		m.Cue = action + ". A complete explanation is unavailable."
		m.Reason = contracts.CoachReason{Summary: "The complete saved rationale exceeds the presentation contract. Inspect the original analysis in the lab archive.", Support: []contracts.CoachSupport{}, Alternatives: []string{}, Limitations: []string{"No partial explanation is presented as complete."}}
	}
	return m, ValidateCoachMessage(m, original)
}

func ValidateCoachMessage(m contracts.CoachMessage, a d.Analysis) error {
	if m.SelectedAction != d.ActionID(a.Action) || m.PolicyVersion != a.PolicyVersion {
		return fmt.Errorf("coach message differs from original analysis")
	}
	if m.Status == "tactical" && len(m.Reason.Support) == 0 {
		return fmt.Errorf("tactical message needs support")
	}
	_, err := json.Marshal(m)
	return err
}

// ProjectCoachMessage returns a detached view of saved content, with no state or
// analysis argument. A later trick cannot rewrite the reason through this API.
func ProjectCoachMessage(saved contracts.CoachMessage, view string) (contracts.CoachMessageView, error) {
	out := contracts.CoachMessageView{}
	if view != "recommendation" && view != "reason" {
		return out, fmt.Errorf("unsupported coach view")
	}
	raw, err := json.Marshal(saved)
	if err != nil {
		return out, err
	}
	var copy contracts.CoachMessage
	if err = json.Unmarshal(raw, &copy); err != nil {
		return out, err
	}
	out = contracts.CoachMessageView{PresentationVersion: copy.PresentationVersion, DecisionID: copy.DecisionID, Status: copy.Status, SelectedAction: copy.SelectedAction, Cue: copy.Cue, View: view}
	if view == "reason" {
		out.Reason = &copy.Reason
	}
	return out, nil
}
func actionText(a d.Action) string {
	switch a.Kind {
	case "play":
		return "Play " + d.CardLabel(a.Card)
	case "bid":
		return fmt.Sprintf("Bid %d", a.Bid)
	case "pass":
		labels := []string{}
		for _, c := range a.Cards {
			labels = append(labels, d.CardLabel(c))
		}
		return "Pass " + strings.Join(labels, ", ")
	}
	return "Choose " + d.ActionID(a)
}
func tiedSelection(a d.Analysis) bool {
	if a.Trace == nil {
		return false
	}
	var score *float64
	for _, c := range a.Trace.Candidates {
		if c.ActionID == d.ActionID(a.Action) {
			score = c.Score
		}
	}
	if score == nil {
		return false
	}
	for _, c := range a.Trace.Candidates {
		if c.ActionID != d.ActionID(a.Action) && c.Score != nil && *c.Score == *score {
			return true
		}
	}
	return false
}
