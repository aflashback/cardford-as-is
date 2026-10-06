package hearts

import (
	"encoding/json"
	"fmt"
)

func Observe(raw json.RawMessage, seat int) (json.RawMessage, error) {
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	s, err := read(raw)
	if err != nil {
		return nil, err
	}
	return json.Marshal(observation(s, seat))
}
func SafeView(raw json.RawMessage, seat int) (json.RawMessage, error) {
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	s, err := read(raw)
	if err != nil {
		return nil, err
	}
	return json.Marshal(view(s, seat, actions(s, seat)))
}
func publicMemory(s *state) ([]any, map[string]bool) {
	seen := map[string]bool{}
	voids := map[byte][4]bool{'C': {}, 'D': {}, 'H': {}, 'S': {}}
	add := func(plays []Play) {
		if len(plays) == 0 {
			return
		}
		led := plays[0].Card[0]
		for _, p := range plays {
			seen[p.Card] = true
			if p.Card[0] != led {
				v := voids[led]
				v[p.Seat] = true
				voids[led] = v
			}
		}
	}
	for _, t := range s.History {
		add(t.Plays)
	}
	add(s.Trick)
	memory := []any{}
	for _, suit := range []byte{'C', 'D', 'H', 'S'} {
		played := 0
		for c := range seen {
			if c[0] == suit {
				played++
			}
		}
		seats := []int{}
		for seat, empty := range voids[suit] {
			if empty {
				seats = append(seats, seat)
			}
		}
		memory = append(memory, map[string]any{"suit": string(suit), "played": played, "remaining": 13 - played, "voidSeats": seats})
	}
	return memory, seen
}
func handSizes(s *state) [4]int {
	return [4]int{len(s.Hands[0]), len(s.Hands[1]), len(s.Hands[2]), len(s.Hands[3])}
}
func observation(s *state, seat int) map[string]any {
	memory, seen := publicMemory(s)
	known := []Play{}
	p := s.Passes[seat]
	if p.To != nil {
		for _, c := range p.Outgoing {
			if !seen[c] {
				known = append(known, Play{*p.To, c})
			}
		}
	}
	out := map[string]any{"mode": s.Mode, "seat": seat, "moduleVersion": s.ModuleVersion, "ruleProfileId": s.RuleProfileID, "observationSchemaVersion": "1.0.0", "featureVersion": "1.0.0", "phase": s.Phase, "hand": s.Hands[seat], "handSizes": handSizes(s), "bids": s.Bids, "tricks": s.Tricks, "scores": s.Scores, "bags": s.Bags, "trick": s.Trick, "history": s.History, "turn": s.Turn, "dealer": s.Dealer, "handNumber": s.HandNumber, "heartsBroken": s.HeartsBroken, "spadesBroken": s.SpadesBroken, "events": s.Events, "passDirection": s.PassDirection, "pass": p, "legalActions": actions(s, seat), "memory": memory, "knownHoldings": known}
	if s.HandResult != nil {
		out["handResult"] = s.HandResult
	}
	return out
}
func view(s *state, seat int, choices []action) map[string]any {
	public := []any{}
	for _, a := range choices {
		if a.Kind == "pass" {
			public = append(public, map[string]any{"kind": "pass", "cards": a.Cards})
		} else {
			public = append(public, map[string]any{"kind": "play", "card": a.Card})
		}
	}
	var winner *int
	if len(s.Trick) > 0 {
		winner = ptr(trickWinner(s.Trick))
	}
	return map[string]any{"id": s.ID, "mode": s.Mode, "phase": s.Phase, "hand": s.Hands[seat], "handCounts": handSizes(s), "bids": s.Bids, "tricks": s.Tricks, "scores": s.Scores, "bags": s.Bags, "trick": s.Trick, "history": s.History, "turn": s.Turn, "dealer": s.Dealer, "handNumber": s.HandNumber, "heartsBroken": s.HeartsBroken, "spadesBroken": s.SpadesBroken, "passDirection": s.PassDirection, "received": s.Passes[seat].Incoming, "outgoing": s.Passes[seat].Outgoing, "handResult": s.HandResult, "currentWinner": winner, "legalActions": public}
}
