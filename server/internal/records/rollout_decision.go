package records

import (
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/rollout"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"slices"
)

// Optional metadata is executable only under its exact installed profile. The
// historical reader remains available when a different new-game pin is chosen.
func validateActorRolloutMetadata(decision DecisionRecord, a OriginalAnalysisEnvelope) error {
	if decision.Policy.ID != d.ActorRolloutPolicy {
		if a.Rollout != nil {
			return fmt.Errorf("rollout metadata attached to another policy")
		}
		return nil
	}
	m := a.Rollout
	if m == nil {
		return fmt.Errorf("actor rollout policy requires complete private metadata")
	}
	if m.Version != "2.0.0" || m.BindingDigest != decision.InputDigest || m.BudgetVersion != d.ActorRolloutBudgetVersion || decision.Policy.BudgetVersion != m.BudgetVersion || !reflect.DeepEqual(m.Budget, d.ActorRolloutBudget()) || !reflect.DeepEqual(m.Horizon, d.ActorRolloutHorizon()) {
		return fmt.Errorf("actor rollout budget/horizon/input binding mismatch")
	}
	wantComponents := []ComponentVersion{}
	for _, c := range d.ActorRolloutComponents() {
		wantComponents = append(wantComponents, ComponentVersion{ID: c.ID, Version: c.Version})
	}
	if !reflect.DeepEqual(decision.Policy.Components, wantComponents) {
		return fmt.Errorf("actor rollout component tuple mismatch")
	}
	r := m.Result
	b := m.Budget
	if r.SelectedID == nil || *r.SelectedID != decision.SelectedCandidateID || r.ExecutionStatus != "completed" || r.Work.StoppedBy != nil || r.Coverage.Completed != b.MaxWorlds || r.Coverage.Attempted != b.MaxWorlds || r.Coverage.Feasible != b.MaxWorlds || r.Coverage.Excluded != 0 || r.Coverage.Failed != 0 || r.Work.Worlds != b.MaxWorlds {
		return fmt.Errorf("actor rollout requires complete uncancelled paired coverage")
	}
	if r.Work.Steps < 0 || r.Work.Steps > b.MaxSteps || r.Work.SetupOperations < 2 || r.Work.SetupOperations > b.MaxSetupOperations || r.Work.SamplerOperations < b.MaxWorlds || r.Work.SamplerOperations > b.MaxSamplerOperations || r.Work.PeakMemoryBytes < 1 || r.Work.PeakMemoryBytes > b.MaxMemoryBytes {
		return fmt.Errorf("actor rollout counted work exceeds its pinned budget")
	}
	if !validDigest(r.Provenance.PermittedInputDigest) || !reflect.DeepEqual(r.Provenance, d.ActorRolloutProvenance(a.Original.Facts.Mode, r.Provenance.PermittedInputDigest)) {
		return fmt.Errorf("actor rollout provenance pin mismatch")
	}
	if len(r.Coverage.Samples) != b.MaxWorlds || r.Coverage.WeightSum != float64(b.MaxWorlds) || r.Coverage.EffectiveSampleCount != float64(b.MaxWorlds) {
		return fmt.Errorf("actor rollout sampled population mismatch")
	}
	for i, s := range r.Coverage.Samples {
		if s.ID != fmt.Sprintf("world:%d", i) || s.Weight != 1 {
			return fmt.Errorf("actor rollout uniform sample mismatch")
		}
	}
	ids := []string{}
	for _, c := range a.Original.Candidates {
		ids = append(ids, d.ActionID(c.Action))
	}
	if len(ids) > b.MaxCandidates || !slices.Equal(ids, r.ComparableIDs) || len(r.UnsampledIDs) != 0 || len(r.Coverage.Candidates) != len(ids) || len(r.Results) != len(ids) {
		return fmt.Errorf("actor rollout candidate coverage mismatch")
	}
	for i, c := range r.Coverage.Candidates {
		if c.ID != ids[i] || c.Attempted != b.MaxWorlds || c.Completed != b.MaxWorlds {
			return fmt.Errorf("actor rollout candidate pairing mismatch")
		}
	}
	competitors := []string{"seat:0", "seat:1", "seat:2", "seat:3"}
	own := fmt.Sprintf("seat:%d", decision.Actor)
	if a.Original.Facts.Mode == "spades-partners" {
		competitors = []string{"team:0", "team:1"}
		own = fmt.Sprintf("team:%d", decision.Actor%2)
	}
	values := make([]float64, len(ids))
	for i, c := range r.Results {
		if c.CandidateID != ids[i] || c.Kind != "terminal" || c.Evaluator != nil || len(c.Assumptions) != 0 || len(c.Estimates) != len(competitors) {
			return fmt.Errorf("actor rollout terminal result shape mismatch")
		}
		for j, e := range c.Estimates {
			if e.CompetitorID != competitors[j] || e.Metric != "score" || e.Event != "declared-horizon-payoff" || e.Unit != "game-metric" || e.Population != "completed-paired-worlds" || e.Estimator != (rollout.Component{ID: "weighted-paired-mean", Version: "1.0.0"}) || e.Uncertainty != nil || math.IsNaN(e.Value) || math.IsInf(e.Value, 0) {
				return fmt.Errorf("actor rollout estimate semantics mismatch")
			}
			if e.CompetitorID == own {
				values[i] = e.Value
			}
		}
	}
	best := 0
	for i := 1; i < len(values); i++ {
		if a.Original.Facts.Mode == "hearts" && values[i] < values[best] || a.Original.Facts.Mode != "hearts" && values[i] > values[best] {
			best = i
		}
	}
	if len(ids) == 0 || ids[best] != decision.SelectedCandidateID {
		return fmt.Errorf("actor rollout selection differs from declared comparison")
	}
	var public struct {
		Estimates []rollout.Estimate `json:"estimates"`
		Horizon   rollout.Horizon    `json:"horizon"`
		Objective struct {
			ID        string `json:"id"`
			Version   string `json:"version"`
			Metric    string `json:"metric"`
			Direction string `json:"direction"`
		} `json:"objective"`
	}
	if err := json.Unmarshal(a.Registered, &public); err != nil {
		return err
	}
	direction, objective := "higher", "spades-individual-score"
	if a.Original.Facts.Mode == "spades-partners" {
		objective = "spades-partnership-score"
	}
	if a.Original.Facts.Mode == "hearts" {
		direction, objective = "lower", "hearts-low-penalty"
	}
	if !reflect.DeepEqual(public.Estimates, d.ActorRolloutPublicEstimates(a.Original.Facts.Mode, r.Results[best].Estimates)) || public.Horizon != (rollout.Horizon{ID: "card-round", Version: "2.0.0", Scope: "round"}) || public.Objective.ID != objective || public.Objective.Version != "2.0.0" || public.Objective.Metric != "score" || public.Objective.Direction != direction {
		return fmt.Errorf("public rollout estimates/objective differ from saved paired result")
	}
	if len(r.Assumptions) == 0 {
		return fmt.Errorf("actor rollout model assumptions missing")
	}
	for _, s := range r.Assumptions {
		if len(s) == 0 || len(s) > 4000 {
			return fmt.Errorf("invalid actor rollout assumption")
		}
	}
	return nil
}

func (c *DocumentCodec) validateActorRolloutInput(doc Document, s gamekernel.Snapshot, decision DecisionRecord, a OriginalAnalysisEnvelope) error {
	if a.Rollout == nil {
		return nil
	}
	bound, err := c.Session(doc, s)
	if err != nil {
		return err
	}
	raw, err := bound.LegacyObservation(decision.Actor)
	if err != nil {
		return err
	}
	var o d.Observation
	if err = gamekernel.DecodeSessionJSON(raw, &o); err != nil {
		return err
	}
	canonical, err := json.Marshal(o)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(canonical)
	if a.Rollout.Result.Provenance.PermittedInputDigest != hex.EncodeToString(digest[:]) {
		return fmt.Errorf("actor rollout provenance does not match original permitted observation")
	}
	return nil
}
