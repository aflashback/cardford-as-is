package coachlab

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"slices"
)

type TrixEvaluationConfig struct {
	Version    string                       `json:"version"`
	DecisionID string                       `json:"decisionId"`
	OriginalID string                       `json:"originalId"`
	Request    trix.RequestEvaluationConfig `json:"request"`
}
type TrixComparisonResult struct {
	Summary       EvaluationRecord             `json:"summary"`
	Configuration TrixEvaluationConfig         `json:"configuration"`
	Result        trix.RequestEvaluationResult `json:"result"`
}

func DefaultTrixEvaluationConfig(decisionID, originalID string) TrixEvaluationConfig {
	return TrixEvaluationConfig{Version: "coach-lab-trix-comparison-1.0.0", DecisionID: decisionID, OriginalID: originalID, Request: trix.DefaultRequestEvaluationConfig()}
}
func (c TrixEvaluationConfig) Validate() error {
	if c.Version != "coach-lab-trix-comparison-1.0.0" {
		return fmt.Errorf("unknown Trix comparison configuration")
	}
	return c.Request.Validate()
}

type trixEvaluationPacket struct {
	PublicSchemaVersion string                       `json:"publicSchemaVersion"`
	GameID              string                       `json:"gameId"`
	VariantID           string                       `json:"variantId"`
	Seat                int                          `json:"seat"`
	Phase               string                       `json:"phase"`
	Observation         trix.Observation             `json:"observation"`
	Candidates          []gamekernel.PublicCandidate `json:"candidates"`
}

func validateTrixObservationPin(variant, version string, observation trix.Observation) (gamekernel.Pin, error) {
	pin, err := trix.PinForPublicSchema(variant, version)
	if err != nil {
		return gamekernel.Pin{}, err
	}
	if observation.VariantID != variant || (version == "1.2.0") != (observation.LayoutHistory != nil) {
		return gamekernel.Pin{}, fmt.Errorf("Trix observation does not match its exact public pin")
	}
	if err = trix.ValidateLayoutHistoryObservation(observation); err != nil {
		return gamekernel.Pin{}, err
	}
	return pin, nil
}

func isTrixEvaluationDecision(d DecisionRecord) bool {
	var p struct {
		GameID string `json:"gameId"`
	}
	return json.Unmarshal(d.ActorPacket, &p) == nil && p.GameID == "trix"
}
func supportsEvaluationDecision(d DecisionRecord, c EvaluationBatchConfig) bool {
	if isTrixEvaluationDecision(d) {
		return c.TrixComparison != nil && slices.Contains([]string{"choose-request", "declare-doubles", "playing", "layout"}, d.Phase)
	}
	o := d.ActorObservation
	return d.Phase == "play" && o.Phase == "play" && (o.Mode == "hearts" || o.Mode == "spades-solo" || o.Mode == "spades-partners")
}
func evaluateTrixDecision(ctx context.Context, d DecisionRecord, c TrixEvaluationConfig) (out TrixComparisonResult, err error) {
	out = TrixComparisonResult{Configuration: c, Summary: EvaluationRecord{SchemaVersion: "coach-lab-evaluation-1.0.0", DecisionID: d.DecisionID, Status: "incomplete", Objective: "paired-actor-request-margin-difference", Horizon: "current-request", Assumptions: []string{"All legal choices share every feasible sampled world; native future actors see only their own observations.", "Partners objective is own-team minus opposing-team score; Solo objective is own score minus the other players' mean score.", "Values are paired differences from the archived original action in residual request-end margin points."}, TestedActions: []string{}, UntestedActions: []string{}, EvidenceRefs: []string{}, Values: []EvaluationValue{}, Limitations: []string{"Lower/upper are observed paired minima/maxima, not confidence intervals.", "Request choice excludes future request-pool opportunity cost; no kingdom/session optimality or playing-strength claim.", "No feedback automation, promotion test or human correctness label is produced."}}}
	if err = c.Validate(); err != nil {
		return out, err
	}
	if c.DecisionID == "" || c.DecisionID != d.DecisionID || c.OriginalID == "" || c.OriginalID != d.SelectedCandidateID {
		return out, fmt.Errorf("Trix comparison original binding mismatch")
	}
	if err = contracts.Validate("RegisteredActorPacket", d.ActorPacket); err != nil {
		return out, err
	}
	var p trixEvaluationPacket
	if err = strict(d.ActorPacket, &p); err != nil {
		return out, err
	}
	if p.GameID != "trix" || p.VariantID != p.Observation.VariantID || p.Seat != d.Actor || p.Seat != p.Observation.Seat || p.Phase != d.Phase || p.Phase != p.Observation.Phase {
		return out, fmt.Errorf("Trix evaluation actor context mismatch")
	}
	pin, pinErr := validateTrixObservationPin(p.VariantID, p.PublicSchemaVersion, p.Observation)
	if pinErr != nil {
		return out, pinErr
	}
	legal := trix.Legal(p.Observation)
	ids := []string{}
	if len(legal) != len(p.Candidates) || len(legal) != len(d.LegalCandidates) {
		return out, fmt.Errorf("Trix evaluation legal coverage mismatch")
	}
	for i, a := range legal {
		id := trix.ActionID(a)
		var packetAction, savedAction trix.Action
		if strict(p.Candidates[i].Public, &packetAction) != nil || strict(d.LegalCandidates[i].Action, &savedAction) != nil || trix.ActionID(packetAction) != id || trix.ActionID(savedAction) != id || p.Candidates[i].ID != id || d.LegalCandidates[i].ID != id {
			return out, fmt.Errorf("Trix evaluation changed legal alternative")
		}
		canonical, _ := json.Marshal(a)
		packetCanonical, _ := json.Marshal(packetAction)
		savedCanonical, _ := json.Marshal(savedAction)
		if string(canonical) != string(packetCanonical) || string(canonical) != string(savedCanonical) {
			return out, fmt.Errorf("Trix evaluation action payload mismatch")
		}
		ids = append(ids, id)
	}
	original := slices.Index(ids, c.OriginalID)
	if original < 0 {
		return out, fmt.Errorf("Trix original action absent from legal set")
	}
	out.Summary.UntestedActions = append([]string{}, ids...)
	out.Result, err = trix.EvaluateRequest(ctx, p.Observation, pin, c.Request)
	out.Summary.Limitations = append(out.Summary.Limitations, out.Result.Limitations...)
	if err != nil {
		return out, err
	}
	if out.Result.Status != "completed" || len(out.Result.Values) != c.Request.Worlds {
		return out, nil
	}
	out.Summary.Status = "completed"
	out.Summary.TestedActions = append([]string{}, ids...)
	out.Summary.UntestedActions = []string{}
	out.Summary.EvidenceRefs = []string{"actor-observation:" + out.Result.InputDigest}
	for j, id := range ids {
		mean, low, high := 0.0, math.Inf(1), math.Inf(-1)
		for _, row := range out.Result.Values {
			delta := row[j] - row[original]
			mean += delta
			low = math.Min(low, delta)
			high = math.Max(high, delta)
		}
		out.Summary.Values = append(out.Summary.Values, EvaluationValue{ActionID: id, Value: mean / float64(len(out.Result.Values)), Lower: low, Upper: high, Worlds: len(out.Result.Values)})
	}
	return out, nil
}
func analyzePreparedTrix(ctx context.Context, d DecisionRecord, options EvidenceOptions) (DecisionEvidence, error) {
	out := DecisionEvidence{SchemaVersion: "coach-lab-decision-evidence-1.0.0", DecisionID: d.DecisionID, Status: "unsupported", Limitations: []string{"Offline evidence cannot replace original saved actions or establish stronger play."}}
	if options.TrixComparison == nil {
		out.Limitations = append(out.Limitations, "This configuration has no Trix request comparison profile.")
		return out, nil
	}
	result, e := evaluateTrixDecision(ctx, d, *options.TrixComparison)
	out.TrixComparisonDetails = &result
	out.Evaluation = &result.Summary
	out.Status = "incomplete"
	if e == nil && result.Summary.Status == "completed" {
		out.Status = "completed"
	}
	return out, e
}
