package rollout

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

type toyWorld struct {
	Stage  int
	Secret int
	Value  float64
	Round  int
}
type toyReferee struct {
	sealed         bool
	loop           bool
	cancel         context.CancelFunc
	projectSecrets []int
	terminal       bool
	weight         float64
}

func (r *toyReferee) Components() RunProvenance {
	c := Component{"toy", "1"}
	return RunProvenance{Sampler: c, Prior: c, Constraints: c, Belief: c, Continuation: c, Objective: c, Horizon: c, Comparator: c, CutoffEvaluator: &c, PermittedInputDigest: "actor-only"}
}
func (*toyReferee) MemoryBytes(RunBudget) int64 { return 1024 }
func (r *toyReferee) Sample(ctx context.Context, w *Work, seed uint32) (*Sample[toyWorld], error) {
	if r.cancel != nil {
		r.cancel()
	}
	v := toyWorld{Secret: int(seed)}
	if r.terminal {
		v.Stage = 2
	}
	weight := r.weight
	if weight == 0 {
		weight = 1
	}
	return &Sample[toyWorld]{World: v, Weight: weight}, nil
}
func (*toyReferee) Clone(ctx context.Context, w *Work, v toyWorld) (toyWorld, error) { return v, nil }
func (r *toyReferee) Node(v toyWorld) Node {
	if v.Stage == 0 && r.sealed {
		return Node{Kind: "sealed", Participants: []int{0, 1}, WindowID: "pass"}
	}
	if r.loop && v.Stage > 0 {
		return Node{Kind: "automatic"}
	}
	if v.Stage < 2 {
		return Node{Kind: "actor", Actor: v.Stage}
	}
	return Node{Kind: "round-end"}
}
func (r *toyReferee) Project(ctx context.Context, w *Work, v toyWorld, seat int) (ActorInput[string, string], error) {
	return ActorInput[string, string]{Seat: seat, Phase: "choice", Observation: "permitted", InformationKey: "same-information", Candidates: []Candidate[string]{{ID: "a", Public: "a"}, {ID: "b", Public: "b"}}}, nil
}
func (*toyReferee) Memory(ActorInput[string, string]) (ActorMemory, error) {
	return ActorMemory{"1", json.RawMessage(`[]`)}, nil
}
func (*toyReferee) Commit(ctx context.Context, w *Work, v toyWorld, seat int, id string) (toyWorld, error) {
	v.Stage++
	if id == "b" {
		v.Value++
	}
	return v, nil
}
func (*toyReferee) CommitSealed(ctx context.Context, w *Work, v toyWorld, id string, c []SeatChoice) (toyWorld, error) {
	v.Stage = 2
	for _, x := range c {
		if x.CandidateID == "b" {
			v.Value++
		}
	}
	return v, nil
}
func (*toyReferee) Advance(ctx context.Context, w *Work, v toyWorld, seed uint32) (toyWorld, error) {
	v.Secret = int(seed)
	return v, nil
}
func (*toyReferee) ContinueRound(ctx context.Context, w *Work, v toyWorld) (toyWorld, error) {
	v.Stage = 0
	v.Round++
	return v, nil
}
func (*toyReferee) Reached(v toyWorld, h Horizon) bool {
	return v.Stage == 2 && (h.Scope != "two-rounds" || v.Round == 1)
}
func (*toyReferee) Evaluate(ctx context.Context, w *Work, v toyWorld, h Horizon) (Evaluation, error) {
	e := Evaluation{Kind: "terminal", Values: []Payoff{{"solo", map[string]float64{"score": v.Value}}}}
	if h.Scope == "cutoff" {
		e.Kind = "cutoff"
		e.EvaluatorVersion = "1"
		e.Assumptions = []string{"declared toy cutoff"}
	}
	return e, nil
}

type toyPolicy struct {
	inputs []ActorInput[string, string]
	seeds  []uint32
}

func (p *toyPolicy) Choose(ctx context.Context, w *Work, in ActorInput[string, string], m ActorMemory, seed uint32) (Choice, error) {
	p.inputs = append(p.inputs, in)
	p.seeds = append(p.seeds, seed)
	return Choice{"a", m}, nil
}

type toyComparison struct{}

func (toyComparison) Pin() Component { return Component{"toy", "1"} }
func (toyComparison) Compare(a, b []Estimate) int {
	if a[0].Value > b[0].Value {
		return -1
	}
	if a[0].Value < b[0].Value {
		return 1
	}
	return 0
}
func toyBudget() RunBudget { return RunBudget{4, 100, 2, 4096, 100, 1000} }
func runToy(t *testing.T, r *toyReferee, b RunBudget, scope string, ctx context.Context) (PairedResult, *toyPolicy) {
	t.Helper()
	p := &toyPolicy{}
	got, err := RunPaired(r, map[int]ActorPolicy[string, string]{0: p, 1: p}, Horizon{"toy", "1", scope}, Root{0, []string{"a", "b"}}, b, toyComparison{}, r.Components(), ExecutionContext{ctx, "offline"})
	if err != nil {
		t.Fatal(err)
	}
	return got, p
}
func TestPairedActorIsolationAndCompletedWorlds(t *testing.T) {
	got, p := runToy(t, &toyReferee{}, toyBudget(), "round", context.Background())
	if got.SelectedID == nil || *got.SelectedID != "b" || got.Coverage.Completed != 4 {
		t.Fatalf("unexpected paired result: %+v", got)
	}
	for i := 1; i < len(p.inputs); i++ {
		if !reflect.DeepEqual(p.inputs[0], p.inputs[i]) || p.seeds[0] != p.seeds[i] {
			t.Fatal("indistinguishable actors changed input or seed")
		}
	}
}
func TestIncompletePairedWorldExcluded(t *testing.T) {
	b := toyBudget()
	b.MaxSteps = 3
	got, _ := runToy(t, &toyReferee{}, b, "round", context.Background())
	if got.Coverage.Completed != 0 || got.Coverage.Excluded != 1 || got.SelectedID != nil || got.Work.Steps != 3 || got.ExecutionStatus != "budget-exhausted" {
		t.Fatalf("partial pair entered arithmetic: %+v", got)
	}
}
func TestSetupCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	got, _ := runToy(t, &toyReferee{cancel: cancel}, toyBudget(), "round", ctx)
	if got.ExecutionStatus != "cancelled" || got.Work.Steps != 0 || got.SelectedID != nil {
		t.Fatalf("setup cancellation lost: %+v", got)
	}
}
func TestAutomaticLoopsBounded(t *testing.T) {
	b := toyBudget()
	b.MaxSteps = 7
	got, p := runToy(t, &toyReferee{loop: true}, b, "round", context.Background())
	if got.Work.Steps != 7 || len(p.inputs) != 0 || got.SelectedID != nil {
		t.Fatalf("automatic loop not bounded: %+v", got)
	}
}
func TestDeclaredCutoffAndRoundContinuation(t *testing.T) {
	got, _ := runToy(t, &toyReferee{}, toyBudget(), "cutoff", context.Background())
	if got.Results[0].Kind != "cutoff" || got.Results[0].Evaluator == nil {
		t.Fatalf("cutoff represented as terminal: %+v", got)
	}
	got, _ = runToy(t, &toyReferee{}, toyBudget(), "two-rounds", context.Background())
	if got.Coverage.Completed != 4 || got.Results[0].Estimates[0].Value != 0 {
		t.Fatalf("round continuation failed: %+v", got)
	}
}
func TestSealedRootUsesAllFrozenParticipants(t *testing.T) {
	got, p := runToy(t, &toyReferee{sealed: true}, toyBudget(), "round", context.Background())
	if got.Coverage.Completed != 4 || len(p.inputs) != 8 || got.SelectedID == nil || *got.SelectedID != "b" {
		t.Fatalf("sealed pairing failed: %+v", got)
	}
}
func TestTerminalRootsStillRespectEveryWorkBoundary(t *testing.T) {
	for _, which := range []string{"world", "setup", "sampler", "memory", "candidate"} {
		t.Run(which, func(t *testing.T) {
			b := toyBudget()
			switch which {
			case "world":
				b.MaxWorlds = 0
			case "setup":
				b.MaxSetupOperations = 0
			case "sampler":
				b.MaxSamplerOperations = 0
			case "memory":
				b.MaxMemoryBytes = 100
			case "candidate":
				b.MaxCandidates = 1
			}
			got, _ := runToy(t, &toyReferee{terminal: true}, b, "round", context.Background())
			if got.ExecutionStatus != "budget-exhausted" || got.SelectedID != nil || got.Coverage.Completed != 0 || got.Work.Worlds > b.MaxWorlds || got.Work.SetupOperations > b.MaxSetupOperations || got.Work.SamplerOperations > b.MaxSamplerOperations || got.Work.PeakMemoryBytes > b.MaxMemoryBytes {
				t.Fatalf("terminal root escaped budget: %+v", got)
			}
		})
	}
}
func TestNextWorldExhaustionKeepsOnlyCompletedPair(t *testing.T) {
	b := toyBudget()
	b.MaxSteps = 5
	got, _ := runToy(t, &toyReferee{}, b, "round", context.Background())
	if got.Coverage.Completed != 1 || got.Coverage.Excluded != 1 || len(got.Coverage.Samples) != 1 || got.Coverage.WeightSum != 1 || got.Coverage.EffectiveSampleCount != 1 || got.Work.Steps != 5 || got.SelectedID == nil || *got.SelectedID != "b" {
		t.Fatalf("incomplete second world affected estimates: %+v", got)
	}
}
func TestDeadlineAndInvalidProvenance(t *testing.T) {
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	got, _ := runToy(t, &toyReferee{}, toyBudget(), "round", ctx)
	if got.ExecutionStatus != "deadline" || got.Work.Worlds != 0 {
		t.Fatalf("deadline lost: %+v", got)
	}
	r := &toyReferee{}
	p := r.Components()
	p.Continuation.Version = "unknown"
	_, err := RunPaired(r, map[int]ActorPolicy[string, string]{}, Horizon{"toy", "1", "round"}, Root{0, []string{"a"}}, toyBudget(), toyComparison{}, p, ExecutionContext{context.Background(), "offline"})
	if err == nil {
		t.Fatal("unknown continuation silently accepted")
	}
}
func TestNegativeSoftWeightFailsClosed(t *testing.T) {
	r := &toyReferee{weight: -1}
	got, err := RunPaired(r, map[int]ActorPolicy[string, string]{}, Horizon{"toy", "1", "round"}, Root{0, []string{"a"}}, toyBudget(), toyComparison{}, r.Components(), ExecutionContext{context.Background(), "offline"})
	if err == nil || got.SelectedID != nil || got.Coverage.Failed != 1 {
		t.Fatalf("negative support accepted: %+v %v", got, err)
	}
}
