package coachlab

import (
	b "cardford/server/internal/games/spades/reasoning/beliefs"
	d "cardford/server/internal/legacydecision"
	"context"
	"fmt"
	"reflect"
)

type Population struct {
	ID       string    `json:"id"`
	Policies [4]string `json:"policies"`
	Belief   *b.Config `json:"belief,omitempty"`
}
type PopulationRun struct {
	Population Population       `json:"population"`
	Comparison ComparisonResult `json:"comparison"`
}
type PopulationSensitivity struct {
	SchemaVersion string          `json:"schemaVersion"`
	Status        string          `json:"status"`
	Runs          []PopulationRun `json:"runs"`
	SignReversals []string        `json:"signReversals"`
	Limitations   []string        `json:"limitations"`
}

// EvaluatePopulationSensitivity runs only explicitly named frozen code policies.
// Different weights of one behavior model do not count as independent expertise.
func EvaluatePopulationSensitivity(ctx context.Context, o d.Observation, c EvaluationConfig, populations []Population) (out PopulationSensitivity, err error) {
	out = PopulationSensitivity{SchemaVersion: "coach-lab-population-sensitivity-1.0.0", Status: "untested", Runs: []PopulationRun{}, SignReversals: []string{}, Limitations: []string{"Sensitivity is descriptive; these code policies are not established independent experts.", "The low-legal policy is a deliberately simple mismatch control; robust performance against unfamiliar competent partners remains untested.", "Screened alternative sets may differ between populations; absent comparisons are not agreement."}}
	if len(populations) < 2 || len(populations) > 4 {
		return out, fmt.Errorf("sensitivity requires two to four declared populations")
	}
	seen := map[string]bool{}
	for i, p := range populations {
		if p.ID == "" || seen[p.ID] {
			return out, fmt.Errorf("duplicate/empty population ID")
		}
		seen[p.ID] = true
		for _, previous := range populations[:i] {
			if reflect.DeepEqual(p.Policies, previous.Policies) && reflect.DeepEqual(p.Belief, previous.Belief) {
				return out, fmt.Errorf("duplicate population assumptions")
			}
		}
	}
	signs := map[string]int{}
	out.Status = "completed-descriptive"
	for _, p := range populations {
		local := c
		local.Screening.Policies = p.Policies
		local.Screening.Belief = p.Belief
		result, e := EvaluateOffline(ctx, o, local)
		out.Runs = append(out.Runs, PopulationRun{p, result})
		if e != nil {
			out.Status = "incomplete"
			return out, e
		}
		if result.Summary.Status != "completed" {
			out.Status = "incomplete"
		}
		for _, interval := range result.Intervals {
			sign := 0
			if interval.Mean > 0 {
				sign = 1
			} else if interval.Mean < 0 {
				sign = -1
			}
			previous, ok := signs[interval.ActionID]
			if ok && sign*previous < 0 {
				found := false
				for _, id := range out.SignReversals {
					found = found || id == interval.ActionID
				}
				if !found {
					out.SignReversals = append(out.SignReversals, interval.ActionID)
				}
			}
			if !ok || previous == 0 {
				signs[interval.ActionID] = sign
			}
		}
	}
	return out, nil
}
