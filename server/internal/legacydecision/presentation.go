package legacydecision

import (
	"cardford/server/internal/contracts"
	"encoding/json"
)

// PublicAction drops the private actor field from the already permitted action.
func PublicAction(a Action) map[string]any {
	switch a.Kind {
	case "play":
		return map[string]any{"kind": "play", "card": a.Card}
	case "bid":
		return map[string]any{"kind": "bid", "bid": a.Bid}
	default:
		return map[string]any{"kind": "pass", "cards": append([]string{}, a.Cards...)}
	}
}

// Presentation is an allowlist of the original human-visible table fields.
// Its only input is an actor observation, never an authoritative game.
func Presentation(id string, o Observation) (json.RawMessage, error) {
	actions := make([]any, 0, len(o.LegalActions))
	for _, a := range o.LegalActions {
		actions = append(actions, PublicAction(a))
	}
	var winner any
	if len(o.Trick) > 0 {
		winner = TrickWinner(o.Trick, o.Mode)
	}
	v := map[string]any{"id": id, "mode": o.Mode, "phase": o.Phase, "hand": o.Hand, "handCounts": o.HandSizes, "bids": o.Bids, "tricks": o.Tricks, "scores": o.Scores, "bags": o.Bags, "trick": o.Trick, "history": o.History, "turn": o.Turn, "dealer": o.Dealer, "handNumber": o.HandNumber, "heartsBroken": o.HeartsBroken, "spadesBroken": o.SpadesBroken, "passDirection": o.PassDirection, "received": o.Pass.Incoming, "outgoing": o.Pass.Outgoing, "handResult": o.HandResult, "currentWinner": winner, "legalActions": actions}
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	if err = contracts.Validate("GameView", raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func Notes(o Observation) (json.RawMessage, error) {
	plays := []Play{}
	for _, t := range o.History {
		plays = append(plays, t.Plays...)
	}
	if len(o.Trick) < 4 {
		plays = append(plays, o.Trick...)
	}
	memory := []any{}
	for _, m := range GetMemory(o) {
		cards := []string{}
		for _, p := range plays {
			if CardSuit(p.Card) == m.Suit {
				cards = append(cards, p.Card)
			}
		}
		memory = append(memory, map[string]any{"suit": m.Suit, "played": m.Played, "remaining": m.Remaining, "voidSeats": m.VoidSeats, "playedCards": cards})
	}
	raw, err := json.Marshal(map[string]any{"memory": memory, "outgoing": o.Pass.Outgoing, "received": o.Pass.Incoming, "history": o.History})
	if err != nil {
		return nil, err
	}
	if err = contracts.Validate("NotesView", raw); err != nil {
		return nil, err
	}
	return raw, nil
}
