package trix

import (
	"cardford/server/internal/contracts"
	"fmt"
	"math"
	"strings"
)

const OwnershipComparisonPolicyID = "trix-ownership-comparison-1.0.0"
const OwnershipComparisonTraceSchemaVersion = "trix-decision-trace-1.4.0"
const OwnershipComparisonCueVersion = "trix-ownership-comparison-cues-1.0.0"
const ownershipComparisonEvidenceVersion = "trix-ownership-comparison-evidence-1.0.0"

// This revision changes presentation only. Scores, legal order and ownership
// deductions are inherited intact from OwnershipPolicyID.
func usesOwnershipPolicy(policy string) bool {
	return policy == OwnershipPolicyID || policy == OwnershipComparisonPolicyID
}

type OwnershipComparisonEvidence struct {
	Version     string                      `json:"version"`
	Coverage    string                      `json:"coverage"`
	Comparisons []OwnershipLayoutComparison `json:"comparisons"`
}

type OwnershipLayoutComparison struct {
	CandidateID    string               `json:"candidateId"`
	InheritedValue float64              `json:"inheritedValue"`
	OwnOpenings    []string             `json:"ownOpenings"`
	KnownOpenings  []KnownLayoutOpening `json:"knownOpenings"`
}

type KnownLayoutOpening struct {
	Card       string  `json:"card"`
	Holder     int     `json:"holder"`
	CardsLeft  int     `json:"cardsLeft"`
	Adjustment float64 `json:"adjustment"`
	SupportID  string  `json:"supportId"`
}

// Only a frozen seat observation and its already computed ownership evidence
// enter this function. It neither chooses an action nor evaluates future play.
func buildOwnershipComparisonEvidence(o Observation, candidates []DecisionCandidate, ownership *OwnershipEvidence) *OwnershipComparisonEvidence {
	e := &OwnershipComparisonEvidence{Version: ownershipComparisonEvidenceVersion, Coverage: "outside-scope", Comparisons: []OwnershipLayoutComparison{}}
	if o.Phase != "layout" {
		return e
	}
	e.Coverage = "layout"
	for _, candidate := range candidates {
		a := candidate.Action
		if a.Kind != "layout-card" {
			continue
		}
		comparison := OwnershipLayoutComparison{CandidateID: candidate.CandidateID, InheritedValue: candidateValue(o, a), OwnOpenings: []string{}, KnownOpenings: []KnownLayoutOpening{}}
		board := append([]Row{}, o.Board...)
		for i, row := range board {
			if row.Suit != a.Card[:1] {
				continue
			}
			if row.Low == 0 {
				board[i].Low, board[i].High = rank(a.Card), rank(a.Card)
			} else {
				board[i].Low = min(row.Low, rank(a.Card))
				board[i].High = max(row.High, rank(a.Card))
			}
		}
		for _, card := range Deck() {
			if card == a.Card || !placeable(board, card) || placeable(o.Board, card) {
				continue
			}
			if contains(o.Hand, card) {
				comparison.OwnOpenings = append(comparison.OwnOpenings, card)
			}
			holders := possibleHolders(o, card)
			if ownership != nil && ownership.Eligible {
				for _, two := range ownership.Twos {
					if two.Card == card {
						holders = two.PossibleHolders
					}
				}
			}
			if len(holders) != 1 || holders[0] == o.Seat {
				continue
			}
			holder := holders[0]
			adjustment := openingAdjustment(o.VariantID, o.Seat, holder, o.HandCounts[holder])
			comparison.KnownOpenings = append(comparison.KnownOpenings, KnownLayoutOpening{Card: card, Holder: holder, CardsLeft: o.HandCounts[holder], Adjustment: adjustment, SupportID: "trix-layout-unlock-" + a.Card + "-" + card})
		}
		e.Comparisons = append(e.Comparisons, comparison)
	}
	return e
}

func openingAdjustment(variant string, actor, holder, cardsLeft int) float64 {
	amount := 8.0
	if cardsLeft == 1 {
		amount = 45
	}
	if partners(variant) && actor%2 == holder%2 {
		return amount
	}
	return -amount
}

func comparisonFor(t DecisionTrace, id string) *OwnershipLayoutComparison {
	if t.OwnershipComparisonEvidence == nil {
		return nil
	}
	for i := range t.OwnershipComparisonEvidence.Comparisons {
		c := &t.OwnershipComparisonEvidence.Comparisons[i]
		if c.CandidateID == id {
			return c
		}
	}
	return nil
}

// Verify saved structure and candidate/support binding without an observation
// or selector. The full actor-packet validator separately recomputes all facts.
func savedOwnershipComparisonConsistent(t DecisionTrace) bool {
	e := t.OwnershipComparisonEvidence
	if e == nil || e.Version != ownershipComparisonEvidenceVersion {
		return false
	}
	if t.Phase != "layout" {
		return e.Coverage == "outside-scope" && len(e.Comparisons) == 0
	}
	if e.Coverage != "layout" {
		return false
	}
	seen := map[string]bool{}
	for _, comparison := range e.Comparisons {
		if seen[comparison.CandidateID] || math.IsNaN(comparison.InheritedValue) || math.IsInf(comparison.InheritedValue, 0) {
			return false
		}
		seen[comparison.CandidateID] = true
		var candidate *DecisionCandidate
		for i := range t.Candidates {
			if t.Candidates[i].CandidateID == comparison.CandidateID {
				candidate = &t.Candidates[i]
			}
		}
		if candidate == nil || candidate.Action.Kind != "layout-card" {
			return false
		}
		ownFact := support("trix-layout-own-connections-"+candidate.Action.Card, "exact", fmt.Sprintf("This placement immediately opens %d cards in your own hand: %s.", len(comparison.OwnOpenings), strings.Join(comparison.OwnOpenings, ", ")))
		if !hasComparisonSupport(candidate.Support, ownFact) {
			return false
		}
		value := comparison.InheritedValue
		opened := map[string]bool{}
		for _, opening := range comparison.KnownOpenings {
			if opening.Holder < 0 || opening.Holder > 3 || opening.Holder == t.Actor || opening.CardsLeft < 1 || opening.CardsLeft > 13 || opened[opening.Card] || opening.Adjustment != openingAdjustment(t.VariantID, t.Actor, opening.Holder, opening.CardsLeft) || opening.SupportID != "trix-layout-unlock-"+candidate.Action.Card+"-"+opening.Card {
				return false
			}
			opened[opening.Card] = true
			fact := support(opening.SupportID, "exact", fmt.Sprintf("Placing %s makes %s available to seat %d, its only observation-compatible holder; that seat has %d cards left.", cardLabel(candidate.Action.Card), cardLabel(opening.Card), opening.Holder, opening.CardsLeft))
			if !hasComparisonSupport(candidate.Support, fact) {
				return false
			}
			value += opening.Adjustment
		}
		if value != candidate.Value {
			return false
		}
	}
	for _, candidate := range t.Candidates {
		if (candidate.Action.Kind == "layout-card") != seen[candidate.CandidateID] {
			return false
		}
	}
	return true
}

func hasComparisonSupport(facts []contracts.CoachSupport, expected contracts.CoachSupport) bool {
	for _, fact := range facts {
		if fact == expected {
			return true
		}
	}
	return false
}

func comparisonAlternative(t DecisionTrace) *DecisionCandidate {
	var alternative *DecisionCandidate
	for i := range t.Candidates {
		c := &t.Candidates[i]
		if c.CandidateID != t.SelectedCandidateID && (alternative == nil || c.Value > alternative.Value) {
			alternative = c
		}
	}
	return alternative
}

// Claim this specific contrast only when the complete recorded score gap is
// attributable to one alternative opening an opponent's card. Mixed score
// components keep their original reasons rather than receiving a guessed cause.
func avoidedOpponentOpening(t DecisionTrace) (*DecisionCandidate, *KnownLayoutOpening) {
	selected := comparisonFor(t, t.SelectedCandidateID)
	alternative := comparisonAlternative(t)
	if selected == nil || alternative == nil || len(selected.OwnOpenings) != 0 || len(selected.KnownOpenings) != 0 {
		return nil, nil
	}
	other := comparisonFor(t, alternative.CandidateID)
	if other == nil || len(other.OwnOpenings) != 0 || len(other.KnownOpenings) != 1 || selected.InheritedValue != other.InheritedValue {
		return nil, nil
	}
	opening := &other.KnownOpenings[0]
	if opening.Adjustment >= 0 {
		return nil, nil
	}
	for _, candidate := range t.Candidates {
		if candidate.CandidateID == t.SelectedCandidateID && candidate.Value > alternative.Value && candidate.Value-alternative.Value == -opening.Adjustment {
			return alternative, opening
		}
	}
	return nil, nil
}

func ownershipComparisonSupport(t DecisionTrace) []contracts.CoachSupport {
	if t.PolicyID != OwnershipComparisonPolicyID {
		return nil
	}
	facts := []contracts.CoachSupport{support("trix-ownership-comparison-coverage", "policy", "This explanation revision keeps Ownership action scores and fixed legal tie order unchanged. It compares recorded immediate openings only; these heuristic scores are not predicted team points.")}
	if alternative, opening := avoidedOpponentOpening(t); alternative != nil {
		for _, fact := range alternative.Support {
			if fact.ID == opening.SupportID {
				facts = append(facts, fact)
			}
		}
		facts = append(facts, support("trix-ownership-comparison-opponent-opening", "policy", fmt.Sprintf("The selected placement and %s have equal inherited scores and zero immediate own-card openings. The alternative's known opponent opening contributes %g heuristic points; that adjustment accounts for their complete recorded score difference.", cardLabel(alternative.Action.Card), opening.Adjustment)))
	}
	return facts
}

func renderOwnershipComparisonTrace(t DecisionTrace) DecisionTrace {
	selected := comparisonFor(t, t.SelectedCandidateID)
	if selected == nil || len(selected.OwnOpenings) != 0 {
		return t
	}
	// A factual zero-opening description also applies to forced and tied moves;
	// their status and absence of unique preference continue to take precedence.
	t.Summary = strings.Replace(t.Summary, "The heuristic prefers connected paths so you can finish earlier; future turns and hidden openings are not known.", "This placement has no immediate own-card follow-up; future turns and hidden openings are not known.", 1)
	for _, candidate := range t.Candidates {
		if candidate.CandidateID == t.SelectedCandidateID && candidate.Purpose == "open a path through your remaining hand" {
			if t.Status == "tactical" {
				t.Cue = actionLabel(t.Action) + " - advance a row with no immediate own-card follow-up."
			}
		}
	}
	if t.Status != "tactical" {
		return t
	}
	alternative, opening := avoidedOpponentOpening(t)
	if alternative == nil {
		return t
	}
	t.Cue = actionLabel(t.Action) + " - avoid opening the opponent's " + cardLabel(opening.Card) + "."
	t.Summary = fmt.Sprintf("%s would make %s available to seat %d, its only observation-compatible holder and an opponent. Neither placement immediately opens another card in your hand. The recorded heuristic scores are %s: %g and %s: %g; the difference comes from the immediate opponent-opening penalty. This does not establish a better final team finish.", actionLabel(alternative.Action), cardLabel(opening.Card), opening.Holder, cardLabel(t.Action.Card), selected.InheritedValue, cardLabel(alternative.Action.Card), alternative.Value)
	return t
}
