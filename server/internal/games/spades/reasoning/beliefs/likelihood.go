package beliefs

import (
	d "cardford/server/internal/legacydecision"
	"fmt"
	"math"
	"reflect"
	"slices"
)

type HistoricalInput struct {
	ID          string
	Action      d.Action
	Observation d.Observation
}

// HistoryInputs validates a complete joint allocation by reconstructing each
// legal historical hand. Each returned packet contains only that player's
// hypothetical own hand and the public prefix before that action. Root private
// cards and later plays never appear in the packet. Event prose is unnecessary
// for the installed hypotheses and deliberately omitted.
func HistoryInputs(o d.Observation, current [4][]string) ([]HistoricalInput, error) {
	if err := d.ValidateObservation(o); err != nil {
		return nil, err
	}
	if (o.Mode != "spades-partners" && o.Mode != "spades-solo") || o.Phase != "play" {
		return nil, fmt.Errorf("beliefs require a Spades play prefix")
	}
	if !reflect.DeepEqual(d.Sorted(current[o.Seat]), d.Sorted(o.Hand)) {
		return nil, fmt.Errorf("allocation changed observer hand")
	}
	hands := [4][]string{}
	seen := map[string]bool{}
	for s, cs := range current {
		if len(cs) != o.HandSizes[s] {
			return nil, fmt.Errorf("allocation capacity mismatch")
		}
		hands[s] = append([]string{}, cs...)
		for _, card := range cs {
			if !d.ValidCard(card) || seen[card] {
				return nil, fmt.Errorf("duplicate/invalid allocation card")
			}
			seen[card] = true
		}
	}
	chronology := [][]d.Play{}
	for _, tr := range o.History {
		if len(tr.Plays) != 4 || d.TrickWinner(tr.Plays, o.Mode) != tr.Winner {
			return nil, fmt.Errorf("invalid complete trick")
		}
		chronology = append(chronology, tr.Plays)
	}
	chronology = append(chronology, o.Trick)
	for _, ps := range chronology {
		for _, p := range ps {
			if seen[p.Card] {
				return nil, fmt.Errorf("played card allocated or duplicated")
			}
			seen[p.Card] = true
			hands[p.Seat] = append(hands[p.Seat], p.Card)
		}
	}
	if len(seen) != 52 {
		return nil, fmt.Errorf("incomplete joint allocation")
	}
	for _, cs := range hands {
		if len(cs) != 13 {
			return nil, fmt.Errorf("historical hand capacity mismatch")
		}
	}
	previousID := 0
	for _, e := range o.Events {
		if e.ID <= previousID {
			return nil, fmt.Errorf("event IDs not unique and chronological")
		}
		previousID = e.ID
	}
	prefix := []d.Trick{}
	tricks := []int{0, 0, 0, 0}
	broken := false
	heartsBroken := false
	leader := (o.Dealer + 1) % 4
	out := []HistoricalInput{}
	index := 0
	for ti, ps := range chronology {
		trick := []d.Play{}
		for pi, p := range ps {
			if p.Seat != (leader+pi)%4 {
				return nil, fmt.Errorf("historical turn order mismatch")
			}
			own := d.Observation{Mode: o.Mode, Seat: p.Seat, ModuleVersion: o.ModuleVersion, RuleProfileID: o.RuleProfileID, ObservationSchemaVersion: o.ObservationSchemaVersion, FeatureVersion: o.FeatureVersion, Phase: "play", Hand: d.Sorted(hands[p.Seat]), HandSizes: []int{len(hands[0]), len(hands[1]), len(hands[2]), len(hands[3])}, Bids: o.Bids, Tricks: append([]int{}, tricks...), Scores: o.Scores, Bags: o.Bags, Trick: append([]d.Play{}, trick...), History: append([]d.Trick{}, prefix...), Turn: d.Ptr(p.Seat), Dealer: o.Dealer, HandNumber: o.HandNumber, SpadesBroken: broken, HeartsBroken: heartsBroken, Events: []d.Event{}, PassDirection: o.PassDirection, Pass: d.PassMemory{Incoming: []string{}, Outgoing: []string{}}, KnownHoldings: []d.Play{}}
			own.Memory = d.GetMemory(own)
			own.LegalActions = d.ActionsFor(own)
			action := d.Action{Kind: "play", Seat: p.Seat, Card: p.Card}
			if !slices.ContainsFunc(own.LegalActions, func(a d.Action) bool { return d.ActionID(a) == d.ActionID(action) }) {
				return nil, fmt.Errorf("allocation contradicts historical legality at %d", index)
			}
			out = append(out, HistoricalInput{ID: fmt.Sprintf("hand:%d/play:%d", o.HandNumber, index), Action: action, Observation: own})
			index++
			at := slices.Index(hands[p.Seat], p.Card)
			hands[p.Seat] = slices.Delete(hands[p.Seat], at, at+1)
			trick = append(trick, p)
			broken = broken || d.CardSuit(p.Card) == "S"
			heartsBroken = heartsBroken || d.CardSuit(p.Card) == "H"
		}
		if ti < len(o.History) {
			leader = o.History[ti].Winner
			tricks[leader]++
			prefix = append(prefix, o.History[ti])
		}
	}
	if !reflect.DeepEqual(tricks, o.Tricks) || broken != o.SpadesBroken || heartsBroken != o.HeartsBroken {
		return nil, fmt.Errorf("historical public facts mismatch")
	}
	if o.Turn == nil || *o.Turn != (leader+len(o.Trick))%4 {
		return nil, fmt.Errorf("current turn mismatch")
	}
	if !reflect.DeepEqual(d.ActionsFor(o), o.LegalActions) {
		return nil, fmt.Errorf("current legal set mismatch")
	}
	return out, nil
}

// Applicability is entirely public and common across all feasible allocations.
// Only a fourth-seat follow under its partner's untrumped ace is modeled in V1.
// Leads, bids, other plays and observer interventions supply no soft factor.
func applicable(h HistoricalInput, observer int) bool {
	o := h.Observation
	if h.Action.Seat == observer || o.Mode != "spades-partners" || len(o.Trick) != 3 {
		return false
	}
	suit := d.CardSuit(o.Trick[0].Card)
	if suit == "S" || d.CardSuit(h.Action.Card) != suit {
		return false
	}
	partner := (o.Seat + 2) % 4
	for _, p := range o.Trick {
		if d.CardSuit(p.Card) == "S" {
			return false
		}
	}
	return slices.Contains(o.Trick, d.Play{Seat: partner, Card: suit + "A"})
}

func actionLikelihood(h HistoricalInput, style Style, epsilon float64) float64 {
	legal := h.Observation.LegalActions
	preferred := []d.Action{}
	switch style {
	case UniformLegal:
		preferred = legal
	case ConserveHonors:
		preferred = []d.Action{legal[0]}
	case HighestSafe:
		preferred = []d.Action{legal[len(legal)-1]}
	case NilEquivalentHonors:
		top := legal[len(legal)-1]
		preferred = []d.Action{top}
		if h.Observation.Bids[h.Action.Seat] != nil && *h.Observation.Bids[h.Action.Seat] == 0 && top.Card == d.CardSuit(top.Card)+"K" {
			for _, a := range legal {
				if a.Card == d.CardSuit(top.Card)+"Q" {
					preferred = append(preferred, a)
				}
			}
		}
	}
	probability := epsilon / float64(len(legal))
	if slices.ContainsFunc(preferred, func(a d.Action) bool { return a.Card == h.Action.Card }) {
		probability += (1 - epsilon) / float64(len(preferred))
	}
	return probability
}

func logSumExp(values []float64) float64 {
	high := math.Inf(-1)
	for _, v := range values {
		high = math.Max(high, v)
	}
	if math.IsInf(high, -1) {
		return high
	}
	sum := 0.0
	for _, v := range values {
		sum += math.Exp(v - high)
	}
	return high + math.Log(sum)
}

// LogLikelihood keeps a player's style fixed over the whole observed history:
// log(sum_style prior(style)*product_events P(action|style,own-prefix)).
// Constraint-only omits every behavioral factor, exactly log(1)=0.
func LogLikelihood(history []HistoricalInput, observer int, c Config) (float64, []string) {
	if c.Mode == "constraint-only" {
		return 0, []string{}
	}
	evidence := []string{}
	bySeat := [4][]HistoricalInput{}
	for _, h := range history {
		if applicable(h, observer) {
			bySeat[h.Action.Seat] = append(bySeat[h.Action.Seat], h)
			evidence = append(evidence, h.ID)
		}
	}
	total := 0.0
	for seat, events := range bySeat {
		if len(events) == 0 {
			continue
		}
		mass := 0.0
		for _, s := range c.Players[seat] {
			mass += s.Weight
		}
		logs := []float64{}
		for _, s := range c.Players[seat] {
			v := math.Log(s.Weight / mass)
			for _, h := range events {
				v += math.Log(actionLikelihood(h, s.Style, c.MistakeAllowance))
			}
			logs = append(logs, v)
		}
		total += logSumExp(logs)
	}
	return total, evidence
}
