package hearts

import (
	"cardford/server/internal/coaching"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts/reasoning"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"fmt"
)

func analyzeSessionComplete(ctx context.Context, o sessionObservation, policyID, decisionID string) (gamekernel.CompleteAnalysis, error) {
	var out gamekernel.CompleteAnalysis
	if policyID != reasoning.PolicyVersion {
		return out, fmt.Errorf("unsupported original Hearts policy")
	}
	input, err := legacySessionObservationContext(ctx, o)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	original, err := reasoning.AnalyzeContext(ctx, input)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	advice, err := coaching.ExplainContext(ctx, input, &original)
	if err != nil {
		return out, err
	}
	id, registered, err := registeredSessionAnalysis(o, original)
	if err != nil {
		return out, err
	}
	detail, err := json.Marshal(d.PreparedAnalysisEnvelope{Version: "1.0.0", Registered: registered, Original: original})
	if err != nil {
		return out, err
	}
	adviceEnvelope := d.PreparedAdviceEnvelope{Version: "1.0.0", Original: advice}
	for level := 1; level <= 3; level++ {
		adviceEnvelope.Levels[level-1], err = coaching.ProjectAdvice(advice, level, decisionID)
		if err != nil {
			return out, err
		}
	}
	adviceBytes, err := json.Marshal(adviceEnvelope)
	if err != nil {
		return out, err
	}
	return gamekernel.CompleteAnalysis{CandidateID: id, Registered: registered, Detail: gamekernel.PrivateOutput{Schema: d.PreparedAnalysisSchema, Bytes: detail}, Advice: gamekernel.PrivateOutput{Schema: d.PreparedAdviceSchema, Bytes: adviceBytes}}, ctx.Err()
}

func analyzeSession(o sessionObservation, policyID string) (string, json.RawMessage, error) {
	if policyID != reasoning.PolicyVersion {
		return "", nil, fmt.Errorf("unsupported Hearts policy %q; saved optional policies are read-only", policyID)
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
func registeredSessionAnalysis(o sessionObservation, original d.Analysis) (string, json.RawMessage, error) {
	if original.Action.Kind != "play" && original.Action.Kind != "pass" {
		return "", nil, fmt.Errorf("Hearts policy returned unsupported action")
	}
	id := d.ActionID(original.Action)
	scenarios := []any{}
	for _, scenario := range original.ScenarioIDs {
		scenarios = append(scenarios, map[string]any{"id": scenario, "version": original.PolicyVersion, "applicability": "applies", "evidence": []string{"Original pinned Hearts policy analysis."}, "exceptions": []string{}})
	}
	count := len(observationActions(o))
	score := o.Scores[o.Seat]
	raw, err := json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "hearts", "variantId": "solo", "origin": original.Provenance, "selectedCandidateId": id, "objective": map[string]any{"id": "hearts-low-penalty", "version": "1.0.0", "metric": "penalty-points", "direction": "lower"}, "horizon": map[string]any{"id": "hand", "version": "1.0.0", "scope": "round"}, "facts": []any{map[string]any{"id": "hearts.legal-count", "kind": "exact", "summary": fmt.Sprintf("%d legal actions.", count), "evidence": []string{fmt.Sprintf("legal-count:%d", count)}, "candidateId": nil}, map[string]any{"id": "hearts.own-score", "kind": "exact", "summary": fmt.Sprintf("%d cumulative penalty points.", score), "evidence": []string{fmt.Sprintf("own-score:%d", score)}, "candidateId": nil}}, "estimates": []any{}, "scenarios": scenarios, "assumptions": append([]string{}, original.Limitations...)})
	return id, raw, err
}
