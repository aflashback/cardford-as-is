// Package cardcontinuation adapts the preserved Hearts and Spades engines to
// the actor-only planner. It is a game compatibility adapter, not shared kernel.
package cardcontinuation

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	hr "cardford/server/internal/games/hearts/reasoning"
	"cardford/server/internal/games/spades"
	sr "cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/knowledge"
	"cardford/server/internal/strategy/rollout"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
)

const PolicyVersion = d.ActorRolloutPolicy

type Config struct {
	Budget         rollout.RunBudget
	Seeds          rollout.Seeds
	Horizon        rollout.Horizon
	AdmissionClass string
}

func DefaultConfig() Config {
	return Config{Budget: d.ActorRolloutBudget(), Seeds: d.ActorRolloutSeeds(), Horizon: d.ActorRolloutHorizon(), AdmissionClass: "offline"}
}

// Evaluate accepts a frozen seat-scoped observation; callers keep the returned
// provenance and coverage with the decision. It never reads a production deal.
func Evaluate(ctx context.Context, o d.Observation, c Config) (rollout.PairedResult, error) {
	if ctx == nil {
		return rollout.PairedResult{}, fmt.Errorf("execution context required")
	}
	// Metadata encoding/model construction consume two setup units. Reserve
	// these before constructing candidate arrays or hashing a permitted packet.
	early := rollout.PairedResult{ExecutionStatus: "completed", ComparableIDs: []string{}, UnsampledIDs: []string{}, Results: []rollout.CandidateEstimate{}, Assumptions: []string{"Stopped before permitted-input model construction; no candidate was compared."}}
	if e := ctx.Err(); e != nil {
		early.ExecutionStatus = "cancelled"
		if errors.Is(e, context.DeadlineExceeded) {
			early.ExecutionStatus = "deadline"
		}
		return early, nil
	}
	if !slices.Contains([]string{"current-round", "two-rounds", "match-cutoff-two-rounds"}, c.Horizon.Scope) || c.Horizon.ID != "card-round" || c.Horizon.Version != "2.0.0" {
		return rollout.PairedResult{}, fmt.Errorf("unsupported explicit card horizon")
	}
	if !slices.Contains([]string{"hearts", "spades-solo", "spades-partners"}, o.Mode) || !slices.Contains([]string{"bid", "pass", "play"}, o.Phase) || len(o.LegalActions) == 0 {
		return rollout.PairedResult{}, fmt.Errorf("unsupported decision observation")
	}
	// Size checks use existing lengths before serialization. No private history
	// is discarded: oversized observations return an explicit unsupported error.
	if len(o.Events) > 32768 || len(o.History) > 13 || len(o.Hand) > 13 {
		return rollout.PairedResult{}, fmt.Errorf("permitted input exceeds installed workspace profile")
	}
	r := &referee{input: o, config: c}
	cap := ""
	if len(o.LegalActions) > c.Budget.MaxCandidates {
		cap = "maxCandidates"
	} else if c.Budget.MaxSetupOperations < 2 {
		cap = "maxSetupOperations"
	} else if r.MemoryBytes(c.Budget) > c.Budget.MaxMemoryBytes {
		cap = "maxMemoryBytes"
	}
	if cap != "" {
		early.ExecutionStatus = "budget-exhausted"
		early.Work.StoppedBy = &cap
		return early, nil
	}
	ids := make([]string, len(o.LegalActions))
	for i, a := range o.LegalActions {
		ids[i] = d.ActionID(a)
	}
	p := r.Components()
	r.provenance = &p
	p.Seeds = c.Seeds
	policies := map[int]rollout.ActorPolicy[d.Observation, d.Action]{}
	for seat := 0; seat < 4; seat++ {
		policies[seat] = actorPolicy{}
	}
	budget := c.Budget
	budget.MaxSetupOperations -= 2
	result, err := rollout.RunPaired(r, policies, c.Horizon, rollout.Root{Seat: o.Seat, CandidateIDs: ids}, budget, comparison{o.Mode, o.Seat}, p, rollout.ExecutionContext{Context: ctx, AdmissionClass: c.AdmissionClass})
	result.Work.SetupOperations += 2
	return result, err
}

type world struct {
	snapshot      gamekernel.Snapshot
	public        d.Observation
	pendingChance bool
	rounds        int
	startHand     int
}
type referee struct {
	input      d.Observation
	config     Config
	provenance *rollout.RunProvenance
}

func (r *referee) Components() rollout.RunProvenance {
	if r.provenance != nil {
		return *r.provenance
	}
	// This metadata hash is over the actor packet only. The runner checks the
	// operational context before callbacks execute; input size is bounded above.
	p := d.ActorRolloutProvenance(r.input.Mode, digest(r.input))
	p.Horizon = rollout.Component{ID: r.config.Horizon.ID, Version: r.config.Horizon.Version}
	p.Seeds = r.config.Seeds
	return p
}
func (r *referee) MemoryBytes(b rollout.RunBudget) int64 {
	// 64 MiB for memoized 52-card counting and temporary big integers; 16 KiB
	// per permitted event bounds JSON copies, four memories and snapshot copies;
	// 4 KiB per root candidate/result. Sampling allocations have a separate cap.
	return (64 << 20) + int64(len(r.input.Events)+200)*16384 + int64(len(r.input.LegalActions))*4096 + int64(b.MaxWorlds)*128
}
func (r *referee) Sample(ctx context.Context, w *rollout.Work, seed uint32) (*rollout.Sample[world], error) {
	if e := w.Setup(1); e != nil {
		return nil, e
	}
	if e := d.ValidateObservationContext(ctx, r.input); e != nil {
		return nil, e
	}
	var hands [4][]string
	var e error
	if r.input.Phase == "play" {
		hands, e = samplePlayHands(ctx, w, r.input, seed)
	} else {
		hands, e = sampleOpeningHands(w, r.input, seed)
	}
	if e != nil {
		return nil, e
	}
	if e = w.Setup(1); e != nil {
		return nil, e
	}
	raw, e := d.SyntheticWorld(r.input, hands)
	if e != nil {
		return nil, e
	}
	if r.input.Mode == "hearts" && r.input.Phase == "play" && r.input.PassDirection != "hold" {
		raw, e = withSyntheticExchanges(w, r.input, hands, raw, seed)
		if e != nil {
			return nil, e
		}
	}
	if e = w.Setup(1); e != nil {
		return nil, e
	}
	var s gamekernel.Snapshot
	if r.input.Mode == "hearts" {
		s, e = hearts.Open(raw)
	} else {
		s, e = spades.Open(raw)
	}
	if e != nil {
		return nil, fmt.Errorf("sampled production state: %w", e)
	}
	v, e := r.refresh(ctx, w, world{snapshot: s, startHand: r.input.HandNumber})
	if e != nil {
		return nil, e
	}
	return &rollout.Sample[world]{World: v, Weight: 1}, nil
}
func (r *referee) Clone(ctx context.Context, w *rollout.Work, v world) (world, error) {
	return v, w.Check()
} // production snapshots are immutable
func (r *referee) Node(v world) rollout.Node {
	if v.pendingChance {
		return rollout.Node{Kind: "chance"}
	}
	switch v.public.Phase {
	case "bid", "play":
		if v.public.Turn != nil {
			return rollout.Node{Kind: "actor", Actor: *v.public.Turn}
		}
	case "pass":
		return rollout.Node{Kind: "sealed", Participants: []int{0, 1, 2, 3}, WindowID: fmt.Sprintf("pass:%d", v.public.HandNumber)}
	case "trick-end":
		return rollout.Node{Kind: "automatic"}
	case "hand-end":
		return rollout.Node{Kind: "round-end"}
	case "match-end":
		return rollout.Node{Kind: "terminal"}
	}
	return rollout.Node{Kind: "unsupported"}
}
func (r *referee) Project(ctx context.Context, w *rollout.Work, v world, actor int) (rollout.ActorInput[d.Observation, d.Action], error) {
	var out rollout.ActorInput[d.Observation, d.Action]
	if e := w.Check(); e != nil {
		return out, e
	}
	p, e := v.snapshot.Project(actor)
	if e != nil {
		return out, e
	}
	if e = w.Setup(1); e != nil {
		return out, e
	}
	var o d.Observation
	if e = json.Unmarshal(p.Observation, &o); e != nil {
		return out, e
	}
	out = rollout.ActorInput[d.Observation, d.Action]{Seat: actor, Phase: o.Phase, Observation: o, InformationKey: digest(o), Candidates: []rollout.Candidate[d.Action]{}}
	for _, a := range o.LegalActions {
		out.Candidates = append(out.Candidates, rollout.Candidate[d.Action]{ID: d.ActionID(a), Public: d.CloneAction(a)})
	}
	return out, w.Check()
}
func (r *referee) Memory(in rollout.ActorInput[d.Observation, d.Action]) (rollout.ActorMemory, error) {
	return observationMemory(in.Observation)
}
func (r *referee) Commit(ctx context.Context, w *rollout.Work, v world, seat int, id string) (world, error) {
	in, e := r.Project(ctx, w, v, seat)
	if e != nil {
		return v, e
	}
	for _, c := range in.Candidates {
		if c.ID == id {
			if c.Public.Kind == "pass" {
				return v, fmt.Errorf("passing requires an atomic bundle")
			}
			return r.apply(ctx, w, v, map[string]any{"type": "action", "action": c.Public})
		}
	}
	return v, fmt.Errorf("candidate is not legal")
}
func (r *referee) CommitSealed(ctx context.Context, w *rollout.Work, v world, windowID string, choices []rollout.SeatChoice) (world, error) {
	if r.input.Mode != "hearts" || v.public.Phase != "pass" || windowID != fmt.Sprintf("pass:%d", v.public.HandNumber) || len(choices) != 4 {
		return v, fmt.Errorf("invalid pass bundle")
	}
	passes := [4][]string{}
	seen := [4]bool{}
	for _, choice := range choices {
		if choice.Seat < 0 || choice.Seat > 3 || seen[choice.Seat] {
			return v, fmt.Errorf("invalid sealed participant")
		}
		seen[choice.Seat] = true
		in, e := r.Project(ctx, w, v, choice.Seat)
		if e != nil {
			return v, e
		}
		for _, c := range in.Candidates {
			if c.ID == choice.CandidateID {
				passes[choice.Seat] = append([]string{}, c.Public.Cards...)
				break
			}
		}
		if len(passes[choice.Seat]) != 3 {
			return v, fmt.Errorf("illegal sealed choice")
		}
	}
	return r.apply(ctx, w, v, map[string]any{"type": "action", "action": map[string]any{"kind": "pass-bundle", "passes": passes}})
}
func (r *referee) Advance(ctx context.Context, w *rollout.Work, v world, seed uint32) (world, error) {
	if v.pendingChance {
		deck := d.FullDeck()
		if e := shuffle(w, deck, &seed); e != nil {
			return v, e
		}
		v.pendingChance = false
		return r.apply(ctx, w, v, map[string]any{"type": "next-hand", "deal": deck})
	}
	if v.public.Phase != "trick-end" {
		return v, fmt.Errorf("no automatic operation")
	}
	return r.apply(ctx, w, v, map[string]any{"type": "collect-trick"})
}
func (r *referee) ContinueRound(ctx context.Context, w *rollout.Work, v world) (world, error) {
	if v.public.Phase != "hand-end" {
		return v, fmt.Errorf("round not scored")
	}
	v.pendingChance = true
	v.rounds++
	return v, w.Check()
}
func (r *referee) Reached(v world, h rollout.Horizon) bool {
	if v.public.Phase == "match-end" {
		return true
	}
	if v.pendingChance {
		return false
	}
	if v.public.Phase != "hand-end" {
		return false
	}
	if h.Scope == "current-round" {
		return true
	}
	return v.rounds >= 1
}
func (r *referee) Evaluate(ctx context.Context, w *rollout.Work, v world, h rollout.Horizon) (rollout.Evaluation, error) {
	if !r.Reached(v, h) {
		return rollout.Evaluation{}, fmt.Errorf("cannot score an unfinished horizon")
	}
	out := rollout.Evaluation{Kind: "terminal", Values: []rollout.Payoff{}}
	if h.Scope == "match-cutoff-two-rounds" && v.public.Phase != "match-end" {
		out.Kind = "cutoff"
		out.EvaluatorVersion = "2.0.0"
		out.Assumptions = []string{"Cumulative score after two completed rounds is a heuristic for the unfinished match; future deals and play remain unknown."}
	}
	for seat, score := range v.public.Scores {
		if r.input.Mode == "spades-partners" && seat >= 2 {
			continue
		}
		out.Values = append(out.Values, rollout.Payoff{CompetitorID: competitor(r.input.Mode, seat), Metrics: map[string]float64{"score": float64(score)}})
	}
	return out, w.Check()
}
func (r *referee) refresh(ctx context.Context, w *rollout.Work, v world) (world, error) {
	if e := w.Setup(1); e != nil {
		return v, e
	}
	p, e := v.snapshot.Project(0)
	if e != nil {
		return v, e
	}
	v.public = d.Observation{}
	e = json.Unmarshal(p.Observation, &v.public)
	if e != nil {
		return v, e
	}
	return v, w.Check()
}
func (r *referee) apply(ctx context.Context, w *rollout.Work, v world, command any) (world, error) {
	if e := w.Setup(1); e != nil {
		return v, e
	}
	raw, e := json.Marshal(command)
	if e != nil {
		return v, e
	}
	if e = w.Setup(1); e != nil {
		return v, e
	}
	v.snapshot, e = v.snapshot.Apply(raw)
	if e != nil {
		return v, e
	}
	return r.refresh(ctx, w, v)
}

type actorPolicy struct{}

func (actorPolicy) Choose(ctx context.Context, w *rollout.Work, in rollout.ActorInput[d.Observation, d.Action], memory rollout.ActorMemory, seed uint32) (rollout.Choice, error) {
	if e := w.Setup(1); e != nil {
		return rollout.Choice{}, e
	}
	var a d.Analysis
	var e error
	if in.Observation.Mode == "hearts" {
		a, e = hr.AnalyzeContext(ctx, in.Observation)
	} else {
		a, e = sr.AnalyzeContext(ctx, in.Observation)
	}
	if e != nil {
		return rollout.Choice{}, e
	}
	if e = w.Setup(1); e != nil {
		return rollout.Choice{}, e
	}
	m, e := observationMemory(in.Observation)
	return rollout.Choice{CandidateID: d.ActionID(a.Action), Memory: m}, e
}
func observationMemory(o d.Observation) (rollout.ActorMemory, error) {
	events := make([]knowledge.Event, 0, len(o.Events)+1)
	for _, e := range o.Events {
		raw, err := json.Marshal(e)
		if err != nil {
			return rollout.ActorMemory{}, err
		}
		events = append(events, knowledge.Event{Sequence: e.ID, Kind: e.Type, Value: raw})
	}
	n := 1
	if len(events) > 0 {
		n = events[len(events)-1].Sequence + 1
	}
	own, _ := json.Marshal(struct {
		HandNumber int          `json:"handNumber"`
		Pass       d.PassMemory `json:"pass"`
	}{o.HandNumber, o.Pass})
	events = append(events, knowledge.Event{Sequence: n, Kind: "own-exchange-memory", VisibleTo: []int{o.Seat}, Value: own})
	m, e := knowledge.Reconstruct(events, o.Seat, n)
	if e != nil {
		return rollout.ActorMemory{}, e
	}
	raw, e := json.Marshal(m)
	return rollout.ActorMemory{Version: m.Version, Value: raw}, e
}
func digest(v any) string {
	raw, _ := json.Marshal(v)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
func competitor(mode string, seat int) string {
	if mode == "spades-partners" {
		return fmt.Sprintf("team:%d", seat%2)
	}
	return fmt.Sprintf("seat:%d", seat)
}

type comparison struct {
	mode string
	seat int
}

func (c comparison) Pin() rollout.Component {
	return rollout.Component{ID: c.mode + "-actor-score-comparator", Version: "2.0.0"}
}
func (c comparison) Compare(a, b []rollout.Estimate) int {
	value := func(es []rollout.Estimate) float64 {
		for _, e := range es {
			if e.CompetitorID == competitor(c.mode, c.seat) && e.Metric == "score" {
				return e.Value
			}
		}
		return 0
	}
	left, right := value(a), value(b)
	if left == right {
		return 0
	}
	if (left > right) != (c.mode == "hearts") {
		return -1
	}
	return 1
}
