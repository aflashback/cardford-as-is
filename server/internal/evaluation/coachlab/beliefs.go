package coachlab

import (
	"cardford/server/internal/games/cardcontinuation"
	b "cardford/server/internal/games/spades/reasoning/beliefs"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/rollout"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type BeliefConfig struct {
	Model    b.Config                        `json:"model"`
	Sampling cardcontinuation.SamplingConfig `json:"sampling"`
}
type InferenceEstimate struct {
	Event string  `json:"event"`
	Value float64 `json:"value"`
	Kind  string  `json:"kind"`
}

// InferenceRecord is the allowlisted judge projection. Synthetic allocations,
// private calibration truth and private run identity are absent by construction.
type InferenceRecord struct {
	SchemaVersion     string              `json:"schemaVersion"`
	DecisionID        string              `json:"decisionId"`
	Status            string              `json:"status"`
	AssumptionVersion string              `json:"assumptionVersion"`
	Work              int                 `json:"work"`
	EvidenceRefs      []string            `json:"evidenceRefs"`
	Estimates         []InferenceEstimate `json:"estimates"`
	Limitations       []string            `json:"limitations"`
}
type BeliefRecord struct {
	Result         b.Result           `json:"result"`
	SamplingStatus string             `json:"samplingStatus"`
	SamplingWork   rollout.WorkResult `json:"samplingWork"`
}

func DefaultBeliefConfig() BeliefConfig {
	budget := d.ActorRolloutBudget()
	budget.MaxWorlds = 32
	budget.MaxSamplerOperations = 2000000
	return BeliefConfig{Model: b.DefaultConfig(), Sampling: cardcontinuation.SamplingConfig{Count: 32, Stream: "belief", Budget: budget}}
}
func BuildBeliefs(ctx context.Context, o d.Observation, c BeliefConfig) (BeliefRecord, error) {
	var out BeliefRecord
	if err := c.Model.Validate(); err != nil {
		return out, err
	}
	samples, err := cardcontinuation.SampleAllocations(ctx, o, c.Sampling)
	out.SamplingStatus = samples.Status
	out.SamplingWork = samples.Work
	if err != nil {
		out.Result.Status = "incomplete"
		return out, err
	}
	out.Result, err = b.AnalyzeAllocations(ctx, o, samples.Allocations, c.Model)
	return out, err
}
func (r BeliefRecord) Inference(decisionID string) InferenceRecord {
	v := r.Result
	out := InferenceRecord{SchemaVersion: "coach-lab-inference-1.0.0", DecisionID: decisionID, Status: "insufficient", AssumptionVersion: b.Version, Work: v.Operations + r.SamplingWork.SetupOperations + r.SamplingWork.SamplerOperations, EvidenceRefs: append([]string{}, v.EvidenceIDs...), Estimates: []InferenceEstimate{}, Limitations: append([]string{}, v.Limitations...)}
	if v.Status == "completed" && r.SamplingStatus == "completed" {
		out.Status = "supported"
	}
	// "supported" describes the completed conditional arithmetic, never a
	// validated behavioral convention or a proven preferred action.
	out.Limitations = append(out.Limitations, fmt.Sprintf("Conditional sample ESS %.3f over %d proposals; supported means arithmetic/support completed, not calibrated beliefs.", v.EffectiveSamples, v.Allocations))
	for _, m := range v.Cards {
		kind := "conditional"
		if m.Status == "known-own" {
			kind = "exact"
		}
		for seat, p := range m.Probability {
			out.Estimates = append(out.Estimates, InferenceEstimate{Event: fmt.Sprintf("card:%s/seat:%d", m.Card, seat), Value: p, Kind: kind})
		}
	}
	for _, m := range v.Suits {
		kind := "conditional"
		if m.Status == "known-own" {
			kind = "exact"
		}
		for count, p := range m.CountProbability {
			out.Estimates = append(out.Estimates, InferenceEstimate{Event: fmt.Sprintf("suit:%s/seat:%d/count:%d", m.Suit, m.Seat, count), Value: p, Kind: kind})
		}
	}
	return out
}

type EvidenceOptions struct {
	Beliefs        *BeliefConfig         `json:"beliefs,omitempty"`
	Comparison     *EvaluationConfig     `json:"comparison,omitempty"`
	TrixComparison *TrixEvaluationConfig `json:"trixComparison,omitempty"`
}
type DecisionEvidence struct {
	SchemaVersion         string                `json:"schemaVersion"`
	DecisionID            string                `json:"decisionId"`
	Status                string                `json:"status"`
	Inference             *InferenceRecord      `json:"inference,omitempty"`
	Evaluation            *EvaluationRecord     `json:"evaluation,omitempty"`
	BeliefDetails         *BeliefRecord         `json:"beliefDetails,omitempty"`
	ComparisonDetails     *ComparisonResult     `json:"comparisonDetails,omitempty"`
	TrixComparisonDetails *TrixComparisonResult `json:"trixComparisonDetails,omitempty"`
	Limitations           []string              `json:"limitations"`
}

// AnalyzePreparedDecision is the post-archive runner boundary. ReplayVisit
// reconstructs ActorObservation from the original preparation's verified native
// state; the analysis receives neither that private state nor its chance seed.
// Failure cannot alter the already committed original action or coach message.
func AnalyzePreparedDecision(ctx context.Context, decision DecisionRecord, options EvidenceOptions) (out DecisionEvidence, err error) {
	if isTrixEvaluationDecision(decision) {
		return analyzePreparedTrix(ctx, decision, options)
	}
	out = DecisionEvidence{SchemaVersion: "coach-lab-decision-evidence-1.0.0", DecisionID: decision.DecisionID, Status: "unsupported", Limitations: []string{"Offline evidence cannot replace the original saved recommendation or establish stronger play."}}
	o := decision.ActorObservation
	if decision.Phase != "play" || o.Phase != "play" || (o.Mode != "hearts" && o.Mode != "spades-solo" && o.Mode != "spades-partners") {
		out.Limitations = append(out.Limitations, "Only reconstructed Hearts/Spades play observations are supported by this evidence adapter.")
		return out, nil
	}
	if decision.DecisionID == "" || decision.SelectedCandidateID == "" {
		return out, fmt.Errorf("original decision identity required")
	}
	if err = d.ValidateObservationContext(ctx, o); err != nil {
		return out, err
	}
	out.Status = "completed"
	if options.Beliefs != nil {
		if o.Mode == "hearts" {
			out.Limitations = append(out.Limitations, "Spades behavioral inference does not apply to Hearts.")
		} else {
			value, e := BuildBeliefs(ctx, o, *options.Beliefs)
			out.BeliefDetails = &value
			summary := value.Inference(decision.DecisionID)
			out.Inference = &summary
			if e != nil {
				out.Status = "incomplete"
				return out, e
			}
			if value.Result.Status != "completed" {
				out.Status = "incomplete"
			}
		}
	}
	if options.Comparison != nil {
		c := *options.Comparison
		if c.DecisionID != decision.DecisionID || c.OriginalID != decision.SelectedCandidateID {
			return out, fmt.Errorf("comparison original binding mismatch")
		}
		value, e := EvaluateOffline(ctx, o, c)
		out.ComparisonDetails = &value
		out.Evaluation = &value.Summary
		if e != nil {
			out.Status = "incomplete"
			return out, e
		}
		if value.Summary.Status != "completed" {
			out.Status = "incomplete"
		}
	}
	return out, nil
}

type EvaluationBatchConfig struct {
	SchemaVersion  string                `json:"schemaVersion"`
	Beliefs        *BeliefConfig         `json:"beliefs,omitempty"`
	Comparison     EvaluationConfig      `json:"comparison"`
	TrixComparison *TrixEvaluationConfig `json:"trixComparison,omitempty"`
	MaxWallMS      int                   `json:"maxWallMs"`
	MaxDecisionMS  int                   `json:"maxDecisionMs"`
}
type EvaluationDecisionStatus struct {
	DecisionID     string `json:"decisionId"`
	Status         string `json:"status"`
	EvidencePath   string `json:"evidencePath,omitempty"`
	EvidenceDigest string `json:"evidenceDigest,omitempty"`
}
type EvaluationBatchReceipt struct {
	SchemaVersion     string                     `json:"schemaVersion"`
	Status            string                     `json:"status"`
	ManifestHash      string                     `json:"manifestHash"`
	ConfigurationHash string                     `json:"configurationHash"`
	Configuration     EvaluationBatchConfig      `json:"configuration"`
	TotalDecisions    int                        `json:"totalDecisions"`
	Unsupported       int                        `json:"unsupported"`
	Pending           int                        `json:"pending"`
	Stored            int                        `json:"stored"`
	Completed         int                        `json:"completed"`
	Insufficient      int                        `json:"insufficient"`
	AttemptedNew      int                        `json:"attemptedNew"`
	ExistingVerified  int                        `json:"existingVerified"`
	Decisions         []EvaluationDecisionStatus `json:"decisions"`
	Limitations       []string                   `json:"limitations"`
}
type savedDecisionEvidence struct {
	SchemaVersion     string           `json:"schemaVersion"`
	ManifestHash      string           `json:"manifestHash"`
	ConfigurationHash string           `json:"configurationHash"`
	InputDigest       string           `json:"inputDigest"`
	PayloadDigest     string           `json:"payloadDigest"`
	Evidence          DecisionEvidence `json:"evidence"`
}

func DefaultEvaluationBatchConfig() EvaluationBatchConfig {
	bc := DefaultBeliefConfig()
	bc.Sampling.Count = 2
	bc.Sampling.Budget.MaxWorlds = 2
	comparison := DefaultEvaluationConfig("", "")
	comparison.Screening.Budget.MaxWorlds = 2
	comparison.ConfirmationBudget.MaxWorlds = 2
	return EvaluationBatchConfig{SchemaVersion: "coach-lab-evaluation-batch-1.0.0", Beliefs: &bc, Comparison: comparison, MaxWallMS: 1140000, MaxDecisionMS: 30000}
}
func DecodeEvaluationBatch(data []byte) (EvaluationBatchConfig, error) {
	var c EvaluationBatchConfig
	if len(data) > 65536 {
		return c, fmt.Errorf("evaluation config exceeds bound")
	}
	if err := strict(data, &c); err != nil {
		return c, err
	}
	return c, c.Validate()
}
func (c EvaluationBatchConfig) Validate() error {
	if c.TrixComparison != nil {
		if c.TrixComparison.DecisionID != "" || c.TrixComparison.OriginalID != "" {
			return fmt.Errorf("Trix batch comparison requires empty decision template bindings")
		}
		if err := c.TrixComparison.Validate(); err != nil {
			return err
		}
	}
	if c.SchemaVersion != "coach-lab-evaluation-batch-1.0.0" || c.MaxWallMS < 1 || c.MaxWallMS > 1200000 || c.MaxDecisionMS < 1 || c.MaxDecisionMS > 30000 || c.Comparison.DecisionID != "" || c.Comparison.OriginalID != "" {
		return fmt.Errorf("invalid evaluation batch identity/caps")
	}
	v := c.Comparison
	if v.Version != "coach-lab-comparison-1.0.0" || v.Screening.Stream != "screening" || len(v.Screening.RootIDs) != 0 || v.MaxAlternatives < 1 || v.MaxAlternatives > 3 || v.Alpha <= 0 || v.Alpha >= 1 || v.PracticalEffect < 0 {
		return fmt.Errorf("invalid frozen comparison template")
	}
	validBudget := func(w rollout.RunBudget) bool {
		return w.MaxWorlds >= 1 && w.MaxWorlds <= 4096 && w.MaxSteps >= 1 && w.MaxSteps <= 10000000 && w.MaxCandidates >= 1 && w.MaxCandidates <= 286 && w.MaxMemoryBytes >= 64<<20 && w.MaxMemoryBytes <= 256<<20 && w.MaxSamplerOperations >= 1 && w.MaxSamplerOperations <= 16000000 && w.MaxSetupOperations >= 1 && w.MaxSetupOperations <= 16000000
	}
	if !validBudget(v.Screening.Budget) || !validBudget(v.ConfirmationBudget) || v.ConfirmationBudget.MaxWorlds < 2 {
		return fmt.Errorf("unsupported comparison work profile")
	}
	for _, id := range v.Screening.Policies {
		if !contains([]string{"spades-tactics-2.1.0", "spades-partner-resource-5.0.0", "hearts-baseline-1.0.0", cardcontinuation.LowestLegalPolicy}, id) {
			return fmt.Errorf("unknown offline continuation pin")
		}
	}
	h := v.Screening.Horizon
	terminal := h == (rollout.Horizon{ID: "terminal-match", Version: "1.0.0", Scope: "terminal-match"})
	if !terminal && (h.ID != "card-round" || h.Version != "2.0.0" || !contains([]string{"current-round", "two-rounds", "match-cutoff-two-rounds"}, h.Scope)) {
		return fmt.Errorf("unknown horizon pin")
	}
	unit := "score-points"
	if terminal {
		unit = "match-win-fraction"
	}
	if v.EffectUnit != unit {
		return fmt.Errorf("wrong practical effect unit")
	}
	if v.Screening.Belief != nil {
		if err := v.Screening.Belief.Validate(); err != nil {
			return err
		}
	}
	if c.Beliefs != nil {
		if err := c.Beliefs.Model.Validate(); err != nil {
			return err
		}
		s := c.Beliefs.Sampling
		if s.Stream != "belief" || s.Count < 1 || s.Count > s.Budget.MaxWorlds || !validBudget(s.Budget) {
			return fmt.Errorf("invalid belief proposal work")
		}
	}
	return nil
}

// EvaluateArchive is a separate post-run batch, never a selector hook. It first
// verifies the complete native journal, then visits the frozen actor packets.
// maxNew bounds NEW attempts in this invocation; verified stored records do not
// consume that limit. Every other original decision remains in the denominator.
func EvaluateArchive(ctx context.Context, e RunEnvelope, j *Journal, c EvaluationBatchConfig, maxNew int) (out EvaluationBatchReceipt, err error) {
	if ctx == nil || j == nil || j.closed || maxNew < 1 || maxNew > 128 {
		return out, fmt.Errorf("open verified journal and bounded batch required")
	}
	if err = c.Validate(); err != nil {
		return out, err
	}
	batchCtx, cancel := context.WithTimeout(ctx, time.Duration(c.MaxWallMS)*time.Millisecond)
	defer cancel()
	entries := j.Entries()
	closed := false
	for _, entry := range entries {
		if entry.Kind == "run-receipt" {
			closed = true
		}
	}
	if !closed {
		return out, fmt.Errorf("evaluation requires a closed collector receipt")
	}
	inventory := []EvaluationDecisionStatus{}
	inventoryIDs := map[string]bool{}
	if _, err = ReplayVisitContext(batchCtx, e, entries, func(decision DecisionRecord) error {
		if inventoryIDs[decision.DecisionID] {
			return fmt.Errorf("duplicate archived decision ID")
		}
		inventoryIDs[decision.DecisionID] = true
		row := EvaluationDecisionStatus{DecisionID: decision.DecisionID, Status: "pending"}
		if !supportsEvaluationDecision(decision, c) {
			row.Status = "unsupported"
		}
		inventory = append(inventory, row)
		return nil
	}); err != nil {
		return out, err
	}
	configBytes, _ := json.Marshal(c)
	configHash := Digest(configBytes)
	manifestHash := e.ManifestHash()
	out = EvaluationBatchReceipt{SchemaVersion: "coach-lab-evaluation-batch-receipt-1.0.0", Status: "partial", ManifestHash: manifestHash, ConfigurationHash: configHash, Configuration: c, Decisions: []EvaluationDecisionStatus{}, Limitations: []string{"Mechanical offline diagnostics only; a two-world smoke batch is not statistical proof.", "All original decisions remain listed; pending and unsupported decisions are not silently dropped.", "Original match incompleteness and missing independent human judgments are unchanged by this analysis.", "A timeout writes no recommendation or completed sidecar; the same fixed work may be retried later."}}
	directory := filepath.Join("evaluations", configHash)
	seen := map[string]bool{}
	_, err = ReplayVisitContext(batchCtx, e, entries, func(decision DecisionRecord) error {
		if seen[decision.DecisionID] {
			return fmt.Errorf("duplicate decision in archive")
		}
		seen[decision.DecisionID] = true
		out.TotalDecisions++
		row := EvaluationDecisionStatus{DecisionID: decision.DecisionID, Status: "pending"}
		if !supportsEvaluationDecision(decision, c) {
			row.Status = "unsupported"
			out.Unsupported++
			out.Decisions = append(out.Decisions, row)
			return nil
		}
		// Hash the opaque ID for a filesystem component; never use caller text as a
		// path. The original reference is preserved inside the signed-content record.
		relative := filepath.Join(directory, Digest([]byte(decision.DecisionID))+".json")
		target := filepath.Join(j.dir, relative)
		raw, readErr := os.ReadFile(target)
		if readErr == nil {
			var saved savedDecisionEvidence
			if er := strict(raw, &saved); er != nil {
				return fmt.Errorf("invalid immutable evidence: %w", er)
			}
			payload, _ := json.Marshal(saved.Evidence)
			if saved.SchemaVersion != "coach-lab-saved-evidence-1.0.0" || saved.ManifestHash != manifestHash || saved.ConfigurationHash != configHash || saved.InputDigest != decision.InputDigest || saved.PayloadDigest != Digest(payload) || saved.Evidence.DecisionID != decision.DecisionID {
				return fmt.Errorf("immutable evidence identity/digest mismatch")
			}
			out.ExistingVerified++
			out.Stored++
			row.Status = saved.Evidence.Status
			row.EvidencePath = filepath.ToSlash(relative)
			row.EvidenceDigest = Digest(raw)
			if row.Status == "completed" {
				out.Completed++
			} else {
				out.Insufficient++
			}
			out.Decisions = append(out.Decisions, row)
			return nil
		}
		if !os.IsNotExist(readErr) {
			return readErr
		}
		if out.AttemptedNew >= maxNew || batchCtx.Err() != nil {
			out.Pending++
			out.Decisions = append(out.Decisions, row)
			return nil
		}
		out.AttemptedNew++
		config := c.Comparison
		config.DecisionID = decision.DecisionID
		config.OriginalID = decision.SelectedCandidateID
		options := EvidenceOptions{Beliefs: c.Beliefs, Comparison: &config}
		if c.TrixComparison != nil {
			tc := *c.TrixComparison
			tc.DecisionID = decision.DecisionID
			tc.OriginalID = decision.SelectedCandidateID
			options.TrixComparison = &tc
		}
		callCtx, stop := context.WithTimeout(batchCtx, time.Duration(c.MaxDecisionMS)*time.Millisecond)
		evidence, analysisErr := AnalyzePreparedDecision(callCtx, decision, options)
		timedOut := callCtx.Err() != nil
		stop()
		if timedOut || errors.Is(analysisErr, context.DeadlineExceeded) || errors.Is(analysisErr, context.Canceled) {
			out.Pending++
			row.Status = "pending-timeout"
			out.Decisions = append(out.Decisions, row)
			return nil
		}
		if analysisErr != nil {
			out.Pending++
			row.Status = "pending-analysis-error"
			out.Decisions = append(out.Decisions, row)
			return nil
		}
		payload, _ := json.Marshal(evidence)
		saved := savedDecisionEvidence{SchemaVersion: "coach-lab-saved-evidence-1.0.0", ManifestHash: manifestHash, ConfigurationHash: configHash, InputDigest: decision.InputDigest, PayloadDigest: Digest(payload), Evidence: evidence}
		raw, marshalErr := json.Marshal(saved)
		if marshalErr != nil {
			return marshalErr
		}
		fileBytes := append(raw, '\n')
		if er := writeEvidenceOnce(target, fileBytes); er != nil {
			return er
		}
		out.Stored++
		row.Status = evidence.Status
		row.EvidencePath = filepath.ToSlash(relative)
		row.EvidenceDigest = Digest(fileBytes)
		if row.Status == "completed" {
			out.Completed++
		} else {
			out.Insufficient++
		}
		out.Decisions = append(out.Decisions, row)
		return nil
	})
	if err != nil && batchCtx.Err() != nil {
		// The full source was already verified before any analysis. A later
		// deadline stops native replay, but not accounting for the remaining
		// original records. This final bounded scan of already verified IDs
		// performs no decoding, game or model work.
		for _, row := range inventory {
			if seen[row.DecisionID] {
				continue
			}
			seen[row.DecisionID] = true
			out.TotalDecisions++
			if row.Status == "unsupported" {
				out.Unsupported++
			} else {
				out.Pending++
			}
			out.Decisions = append(out.Decisions, row)
		}
		err = nil
	}
	if err != nil {
		return out, err
	}
	if out.Pending == 0 {
		out.Status = "processed"
	}
	if batchCtx.Err() != nil {
		out.Status = "incomplete"
	}
	raw, _ := json.Marshal(out)
	receiptPath := filepath.Join(j.dir, directory, "batches", Digest(raw)+".json")
	if err = writeEvidenceOnce(receiptPath, append(raw, '\n')); err != nil {
		return out, err
	}
	return out, nil
}
func writeEvidenceOnce(target string, data []byte) error {
	if old, err := os.ReadFile(target); err == nil {
		if string(old) == string(data) {
			return nil
		}
		return fmt.Errorf("immutable evidence already exists with different bytes")
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(target), ".pending-evidence-")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	// The archive's existing exclusive owner lock serializes publication.
	return os.Rename(name, target)
}
