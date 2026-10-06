package records

import (
	"cardford/server/internal/coaching"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/sessions"
	"encoding/json"
	"fmt"
	"reflect"
)

// OriginalDecision reads issued bytes through the exact installed private
// reader. The frozen original projector verifies all saved view fields; returned
// advice remains the issued bytes and no policy or coach is executed.
func OriginalDecision(decision DecisionRecord) (OriginalAnalysisEnvelope, OriginalAdviceEnvelope, error) {
	var a OriginalAnalysisEnvelope
	var advice OriginalAdviceEnvelope
	fail := func(message string) (OriginalAnalysisEnvelope, OriginalAdviceEnvelope, error) {
		return a, advice, fmt.Errorf("%s", message)
	}
	if err := ValidateDecisionShape(decision); err != nil {
		return a, advice, err
	}
	if decision.AnalysisSchema != OriginalAnalysisSchema || decision.AdviceSchema != OriginalAdviceSchema || decision.PacketVersion != "2.0.0" {
		return fail("unsupported full original decision schema")
	}
	if err := gamekernel.DecodeSessionJSON(decision.Analysis, &a); err != nil {
		return a, advice, err
	}
	if err := gamekernel.DecodeSessionJSON(decision.Advice, &advice); err != nil {
		return a, advice, err
	}
	if a.Version != "1.0.0" || advice.Version != "1.0.0" || a.Original.SchemaVersion != "1.0.0" || a.Original.PolicyVersion != decision.Policy.ID || a.Original.PolicyVersion != decision.Policy.Version || advice.Original.PolicyVersion != a.Original.PolicyVersion {
		return fail("original output version/policy mismatch")
	}
	if err := contracts.Validate("RegisteredAnalysis", a.Registered); err != nil {
		return a, advice, err
	}
	var registered struct {
		GameID    string `json:"gameId"`
		VariantID string `json:"variantId"`
		Selected  string `json:"selectedCandidateId"`
		Origin    string `json:"origin"`
	}
	if err := json.Unmarshal(a.Registered, &registered); err != nil {
		return a, advice, err
	}
	expectedMode := registered.GameID
	if registered.GameID == "spades" {
		expectedMode += "-" + registered.VariantID
	} else if registered.GameID != "hearts" || registered.VariantID != "solo" {
		return fail("unsupported original output game")
	}
	if a.Original.Action.Seat != decision.Actor || d.ActionID(a.Original.Action) != decision.SelectedCandidateID || registered.Selected != decision.SelectedCandidateID || registered.Origin != a.Original.Provenance || advice.Original.Provenance != a.Original.Provenance || a.Original.Facts.Mode != expectedMode || a.Original.Facts.Seat != decision.Actor {
		return fail("original output actor/action/provenance mismatch")
	}
	if a.Original.Trace == nil || a.Original.Trace.SchemaVersion != "1.0.0" || a.Original.Trace.PolicyVersion != decision.Policy.ID || a.Original.Trace.SelectedActionID != decision.SelectedCandidateID {
		return fail("original trace selection/policy mismatch")
	}
	catalogFound := false
	for _, c := range decision.Policy.Components {
		if c.ID == "original-catalog" && c.Version == a.Original.Trace.CatalogVersion {
			catalogFound = true
		}
	}
	if !catalogFound {
		return fail("original trace catalog pin mismatch")
	}
	if err := validateOriginalAction(a.Original.Action); err != nil {
		return a, advice, err
	}
	candidates := map[string]bool{}
	selected := 0
	for _, c := range a.Original.Candidates {
		if err := validateOriginalAction(c.Action); err != nil {
			return a, advice, err
		}
		id := d.ActionID(c.Action)
		if c.Action.Seat != decision.Actor || candidates[id] || !validText(id) {
			return fail("invalid original candidate identity")
		}
		candidates[id] = true
		if c.Disposition != "selected" && c.Disposition != "alternative" {
			return fail("invalid original candidate disposition")
		}
		if c.Disposition == "selected" {
			selected++
			if id != decision.SelectedCandidateID {
				return fail("original selected candidate mismatch")
			}
		}
	}
	if selected != 1 || !candidates[decision.SelectedCandidateID] || a.Original.Facts.LegalCount != len(candidates) {
		return fail("original candidate completeness mismatch")
	}
	if err := validateOriginalAdviceAction(advice.Original, decision.SelectedCandidateID); err != nil {
		return a, advice, err
	}
	for i, view := range advice.Levels {
		raw, err := json.Marshal(view)
		if err != nil {
			return a, advice, err
		}
		if err = contracts.Validate("AdviceView", raw); err != nil {
			return a, advice, err
		}
		expected, err := coaching.ProjectAdvice(advice.Original, i+1, decision.ID)
		if err != nil {
			return a, advice, err
		}
		if !reflect.DeepEqual(view, expected) {
			return fail("saved advice differs from its frozen original projection")
		}
	}
	return a, advice, nil
}
func validateOriginalAction(a d.Action) error {
	valid := a.Seat >= 0 && a.Seat <= 3
	switch a.Kind {
	case "bid":
		valid = valid && a.Bid >= 0 && a.Bid <= 13 && a.Card == "" && a.Cards == nil
	case "play":
		valid = valid && d.ValidCard(a.Card) && a.Bid == 0 && a.Cards == nil
	case "pass":
		valid = valid && len(a.Cards) == 3 && a.Card == "" && a.Bid == 0
		seen := map[string]bool{}
		for _, card := range a.Cards {
			valid = valid && d.ValidCard(card) && !seen[card]
			seen[card] = true
		}
	default:
		valid = false
	}
	if !valid {
		return fmt.Errorf("invalid closed original action")
	}
	return nil
}
func validateOriginalAdviceAction(a d.Advice, selected string) error {
	if a.Card != "" && "play:"+a.Card != selected || a.Bid != nil && fmt.Sprintf("bid:%d", *a.Bid) != selected || a.Pass != nil && d.ActionID(d.Action{Kind: "pass", Cards: a.Pass}) != selected {
		return fmt.Errorf("original advice selection mismatch")
	}
	return nil
}
func validateV2DecisionCommand(d DecisionRecord, raw json.RawMessage) error {
	op, err := sessions.DecodeOperation(raw)
	if err != nil {
		return err
	}
	selected := ""
	if d.Purpose == "bot-action" {
		selected = d.SelectedCandidateID
	}
	switch v := op.(type) {
	case sessions.ActorOperation:
		if v.Seat != d.Actor || (selected != "" && v.CandidateID != selected) {
			return fmt.Errorf("actor operation differs from prepared decision")
		}
		return nil
	case sessions.SealedOperation:
		count := 0
		for _, c := range v.Choices {
			if c.Seat == d.Actor {
				count++
				if selected != "" && c.CandidateID != selected {
					return fmt.Errorf("sealed operation differs from prepared decision")
				}
			}
		}
		if count != 1 {
			return fmt.Errorf("sealed operation lacks prepared actor")
		}
		return nil
	default:
		return fmt.Errorf("prepared decision requires actor or sealed operation")
	}
}
