package trix

import (
	"fmt"
	"strings"
)

const FrontierPolicyID = "trix-frontier-1.0.0"
const FrontierTraceSchemaVersion = "trix-decision-trace-1.2.0"
const FrontierCueVersion = "trix-frontier-cues-1.0.0"

// FrontierEvidence describes a bounded, actor-only heuristic correction. The
// card paths are facts; their strategic value is an unvalidated preference.
type FrontierEvidence struct {
	Version          string               `json:"version"`
	Coverage         string               `json:"coverage"`
	Eligible         bool                 `json:"eligible"`
	PriorCandidateID string               `json:"priorCandidateId"`
	SelectedChanged  bool                 `json:"selectedChanged"`
	Comparisons      []FrontierComparison `json:"comparisons"`
}

type FrontierComparison struct {
	CandidateID    string           `json:"candidateId"`
	InheritedValue float64          `json:"inheritedValue"`
	Value          float64          `json:"value"`
	RemovedCredit  int              `json:"removedCredit"`
	Branches       []FrontierBranch `json:"branches"`
}

type FrontierBranch struct {
	Direction       string   `json:"direction"`
	OwnedChain      []string `json:"ownedChain"`
	BlockedOwnCards []string `json:"blockedOwnCards"`
	FirstExternal   string   `json:"firstExternal,omitempty"`
	PossibleHolders []int    `json:"possibleHolders"`
}

func usesHistoryPolicy(policy string) bool {
	return policy == HistoryPolicyID || policy == FrontierPolicyID || usesOwnershipPolicy(policy)
}

func decisionTraceCandidates(o Observation, policy string) ([]DecisionCandidate, *HistoryEvidence, *FrontierEvidence) {
	if policy != FrontierPolicyID {
		candidates, history := traceCandidates(o, policy)
		return candidates, history, nil
	}
	candidates, history := traceCandidates(o, HistoryPolicyID)
	prior := strongestCandidateIndex(candidates)
	e := &FrontierEvidence{Version: "trix-frontier-evidence-1.0.0", Coverage: "outside-scope", PriorCandidateID: candidates[prior].CandidateID, Comparisons: []FrontierComparison{}}
	if !partners(o.VariantID) || o.Phase != "layout" {
		return candidates, history, e
	}
	if len(candidates) < 2 {
		e.Coverage = "forced-layout"
		return candidates, history, e
	}
	e.Eligible, e.Coverage = true, "compared"
	for i := range candidates {
		c := &candidates[i]
		comparison := FrontierComparison{CandidateID: c.CandidateID, InheritedValue: c.Value, Branches: []FrontierBranch{}}
		r := rank(c.Action.Card)
		if r <= 11 {
			comparison.Branches = append(comparison.Branches, frontierBranch(o, c.Action.Card, -1))
		}
		if r >= 11 {
			comparison.Branches = append(comparison.Branches, frontierBranch(o, c.Action.Card, 1))
		}
		pathText := []string{}
		gapText := []string{}
		for _, branch := range comparison.Branches {
			comparison.RemovedCredit += 3 * len(branch.BlockedOwnCards)
			if len(branch.OwnedChain) > 0 {
				pathText = append(pathText, strings.Join(branch.OwnedChain, " then "))
			}
			if len(branch.BlockedOwnCards) > 0 {
				gapText = append(gapText, fmt.Sprintf("%s wait beyond missing %s", strings.Join(branch.BlockedOwnCards, ", "), branch.FirstExternal))
			}
		}
		c.Value -= float64(comparison.RemovedCredit)
		comparison.Value = c.Value
		e.Comparisons = append(e.Comparisons, comparison)
		path := "This placement opens no contiguous path of further cards in your own hand."
		if len(pathText) > 0 {
			path = "After this placement you can extend " + strings.Join(pathText, "; or ") + " on your own later turns without waiting for another holder to fill a gap."
		}
		if len(gapText) > 0 {
			path += " " + strings.Join(gapText, "; ") + "; another holder must supply that missing card first."
		}
		c.Support = append(c.Support, support("trix-frontier-path-"+c.Action.Card, "exact", path))
		c.Support = append(c.Support, support("trix-frontier-credit-"+c.Action.Card, "policy", fmt.Sprintf("Remove %d inherited heuristic points for own cards beyond the first gap on each side. Keep the existing adjacent-card, jack, finish and public partner/opponent-opening terms. These scores are not expected team points or winning probabilities.", comparison.RemovedCredit)))
		// Keep the existing teammate/opponent explanation and purpose when an
		// exact public opening matters. Only the generic path purpose changes.
		if c.Purpose == "open a path through your remaining hand" {
			c.Purpose = "keep your own paths moving"
			if len(pathText) == 0 {
				c.Purpose = "advance a frontier with limited own follow-up"
			}
		}
		c.Reason = path + " " + c.Reason + " The candidate removes credit for own cards blocked beyond missing ranks; this preference has not established a better team finish."
	}
	e.SelectedChanged = strongestCandidateIndex(candidates) != prior
	return candidates, history, e
}

func strongestCandidateIndex(candidates []DecisionCandidate) int {
	best := 0
	for i, c := range candidates {
		if c.Value > candidates[best].Value {
			best = i
		}
	}
	return best
}

// At most twelve ranks are inspected per candidate. It does not sample hands,
// infer behavior probabilities or read an aggregate/private native State.
func frontierBranch(o Observation, root string, direction int) FrontierBranch {
	b := FrontierBranch{Direction: "lower", OwnedChain: []string{}, BlockedOwnCards: []string{}, PossibleHolders: []int{}}
	if direction > 0 {
		b.Direction = "upper"
	}
	for r := rank(root) + direction; r >= 2 && r <= 14; r += direction {
		card := root[:1] + frontierRank(r)
		if contains(o.Hand, card) {
			if b.FirstExternal == "" {
				b.OwnedChain = append(b.OwnedChain, card)
			} else {
				b.BlockedOwnCards = append(b.BlockedOwnCards, card)
			}
		} else if b.FirstExternal == "" {
			b.FirstExternal = card
			b.PossibleHolders = append(b.PossibleHolders, possibleHolders(o, card)...)
		}
	}
	return b
}

func frontierRank(r int) string {
	switch r {
	case 11:
		return "J"
	case 12:
		return "Q"
	case 13:
		return "K"
	case 14:
		return "A"
	}
	return fmt.Sprint(r)
}
