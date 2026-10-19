package coachlab

import (
	b "cardford/server/internal/games/spades/reasoning/beliefs"
	"fmt"
	"math"
	"slices"
)

// These are private offline scorer inputs, not inference or judge contracts.
// The archive loader must verify the closed receipt and frozen prediction bytes
// before constructing them. No actor API accepts a ClosedTruth.
type FrozenPrediction struct {
	DecisionID, FamilyID, Partition, ObservationDigest string
	Cards                                              []b.CardEstimate
	Suits                                              []b.SuitEstimate
}
type ClosedTruth struct {
	DecisionID, ObservationDigest, ReceiptDigest string
	ClosedRun                                    bool
	Hands                                        [4][]string
}
type ReliabilityBand struct {
	Lower          float64 `json:"lower"`
	Upper          float64 `json:"upper"`
	Count          int     `json:"count"`
	MeanPrediction float64 `json:"meanPrediction"`
	Frequency      float64 `json:"frequency"`
}
type CalibrationReceipt struct {
	SchemaVersion              string            `json:"schemaVersion"`
	Partition                  string            `json:"partition"`
	Cards                      int               `json:"cards"`
	Suits                      int               `json:"suits"`
	Families                   int               `json:"families"`
	MeanBrier                  float64           `json:"meanBrier"`
	MeanLogLoss                float64           `json:"meanLogLoss"`
	MeanSuitBrier              float64           `json:"meanSuitBrier"`
	ImpossibleTruthPredictions int               `json:"impossibleTruthPredictions"`
	ErroneousNearCertainties   int               `json:"erroneousNearCertainties"`
	Reliability                []ReliabilityBand `json:"reliability"`
	Limitations                []string          `json:"limitations"`
}

func ScoreBeliefCalibration(predictions []FrozenPrediction, truths []ClosedTruth, partition string) (out CalibrationReceipt, err error) {
	out = CalibrationReceipt{SchemaVersion: "coach-lab-private-calibration-1.0.0", Partition: partition, Reliability: []ReliabilityBand{}, Limitations: []string{"Truth scores card-location predictions only; it never labels a best action.", "Descriptive aggregates only; no family-level confidence interval or strategy-strength claim.", "Log loss clips zero probability at 1e-15 and separately counts impossible-truth predictions."}}
	if !slices.Contains([]string{"development", "judge-calibration-fit", "judge-calibration-audit", "validation"}, partition) || len(predictions) == 0 {
		return out, fmt.Errorf("invalid calibration partition/empty input")
	}
	byID := map[string]ClosedTruth{}
	for _, truth := range truths {
		if !truth.ClosedRun || !validHash(truth.ReceiptDigest) || truth.DecisionID == "" {
			return out, fmt.Errorf("verified closed-run receipt required")
		}
		if _, ok := byID[truth.DecisionID]; ok {
			return out, fmt.Errorf("duplicate truth")
		}
		byID[truth.DecisionID] = truth
	}
	seen := map[string]bool{}
	families := map[string]bool{}
	bands := [10]ReliabilityBand{}
	for i := range bands {
		bands[i].Lower = float64(i) / 10
		bands[i].Upper = float64(i+1) / 10
	}
	for _, p := range predictions {
		truth, ok := byID[p.DecisionID]
		if !ok || p.Partition != partition || p.FamilyID == "" || p.ObservationDigest == "" || p.ObservationDigest != truth.ObservationDigest || seen[p.DecisionID] {
			return out, fmt.Errorf("prediction/truth identity or partition mismatch")
		}
		seen[p.DecisionID] = true
		families[p.FamilyID] = true
		owners := map[string]int{}
		for seat, cs := range truth.Hands {
			for _, card := range cs {
				if _, ok := owners[card]; ok {
					return out, fmt.Errorf("duplicate private truth card")
				}
				owners[card] = seat
			}
		}
		cardSeen := map[string]bool{}
		for _, m := range p.Cards {
			if m.Status == "known-own" {
				continue
			}
			seat, ok := owners[m.Card]
			if !ok || cardSeen[m.Card] {
				return out, fmt.Errorf("missing/duplicate truth for forecast")
			}
			cardSeen[m.Card] = true
			sum := 0.0
			score := 0.0
			for s, v := range m.Probability {
				if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 1 {
					return out, fmt.Errorf("invalid frozen probability")
				}
				sum += v
				y := 0.0
				if s == seat {
					y = 1
				}
				score += (v - y) * (v - y)
				band := min(9, int(v*10))
				bands[band].Count++
				bands[band].MeanPrediction += v
				bands[band].Frequency += y
				if v >= .95 && s != seat {
					out.ErroneousNearCertainties++
				}
			}
			if math.Abs(sum-1) > 1e-8 {
				return out, fmt.Errorf("unnormalized frozen probability")
			}
			out.Cards++
			out.MeanBrier += score
			truthP := m.Probability[seat]
			if truthP == 0 {
				out.ImpossibleTruthPredictions++
			}
			out.MeanLogLoss -= math.Log(math.Max(1e-15, truthP))
		}
		for _, m := range p.Suits {
			if m.Status == "known-own" {
				continue
			}
			if m.Seat < 0 || m.Seat > 3 {
				return out, fmt.Errorf("invalid forecast seat")
			}
			n := 0
			for _, card := range truth.Hands[m.Seat] {
				if len(card) > 0 && card[:1] == m.Suit {
					n++
				}
			}
			sum := 0.0
			score := 0.0
			for count, v := range m.CountProbability {
				if v < 0 || v > 1 || math.IsNaN(v) || math.IsInf(v, 0) {
					return out, fmt.Errorf("invalid suit probability")
				}
				sum += v
				y := 0.0
				if count == n {
					y = 1
				}
				score += (v - y) * (v - y)
			}
			if math.Abs(sum-1) > 1e-8 {
				return out, fmt.Errorf("unnormalized suit forecast")
			}
			out.Suits++
			out.MeanSuitBrier += score
		}
	}
	if out.Cards > 0 {
		out.MeanBrier /= float64(out.Cards)
		out.MeanLogLoss /= float64(out.Cards)
	}
	if out.Suits > 0 {
		out.MeanSuitBrier /= float64(out.Suits)
	}
	out.Families = len(families)
	for _, band := range bands {
		if band.Count > 0 {
			band.MeanPrediction /= float64(band.Count)
			band.Frequency /= float64(band.Count)
		}
		out.Reliability = append(out.Reliability, band)
	}
	return out, nil
}
