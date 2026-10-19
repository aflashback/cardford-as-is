// Package beliefs implements offline, handwritten mathematical assumptions.
// No installed bot or coach imports this experimental package.
package beliefs

import (
	"fmt"
	"math"
)

const Version = "spades-public-beliefs-1.0.0"

type Style string

const (
	UniformLegal        Style = "uniform-legal-1.0.0"
	ConserveHonors      Style = "conserve-under-partner-ace-1.0.0"
	HighestSafe         Style = "highest-under-partner-ace-1.0.0"
	NilEquivalentHonors Style = "nil-equivalent-honors-1.0.0"
)

type StyleWeight struct {
	Style  Style   `json:"style"`
	Weight float64 `json:"weight"`
}
type Config struct {
	Version             string           `json:"version"`
	Mode                string           `json:"mode"`
	Players             [4][]StyleWeight `json:"players"`
	MistakeAllowance    float64          `json:"mistakeAllowance"`
	MaxOperations       int              `json:"maxOperations"`
	MinEffectiveSamples float64          `json:"minEffectiveSamples"`
}

func DefaultConfig() Config {
	return Config{Version: Version, Mode: "constraint-only", MistakeAllowance: .1, MaxOperations: 2000000, MinEffectiveSamples: 2}
}
func (c Config) Validate() error {
	if c.Version != Version || (c.Mode != "constraint-only" && c.Mode != "style-mixture") || !finite(c.MistakeAllowance) || c.MistakeAllowance <= 0 || c.MistakeAllowance >= 1 || c.MaxOperations < 1 || !finite(c.MinEffectiveSamples) || c.MinEffectiveSamples < 1 {
		return fmt.Errorf("unsupported belief configuration")
	}
	if c.Mode == "constraint-only" {
		for _, ps := range c.Players {
			if len(ps) != 0 {
				return fmt.Errorf("constraint-only cannot carry behavioral profiles")
			}
		}
		return nil
	}
	for _, ps := range c.Players {
		if len(ps) == 0 || len(ps) > 4 {
			return fmt.Errorf("each player needs a bounded explicit style mixture")
		}
		seen := map[Style]bool{}
		sum := 0.0
		for _, p := range ps {
			if !finite(p.Weight) || p.Weight <= 0 || seen[p.Style] {
				return fmt.Errorf("invalid style mass")
			}
			seen[p.Style] = true
			sum += p.Weight
			switch p.Style {
			case UniformLegal, ConserveHonors, HighestSafe, NilEquivalentHonors:
			default:
				return fmt.Errorf("unsupported handwritten style %q", p.Style)
			}
		}
		if !finite(sum) {
			return fmt.Errorf("style mass overflow")
		}
	}
	return nil
}
func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
