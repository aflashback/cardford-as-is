package coachlab

import (
	"cardford/server/internal/games/cardcontinuation"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/rollout"
	"context"
	"fmt"
	"math"
	"slices"
	"sort"
)

type EvaluationValue struct {
	ActionID string  `json:"actionId"`
	Value    float64 `json:"value"`
	Lower    float64 `json:"lower"`
	Upper    float64 `json:"upper"`
	Worlds   int     `json:"worlds"`
}
type EvaluationRecord struct {
	SchemaVersion   string            `json:"schemaVersion"`
	DecisionID      string            `json:"decisionId"`
	Status          string            `json:"status"`
	Objective       string            `json:"objective"`
	Horizon         string            `json:"horizon"`
	Assumptions     []string          `json:"assumptions"`
	TestedActions   []string          `json:"testedActions"`
	UntestedActions []string          `json:"untestedActions"`
	EvidenceRefs    []string          `json:"evidenceRefs"`
	Values          []EvaluationValue `json:"values"`
	Limitations     []string          `json:"limitations"`
}
type EvaluationConfig struct {
	Version            string                         `json:"version"`
	DecisionID         string                         `json:"decisionId"`
	OriginalID         string                         `json:"originalId"`
	Screening          cardcontinuation.OfflineConfig `json:"screening"`
	ConfirmationBudget rollout.RunBudget              `json:"confirmationBudget"`
	MaxAlternatives    int                            `json:"maxAlternatives"`
	Alpha              float64                        `json:"alpha"`
	PracticalEffect    float64                        `json:"practicalEffect"`
	EffectUnit         string                         `json:"effectUnit"`
}
type PairedInterval struct {
	ActionID string  `json:"actionId"`
	Mean     float64 `json:"mean"`
	Lower    float64 `json:"lower"`
	Upper    float64 `json:"upper"`
	Worlds   int     `json:"worlds"`
	Method   string  `json:"method"`
}
type ComparisonResult struct {
	Summary            EvaluationRecord                `json:"summary"`
	Configuration      EvaluationConfig                `json:"configuration"`
	Screening          cardcontinuation.OfflineResult  `json:"screening"`
	Confirmation       *cardcontinuation.OfflineResult `json:"confirmation,omitempty"`
	Intervals          []PairedInterval                `json:"intervals"`
	UnconfirmedActions []string                        `json:"unconfirmedActions"`
	Robustness         string                          `json:"robustness"`
}

func DefaultEvaluationConfig(decisionID, originalID string) EvaluationConfig {
	c := cardcontinuation.DefaultOfflineConfig()
	c.Budget = rollout.RunBudget{MaxWorlds: 32, MaxSteps: 250000, MaxCandidates: 286, MaxMemoryBytes: 256 << 20, MaxSamplerOperations: 2000000, MaxSetupOperations: 2000000}
	confirm := c.Budget
	confirm.MaxWorlds = 128
	confirm.MaxSteps = 1000000
	confirm.MaxSamplerOperations = 8000000
	confirm.MaxSetupOperations = 8000000
	return EvaluationConfig{Version: "coach-lab-comparison-1.0.0", DecisionID: decisionID, OriginalID: originalID, Screening: c, ConfirmationBudget: confirm, MaxAlternatives: 3, Alpha: .05, PracticalEffect: 0, EffectUnit: "score-points"}
}
func EvaluateOffline(ctx context.Context, o d.Observation, c EvaluationConfig) (out ComparisonResult, err error) {
	out = ComparisonResult{Configuration: c, Intervals: []PairedInterval{}, UnconfirmedActions: []string{}, Robustness: "untested", Summary: EvaluationRecord{SchemaVersion: "coach-lab-evaluation-1.0.0", DecisionID: c.DecisionID, Status: "uncertain", Objective: "paired-actor-score-difference", Horizon: c.Screening.Horizon.Scope, Assumptions: []string{"All candidate branches share each hypothetical world; future actors receive only their own observations."}, TestedActions: []string{}, UntestedActions: []string{}, EvidenceRefs: []string{}, Values: []EvaluationValue{}, Limitations: []string{"Conditional approximate paired intervals assess this evaluator, not domain truth or policy strength.", "Original action is the zero-difference reference. Unconfirmed actions prevent any unique-best claim.", "Continuation-policy and belief robustness are untested unless a separate population sensitivity receipt is present.", "Zero practical-effect default is a diagnostic convention, not an approved promotion threshold."}}}
	finite := func(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
	unit := "score-points"
	if c.Screening.Horizon.Scope == "terminal-match" {
		unit = "match-win-fraction"
		out.Summary.Objective = "paired-terminal-match-win-difference"
	}
	if c.Version != "coach-lab-comparison-1.0.0" || c.DecisionID == "" || c.MaxAlternatives < 1 || c.MaxAlternatives > 3 || !finite(c.Alpha) || c.Alpha <= 0 || c.Alpha >= 1 || !finite(c.PracticalEffect) || c.PracticalEffect < 0 || c.EffectUnit != unit || c.Screening.Stream != "screening" || len(c.Screening.RootIDs) != 0 || c.Screening.Budget.MaxWorlds < 1 || c.ConfirmationBudget.MaxWorlds < 2 {
		return out, fmt.Errorf("invalid explicit comparison configuration")
	}
	legal := []string{}
	for _, a := range o.LegalActions {
		legal = append(legal, d.ActionID(a))
	}
	if !slices.Contains(legal, c.OriginalID) {
		return out, fmt.Errorf("original action absent from actor legal set")
	}
	out.UnconfirmedActions = append([]string{}, legal...)
	out.Summary.UntestedActions = append([]string{}, legal...)
	out.Screening, err = cardcontinuation.EvaluateOffline(ctx, o, c.Screening)
	if err != nil {
		out.Summary.Status = "failed"
		return out, err
	}
	if out.Screening.Paired.ExecutionStatus != "completed" || out.Screening.Paired.Coverage.Completed != c.Screening.Budget.MaxWorlds {
		return out, nil
	}
	out.Summary.TestedActions = append([]string{}, legal...)
	// Screening values choose a bounded fresh confirmation set; no screening row
	// is reused in an interval. Stable candidate IDs break exact ranking ties.
	means := make(map[string]float64, len(legal))
	mass := 0.0
	for i, row := range out.Screening.Values {
		mass += out.Screening.Weights[i]
		for j, v := range row {
			means[out.Screening.CandidateIDs[j]] += v * out.Screening.Weights[i]
		}
	}
	alternatives := []string{}
	for _, id := range legal {
		if id != c.OriginalID {
			alternatives = append(alternatives, id)
		}
	}
	sort.Slice(alternatives, func(i, j int) bool {
		a, z := means[alternatives[i]]/mass, means[alternatives[j]]/mass
		if a == z {
			return alternatives[i] < alternatives[j]
		}
		return a > z
	})
	if len(alternatives) > c.MaxAlternatives {
		alternatives = alternatives[:c.MaxAlternatives]
	}
	confirm := c.Screening
	confirm.Stream = "confirmation"
	confirm.Budget = c.ConfirmationBudget
	confirm.RootIDs = append([]string{c.OriginalID}, alternatives...)
	result, e := cardcontinuation.EvaluateOffline(ctx, o, confirm)
	out.Confirmation = &result
	if e != nil {
		out.Summary.Status = "failed"
		return out, e
	}
	if result.Paired.ExecutionStatus != "completed" || result.Paired.Coverage.Completed != confirm.Budget.MaxWorlds {
		return out, nil
	}
	out.UnconfirmedActions = []string{}
	for _, id := range legal {
		if !slices.Contains(confirm.RootIDs, id) {
			out.UnconfirmedActions = append(out.UnconfirmedActions, id)
		}
	}
	if len(alternatives) == 0 {
		out.Summary.Status = "completed"
		out.Summary.UntestedActions = []string{}
		return out, nil
	}
	out.Intervals, e = PairedIntervals(result.CandidateIDs, result.Values, result.Weights, c.Alpha)
	if e != nil {
		out.Summary.Limitations = append(out.Summary.Limitations, e.Error())
		return out, nil
	}
	out.Summary.UntestedActions = append([]string{}, out.UnconfirmedActions...)
	out.Summary.Status = "completed"
	out.Summary.EvidenceRefs = []string{"actor-observation:" + result.Paired.Provenance.PermittedInputDigest}
	for _, v := range out.Intervals {
		out.Summary.Values = append(out.Summary.Values, EvaluationValue{ActionID: v.ActionID, Value: v.Mean, Lower: v.Lower, Upper: v.Upper, Worlds: v.Worlds})
	}
	out.Summary.Assumptions = append(out.Summary.Assumptions, fmt.Sprintf("Bonferroni familywise alpha %g over %d confirmed paired comparisons; values use %s relative to the original action.", c.Alpha, len(out.Intervals), unit))
	return out, nil
}

// PairedIntervals uses Student-t intervals for independent equal-weight world
// differences with Bonferroni multiplicity. This is an approximation under the
// declared evaluator; importance-weighted rows require a different procedure.
func PairedIntervals(ids []string, rows [][]float64, weights []float64, alpha float64) ([]PairedInterval, error) {
	out := []PairedInterval{}
	if len(ids) < 2 || len(rows) < 2 || len(weights) != len(rows) || alpha <= 0 || alpha >= 1 || math.IsNaN(alpha) {
		return out, fmt.Errorf("paired interval needs complete independent confirmation rows")
	}
	for i, row := range rows {
		if len(row) != len(ids) || weights[i] <= 0 || math.IsNaN(weights[i]) || math.IsInf(weights[i], 0) || weights[i] != weights[0] {
			return out, fmt.Errorf("unequal weights or incomplete paired rows: intervals unavailable")
		}
		for _, v := range row {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return out, fmt.Errorf("nonfinite payoff")
			}
		}
	}
	critical := studentQuantile(1-alpha/(2*float64(len(ids)-1)), len(rows)-1)
	for j := 1; j < len(ids); j++ {
		mean := 0.0
		m2 := 0.0
		for i, row := range rows {
			delta := row[j] - row[0]
			change := delta - mean
			mean += change / float64(i+1)
			m2 += change * (delta - mean)
		}
		radius := critical * math.Sqrt(math.Max(0, m2)/float64(len(rows)-1)/float64(len(rows)))
		out = append(out, PairedInterval{ids[j], mean, mean - radius, mean + radius, len(rows), "bonferroni-paired-student-t-approximation-1.0.0"})
	}
	return out, nil
}
func studentQuantile(p float64, df int) float64 {
	cdf := func(x float64) float64 {
		return 1 - .5*regularizedBeta(float64(df)/(float64(df)+x*x), float64(df)/2, .5)
	}
	lo, hi := 0.0, 1.0
	for cdf(hi) < p {
		hi *= 2
	}
	for i := 0; i < 90; i++ {
		mid := (lo + hi) / 2
		if cdf(mid) < p {
			lo = mid
		} else {
			hi = mid
		}
	}
	return (lo + hi) / 2
}
func regularizedBeta(x, a, b float64) float64 {
	if x <= 0 {
		return 0
	}
	if x >= 1 {
		return 1
	}
	lgab, _ := math.Lgamma(a + b)
	lga, _ := math.Lgamma(a)
	lgb, _ := math.Lgamma(b)
	factor := math.Exp(lgab - lga - lgb + a*math.Log(x) + b*math.Log1p(-x))
	if x < (a+1)/(a+b+2) {
		return factor * betaFraction(a, b, x) / a
	}
	return 1 - factor*betaFraction(b, a, 1-x)/b
}
func betaFraction(a, b, x float64) float64 {
	const tiny = 1e-300
	qab, qap, qam := a+b, a+1, a-1
	c := 1.0
	dv := 1 - qab*x/qap
	if math.Abs(dv) < tiny {
		dv = tiny
	}
	dv = 1 / dv
	h := dv
	for m := 1; m <= 200; m++ {
		mf := float64(m)
		m2 := 2 * mf
		aa := mf * (b - mf) * x / ((qam + m2) * (a + m2))
		dv = 1 + aa*dv
		if math.Abs(dv) < tiny {
			dv = tiny
		}
		c = 1 + aa/c
		if math.Abs(c) < tiny {
			c = tiny
		}
		dv = 1 / dv
		h *= dv * c
		aa = -(a + mf) * (qab + mf) * x / ((a + m2) * (qap + m2))
		dv = 1 + aa*dv
		if math.Abs(dv) < tiny {
			dv = tiny
		}
		c = 1 + aa/c
		if math.Abs(c) < tiny {
			c = tiny
		}
		dv = 1 / dv
		delta := dv * c
		h *= delta
		if math.Abs(delta-1) < 3e-14 {
			break
		}
	}
	return h
}
