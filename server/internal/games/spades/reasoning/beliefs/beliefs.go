package beliefs

import (
	d "cardford/server/internal/legacydecision"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"slices"
)

// PriorWeight is prior(D)/proposal(D), up to a common constant. The installed
// uniform constrained proposal supplies 1. Synthetic allocations are private
// workspace only and never serialized in a review result.
type Allocation struct {
	Hands       [4][]string
	PriorWeight float64
}
type CardEstimate struct {
	Card          string     `json:"card"`
	Probability   [4]float64 `json:"probability"`
	PossibleSeats []int      `json:"possibleSeats"`
	Status        string     `json:"status"`
}
type SuitEstimate struct {
	Seat             int         `json:"seat"`
	Suit             string      `json:"suit"`
	CountProbability [14]float64 `json:"countProbability"`
	Status           string      `json:"status"`
}
type Constraint struct {
	Kind        string   `json:"kind"`
	Seat        int      `json:"seat"`
	Card        string   `json:"card,omitempty"`
	Suit        string   `json:"suit,omitempty"`
	EvidenceIDs []string `json:"evidenceIds"`
}
type Result struct {
	SchemaVersion     string         `json:"schemaVersion"`
	Status            string         `json:"status"`
	ObservationDigest string         `json:"observationDigest"`
	Configuration     Config         `json:"configuration"`
	Constraints       []Constraint   `json:"constraints"`
	Cards             []CardEstimate `json:"cards"`
	Suits             []SuitEstimate `json:"suits"`
	EvidenceIDs       []string       `json:"evidenceIds"`
	EffectiveSamples  float64        `json:"effectiveSamples"`
	Allocations       int            `json:"allocations"`
	Operations        int            `json:"operations"`
	FallbackReason    string         `json:"fallbackReason,omitempty"`
	Limitations       []string       `json:"limitations"`
	Weights           []float64      `json:"-"`
}

func AnalyzeAllocations(ctx context.Context, o d.Observation, worlds []Allocation, c Config) (Result, error) {
	out := Result{SchemaVersion: "coach-lab-beliefs-1.0.0", Status: "completed", Configuration: c, Constraints: []Constraint{}, Cards: []CardEstimate{}, Suits: []SuitEstimate{}, EvidenceIDs: []string{}, Limitations: []string{"Handwritten behavior assumptions are uncalibrated research hypotheses.", "Sampled absence is not proof of impossible ownership; possibleSeats retains the public logical domain.", "No best-move or strategy-strength conclusion follows from these card estimates.", "Only fourth-seat follows under a partner ace have behavioral likelihoods; bids and other events are not modeled."}}
	if ctx == nil {
		return out, fmt.Errorf("execution context required")
	}
	if err := c.Validate(); err != nil {
		return out, err
	}
	charge := func(n int) bool {
		if n > c.MaxOperations-out.Operations {
			out.Status = "budget-exhausted"
			out.FallbackReason = "fixed-work-exhausted"
			return false
		}
		out.Operations += n
		return true
	}
	if len(worlds) > 4096 || len(o.Events) > 32768 {
		return out, fmt.Errorf("belief workspace exceeds bounded profile")
	}
	if !charge(52 + len(o.Events)) {
		return out, nil
	}
	if err := d.ValidateObservationContext(ctx, o); err != nil {
		return out, err
	}
	raw, _ := json.Marshal(o)
	sum := sha256.Sum256(raw)
	out.ObservationDigest = hex.EncodeToString(sum[:])
	if len(worlds) == 0 {
		out.Status = "insufficient-support"
		out.FallbackReason = "no-feasible-proposals"
		return out, nil
	}
	logs := make([]float64, len(worlds))
	for i, w := range worlds {
		if err := ctx.Err(); err != nil {
			out.Status = "incomplete"
			out.FallbackReason = "external-cancellation"
			return out, err
		}
		if !charge(52 + len(o.Events) + (4*len(o.History)+len(o.Trick))*60) {
			return out, nil
		}
		if !finite(w.PriorWeight) || w.PriorWeight <= 0 {
			return out, fmt.Errorf("prior/proposal weight must be positive finite")
		}
		history, err := HistoryInputs(o, w.Hands)
		if err != nil {
			return out, fmt.Errorf("allocation %d: %w", i, err)
		}
		likelihood, ids := LogLikelihood(history, o.Seat, c)
		logs[i] = math.Log(w.PriorWeight) + likelihood
		if i == 0 {
			out.EvidenceIDs = ids
		}
	}
	if !charge(len(worlds)*104 + 52*4) {
		return out, nil
	}
	// Center before exponentiating, then divide by the summed scaled mass.
	// Subtracting log(sum(exp(.))) alone can leave all probabilities shifted
	// above one by a few ulps, especially when a large common log prior cancels.
	maximum := slices.Max(logs)
	out.Weights = make([]float64, len(logs))
	for i, v := range logs {
		out.Weights[i] = math.Exp(v - maximum)
		if out.Weights[i] == 0 {
			return out, fmt.Errorf("posterior underflow; no ownership may be deleted")
		}
	}
	if err := normalizeNonnegativeMass(out.Weights); err != nil {
		return out, err
	}
	var weightSum, squares compensatedSum
	for _, weight := range out.Weights {
		if weight == 0 {
			return out, fmt.Errorf("posterior underflow; no ownership may be deleted")
		}
		weightSum.add(weight)
		squares.add(weight * weight)
	}
	// This scale-invariant form also accounts for residual rounding in sum(w).
	// The mathematical bounds follow from positive weights, not an assumption
	// about sample quality; this does not relax the configured support gate.
	total := weightSum.value()
	out.EffectiveSamples = math.Max(1, math.Min(float64(len(worlds)), total*total/squares.value()))
	out.Allocations = len(worlds)
	facts := d.BuildFacts(o)
	for _, card := range o.Hand {
		out.Constraints = append(out.Constraints, Constraint{Kind: "own-card", Seat: o.Seat, Card: card, EvidenceIDs: []string{"actor-hand"}})
	}
	for _, m := range d.GetMemory(o) {
		for _, seat := range m.VoidSeats {
			ids := []string{}
			idx := 0
			all := [][]d.Play{}
			for _, t := range o.History {
				all = append(all, t.Plays)
			}
			all = append(all, o.Trick)
			for _, ps := range all {
				for _, p := range ps {
					if len(ps) > 0 && p.Seat == seat && d.CardSuit(ps[0].Card) == m.Suit && d.CardSuit(p.Card) != m.Suit {
						ids = append(ids, fmt.Sprintf("hand:%d/play:%d", o.HandNumber, idx))
					}
					idx++
				}
			}
			out.Constraints = append(out.Constraints, Constraint{Kind: "proven-void", Seat: seat, Suit: m.Suit, EvidenceIDs: ids})
		}
	}
	played := map[string]bool{}
	for _, card := range facts.PlayedCards {
		played[card] = true
	}
	for _, card := range d.FullDeck() {
		if played[card] {
			continue
		}
		m := CardEstimate{Card: card, Status: "conditional", PossibleSeats: []int{}}
		if slices.Contains(o.Hand, card) {
			m.PossibleSeats = []int{o.Seat}
			m.Status = "known-own"
		} else {
			for _, p := range facts.PossibleOwners {
				if p.Card == card {
					m.PossibleSeats = append([]int{}, p.Seats...)
					break
				}
			}
		}
		for i, w := range worlds {
			for seat, cs := range w.Hands {
				if slices.Contains(cs, card) {
					m.Probability[seat] += out.Weights[i]
				}
			}
		}
		if err := normalizeNonnegativeMass(m.Probability[:]); err != nil {
			return out, err
		}
		out.Cards = append(out.Cards, m)
	}
	for seat := 0; seat < 4; seat++ {
		for _, suit := range d.Suits() {
			m := SuitEstimate{Seat: seat, Suit: suit, Status: "conditional"}
			if seat == o.Seat {
				m.Status = "known-own"
			}
			for i, w := range worlds {
				n := 0
				for _, card := range w.Hands[seat] {
					if d.CardSuit(card) == suit {
						n++
					}
				}
				m.CountProbability[n] += out.Weights[i]
			}
			if err := normalizeNonnegativeMass(m.CountProbability[:]); err != nil {
				return out, err
			}
			out.Suits = append(out.Suits, m)
		}
	}
	// Compensated positive sums and divisions incur only a few ulps. Permit
	// eight machine epsilons at this one numerical comparison, rather than
	// reducing the substantive ESS threshold or accepting invalid source mass.
	essTolerance := 8 * (math.Nextafter(1, 2) - 1) * math.Max(out.EffectiveSamples, c.MinEffectiveSamples)
	if out.EffectiveSamples+essTolerance < c.MinEffectiveSamples {
		out.Status = "insufficient-support"
		out.FallbackReason = "effective-sample-count-below-declared-minimum"
	}
	return out, nil
}

type compensatedSum struct{ sum, correction float64 }

func (s *compensatedSum) add(value float64) {
	next := s.sum + value
	if math.Abs(s.sum) >= math.Abs(value) {
		s.correction += (s.sum - next) + value
	} else {
		s.correction += (value - next) + s.sum
	}
	s.sum = next
}
func (s compensatedSum) value() float64 { return s.sum + s.correction }

// Each marginal is a nonnegative partition of the same posterior mass. Divide
// by its compensated total so strict schema bounds hold even when a category
// accumulated 1+roundoff. Invalid/nonfinite mass is rejected, never clipped.
func normalizeNonnegativeMass(values []float64) error {
	var sum compensatedSum
	maximum := 0.0
	for _, value := range values {
		if !finite(value) || value < 0 {
			return fmt.Errorf("invalid posterior mass")
		}
		sum.add(value)
		maximum = math.Max(maximum, value)
	}
	total := sum.value()
	if !finite(total) || total <= 0 {
		return fmt.Errorf("invalid posterior total")
	}
	// A sum of nonnegative terms cannot be smaller than its largest term.
	// Preserve that exact bound if floating-point accumulation rounds down.
	total = math.Max(total, maximum)
	for i := range values {
		values[i] /= total
	}
	return nil
}
