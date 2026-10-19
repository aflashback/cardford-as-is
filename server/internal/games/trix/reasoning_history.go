package trix

import (
	"cardford/server/internal/contracts"
	"context"
	"fmt"
	"math/rand/v2"
)

const HistoryPolicyID = "trix-history-1.0.0"
const HistoryTraceSchemaVersion = "trix-decision-trace-1.1.0"
const HistoryCueVersion = "trix-history-cues-1.0.0"

// HistoryEvidence is saved decision-time evidence, not a learned belief or an
// estimate of a partner's skill. Integer deltas retain exact native arithmetic.
type HistoryEvidence struct {
	Version                   string              `json:"version"`
	Coverage                  string              `json:"coverage"`
	Allocations               int                 `json:"allocations"`
	ObjectiveScale            int                 `json:"objectiveScale"`
	Comparisons               []HistoryComparison `json:"comparisons"`
	Signals                   []HistorySignal     `json:"signals"`
	Eligible                  bool                `json:"eligible"`
	DominantCandidateID       string              `json:"dominantCandidateId,omitempty"`
	PriorReasoningCandidateID string              `json:"priorReasoningCandidateId"`
	SelectedChanged           bool                `json:"selectedChanged"`
}

type HistoryComparison struct {
	CandidateID        string `json:"candidateId"`
	AlternativeID      string `json:"alternativeId"`
	MinimumScaledDelta int    `json:"minimumScaledDelta"`
	MaximumScaledDelta int    `json:"maximumScaledDelta"`
	Worse              int    `json:"worse"`
	Equal              int    `json:"equal"`
	Better             int    `json:"better"`
}

// KnownAlternatives lists cards publicly proved to have been held and legal at
// the earlier play. An empty list never becomes evidence of voluntary choice.
type HistorySignal struct {
	ID                string   `json:"id"`
	Seat              int      `json:"seat"`
	Ref               string   `json:"ref"`
	Chosen            string   `json:"chosen"`
	KnownAlternatives []string `json:"knownAlternatives"`
	Interpretation    string   `json:"interpretation"`
}

func isTracePolicy(policy string) bool {
	return policy == ReasoningPolicyID || policy == HistoryPolicyID || policy == FrontierPolicyID || usesOwnershipPolicy(policy)
}

func traceSchemaFor(policy string) string {
	if policy == OwnershipComparisonPolicyID {
		return OwnershipComparisonTraceSchemaVersion
	}
	if policy == OwnershipPolicyID {
		return OwnershipTraceSchemaVersion
	}
	if policy == FrontierPolicyID {
		return FrontierTraceSchemaVersion
	}
	if policy == HistoryPolicyID {
		return HistoryTraceSchemaVersion
	}
	return DecisionTraceSchemaVersion
}

func traceCandidates(o Observation, policy string) ([]DecisionCandidate, *HistoryEvidence) {
	candidates := []DecisionCandidate{}
	for _, action := range Legal(o) {
		candidates = append(candidates, reasoningCandidate(o, action))
	}
	if policy != HistoryPolicyID {
		return candidates, nil
	}
	evidence := historyEndgame(o, candidates)
	prior := 0
	for i, candidate := range candidates {
		if candidate.Value > candidates[prior].Value {
			prior = i
		}
	}
	evidence.PriorReasoningCandidateID = candidates[prior].CandidateID
	evidence.Signals = historySignals(o)
	if evidence.Coverage == "complete" {
		for i := range candidates {
			comparison := evidence.Comparisons[i]
			candidates[i].Support = append(candidates[i].Support, support("trix-history-comparison-"+candidates[i].Action.Card, "exact", fmt.Sprintf("Across all %d observation-compatible native-history allocations, this action's request-end margin difference versus %s is %d to %d divided by %d; worse/equal/better allocation counts are %d/%d/%d. These counts are not probabilities.", evidence.Allocations, comparison.AlternativeID, comparison.MinimumScaledDelta, comparison.MaximumScaledDelta, evidence.ObjectiveScale, comparison.Worse, comparison.Equal, comparison.Better)))
		}
		for i, comparison := range evidence.Comparisons {
			if comparison.Worse != 0 || comparison.Better == 0 {
				continue
			}
			evidence.DominantCandidateID = candidates[i].CandidateID
			evidence.SelectedChanged = i != prior
			// Rank only this proven narrow comparison. No behavioral signal adds
			// an action weight, and all future actors have exactly one legal move.
			for j := range candidates {
				candidates[j].Value = 0
				if i == j {
					candidates[j].Value = 1
				}
			}
			candidates[i].Purpose = "preserve the better forced finish"
			candidates[i].Reason = fmt.Sprintf("Playing %s is no worse than %s in every feasible allocation consistent with your own cards and public history, and improves the request-end score margin in %d of %d allocations. All moves after this trick are forced. The comparison includes both remaining tricks and native doubled-card scoring; it assumes no helpful or skilled teammate. Allocation counts are not probabilities, and this local result does not establish stronger complete-session play.", cardLabel(candidates[i].Action.Card), cardLabel(candidates[1-i].Action.Card), comparison.Better, evidence.Allocations)
			candidates[i].Support = append(candidates[i].Support, support("trix-history-forced-finish-dominance", "exact", "This action never lowers the native request-end objective versus the alternative across the complete feasible allocation set, and raises it in at least one allocation; every future seat's play is forced."))
			break
		}
	}
	return candidates, &evidence
}

// Only a fourth-seat penultimate trick is covered: after either root action,
// every seat has one card. Enumerating at most 3! remaining allocations avoids
// per-world future decisions and the strategy fusion they would introduce.
func historyEndgame(o Observation, candidates []DecisionCandidate) HistoryEvidence {
	e := HistoryEvidence{Version: "trix-history-evidence-1.0.0", Coverage: "outside-scope", ObjectiveScale: 1, Comparisons: []HistoryComparison{}, Signals: []HistorySignal{}}
	if !partners(o.VariantID) {
		e.ObjectiveScale = 3
	}
	if o.Phase != "playing" || len(o.Tricks) != 11 || len(o.Trick) != 3 || len(o.Hand) != 2 || len(candidates) != 2 || o.Seat < 0 || o.Seat > 3 || o.HandCounts[o.Seat] != 2 {
		return e
	}
	for seat, count := range o.HandCounts {
		if seat != o.Seat && count != 1 {
			return e
		}
	}
	e.Eligible = true
	config, err := evaluationProfile(tracePin(o), o)
	if err != nil {
		e.Coverage = "invalid-context"
		return e
	}
	c := DefaultRequestEvaluationConfig()
	c.MaxSamplerOperations, c.MaxSteps = 20000, 60
	work := EvaluationWork{}
	meter := &evaluationMeter{ctx: context.Background(), config: c, work: &work}
	p, err := newEvaluationSampler(o, config, meter)
	if err != nil || len(p.cards) != 3 {
		e.Coverage = "invalid-context"
		return e
	}
	rows := [][2]int{}
	var visit func(int, [4][]string, [4]int) error
	visit = func(index int, hands [4][]string, left [4]int) error {
		if err := meter.sample(); err != nil {
			return err
		}
		if index < len(p.cards) {
			for seat := 0; seat < 4; seat++ {
				if left[seat] == 0 || p.masks[index]&(1<<seat) == 0 {
					continue
				}
				next := hands
				next[seat] = []string{p.cards[index]}
				counts := left
				counts[seat]--
				if err := visit(index+1, next, counts); err != nil {
					return err
				}
			}
			return nil
		}
		s, ok, err := p.reconstruct(hands, rand.New(rand.NewPCG(1, 2)))
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		row := [2]int{}
		for i, candidate := range candidates {
			if err := meter.step(); err != nil {
				return err
			}
			branch, err := Apply(s, o.Seat, candidate.Action)
			if err != nil {
				return err
			}
			for branch.Phase != "round-complete" {
				if err := meter.step(); err != nil {
					return err
				}
				legal := Legal(Observe(branch, branch.Turn))
				if len(legal) != 1 {
					return fmt.Errorf("history continuation is not forced")
				}
				branch, err = Apply(branch, branch.Turn, legal[0])
				if err != nil {
					return err
				}
			}
			row[i] = historyScaledObjective(branch, o.Seat)
		}
		rows = append(rows, row)
		return nil
	}
	hands := [4][]string{}
	hands[o.Seat] = append([]string{}, o.Hand...)
	if err := visit(0, hands, p.capacities); err != nil {
		e.Coverage = "incomplete"
		return e
	}
	if len(rows) == 0 {
		e.Coverage = "no-feasible-allocation"
		return e
	}
	e.Coverage, e.Allocations = "complete", len(rows)
	for i, candidate := range candidates {
		comparison := HistoryComparison{CandidateID: candidate.CandidateID, AlternativeID: candidates[1-i].CandidateID, MinimumScaledDelta: rows[0][i] - rows[0][1-i], MaximumScaledDelta: rows[0][i] - rows[0][1-i]}
		for _, row := range rows {
			delta := row[i] - row[1-i]
			if delta < comparison.MinimumScaledDelta {
				comparison.MinimumScaledDelta = delta
			}
			if delta > comparison.MaximumScaledDelta {
				comparison.MaximumScaledDelta = delta
			}
			switch {
			case delta < 0:
				comparison.Worse++
			case delta > 0:
				comparison.Better++
			default:
				comparison.Equal++
			}
		}
		e.Comparisons = append(e.Comparisons, comparison)
	}
	return e
}

func historyScaledObjective(s State, seat int) int {
	own, others := 0, 0
	for _, score := range scores(s, s.DealNumber, 0) {
		mine := false
		for _, member := range score.Seats {
			mine = mine || member == seat
		}
		if mine {
			own = score.Total
		} else {
			others += score.Total
		}
	}
	if partners(s.Config.Variant) {
		return own - others
	}
	return 3*own - others
}

func historySignals(o Observation) []HistorySignal {
	out := []HistorySignal{}
	for _, declaration := range o.Declarations {
		if contains(declaration.Cards, "HK") {
			out = append(out, HistorySignal{ID: "trix-history-double-HK", Seat: declaration.Seat, Ref: declaration.Ref, Chosen: "HK", KnownAlternatives: []string{"decline doubling"}, Interpretation: "Choosing to double the king of hearts may suggest protective heart holdings, but proves ownership of the king only. Low hearts, the ace, escape success and intention remain unknown; this signal changes no action score."})
		}
	}
	tricks := append(append([]Trick{}, o.Tricks...), Trick{Number: len(o.Tricks) + 1, Plays: o.Trick})
	for ti, trick := range tricks {
		for pi, play := range trick.Plays {
			known := []string{}
			// A later public play proves that card was still held at this earlier
			// turn. Today's own cards are also usable for this actor's past turns.
			for later := ti + 1; later < len(tricks); later++ {
				for _, future := range tricks[later].Plays {
					if future.Seat == play.Seat {
						known = append(known, future.Card)
					}
				}
			}
			if play.Seat == o.Seat {
				known = append(known, o.Hand...)
			}
			alternatives := []string{}
			for _, card := range known {
				legal := pi == 0 || play.Card[0] != trick.Plays[0].Card[0] || card[0] == trick.Plays[0].Card[0]
				if legal && card != play.Card {
					alternatives = append(alternatives, card)
				}
			}
			if len(alternatives) == 0 {
				continue
			}
			if pi == 0 && play.Card[0] == 'H' && partners(o.VariantID) {
				out = append(out, HistorySignal{ID: fmt.Sprintf("trix-history-heart-lead-%d-%d", trick.Number, play.Seat), Seat: play.Seat, Ref: fmt.Sprintf("trick:%d", trick.Number), Chosen: play.Card, KnownAlternatives: alternatives, Interpretation: "A voluntary heart lead may offer a teammate holding the heart ace an opportunity to release it. The lead does not prove who holds the ace or the leader's intention; declining to play the ace does not prove its absence. This signal changes no action score."})
			}
		}
	}
	return append(out, layoutHistorySignals(o)...)
}

func traceFactCatalog(o Observation, policy string, evidence *HistoryEvidence) []contracts.CoachSupport {
	out := contextSupport(o)
	if !usesHistoryPolicy(policy) {
		return out
	}
	out = append(out, layoutHistoryFacts(o)...)
	for _, signal := range evidence.Signals {
		out = append(out, support(signal.ID, "conditional", signal.Interpretation))
	}
	if o.Phase == "layout" && o.LayoutHistory == nil {
		out = append(out, support("trix-history-layout-evidence-gap", "conditional", "This observation retains the board and forced passes, but no chronological placement ownership and voluntary alternative sets. Repeated upper-side choices or a delayed lower frontier card cannot establish a preference here; a forced jack is not a behavioral signal. Forced passes constrain ownership at their saved boards, and public twos announcements remain exact constraints."))
	}
	coverage := fmt.Sprintf("History endgame coverage: %s. Outside the fourth-seat two-card penalty finish, action scores retain trix-reasoning-1.0.0; behavioral observations receive no numeric weight.", evidence.Coverage)
	if policy == FrontierPolicyID {
		coverage = fmt.Sprintf("History endgame coverage: %s. The frontier candidate inherits history policy scores except for own-card gap credit in unforced Partners Jacks choices; behavioral observations receive no numeric weight.", evidence.Coverage)
	}
	if usesOwnershipPolicy(policy) {
		coverage = fmt.Sprintf("History endgame coverage: %s. The ownership candidate inherits history policy scores and applies exact four-two exclusions to the existing immediate-opening terms in supported Partners Jacks observations; behavioral observations receive no numeric weight.", evidence.Coverage)
	}
	out = append(out, support("trix-history-coverage", "policy", coverage))
	return out
}

func traceSelectedSupport(o Observation, policy string, candidate DecisionCandidate, evidence *HistoryEvidence) []contracts.CoachSupport {
	out := append(relevantSupport(o, candidate.Action), candidate.Support...)
	if usesHistoryPolicy(policy) {
		for _, fact := range traceFactCatalog(o, policy, evidence) {
			if fact.ID == "trix-history-coverage" || fact.ID == "trix-history-layout-evidence-gap" || fact.ID == "trix-history-layout-provenance" {
				out = append(out, fact)
			}
		}
	}
	return append(out, support("trix-heuristic-preference", "policy", "A fixed deterministic heuristic compares every legal action; its scores are not calibrated probabilities."))
}
