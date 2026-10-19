package cardcontinuation

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"slices"

	sr "cardford/server/internal/games/spades/reasoning"
	b "cardford/server/internal/games/spades/reasoning/beliefs"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/rollout"
)

const OfflineVersion = "card-offline-comparison-1.0.0"
const LowestLegalPolicy = "lowest-legal-research-1.0.0"

type SamplingConfig struct {
	Count  int               `json:"count"`
	Stream string            `json:"stream"`
	Budget rollout.RunBudget `json:"budget"`
}
type SamplingResult struct {
	Status      string             `json:"status"`
	Work        rollout.WorkResult `json:"work"`
	Allocations []b.Allocation     `json:"-"`
}

// ObservationSeeds derives every stream from only the actor packet and explicit
// public configuration. No deal seed, private archive ID, clock or worker enters.
func ObservationSeeds(o d.Observation, config any, stream string) rollout.Seeds {
	raw, _ := json.Marshal(struct {
		Observation   d.Observation
		Configuration any
		Stream        string
	}{o, config, stream})
	hash := sha256.Sum256(raw)
	return rollout.Seeds{World: binary.LittleEndian.Uint32(hash[:4]), Actor: binary.LittleEndian.Uint32(hash[4:8]), Chance: binary.LittleEndian.Uint32(hash[8:12])}
}
func validStream(s string) bool {
	return slices.Contains([]string{"belief", "screening", "confirmation", "sensitivity"}, s)
}

// SampleAllocations returns uniform hard-feasible play allocations in private
// workspace. A stopped collection publishes no partial posterior input.
func SampleAllocations(ctx context.Context, o d.Observation, c SamplingConfig) (out SamplingResult, err error) {
	out.Status = "incomplete"
	if ctx == nil {
		return out, fmt.Errorf("execution context required")
	}
	if !validStream(c.Stream) || c.Count < 1 || c.Count > 4096 || c.Count > c.Budget.MaxWorlds {
		return out, fmt.Errorf("invalid sample count or public stream")
	}
	if o.Phase != "play" {
		return out, fmt.Errorf("allocation sampling requires play")
	}
	if err = d.ValidateObservationContext(ctx, o); err != nil {
		return out, err
	}
	w, e := rollout.NewWork(ctx, c.Budget)
	if e != nil {
		return out, e
	}
	defer func() {
		out.Work = w.Result()
		if err != nil {
			out.Allocations = nil
		}
	}()
	reservation := int64(64<<20) + int64(c.Count)*2048
	if reservation > c.Budget.MaxMemoryBytes {
		return out, fmt.Errorf("sampling memory budget exhausted")
	}
	if err = w.Setup(2); err != nil {
		return out, err
	}
	seeds := ObservationSeeds(o, c, c.Stream)
	for i := 0; i < c.Count; i++ {
		if err = w.Sampler(1); err != nil {
			return out, err
		}
		// Separate deterministic draws; each uses the installed unbiased counter.
		seed := seeds.World + uint32(i)*0x9e3779b9
		var hands [4][]string
		hands, err = samplePlayHands(ctx, w, o, seed)
		if err != nil {
			return out, err
		}
		out.Allocations = append(out.Allocations, b.Allocation{Hands: hands, PriorWeight: 1})
	}
	out.Status = "completed"
	return out, nil
}

type OfflineConfig struct {
	Budget   rollout.RunBudget `json:"budget"`
	Horizon  rollout.Horizon   `json:"horizon"`
	Policies [4]string         `json:"policies"`
	Stream   string            `json:"stream"`
	RootIDs  []string          `json:"rootIds,omitempty"`
	Belief   *b.Config         `json:"belief,omitempty"`
}
type OfflineResult struct {
	Version      string               `json:"version"`
	Paired       rollout.PairedResult `json:"paired"`
	Metric       string               `json:"metric"`
	Unit         string               `json:"unit"`
	CandidateIDs []string             `json:"candidateIds"`
	// Complete shared-world payoff rows (no card ownership or private truth).
	Values  [][]float64 `json:"values"`
	Weights []float64   `json:"weights"`
}

func DefaultOfflineConfig() OfflineConfig {
	c := DefaultConfig()
	return OfflineConfig{Budget: c.Budget, Horizon: c.Horizon, Policies: [4]string{"spades-tactics-2.1.0", "spades-tactics-2.1.0", "spades-tactics-2.1.0", "spades-tactics-2.1.0"}, Stream: "screening"}
}

type offlineReferee struct {
	*referee
	offline OfflineConfig
	payoffs []float64
	metric  string
}

func (r *offlineReferee) MemoryBytes(budget rollout.RunBudget) int64 {
	return r.referee.MemoryBytes(budget) + int64(budget.MaxWorlds)*int64(budget.MaxCandidates+1)*16
}
func (r *offlineReferee) Sample(ctx context.Context, w *rollout.Work, seed uint32) (*rollout.Sample[world], error) {
	v, err := r.referee.Sample(ctx, w, seed)
	if err != nil || v == nil || r.offline.Belief == nil || r.offline.Belief.Mode == "constraint-only" {
		return v, err
	}
	cost := 52 + len(r.input.Events) + (4*len(r.input.History)+len(r.input.Trick))*60
	if err = w.Setup(cost); err != nil {
		return nil, err
	}
	raw, err := v.World.snapshot.Export()
	if err != nil {
		return nil, err
	}
	var state struct{ Hands [4][]string }
	if err = json.Unmarshal(raw, &state); err != nil {
		return nil, err
	}
	history, err := b.HistoryInputs(r.input, state.Hands)
	if err != nil {
		return nil, err
	}
	logWeight, _ := b.LogLikelihood(history, r.input.Seat, *r.offline.Belief)
	v.Weight = math.Exp(logWeight)
	if v.Weight == 0 || math.IsNaN(v.Weight) || math.IsInf(v.Weight, 0) {
		return nil, fmt.Errorf("behavior weight underflow/nonfinite")
	}
	return v, nil
}
func (r *offlineReferee) Reached(v world, h rollout.Horizon) bool {
	if h.Scope == "terminal-match" {
		return v.public.Phase == "match-end"
	}
	return r.referee.Reached(v, h)
}
func (r *offlineReferee) Evaluate(ctx context.Context, w *rollout.Work, v world, h rollout.Horizon) (rollout.Evaluation, error) {
	var e rollout.Evaluation
	var err error
	if h.Scope == "terminal-match" {
		if v.public.Phase != "match-end" || v.public.HandResult == nil || v.public.HandResult.Winner == nil {
			return e, fmt.Errorf("terminal match winner unavailable")
		}
		e = rollout.Evaluation{Kind: "terminal", Values: []rollout.Payoff{}}
		for seat := 0; seat < 4; seat++ {
			if r.input.Mode == "spades-partners" && seat >= 2 {
				continue
			}
			win := 0.0
			if competitor(r.input.Mode, seat) == competitor(r.input.Mode, *v.public.HandResult.Winner) {
				win = 1
			}
			e.Values = append(e.Values, rollout.Payoff{CompetitorID: competitor(r.input.Mode, seat), Metrics: map[string]float64{"match-win": win}})
		}
	} else {
		e, err = r.referee.Evaluate(ctx, w, v, h)
		if err != nil {
			return e, err
		}
	}
	value := 0.0
	for _, p := range e.Values {
		if p.CompetitorID == competitor(r.input.Mode, r.input.Seat) {
			value = p.Metrics[r.metric]
		}
	}
	// Utility convention is larger-is-better. Keep the original raw metrics in
	// Paired; only the explicit score diagnostic utility changes sign for Hearts.
	if r.input.Mode == "hearts" && r.metric == "score" {
		value = -value
	}
	r.payoffs = append(r.payoffs, value)
	return e, w.Check()
}

type offlineComparison struct {
	mode   string
	seat   int
	metric string
}

func (c offlineComparison) Pin() rollout.Component {
	return rollout.Component{ID: "offline-actor-" + c.metric, Version: "1.0.0"}
}
func (c offlineComparison) Compare(a, z []rollout.Estimate) int {
	value := func(es []rollout.Estimate) float64 {
		for _, e := range es {
			if e.CompetitorID == competitor(c.mode, c.seat) && e.Metric == c.metric {
				return e.Value
			}
		}
		return 0
	}
	left, right := value(a), value(z)
	if left == right {
		return 0
	}
	if (left > right) != (c.mode == "hearts" && c.metric == "score") {
		return -1
	}
	return 1
}

type pinnedPolicy struct{ id string }

func (p pinnedPolicy) Choose(ctx context.Context, w *rollout.Work, in rollout.ActorInput[d.Observation, d.Action], memory rollout.ActorMemory, seed uint32) (rollout.Choice, error) {
	if p.id == "spades-tactics-2.1.0" || p.id == "hearts-baseline-1.0.0" {
		return actorPolicy{}.Choose(ctx, w, in, memory, seed)
	}
	if err := w.Setup(1); err != nil {
		return rollout.Choice{}, err
	}
	var id string
	if p.id == LowestLegalPolicy {
		id = in.Candidates[0].ID
	} else {
		a, err := sr.AnalyzePartnerResourcesContext(ctx, in.Observation)
		if err != nil {
			return rollout.Choice{}, err
		}
		id = d.ActionID(a.Action)
	}
	m, err := observationMemory(in.Observation)
	return rollout.Choice{CandidateID: id, Memory: m}, err
}

// EvaluateOffline is additive. Installed Evaluate and its defaults are untouched.
// Only completed common-world rows are exposed; cancellation never recommends a
// best-so-far action. The caller must separately evaluate strategic robustness.
func EvaluateOffline(ctx context.Context, o d.Observation, c OfflineConfig) (out OfflineResult, err error) {
	out = OfflineResult{Version: OfflineVersion, Metric: "score", Unit: "score-points", Values: [][]float64{}, Weights: []float64{}, CandidateIDs: []string{}}
	if ctx == nil {
		return out, fmt.Errorf("execution context required")
	}
	if !validStream(c.Stream) || !slices.Contains([]string{"hearts", "spades-solo", "spades-partners"}, o.Mode) {
		return out, fmt.Errorf("unsupported offline stream/mode")
	}
	terminal := c.Horizon == (rollout.Horizon{ID: "terminal-match", Version: "1.0.0", Scope: "terminal-match"})
	if !terminal && (c.Horizon.ID != "card-round" || c.Horizon.Version != "2.0.0" || !slices.Contains([]string{"current-round", "two-rounds", "match-cutoff-two-rounds"}, c.Horizon.Scope)) {
		return out, fmt.Errorf("unsupported offline horizon")
	}
	if terminal {
		out.Metric = "match-win"
		out.Unit = "match-win-fraction"
	}
	policies := map[int]rollout.ActorPolicy[d.Observation, d.Action]{}
	for seat, id := range c.Policies {
		valid := id == LowestLegalPolicy || (o.Mode != "hearts" && id == "spades-tactics-2.1.0") || (o.Mode == "spades-partners" && id == sr.PartnerResourcePolicy) || (o.Mode == "hearts" && id == "hearts-baseline-1.0.0")
		if !valid {
			return out, fmt.Errorf("unsupported continuation pin %q for %s", id, o.Mode)
		}
		policies[seat] = pinnedPolicy{id}
	}
	if c.Belief != nil {
		if err = c.Belief.Validate(); err != nil {
			return out, err
		}
		if o.Mode == "hearts" || o.Phase != "play" {
			return out, fmt.Errorf("behavioral belief adapter requires Spades play")
		}
	}
	if err = d.ValidateObservationContext(ctx, o); err != nil {
		if ctx.Err() != nil {
			out.Paired.ExecutionStatus = "cancelled"
			if ctx.Err() == context.DeadlineExceeded {
				out.Paired.ExecutionStatus = "deadline"
			}
			return out, nil
		}
		return out, err
	}
	if len(o.Events) > 32768 || len(o.LegalActions) == 0 {
		return out, fmt.Errorf("unsupported offline packet size/legal set")
	}
	legal := []string{}
	for _, a := range o.LegalActions {
		legal = append(legal, d.ActionID(a))
	}
	ids := c.RootIDs
	if len(ids) == 0 {
		ids = legal
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] || !slices.Contains(legal, id) {
			return out, fmt.Errorf("invalid root alternative")
		}
		seen[id] = true
	}
	out.CandidateIDs = append([]string{}, ids...)
	seeds := ObservationSeeds(o, c, c.Stream)
	base := &referee{input: o, config: Config{Budget: c.Budget, Seeds: seeds, Horizon: c.Horizon, AdmissionClass: "offline"}}
	r := &offlineReferee{referee: base, offline: c, metric: out.Metric}
	provenance := base.Components()
	comparator := offlineComparison{o.Mode, o.Seat, out.Metric}
	provenance.Comparator = comparator.Pin()
	provenance.Horizon = rollout.Component{ID: c.Horizon.ID, Version: c.Horizon.Version}
	provenance.Continuation = rollout.Component{ID: "offline-seat-pins:" + digest(c.Policies), Version: "1.0.0"}
	if terminal {
		provenance.Objective = rollout.Component{ID: o.Mode + "-terminal-win", Version: "1.0.0"}
		provenance.CutoffEvaluator = nil
	}
	if c.Belief != nil {
		provenance.Belief = rollout.Component{ID: c.Belief.Mode + ":" + digest(*c.Belief), Version: b.Version}
	}
	base.provenance = &provenance
	out.Paired, err = rollout.RunPaired(r, policies, c.Horizon, rollout.Root{Seat: o.Seat, CandidateIDs: ids}, c.Budget, comparator, provenance, rollout.ExecutionContext{Context: ctx, AdmissionClass: "offline"})
	if out.Paired.ExecutionStatus != "completed" || err != nil {
		out.Paired.SelectedID = nil
	}
	for i := 0; i < out.Paired.Coverage.Completed; i++ {
		start := i * len(ids)
		out.Values = append(out.Values, append([]float64{}, r.payoffs[start:start+len(ids)]...))
		out.Weights = append(out.Weights, out.Paired.Coverage.Samples[i].Weight)
	}
	out.Paired.Assumptions = append(out.Paired.Assumptions, "Offline fixed deterministic continuation pins; low-legal research policy is a sensitivity control, not independently established expertise.")
	return out, err
}
