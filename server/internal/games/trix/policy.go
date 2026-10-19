package trix

import (
	"cardford/server/internal/gamekernel"
	"context"
	"encoding/json"
	"fmt"
	"math"
)

// These deliberately inexpensive heuristics inspect only the frozen actor
// observation. Their weights are estimates, not probabilities or strength proof.
func candidateValue(o Observation, a Action) float64 {
	switch a.Kind {
	case "choose-request":
		risk := 0.0
		for _, c := range o.Hand {
			r := float64(rank(c))
			suitCount := 0
			low := 0
			for _, h := range o.Hand {
				if h[0] == c[0] {
					suitCount++
					if rank(h) < 9 {
						low++
					}
				}
			}
			switch a.Request {
			case "diamonds":
				if c[0] == 'D' {
					risk += (r - 5) * 1.2
				}
			case "lutoosh":
				risk += math.Max(0, r-7)
			case "queens":
				if rank(c) == 12 {
					risk += float64(suitCount-low) * 4
				}
				risk += math.Max(0, r-11)
			case "king":
				if c == "HK" {
					risk += float64(suitCount-low) * 9
				}
				if c[0] == 'H' && r > 12 {
					risk += 10
				}
			case "complex":
				risk += math.Max(0, r-7)
				if c[0] == 'D' {
					risk += 2
				}
				if rank(c) == 12 {
					risk += 8
				}
				if c == "HK" {
					risk += 18
				}
			case "trix":
				if r == 11 {
					risk -= 15
				}
				risk += math.Abs(r-11) * .8
			}
		}
		return -risk
	case "declare-doubles":
		value := 0.0
		for _, c := range a.Cards {
			lower, higher := 0, 0
			for _, h := range o.Hand {
				if h[0] == c[0] {
					if rank(h) < rank(c) {
						lower++
					} else if rank(h) > rank(c) {
						higher++
					}
				}
			}
			v := 25.0
			if c == "HK" {
				v = 75
			}
			safe := float64(lower)*.5 - float64(higher) - 2
			if o.Owner == o.Seat {
				safe -= 1
			}
			if partners(o.VariantID) {
				safe -= .5
			}
			value += v * safe
		}
		return value
	case "layout-pass":
		return 0
	case "layout-card":
		r := rank(a.Card)
		value := 0.0
		for _, h := range o.Hand {
			if h == a.Card || h[0] != a.Card[0] {
				continue
			}
			hr := rank(h)
			if (r <= 11 && hr < r) || (r >= 11 && hr > r) {
				value += 3
				if hr == r-1 || hr == r+1 {
					value += 5
				}
			}
		}
		if r == 11 {
			value -= 1
		}
		if len(o.Hand) == 1 {
			value += 1000
		}
		return value
	case "play-card":
		r := float64(rank(a.Card))
		cost := cardCost(o, a.Card)
		if len(o.Trick) == 3 {
			return finalTrickValue(o, a)
		}
		if len(o.Trick) == 0 {
			length := 0
			for _, c := range o.Hand {
				if c[0] == a.Card[0] {
					length++
				}
			}
			return -r*2 - cost*.6 + float64(length)*.3
		}
		led := o.Trick[0].Card[0]
		if a.Card[0] != led {
			return cost*4 + r
		}
		maxRank := 0
		currentWinner := o.Trick[0].Seat
		penalty := 0.0
		for _, p := range o.Trick {
			if p.Card[0] == led && rank(p.Card) > maxRank {
				maxRank = rank(p.Card)
				currentWinner = p.Seat
			}
			penalty += cardCost(o, p.Card)
		}
		if rank(a.Card) < maxRank {
			if partners(o.VariantID) && currentWinner%2 == o.Seat%2 {
				return r - cost*2
			}
			return r + cost*3
		}
		multiplier := 2.0
		if len(o.Trick) == 3 {
			multiplier = 5
		}
		return -r - (penalty+cost)*multiplier
	}
	return 0
}

// On the last play the winner and ledger are exact public deductions. Reuse
// the actual scoring rules, including per-card giver credits and withholding,
// so a teammate's capture of a double is never mistaken for safe cancellation.
func finalTrickValue(o Observation, a Action) float64 {
	plays := append(append([]Play{}, o.Trick...), Play{Seat: o.Seat, Card: a.Card})
	tr := Trick{Number: len(o.Tricks) + 1, Leader: plays[0].Seat, Winner: winner(plays), Plays: plays}
	s := State{Config: Config{Variant: o.VariantID}, Request: *o.Request, DealNumber: o.DealNumber, Kingdom: o.Kingdom, Declarations: o.Declarations, LastExternalLeader: o.LastExternalLeader, Ledger: []LedgerEntry{}, WithheldBonuses: []WithheldBonus{}}
	if tr.Leader != tr.Winner {
		s.LastExternalLeader[tr.Winner] = &LeadSource{Seat: tr.Leader, Trick: tr.Number}
	}
	scoreTrick(&s, tr)
	own, opponents := 0, 0
	for _, total := range scores(s, 0, 0) {
		mine := false
		for _, seat := range total.Seats {
			if seat == o.Seat {
				mine = true
			}
		}
		if mine {
			own = total.Total
		} else {
			opponents += total.Total
		}
	}
	value := float64(own)*4 - float64(opponents)
	if tr.Winner == o.Seat {
		return value - float64(rank(a.Card))
	}
	return value + float64(rank(a.Card))
}
func cardCost(o Observation, c string) float64 {
	if o.Request == nil {
		return 0
	}
	r := *o.Request
	v := 0.0
	if (r == "diamonds" || r == "complex") && c[0] == 'D' {
		v += 10
	}
	base := 0.0
	if (r == "queens" || r == "complex") && rank(c) == 12 {
		base = 25
	}
	if (r == "king" || r == "complex") && c == "HK" {
		base = 75
	}
	for _, d := range o.Declarations {
		if contains(d.Cards, c) {
			base *= 2
			break
		}
	}
	v += base
	if r == "lutoosh" || r == "complex" {
		v += 3.75
	}
	return v
}
func Decide(o Observation) (Action, error) {
	choices := Legal(o)
	if len(choices) == 0 {
		return Action{}, fmt.Errorf("no Trix actor choices")
	}
	best := choices[0]
	value := candidateValue(o, best)
	for _, a := range choices[1:] {
		v := candidateValue(o, a)
		if v > value {
			best = a
			value = v
		}
	}
	return best, nil
}
func teaching(o Observation, a Action) (string, string) {
	switch a.Kind {
	case "choose-request":
		return "Choose a game for these cards", "Compare your high cards, low exits and the games still available. The next request will use a fresh deal."
	case "declare-doubles":
		if partners(o.VariantID) {
			return "Choose doubles carefully", "A doubled queen costs its taker 50; the king costs 150. The team opposite the taker receives the bonus, even when your teammate takes the card."
		}
		return "Choose doubles carefully", "A doubled card costs twice its ordinary penalty. If you take your own double, the current or previous external leader gets the bonus; with no previous giver, nobody does."
	case "layout-card":
		return "Open a path through your hand", "Compare which placement connects more of your remaining cards. Opponents may also benefit from the new opening."
	case "layout-pass":
		return "No placement is available", "Passing is required on this board. It reveals only that you cannot extend the current rows."
	default:
		return "Avoid the request's penalties", "Follow suit when you can. Compare losing this trick with releasing a dangerous high card; later players may change the winner."
	}
}
func analyze(o Observation, policy string) (string, json.RawMessage, error) {
	if isTracePolicy(policy) {
		trace, err := BuildDecisionTrace(o, policy)
		if err != nil {
			return "", nil, err
		}
		raw, err := reasoningRegistered(o, trace)
		return trace.SelectedCandidateID, raw, err
	}
	if policy != PolicyID {
		return "", nil, fmt.Errorf("unsupported Trix policy")
	}
	a, e := Decide(o)
	if e != nil {
		return "", nil, e
	}
	origin := "code"
	if len(Legal(o)) == 1 {
		origin = "forced"
	}
	_, text := teaching(o, a)
	id := ActionID(a)
	publicVersion := o.publicSchemaVersion
	if publicVersion == "" {
		publicVersion = "1.0.0"
	}
	raw, e := json.Marshal(map[string]any{"publicSchemaVersion": publicVersion, "gameId": "trix", "variantId": o.VariantID, "origin": origin, "selectedCandidateId": id, "objective": map[string]any{"id": "trix-high-score", "version": "1.0.0", "metric": "points", "direction": "higher"}, "horizon": map[string]any{"id": "trix-request", "version": "1.0.0", "scope": "request"}, "facts": []any{map[string]any{"id": "trix-legal-count", "kind": "exact", "summary": fmt.Sprintf("%d legal choices.", len(Legal(o))), "evidence": []string{fmt.Sprintf("legal-count:%d", len(Legal(o)))}, "candidateId": nil}}, "estimates": []any{}, "scenarios": []any{}, "assumptions": []string{text, "Deterministic actor-only baseline; strategic strength has not been measured."}})
	return id, raw, e
}
func analyzeComplete(ctx context.Context, o Observation, policy, decisionID string) (gamekernel.CompleteAnalysis, error) {
	if e := ctx.Err(); e != nil {
		return gamekernel.CompleteAnalysis{}, e
	}
	if isTracePolicy(policy) {
		trace, err := BuildDecisionTrace(o, policy)
		if err != nil {
			return gamekernel.CompleteAnalysis{}, err
		}
		registered, err := reasoningRegistered(o, trace)
		if err != nil {
			return gamekernel.CompleteAnalysis{}, err
		}
		detail, err := json.Marshal(trace)
		if err != nil {
			return gamekernel.CompleteAnalysis{}, err
		}
		adviceObject, err := BuildAdviceFromTrace(trace, decisionID)
		if err != nil {
			return gamekernel.CompleteAnalysis{}, err
		}
		advice, err := json.Marshal(adviceObject)
		return gamekernel.CompleteAnalysis{CandidateID: trace.SelectedCandidateID, Registered: registered, Detail: gamekernel.PrivateOutput{Schema: "TrixDecisionTrace", Bytes: detail}, Advice: gamekernel.PrivateOutput{Schema: "TrixAdvice", Bytes: advice}}, err
	}
	id, raw, e := analyze(o, policy)
	if e != nil {
		return gamekernel.CompleteAnalysis{}, e
	}
	a, _ := Decide(o)
	title, text := teaching(o, a)
	origin := "code"
	if len(Legal(o)) == 1 {
		origin = "forced"
	}
	advice, e := json.Marshal(Advice{GameID: "trix", VariantID: o.VariantID, DecisionID: decisionID, Level: 3, Origin: origin, Title: title, Text: text, PolicyVersion: "1.0.0", RecommendedCandidateID: id, EvidenceRefs: []string{fmt.Sprintf("legal-count:%d", len(Legal(o)))}})
	return gamekernel.CompleteAnalysis{CandidateID: id, Registered: raw, Detail: gamekernel.PrivateOutput{Schema: "RegisteredAnalysis", Bytes: raw}, Advice: gamekernel.PrivateOutput{Schema: "TrixAdvice", Bytes: advice}}, e
}

func reasoningRegistered(o Observation, trace DecisionTrace) (json.RawMessage, error) {
	facts := []any{}
	assumptions := []string{}
	for _, s := range trace.Support {
		if s.Kind == "exact" {
			facts = append(facts, map[string]any{"id": s.ID, "kind": "exact", "summary": s.Text, "evidence": []string{s.ID}, "candidateId": nil})
		} else {
			assumptions = append(assumptions, s.Text)
		}
	}
	return json.Marshal(map[string]any{"publicSchemaVersion": trace.PublicSchemaVersion, "gameId": "trix", "variantId": o.VariantID, "origin": func() string {
		if trace.LegalCount == 1 {
			return "forced"
		}
		return "code"
	}(), "selectedCandidateId": trace.SelectedCandidateID, "objective": map[string]any{"id": "trix-high-score", "version": "1.0.0", "metric": "points", "direction": "higher"}, "horizon": map[string]any{"id": "trix-request", "version": "1.0.0", "scope": "request"}, "facts": facts, "estimates": []any{}, "scenarios": []any{}, "assumptions": assumptions})
}
