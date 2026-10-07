// Package knowledge keeps proofs, feasible holdings and soft beliefs separate.
package knowledge

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
)

type ProvenConstraint struct {
	ID       string
	Evidence []string
}
type FeasibleHolding struct {
	Item  string
	Seats []int
}
type SoftWeight struct {
	ModelVersion string
	Value        float64
}
type Event struct {
	Sequence  int             `json:"sequence"`
	Kind      string          `json:"kind"`
	VisibleTo []int           `json:"visibleTo,omitempty"`
	Value     json.RawMessage `json:"value"`
}
type Memory struct {
	Version string  `json:"version"`
	Actor   int     `json:"actor"`
	At      int     `json:"at"`
	Events  []Event `json:"events"`
}

func Reconstruct(events []Event, actor, at int) (Memory, error) {
	m := Memory{Version: "actor-memory-2.0.0", Actor: actor, At: at, Events: []Event{}}
	if actor < 0 || actor > 3 || at < 0 {
		return m, fmt.Errorf("invalid actor or chronology")
	}
	last := 0
	for _, e := range events {
		if e.Sequence <= last || e.Kind == "" || !json.Valid(e.Value) {
			return m, fmt.Errorf("invalid chronological event")
		}
		last = e.Sequence
		for _, s := range e.VisibleTo {
			if s < 0 || s > 3 {
				return m, fmt.Errorf("invalid visibility")
			}
		}
		if e.Sequence > at {
			continue
		}
		if len(e.VisibleTo) > 0 && !slices.Contains(e.VisibleTo, actor) {
			continue
		}
		copy := e
		copy.Value = append(json.RawMessage{}, e.Value...)
		copy.VisibleTo = append([]int{}, e.VisibleTo...)
		m.Events = append(m.Events, copy)
	}
	return m, nil
}
func ValidateSoftWeight(weight SoftWeight) error {
	if weight.ModelVersion == "" || weight.Value <= 0 || math.IsNaN(weight.Value) || math.IsInf(weight.Value, 0) {
		return fmt.Errorf("soft weight must have positive finite support")
	}
	return nil
}
