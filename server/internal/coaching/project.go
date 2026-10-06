package coaching

import (
	"fmt"

	"cardford/server/internal/contracts"
	"cardford/server/internal/legacydecision"
)

// ProjectAdvice reproduces the original help-level projection. Stored legacy
// advice does not acquire the fields introduced by later cue versions.
func ProjectAdvice(advice legacydecision.Advice, requestedLevel int, decisionID string) (contracts.AdviceView, error) {
	if requestedLevel < 1 || requestedLevel > 3 {
		return contracts.AdviceView{}, fmt.Errorf("Unsupported help level.")
	}
	several := advice.Outcome == "several-reasonable"
	if several && (advice.Card != "" || advice.Pass != nil || advice.Bid != nil) {
		return contracts.AdviceView{}, fmt.Errorf("Advice with several reasonable choices must not carry a single action.")
	}
	if !several && (len(advice.ConsideredCards) > 0 || len(advice.ConsideredBids) > 0) {
		return contracts.AdviceView{}, fmt.Errorf("Considered choices belong only to advice with several reasonable choices.")
	}
	if len(advice.ConsideredCards) > 0 && len(advice.ConsideredBids) > 0 {
		return contracts.AdviceView{}, fmt.Errorf("Considered choices are either cards or bids.")
	}
	if !validChoices(advice.ConsideredCards) || !validChoices(advice.ConsideredBids) {
		return contracts.AdviceView{}, fmt.Errorf("Two or three distinct considered choices are required.")
	}
	view := contracts.AdviceView{Focus: advice.Focus, Notice: advice.Notice, Source: advice.Provenance, DecisionID: decisionID, RequestedLevel: float64(requestedLevel)}
	if requestedLevel >= 2 {
		view.Reason = advice.Reason
	}
	if requestedLevel == 3 {
		view.Suggestion = advice.Suggestion
		if advice.Card != "" {
			view.Card = legacydecision.Ptr(contracts.Card(advice.Card))
		}
		if advice.Pass != nil {
			cards := contractCards(advice.Pass)
			view.Pass = &cards
		}
		if advice.Bid != nil {
			view.Bid = legacydecision.Ptr(float64(*advice.Bid))
		}
		if len(advice.ConsideredCards) > 0 {
			cards := contractCards(advice.ConsideredCards)
			view.ConsideredCards = &cards
		}
		if len(advice.ConsideredBids) > 0 {
			bids := make([]float64, len(advice.ConsideredBids))
			for i, bid := range advice.ConsideredBids {
				bids[i] = float64(bid)
			}
			view.ConsideredBids = &bids
		}
	}
	if advice.HighlightSuit != "" {
		view.HighlightSuit = legacydecision.Ptr(contracts.Suit(advice.HighlightSuit))
	}
	if advice.CueVersion != nil {
		if advice.Outcome != "" {
			view.Outcome = legacydecision.Ptr(advice.Outcome)
		}
		if advice.Explanation != "" {
			view.Explanation = legacydecision.Ptr(advice.Explanation)
		}
		view.Evidence = legacydecision.Ptr(advice.Evidence)
		view.PolicyVersion = legacydecision.Ptr(advice.PolicyVersion)
		view.CueVersion = legacydecision.Ptr(*advice.CueVersion)
	}
	return view, nil
}

func validChoices[T comparable](values []T) bool {
	if len(values) == 0 {
		return true
	}
	if len(values) < 2 || len(values) > 3 {
		return false
	}
	seen := make(map[T]bool, len(values))
	for _, v := range values {
		if seen[v] {
			return false
		}
		seen[v] = true
	}
	return true
}

func contractCards(cards []string) []contracts.Card {
	out := make([]contracts.Card, len(cards))
	for i, c := range cards {
		out[i] = contracts.Card(c)
	}
	return out
}
