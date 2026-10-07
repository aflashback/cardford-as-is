package rollout

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"reflect"
	"slices"
	"sort"
)

func actorSeed(seed uint32, seat int, information string) uint32 {
	h := fnv.New32a()
	var b [8]byte
	binary.LittleEndian.PutUint32(b[:4], seed)
	binary.LittleEndian.PutUint32(b[4:], uint32(seat))
	h.Write(b[:])
	h.Write([]byte(information))
	return h.Sum32()
}
func streamSeed(seed uint32, index int) uint32 { return actorSeed(seed, index, "synthetic-chance-v1") }
func validComponent(c Component) bool          { return c.ID != "" && c.Version != "" }

// RunPaired never accepts the authoritative deal. The referee's only source of
// concealed values is its sampled permitted-input model.
func RunPaired[W, O, C any](r Referee[W, O, C], policies map[int]ActorPolicy[O, C], h Horizon, root Root, b RunBudget, comparison Comparison, provenance RunProvenance, execution ExecutionContext) (out PairedResult, err error) {
	out = PairedResult{ComparableIDs: []string{}, UnsampledIDs: append([]string{}, root.CandidateIDs...), Provenance: provenance, ExecutionStatus: "completed", Results: []CandidateEstimate{}, Assumptions: []string{"Estimates condition on complete paired worlds and the declared synthetic-world model; no strategy-strength or calibrated uncertainty claim."}, Coverage: Coverage{Samples: []SampleCoverage{}, Candidates: []CandidateCoverage{}}}
	ctx := execution.Context
	if ctx == nil {
		return out, fmt.Errorf("execution context required")
	}
	if !slices.Contains([]string{"offline", "live-play", "coach", "review"}, execution.AdmissionClass) {
		return out, fmt.Errorf("invalid admission class")
	}
	if _, ok := ctx.Deadline(); !ok && execution.AdmissionClass != "offline" {
		return out, fmt.Errorf("online planning requires a deadline")
	}
	if root.Seat < 0 || root.Seat > 3 || len(root.CandidateIDs) == 0 || h.ID == "" || h.Version == "" || h.Scope == "" {
		return out, fmt.Errorf("invalid root or horizon")
	}
	seen := map[string]bool{}
	for _, id := range root.CandidateIDs {
		if id == "" || seen[id] {
			return out, fmt.Errorf("duplicate or empty root candidate")
		}
		seen[id] = true
		out.Coverage.Candidates = append(out.Coverage.Candidates, CandidateCoverage{ID: id})
	}
	if b.MaxWorlds < 0 || b.MaxSteps < 0 || b.MaxCandidates < 0 || b.MaxMemoryBytes < 0 || b.MaxSamplerOperations < 0 || b.MaxSetupOperations < 0 {
		return out, fmt.Errorf("negative work cap")
	}
	installed := r.Components()
	installed.Seeds = provenance.Seeds
	if !reflect.DeepEqual(installed, provenance) || comparison.Pin() != provenance.Comparator || provenance.Horizon != (Component{h.ID, h.Version}) || provenance.PermittedInputDigest == "" {
		return out, fmt.Errorf("run provenance does not match installed components")
	}
	for _, c := range []Component{provenance.Sampler, provenance.Prior, provenance.Constraints, provenance.Belief, provenance.Continuation, provenance.Objective, provenance.Horizon, provenance.Comparator} {
		if !validComponent(c) {
			return out, fmt.Errorf("missing component pin")
		}
	}
	w := &Work{ctx: ctx, budget: b}
	defer func() {
		out.Work = w.result
		out.Coverage.Excluded = out.Coverage.Attempted - out.Coverage.Completed
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				err = w.Check()
			}
			var s *stopError
			if errors.As(err, &s) {
				out.ExecutionStatus = s.status
				if s.cap != "" {
					cap := s.cap
					out.Work.StoppedBy = &cap
				}
				err = nil
			} else {
				out.SelectedID = nil
			}
		}
	}()
	if err = w.Check(); err != nil {
		return out, err
	}
	if len(root.CandidateIDs) > b.MaxCandidates {
		return out, &stopError{"budget-exhausted", "maxCandidates"}
	}
	if err = w.Setup(1); err != nil {
		return out, err
	}
	reservation := r.MemoryBytes(b)
	if reservation < 1 {
		return out, fmt.Errorf("referee must declare a positive workspace bound")
	}
	if reservation > b.MaxMemoryBytes {
		return out, &stopError{"budget-exhausted", "maxMemoryBytes"}
	}
	w.result.PeakMemoryBytes = reservation
	acc := make([]CandidateEstimate, len(root.CandidateIDs))
	weightSquares := 0.0
	finish := func() {
		if out.Coverage.Completed == 0 {
			return
		}
		out.Results = acc
		out.ComparableIDs = append([]string{}, root.CandidateIDs...)
		out.UnsampledIDs = []string{}
		out.Coverage.EffectiveSampleCount = out.Coverage.WeightSum * out.Coverage.WeightSum / weightSquares
		best := 0
		for i := 1; i < len(acc); i++ {
			if comparison.Compare(acc[i].Estimates, acc[best].Estimates) == -1 {
				best = i
			}
		}
		id := root.CandidateIDs[best]
		out.SelectedID = &id
	}
	defer finish()
	if b.MaxWorlds == 0 {
		return out, &stopError{"budget-exhausted", "maxWorlds"}
	}
	for worldIndex := 0; worldIndex < b.MaxWorlds; worldIndex++ {
		if err = w.world(); err != nil {
			return out, err
		}
		out.Coverage.Attempted++
		if err = w.Sampler(1); err != nil {
			return out, err
		}
		sample, e := r.Sample(ctx, w, streamSeed(provenance.Seeds.World, worldIndex))
		if e != nil {
			return out, e
		}
		if err = w.Check(); err != nil {
			return out, err
		}
		if sample == nil {
			out.Coverage.Excluded++
			continue
		}
		if !finite(sample.Weight) || sample.Weight <= 0 {
			out.Coverage.Failed++
			out.Coverage.Excluded++
			return out, fmt.Errorf("soft model weight must be finite and strictly positive")
		}
		out.Coverage.Feasible++
		pair := make([]Evaluation, len(root.CandidateIDs))
		complete := false
		for i, id := range root.CandidateIDs {
			out.Coverage.Candidates[i].Attempted++
			if err = w.Setup(1); err != nil {
				out.Coverage.Excluded++
				return out, err
			}
			branch, e := r.Clone(ctx, w, sample.World)
			if e != nil {
				out.Coverage.Failed++
				out.Coverage.Excluded++
				return out, e
			}
			value, e := runBranch(ctx, w, r, policies, h, root.Seat, id, branch, provenance.Seeds, worldIndex)
			if e != nil {
				out.Coverage.Excluded++
				var s *stopError
				if !errors.As(e, &s) {
					out.Coverage.Failed++
				}
				return out, e
			}
			pair[i] = value
			out.Coverage.Candidates[i].Completed++
			complete = i == len(root.CandidateIDs)-1
		}
		if !complete {
			out.Coverage.Excluded++
			continue
		}
		newWeight := out.Coverage.WeightSum + sample.Weight
		if !finite(newWeight) || !finite(weightSquares+sample.Weight*sample.Weight) {
			return out, fmt.Errorf("sampling weights overflow")
		}
		// Validate the complete pair before changing any accumulated arithmetic.
		converted := make([]CandidateEstimate, len(pair))
		for i, e := range pair {
			v, e2 := toEstimate(root.CandidateIDs[i], e, provenance)
			if e2 != nil {
				return out, e2
			}
			converted[i] = v
			if i > 0 && !sameMetrics(converted[0].Estimates, v.Estimates) {
				return out, fmt.Errorf("candidate payoff metrics differ")
			}
			if out.Coverage.Completed > 0 && !sameMetrics(acc[i].Estimates, v.Estimates) {
				return out, fmt.Errorf("world payoff metrics differ")
			}
		}
		for i, v := range converted {
			if out.Coverage.Completed == 0 {
				acc[i] = v
				continue
			}
			for j, e := range v.Estimates {
				acc[i].Estimates[j].Value += (e.Value - acc[i].Estimates[j].Value) * (sample.Weight / newWeight)
			}
			if v.Kind == "cutoff" {
				acc[i].Kind = "cutoff"
				acc[i].Evaluator = v.Evaluator
				acc[i].Assumptions = appendUnique(acc[i].Assumptions, v.Assumptions...)
			}
		}
		out.Coverage.Completed++
		out.Coverage.WeightSum = newWeight
		weightSquares += sample.Weight * sample.Weight
		out.Coverage.Samples = append(out.Coverage.Samples, SampleCoverage{fmt.Sprintf("world:%d", worldIndex), sample.Weight})
	}
	return out, nil
}

func runBranch[W, O, C any](ctx context.Context, w *Work, r Referee[W, O, C], policies map[int]ActorPolicy[O, C], h Horizon, rootSeat int, rootID string, world W, seeds Seeds, worldIndex int) (Evaluation, error) {
	memories := map[int]ActorMemory{}
	rootPending := true
	chanceIndex := 0
	project := func(seat int) (ActorInput[O, C], error) {
		var z ActorInput[O, C]
		if seat < 0 || seat > 3 {
			return z, fmt.Errorf("invalid actor")
		}
		if e := w.Setup(1); e != nil {
			return z, e
		}
		in, e := r.Project(ctx, w, world, seat)
		if e != nil {
			return in, e
		}
		if e = w.Check(); e != nil {
			return in, e
		}
		if in.Seat != seat || in.InformationKey == "" || len(in.Candidates) == 0 {
			return in, fmt.Errorf("invalid actor projection: requested=%d got=%d phase=%s candidates=%d key=%q", seat, in.Seat, in.Phase, len(in.Candidates), in.InformationKey)
		}
		ids := map[string]bool{}
		for _, c := range in.Candidates {
			if c.ID == "" || ids[c.ID] {
				return in, fmt.Errorf("invalid actor candidates")
			}
			ids[c.ID] = true
		}
		return in, nil
	}
	choose := func(in ActorInput[O, C], forced *string) (string, error) {
		if forced != nil {
			for _, c := range in.Candidates {
				if c.ID == *forced {
					return *forced, nil
				}
			}
			return "", fmt.Errorf("root candidate absent from permitted packet")
		}
		policy := policies[in.Seat]
		if policy == nil {
			return "", fmt.Errorf("missing actor policy")
		}
		if e := w.Setup(1); e != nil {
			return "", e
		}
		m, ok := memories[in.Seat]
		if !ok {
			var e error
			m, e = r.Memory(in)
			if e != nil {
				return "", e
			}
		}
		choice, e := policy.Choose(ctx, w, in, m, actorSeed(seeds.Actor, in.Seat, in.InformationKey))
		if e != nil {
			return "", e
		}
		if e = w.Check(); e != nil {
			return "", e
		}
		if choice.Memory.Version == "" || !json.Valid(choice.Memory.Value) {
			return "", fmt.Errorf("invalid actor memory")
		}
		for _, c := range in.Candidates {
			if c.ID == choice.CandidateID {
				memories[in.Seat] = choice.Memory
				return choice.CandidateID, nil
			}
		}
		return "", fmt.Errorf("policy returned a forbidden candidate")
	}
	for {
		if e := w.Setup(1); e != nil {
			return Evaluation{}, e
		}
		if r.Reached(world, h) {
			if e := w.Setup(1); e != nil {
				return Evaluation{}, e
			}
			v, e := r.Evaluate(ctx, w, world, h)
			if e != nil {
				return v, e
			}
			return v, w.Check()
		}
		n := r.Node(world)
		var e error
		switch n.Kind {
		case "actor":
			in, e := project(n.Actor)
			if e != nil {
				return Evaluation{}, e
			}
			var forced *string
			if rootPending {
				if n.Actor != rootSeat {
					return Evaluation{}, fmt.Errorf("root actor mismatch")
				}
				forced = &rootID
			}
			id, e := choose(in, forced)
			if e != nil {
				return Evaluation{}, e
			}
			if e = w.step(); e != nil {
				return Evaluation{}, e
			}
			world, e = r.Commit(ctx, w, world, n.Actor, id)
			if e != nil {
				return Evaluation{}, e
			}
			rootPending = false
		case "sealed":
			if n.WindowID == "" || len(n.Participants) == 0 {
				return Evaluation{}, fmt.Errorf("invalid sealed window")
			}
			inputs := make([]ActorInput[O, C], len(n.Participants))
			seats := map[int]bool{}
			for i, seat := range n.Participants {
				if seats[seat] {
					return Evaluation{}, fmt.Errorf("duplicate sealed actor")
				}
				seats[seat] = true
				inputs[i], e = project(seat)
				if e != nil {
					return Evaluation{}, e
				}
			}
			if rootPending && !seats[rootSeat] {
				return Evaluation{}, fmt.Errorf("root missing from sealed window")
			}
			choices := make([]SeatChoice, len(inputs))
			for i, in := range inputs {
				var forced *string
				if rootPending && in.Seat == rootSeat {
					forced = &rootID
				}
				id, e := choose(in, forced)
				if e != nil {
					return Evaluation{}, e
				}
				choices[i] = SeatChoice{in.Seat, id}
			}
			if e = w.step(); e != nil {
				return Evaluation{}, e
			}
			world, e = r.CommitSealed(ctx, w, world, n.WindowID, choices)
			if e != nil {
				return Evaluation{}, e
			}
			rootPending = false
		case "automatic", "chance":
			if e = w.step(); e != nil {
				return Evaluation{}, e
			}
			world, e = r.Advance(ctx, w, world, streamSeed(seeds.Chance, worldIndex*104729+chanceIndex))
			chanceIndex++
			if e != nil {
				return Evaluation{}, e
			}
		case "round-end":
			if e = w.step(); e != nil {
				return Evaluation{}, e
			}
			world, e = r.ContinueRound(ctx, w, world)
			if e != nil {
				return Evaluation{}, e
			}
		default:
			return Evaluation{}, fmt.Errorf("unsupported continuation node %q before horizon", n.Kind)
		}
	}
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func appendUnique(a []string, b ...string) []string {
	for _, v := range b {
		if !slices.Contains(a, v) {
			a = append(a, v)
		}
	}
	return a
}
func sameMetrics(a, b []Estimate) bool {
	if len(a) != len(b) {
		return false
	}
	for i, v := range a {
		if v.CompetitorID != b[i].CompetitorID || v.Metric != b[i].Metric {
			return false
		}
	}
	return true
}
func toEstimate(id string, e Evaluation, p RunProvenance) (CandidateEstimate, error) {
	out := CandidateEstimate{Kind: e.Kind, CandidateID: id, Estimates: []Estimate{}}
	if e.Kind != "terminal" && e.Kind != "cutoff" {
		return out, fmt.Errorf("invalid evaluation kind")
	}
	if e.Kind == "cutoff" {
		if p.CutoffEvaluator == nil || e.EvaluatorVersion != p.CutoffEvaluator.Version || len(e.Assumptions) == 0 {
			return out, fmt.Errorf("cutoff requires pinned evaluator and assumptions")
		}
		out.Evaluator = p.CutoffEvaluator
		out.Assumptions = append([]string{}, e.Assumptions...)
	}
	seen := map[string]bool{}
	for _, v := range e.Values {
		for metric, value := range v.Metrics {
			key := v.CompetitorID + "\x00" + metric
			if v.CompetitorID == "" || metric == "" || seen[key] || !finite(value) {
				return out, fmt.Errorf("invalid payoff")
			}
			seen[key] = true
			out.Estimates = append(out.Estimates, Estimate{CompetitorID: v.CompetitorID, Metric: metric, Event: "declared-horizon-payoff", Unit: "game-metric", Population: "completed-paired-worlds", Value: value, Estimator: Component{"weighted-paired-mean", "1.0.0"}})
		}
	}
	if len(out.Estimates) == 0 {
		return out, fmt.Errorf("empty payoff")
	}
	sort.Slice(out.Estimates, func(i, j int) bool {
		a, b := out.Estimates[i], out.Estimates[j]
		if a.CompetitorID != b.CompetitorID {
			return a.CompetitorID < b.CompetitorID
		}
		return a.Metric < b.Metric
	})
	return out, nil
}
