package reasoning

import (
	"fmt"
	"math"
	"sort"

	d "cardford/server/internal/legacydecision"
)

const PolicyVersion = "hearts-baseline-1.0.0"

// Analyze ports the original Hearts manifest and local baseline without changing
// its ranking, evidence labels, candidate order or private audit trace.
func Analyze(obs d.Observation) (d.Analysis, error) {
	if err := d.ValidateObservation(obs); err != nil {
		return d.Analysis{}, err
	}
	if obs.Mode != "hearts" {
		return d.Analysis{}, fmt.Errorf("Hearts reasoning does not support mode: %s", obs.Mode)
	}
	action, err := choose(obs)
	if err != nil {
		return d.Analysis{}, err
	}
	forced := len(obs.LegalActions) == 1
	provenance, kind, evidence, selectedBy := "code", "heuristic", "heuristic", "baseline"
	reason := "Hearts retains the original local policy for this decision."
	if forced {
		provenance, kind, evidence, selectedBy = "forced", "fact", "exact", "forced"
		reason = "Only one legal action exists."
	}
	result := d.Analysis{
		SchemaVersion: "1.0.0",
		PolicyVersion: PolicyVersion,
		Provenance:    provenance,
		Action:        action,
		ScenarioIDs:   []string{},
		Facts:         d.BuildFacts(obs),
		Reasons:       []d.Reason{{ID: "hearts.baseline", Kind: kind, Text: reason}},
		Candidates:    []d.Candidate{},
		Limitations:   []string{"Hearts delegates to the retained baseline; this version adds Spades tactics only."},
		Trace: &d.Trace{
			SchemaVersion:    "1.0.0",
			PolicyVersion:    PolicyVersion,
			CatalogVersion:   "hearts-baseline-catalog-1.0.0",
			SelectedActionID: d.ActionID(action),
			SelectedBy:       selectedBy,
			ScenarioChecks:   []d.ScenarioCheck{},
			Candidates:       []d.TraceCandidate{},
			Limitations:      []string{"Hearts retains its uncalibrated local baseline."},
		},
	}
	for i, candidate := range obs.LegalActions {
		disposition := "alternative"
		if d.ActionID(candidate) == d.ActionID(action) {
			disposition = "selected"
		}
		result.Candidates = append(result.Candidates, d.Candidate{Action: d.CloneAction(candidate), ReasonIDs: []string{"hearts.baseline"}, Disposition: disposition, Evidence: evidence})
		result.Trace.Candidates = append(result.Trace.Candidates, d.TraceCandidate{ActionID: d.ActionID(candidate), Score: nil, Effects: []d.Effect{}, TieOrder: i})
	}
	return result, nil
}

func choose(obs d.Observation) (d.Action, error) {
	legal := obs.LegalActions
	if len(legal) == 0 {
		return d.Action{}, fmt.Errorf("No decision is available for this seat.")
	}
	if len(legal) == 1 {
		return d.CloneAction(legal[0]), nil
	}
	if obs.Phase == "bid" {
		bid := suggestBid(obs.Hand)
		for _, a := range legal {
			if a.Kind == "bid" && a.Bid == bid {
				return d.CloneAction(a), nil
			}
		}
		return d.Action{}, fmt.Errorf("Bid missing from legal set.")
	}
	if obs.Phase == "pass" {
		var selected *d.Action
		score := -1
		for _, a := range legal {
			if a.Kind != "pass" {
				continue
			}
			n := 0
			for _, c := range a.Cards {
				n += passPriority(c)
			}
			if selected == nil || n > score {
				copy := d.CloneAction(a)
				selected = &copy
				score = n
			}
		}
		if selected == nil {
			return d.Action{}, fmt.Errorf("Policy produced no legal action.")
		}
		return *selected, nil
	}
	cards := []string{}
	for _, a := range legal {
		if a.Kind == "play" {
			cards = append(cards, a.Card)
		}
	}
	low := d.Sorted(cards)
	sort.SliceStable(low, func(i, j int) bool { return d.CardRank(low[i]) < d.CardRank(low[j]) })
	if len(low) == 0 {
		return d.Action{}, fmt.Errorf("Policy produced no legal action.")
	}
	card := low[0]
	if len(obs.Trick) > 0 {
		losers := []string{}
		for _, c := range low {
			plays := append(append([]d.Play{}, obs.Trick...), d.Play{Seat: obs.Seat, Card: c})
			if d.TrickWinner(plays, obs.Mode) != obs.Seat {
				losers = append(losers, c)
			}
		}
		sort.SliceStable(losers, func(i, j int) bool { return passPriority(losers[i]) > passPriority(losers[j]) })
		if len(losers) > 0 {
			card = losers[0]
		}
	}
	for _, a := range legal {
		if a.Kind == "play" && a.Card == card {
			return d.CloneAction(a), nil
		}
	}
	return d.Action{}, fmt.Errorf("Policy produced no legal action.")
}

func passPriority(card string) int {
	if card == "SQ" {
		return 100
	}
	rank := d.CardRank(card)
	if d.CardSuit(card) == "S" && rank > 12 {
		return 80 + rank
	}
	score := rank
	if rank >= 11 {
		score += 20
	}
	if d.CardSuit(card) == "H" {
		score += 5
	}
	return score
}

// Retained prototype bidder is reachable in the original V1 observation
// contract, even though ordinary Hearts play never enters the bidding phase.
func suggestBid(hand []string) int {
	estimate := 0.0
	for _, suit := range d.Suits() {
		cards := []string{}
		for _, c := range hand {
			if d.CardSuit(c) == suit {
				cards = append(cards, c)
			}
		}
		if suit == "S" {
			for _, c := range cards {
				rank := d.CardRank(c)
				if rank >= 12 {
					estimate++
				} else if rank >= 10 {
					estimate += 0.65
				} else {
					estimate += 0.25
				}
			}
			if len(cards) > 4 {
				estimate += float64(len(cards)-4) * 0.4
			}
		} else {
			has := func(rank int) bool {
				for _, c := range cards {
					if d.CardRank(c) == rank {
						return true
					}
				}
				return false
			}
			if has(14) {
				estimate++
			}
			if len(cards) >= 2 && has(13) {
				estimate += 0.55
			}
			if len(cards) >= 3 && has(12) {
				estimate += 0.2
			}
		}
	}
	spades, high := 0, false
	for _, c := range hand {
		if d.CardSuit(c) == "S" {
			spades++
			if d.CardRank(c) > 9 {
				high = true
			}
		}
	}
	if estimate < 0.9 && !high && spades <= 2 {
		return 0
	}
	return max(1, min(13, int(math.Floor(estimate+0.5))))
}
