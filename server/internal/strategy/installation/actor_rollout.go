// Package installation composes optional reasoning policies at trusted startup.
package installation

import (
	"cardford/server/internal/coaching"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/cardcontinuation"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"cardford/server/internal/strategy/rollout"
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"
)

func InstallActorRollout(codec *records.DocumentCodec, selectForNew bool) error {
	if codec == nil {
		return fmt.Errorf("missing document codec")
	}
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		pin := records.OriginalPin(mode)
		selector := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: "2.0.0", RuleProfileID: pin.RuleProfileID}
		policy := actorRolloutPin()
		var execute records.PrepareExecutor = prepareActorRollout
		if codec.IsPolicyInstalled(selector, policy) {
			execute = nil
		}
		if err := codec.ConfigureNewSessionPolicy(selector, policy, execute); err != nil {
			return err
		}
		installed, err := codec.ServiceRegistry().Installation(selector)
		if err != nil {
			return err
		}
		if err := codec.ConfigureExecutionLimits(records.ModulePin(installed.Pin), policy, records.ExecutionLimits{Deadline: 90 * time.Second, Lease: 95 * time.Second}); err != nil {
			return err
		}
		if !selectForNew {
			original, err := records.ServicePolicy(selector)
			if err != nil {
				return err
			}
			if err = codec.ConfigureNewSessionPolicy(selector, original, nil); err != nil {
				return err
			}
		}
	}
	return nil
}

func actorRolloutPin() records.PolicyPin {
	p := records.PolicyPin{ID: d.ActorRolloutPolicy, Version: d.ActorRolloutPolicy, BudgetVersion: d.ActorRolloutBudgetVersion, Components: []records.ComponentVersion{}}
	for _, c := range d.ActorRolloutComponents() {
		p.Components = append(p.Components, records.ComponentVersion{ID: c.ID, Version: c.Version})
	}
	return p
}

// Unavailable retains operational evidence for the worker's failure handling;
// it contains no prepared decision and can never be committed as a fallback.
type Unavailable struct{ Result rollout.PairedResult }

func (e *Unavailable) Error() string {
	return fmt.Sprintf("actor rollout unavailable: %s, %d/%d complete paired worlds", e.Result.ExecutionStatus, e.Result.Coverage.Completed, d.ActorRolloutBudget().MaxWorlds)
}

func prepareActorRollout(ctx context.Context, bound gamekernel.BoundSession, actor int, policyID, decisionID string) (gamekernel.CompletePreparation, error) {
	var out gamekernel.CompletePreparation
	if err := ctx.Err(); err != nil {
		return out, err
	}
	if policyID != d.ActorRolloutPolicy || !gamekernel.ValidSeat(actor) || !gamekernel.ValidIdentifier(decisionID) {
		return out, fmt.Errorf("unsupported actor rollout preparation")
	}
	raw, err := bound.LegacyObservation(actor)
	if err != nil {
		return out, err
	}
	var obs d.Observation
	if err = gamekernel.DecodeSessionJSON(raw, &obs); err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	binding, err := bound.PreparationBinding(actor, policyID)
	if err != nil {
		return out, err
	}
	config := cardcontinuation.DefaultConfig()
	config.AdmissionClass = "live-play"
	if actor == 0 {
		config.AdmissionClass = "coach"
	}
	result, err := cardcontinuation.Evaluate(ctx, obs, config)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	if result.ExecutionStatus != "completed" || result.SelectedID == nil || result.Coverage.Completed != config.Budget.MaxWorlds || !slices.Contains(binding.CandidateIDs, *result.SelectedID) {
		return out, &Unavailable{Result: result}
	}
	analysis, advice, registered, err := rolloutOutputs(obs, result, bound.Pin())
	if err != nil {
		return out, err
	}
	meta := &d.ActorRolloutRecord{Version: "2.0.0", BindingDigest: binding.InputDigest, BudgetVersion: d.ActorRolloutBudgetVersion, Budget: config.Budget, Horizon: config.Horizon, Result: result}
	detail, err := json.Marshal(d.PreparedAnalysisEnvelope{Version: "1.0.0", Registered: registered, Original: analysis, Rollout: meta})
	if err != nil {
		return out, err
	}
	adviceEnvelope := d.PreparedAdviceEnvelope{Version: "1.0.0", Original: advice}
	for i := 0; i < 3; i++ {
		adviceEnvelope.Levels[i], err = coaching.ProjectAdvice(advice, i+1, decisionID)
		if err != nil {
			return out, err
		}
	}
	adviceBytes, err := json.Marshal(adviceEnvelope)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	parsed, err := gamekernel.ParseRegisteredAnalysis(registered, bound.Pin(), *result.SelectedID)
	if err != nil {
		return out, err
	}
	out.Prepared = gamekernel.PreparedDecision{Actor: actor, CandidateID: *result.SelectedID, InputDigest: binding.InputDigest, PolicyID: policyID, ObservationSchemaVersion: bound.Pin().ObservationSchemaVersion, Analysis: parsed}
	out.Detail = gamekernel.PrivateOutput{Schema: d.PreparedAnalysisSchema, Bytes: detail}
	out.Advice = gamekernel.PrivateOutput{Schema: d.PreparedAdviceSchema, Bytes: adviceBytes}
	return out, nil
}

func rolloutOutputs(obs d.Observation, result rollout.PairedResult, pin gamekernel.Pin) (d.Analysis, d.Advice, json.RawMessage, error) {
	var selected d.Action
	found := false
	for _, a := range obs.LegalActions {
		if d.ActionID(a) == *result.SelectedID {
			selected = d.CloneAction(a)
			found = true
			break
		}
	}
	if !found {
		return d.Analysis{}, d.Advice{}, nil, fmt.Errorf("selected rollout candidate is absent")
	}
	source, evidence := "code", "sampled-estimate"
	if len(obs.LegalActions) == 1 {
		source, evidence = "forced", "exact"
	}
	limits := []string{"Experimental comparison of two possible deals using retained actor-scoped replies; strategic improvement and calibrated uncertainty are unproven.", "Each estimate uses the same completed synthetic worlds for every legal candidate; the actual concealed deal is never supplied."}
	text := "This choice had the preferred average score across two completed synthetic continuations. Other deals or replies may favour another move."
	if source == "forced" {
		text = "The rules leave only one legal choice."
	}
	analysis := d.Analysis{SchemaVersion: "1.0.0", PolicyVersion: d.ActorRolloutPolicy, Provenance: source, Action: selected, ScenarioIDs: []string{}, Reasons: []d.Reason{{ID: "actor-rollout.paired-score", Kind: "heuristic", Text: text, ActionIDs: []string{*result.SelectedID}}}, Facts: d.BuildFacts(obs), Candidates: []d.Candidate{}, Limitations: limits, Trace: &d.Trace{SchemaVersion: "1.0.0", PolicyVersion: d.ActorRolloutPolicy, CatalogVersion: d.ActorRolloutCatalog, SelectedActionID: *result.SelectedID, SelectedBy: "paired-synthetic-worlds", ScenarioChecks: []d.ScenarioCheck{}, Candidates: []d.TraceCandidate{}, Limitations: append([]string{}, limits...)}}
	var selectedEstimates []rollout.Estimate
	for _, r := range result.Results {
		if r.CandidateID == *result.SelectedID {
			selectedEstimates = r.Estimates
		}
	}
	for i, a := range obs.LegalActions {
		disposition := "alternative"
		reasons := []string{}
		if d.ActionID(a) == *result.SelectedID {
			disposition = "selected"
			reasons = []string{"actor-rollout.paired-score"}
		}
		analysis.Candidates = append(analysis.Candidates, d.Candidate{Action: d.CloneAction(a), ReasonIDs: reasons, Disposition: disposition, Evidence: evidence})
		analysis.Trace.Candidates = append(analysis.Trace.Candidates, d.TraceCandidate{ActionID: d.ActionID(a), Effects: []d.Effect{}, TieOrder: i})
	}
	advice := d.Advice{Focus: "Compare possible deals", Notice: "An experimental comparison of two possible deals.", Reason: text, Suggestion: actionSuggestion(selected), Provenance: source, PolicyVersion: d.ActorRolloutPolicy, ReasonIDs: []string{"actor-rollout.paired-score"}, Evidence: evidence, CueVersion: d.Ptr(d.ActorRolloutCueVersion)}
	switch selected.Kind {
	case "play":
		advice.Card = selected.Card
	case "bid":
		advice.Bid = d.Ptr(selected.Bid)
	case "pass":
		advice.Pass = append([]string{}, selected.Cards...)
	}
	if source == "forced" {
		advice.Focus = "One legal choice"
		advice.Notice = "The rules leave one legal choice."
		analysis.Reasons[0].Kind = "fact"
	}
	direction, objective := "higher", "spades-individual-score"
	if obs.Mode == "spades-partners" {
		objective = "spades-partnership-score"
	}
	if obs.Mode == "hearts" {
		direction, objective = "lower", "hearts-low-penalty"
	}
	registered, err := json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": pin.GameID, "variantId": pin.VariantID, "origin": source, "selectedCandidateId": *result.SelectedID, "objective": map[string]any{"id": objective, "version": "2.0.0", "metric": "score", "direction": direction}, "horizon": map[string]any{"id": "card-round", "version": "2.0.0", "scope": "round"}, "facts": []any{map[string]any{"id": "actor-rollout.legal-count", "kind": "exact", "summary": fmt.Sprintf("%d legal actions were compared.", len(obs.LegalActions)), "evidence": []string{fmt.Sprintf("legal-count:%d", len(obs.LegalActions))}, "candidateId": nil}}, "estimates": d.ActorRolloutPublicEstimates(obs.Mode, selectedEstimates), "scenarios": []any{}, "assumptions": limits})
	return analysis, advice, registered, err
}
func actionSuggestion(a d.Action) string {
	switch a.Kind {
	case "bid":
		if a.Bid == 0 {
			return "Bid Nil."
		}
		return fmt.Sprintf("Bid %d.", a.Bid)
	case "play":
		return "Play " + d.CardLabel(a.Card) + "."
	case "pass":
		return "Pass the three highlighted cards."
	}
	return ""
}
