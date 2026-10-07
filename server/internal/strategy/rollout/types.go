// Package rollout evaluates paired synthetic worlds through seat-scoped policies.
// A policy never receives W; only the referee may inspect a synthetic world.
package rollout

import (
	"context"
	"encoding/json"
)

type Component struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}
type Candidate[C any] struct {
	ID     string `json:"id"`
	Public C      `json:"public"`
}
type ActorInput[O, C any] struct {
	Seat           int
	Phase          string
	Observation    O
	Candidates     []Candidate[C]
	InformationKey string
}
type ActorMemory struct {
	Version string          `json:"version"`
	Value   json.RawMessage `json:"value"`
}
type Choice struct {
	CandidateID string
	Memory      ActorMemory
}
type ActorPolicy[O, C any] interface {
	Choose(context.Context, *Work, ActorInput[O, C], ActorMemory, uint32) (Choice, error)
}
type Horizon struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	Scope   string `json:"scope"`
}
type Payoff struct {
	CompetitorID string             `json:"competitorId"`
	Metrics      map[string]float64 `json:"metrics"`
}
type Evaluation struct {
	Kind             string
	Values           []Payoff
	EvaluatorVersion string
	Assumptions      []string
}
type Node struct {
	Kind         string
	Actor        int
	Participants []int
	WindowID     string
}
type SeatChoice struct {
	Seat        int
	CandidateID string
}
type Sample[W any] struct {
	World  W
	Weight float64
}

// Callbacks cooperate with Work: nested sampling, facts and model work must be
// charged before allocation/execution. MemoryBytes reserves a conservative bound
// on the complete workspace, including branch memories and result arrays.
type Referee[W, O, C any] interface {
	Components() RunProvenance
	MemoryBytes(RunBudget) int64
	Sample(context.Context, *Work, uint32) (*Sample[W], error)
	Clone(context.Context, *Work, W) (W, error)
	Node(W) Node
	Project(context.Context, *Work, W, int) (ActorInput[O, C], error)
	Memory(ActorInput[O, C]) (ActorMemory, error)
	Commit(context.Context, *Work, W, int, string) (W, error)
	CommitSealed(context.Context, *Work, W, string, []SeatChoice) (W, error)
	Advance(context.Context, *Work, W, uint32) (W, error)
	ContinueRound(context.Context, *Work, W) (W, error)
	Reached(W, Horizon) bool
	Evaluate(context.Context, *Work, W, Horizon) (Evaluation, error)
}
type RunBudget struct {
	MaxWorlds            int   `json:"maxWorlds"`
	MaxSteps             int   `json:"maxSteps"`
	MaxCandidates        int   `json:"maxCandidates"`
	MaxMemoryBytes       int64 `json:"maxMemoryBytes"`
	MaxSamplerOperations int   `json:"maxSamplerOperations"`
	MaxSetupOperations   int   `json:"maxSetupOperations"`
}
type ExecutionContext struct {
	Context        context.Context
	AdmissionClass string
}
type Seeds struct {
	World  uint32 `json:"world"`
	Actor  uint32 `json:"actor"`
	Chance uint32 `json:"chance"`
}
type RunProvenance struct {
	Sampler              Component  `json:"sampler"`
	Prior                Component  `json:"prior"`
	Constraints          Component  `json:"constraints"`
	Belief               Component  `json:"belief"`
	Continuation         Component  `json:"continuation"`
	Objective            Component  `json:"objective"`
	Horizon              Component  `json:"horizon"`
	Comparator           Component  `json:"comparator"`
	CutoffEvaluator      *Component `json:"cutoffEvaluator"`
	PermittedInputDigest string     `json:"permittedInputDigest"`
	Seeds                Seeds      `json:"seeds"`
}
type Estimate struct {
	CompetitorID string    `json:"competitorId"`
	Metric       string    `json:"metric"`
	Event        string    `json:"event"`
	Unit         string    `json:"unit"`
	Population   string    `json:"population"`
	Value        float64   `json:"value"`
	Estimator    Component `json:"estimator"`
	Uncertainty  any       `json:"uncertainty"`
}
type CandidateEstimate struct {
	Kind        string     `json:"kind"`
	CandidateID string     `json:"candidateId"`
	Estimates   []Estimate `json:"estimates"`
	Evaluator   *Component `json:"evaluator,omitempty"`
	Assumptions []string   `json:"assumptions,omitempty"`
}
type WorkResult struct {
	Worlds            int     `json:"worlds"`
	Steps             int     `json:"steps"`
	PeakMemoryBytes   int64   `json:"peakMemoryBytes"`
	SamplerOperations int     `json:"samplerOperations"`
	SetupOperations   int     `json:"setupOperations"`
	StoppedBy         *string `json:"stoppedBy"`
}
type SampleCoverage struct {
	ID     string  `json:"id"`
	Weight float64 `json:"weight"`
}
type CandidateCoverage struct {
	ID        string `json:"id"`
	Attempted int    `json:"attempted"`
	Completed int    `json:"completed"`
}
type Coverage struct {
	Attempted            int                 `json:"attempted"`
	Feasible             int                 `json:"feasible"`
	Completed            int                 `json:"completed"`
	Excluded             int                 `json:"excluded"`
	Failed               int                 `json:"failed"`
	Samples              []SampleCoverage    `json:"samples"`
	WeightSum            float64             `json:"weightSum"`
	EffectiveSampleCount float64             `json:"effectiveSampleCount"`
	Candidates           []CandidateCoverage `json:"candidates"`
}
type PairedResult struct {
	SelectedID      *string             `json:"selectedId"`
	ComparableIDs   []string            `json:"comparableIds"`
	UnsampledIDs    []string            `json:"unsampledIds"`
	Provenance      RunProvenance       `json:"provenance"`
	Work            WorkResult          `json:"work"`
	ExecutionStatus string              `json:"executionStatus"`
	Coverage        Coverage            `json:"coverage"`
	Results         []CandidateEstimate `json:"results"`
	Assumptions     []string            `json:"assumptions"`
}
type Root struct {
	Seat         int
	CandidateIDs []string
}
type Comparison interface {
	Pin() Component
	Compare([]Estimate, []Estimate) int
}
