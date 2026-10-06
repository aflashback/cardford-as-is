package spades

import (
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"fmt"
)

type sessionTable struct {
	Hand         []string `json:"hand"`
	HandCounts   [4]int   `json:"handCounts"`
	Scores       [4]int   `json:"scores"`
	Turn         *int     `json:"turn"`
	Dealer       int      `json:"dealer"`
	RoundNumber  int      `json:"roundNumber"`
	Trick        []Play   `json:"trick"`
	History      []Trick  `json:"history"`
	SpadesBroken bool     `json:"spadesBroken"`
	Bids         [4]*int  `json:"bids"`
	Tricks       [4]int   `json:"tricks"`
	Bags         [4]int   `json:"bags"`
}
type sessionObservation struct {
	ObservationSchemaVersion string       `json:"observationSchemaVersion"`
	VariantID                string       `json:"variantId"`
	Seat                     int          `json:"seat"`
	Phase                    string       `json:"phase"`
	Table                    sessionTable `json:"table"`
	Events                   []Event      `json:"events"`
	HandResult               *HandResult  `json:"handResult,omitempty"`
}

func observeSession(v *sessionState, seat int) sessionObservation {
	s := v.original
	counts := [4]int{}
	for seat, hand := range s.Hands {
		counts[seat] = len(hand)
	}
	return sessionObservation{ObservationSchemaVersion: "2.0.0", VariantID: sessionVariant(v), Seat: seat, Phase: sessionPhase(v), Table: sessionTable{Hand: s.Hands[seat], HandCounts: counts, Scores: s.Scores, Turn: s.Turn, Dealer: s.Dealer, RoundNumber: s.HandNumber, Trick: s.Trick, History: s.History, SpadesBroken: s.SpadesBroken, Bids: s.Bids, Tricks: s.Tricks, Bags: s.Bags}, Events: s.Events, HandResult: s.HandResult}
}
func observationActions(o sessionObservation) []Action {
	if o.Phase == "deal" {
		return []Action{}
	}
	return actionsFor(o.Phase, o.Table.Turn, sorted(o.Table.Hand), o.Table.Trick, o.Table.SpadesBroken, o.Seat)
}
func observationUnit(o sessionObservation) *gamekernel.AccessUnit {
	if o.Phase == "deal" || o.Phase == "match-end" {
		return nil
	}
	admission := o.Phase == "bid"
	for _, bid := range o.Table.Bids {
		admission = admission && bid == nil
	}
	return &gamekernel.AccessUnit{ID: fmt.Sprintf("spades:%s:hand:%d", o.VariantID, o.Table.RoundNumber), Kind: "hand", AtAdmissionBoundary: admission}
}
func legacySessionObservation(o sessionObservation) (d.Observation, error) {
	t := o.Table
	phase := o.Phase
	if phase == "deal" {
		phase = "hand-end"
	}
	// Only detached seat-visible fields enter the policy. Compatibility data and
	// the private aggregate are absent; Analyze validates the typed projection.
	result := d.Observation{
		Mode: "spades-" + o.VariantID, Seat: o.Seat, ModuleVersion: "1.0.0", RuleProfileID: ruleProfile("spades-" + o.VariantID),
		ObservationSchemaVersion: "1.0.0", FeatureVersion: "1.0.0", Phase: phase,
		Hand: append([]string{}, t.Hand...), HandSizes: append([]int{}, t.HandCounts[:]...),
		Bids: make([]*int, 4), Tricks: append([]int{}, t.Tricks[:]...), Scores: append([]int{}, t.Scores[:]...), Bags: append([]int{}, t.Bags[:]...),
		Trick: []d.Play{}, History: []d.Trick{}, Turn: cloneSessionPointer(t.Turn), Dealer: t.Dealer, HandNumber: t.RoundNumber,
		SpadesBroken: t.SpadesBroken, Events: []d.Event{}, PassDirection: []string{"left", "right", "across", "hold"}[(t.RoundNumber-1)%4],
		Pass: d.PassMemory{Outgoing: []string{}, Incoming: []string{}}, LegalActions: []d.Action{}, KnownHoldings: []d.Play{},
	}
	for seat, bid := range t.Bids {
		result.Bids[seat] = cloneSessionPointer(bid)
	}
	copyPlays := func(plays []Play) []d.Play {
		out := make([]d.Play, len(plays))
		for i, play := range plays {
			out[i] = d.Play{Seat: play.Seat, Card: play.Card}
			result.HeartsBroken = result.HeartsBroken || play.Card[0] == 'H'
		}
		return out
	}
	result.Trick = copyPlays(t.Trick)
	for _, trick := range t.History {
		result.History = append(result.History, d.Trick{Plays: copyPlays(trick.Plays), Winner: trick.Winner})
	}
	for _, event := range o.Events {
		copy := d.Event{ID: event.ID, Type: event.Type, Message: event.Message, Seat: cloneSessionPointer(event.Seat), Bid: cloneSessionPointer(event.Bid)}
		if event.Card != nil {
			copy.Card = *event.Card
		}
		result.Events = append(result.Events, copy)
	}
	for _, action := range actionsFor(phase, t.Turn, sorted(t.Hand), t.Trick, t.SpadesBroken, o.Seat) {
		copy := d.Action{Kind: action.Kind, Seat: action.Seat}
		if action.Card != nil {
			copy.Card = *action.Card
		}
		if action.Bid != nil {
			copy.Bid = *action.Bid
		}
		result.LegalActions = append(result.LegalActions, copy)
	}
	result.Memory = d.GetMemory(result)
	if o.HandResult != nil {
		result.HandResult = &d.HandResult{Points: append([]int{}, o.HandResult.Points[:]...), Bags: append([]int{}, o.HandResult.Bags[:]...), Winner: cloneSessionPointer(o.HandResult.Winner)}
	}
	return result, nil
}

func cloneSessionPointer[T any](value *T) *T {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
