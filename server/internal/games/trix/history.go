package trix

import "fmt"

// CompletedRound identifies a request in the persisted public scoring ledger.
// It carries no hand, decision packet, future deal or live policy output.
type CompletedRound struct {
	ID         string `json:"id"`
	DealNumber int    `json:"dealNumber"`
	Kingdom    int    `json:"kingdom"`
	Request    string `json:"request"`
}
type RoundHistory struct {
	GameID          string          `json:"gameId"`
	Round           CompletedRound  `json:"round"`
	RequestTotals   []Score         `json:"requestTotals"`
	KingdomTotals   []Score         `json:"kingdomTotals"`
	Totals          []Score         `json:"totals"`
	Ledger          []LedgerEntry   `json:"ledger"`
	WithheldBonuses []WithheldBonus `json:"withheldBonuses"`
}

func CompletedRounds(o Observation) []CompletedRound {
	out := []CompletedRound{}
	seen := map[int]bool{}
	for _, e := range o.Ledger {
		closed := e.DealNumber < o.DealNumber || o.Phase == "round-complete" || o.Phase == "session-complete"
		if !closed || seen[e.DealNumber] {
			continue
		}
		seen[e.DealNumber] = true
		out = append(out, CompletedRound{ID: fmt.Sprintf("%s:trix-request:%d", o.ID, e.DealNumber), DealNumber: e.DealNumber, Kingdom: e.Kingdom, Request: e.Request})
	}
	return out
}

// SavedRound reuses the game's score arithmetic on immutable entries up to
// that request. Later rounds cannot change its totals or its breakdown.
func SavedRound(o Observation, id string) (RoundHistory, bool) {
	for _, round := range CompletedRounds(o) {
		if round.ID != id {
			continue
		}
		state := State{Config: Config{Variant: o.VariantID}, Ledger: []LedgerEntry{}}
		out := RoundHistory{GameID: o.ID, Round: round, Ledger: []LedgerEntry{}, WithheldBonuses: []WithheldBonus{}}
		for _, e := range o.Ledger {
			if e.DealNumber <= round.DealNumber {
				state.Ledger = append(state.Ledger, e)
			}
			if e.DealNumber == round.DealNumber {
				out.Ledger = append(out.Ledger, e)
			}
		}
		for _, bonus := range o.WithheldBonuses {
			if bonus.DealNumber == round.DealNumber {
				out.WithheldBonuses = append(out.WithheldBonuses, bonus)
			}
		}
		out.RequestTotals = scores(state, round.DealNumber, 0)
		out.KingdomTotals = scores(state, 0, round.Kingdom)
		out.Totals = scores(state, 0, 0)
		return out, true
	}
	return RoundHistory{}, false
}
