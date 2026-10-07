package legacydecision

import "encoding/json"

// SyntheticWorld is only used by the game-owned illustrative continuation.
// Every concealed card is sampled from actor information. No live aggregate is accepted.
func SyntheticWorld(o Observation, hands [4][]string) (json.RawMessage, error) {
	passes := [4]PassMemory{}
	for i := range passes {
		passes[i] = PassMemory{Outgoing: []string{}, Incoming: []string{}}
	}
	passes[o.Seat] = o.Pass
	return json.Marshal(map[string]any{"id": "sampled-world", "mode": o.Mode, "moduleVersion": "1.0.0", "ruleProfileId": o.RuleProfileID, "eventSchemaVersion": "1.0.0", "phase": o.Phase, "hands": hands, "bids": o.Bids, "tricks": o.Tricks, "scores": o.Scores, "bags": o.Bags, "trick": o.Trick, "history": o.History, "turn": o.Turn, "dealer": o.Dealer, "handNumber": o.HandNumber, "heartsBroken": o.HeartsBroken, "spadesBroken": o.SpadesBroken, "events": o.Events, "passDirection": o.PassDirection, "passes": passes})
}
