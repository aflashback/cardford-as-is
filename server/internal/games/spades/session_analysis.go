package spades

import (
	"cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"fmt"
)

func analyzeSession(o sessionObservation, policyID string) (string, json.RawMessage, error) {
	if policyID != reasoning.PolicyVersion {
		return "", nil, fmt.Errorf("unsupported Spades policy %q; saved optional policies are read-only", policyID)
	}
	input, err := legacySessionObservation(o)
	if err != nil {
		return "", nil, err
	}
	original, err := reasoning.Analyze(input)
	if err != nil {
		return "", nil, err
	}
	return registeredSessionAnalysis(o, original)
}
func hasString(values []string, s string) bool {
	for _, v := range values {
		if v == s {
			return true
		}
	}
	return false
}
func registeredSessionAnalysis(o sessionObservation, original d.Analysis) (string, json.RawMessage, error) {
	if original.Action.Kind != "bid" && original.Action.Kind != "play" {
		return "", nil, fmt.Errorf("unsupported Spades analysis action")
	}
	id := d.ActionID(original.Action)
	var selected *d.Candidate
	for i, c := range original.Candidates {
		if c.Action.Kind != "pass" && d.ActionID(c.Action) == id {
			selected = &original.Candidates[i]
			break
		}
	}
	if selected == nil {
		return "", nil, fmt.Errorf("missing Spades selected candidate")
	}
	facts := []any{}
	for _, reason := range original.Reasons {
		if !hasString(selected.ReasonIDs, reason.ID) || (reason.ActionIDs != nil && !hasString(reason.ActionIDs, id)) {
			continue
		}
		kind := "inferred"
		if reason.Kind == "fact" {
			kind = "exact"
		}
		var candidate any
		if reason.ActionIDs != nil {
			candidate = id
		}
		facts = append(facts, map[string]any{"id": reason.ID, "kind": kind, "summary": reason.Text, "evidence": []string{original.PolicyVersion}, "candidateId": candidate})
	}
	scenarios := []any{}
	for _, scenario := range original.ScenarioIDs {
		scenarios = append(scenarios, map[string]any{"id": scenario, "version": original.PolicyVersion, "applicability": "applies", "evidence": []string{original.PolicyVersion}, "exceptions": []string{}})
	}
	objective := "spades-individual-score"
	if o.VariantID == "partners" {
		objective = "spades-partnership-score"
	}
	raw, err := json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "spades", "variantId": o.VariantID, "origin": original.Provenance, "selectedCandidateId": id, "objective": map[string]any{"id": objective, "version": "1.0.0", "metric": "score", "direction": "higher"}, "horizon": map[string]any{"id": "current-hand", "version": "1.0.0", "scope": "round"}, "facts": facts, "estimates": []any{}, "scenarios": scenarios, "assumptions": append([]string{}, original.Limitations...)})
	return id, raw, err
}
