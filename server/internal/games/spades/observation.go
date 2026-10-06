package spades

import (
	"encoding/json"
	"fmt"
)

func memoryFor(s *State) []SuitMemory {
	seen := map[string]bool{}
	voids := [4][4]bool{}
	tricks := make([][]Play, 0, len(s.History)+1)
	for _, t := range s.History {
		tricks = append(tricks, t.Plays)
	}
	tricks = append(tricks, s.Trick)
	for _, trick := range tricks {
		if len(trick) == 0 {
			continue
		}
		led := cardValue(trick[0].Card) / 13
		for _, p := range trick {
			seen[p.Card] = true
			if cardValue(p.Card)/13 != led {
				voids[led][p.Seat] = true
			}
		}
	}
	result := make([]SuitMemory, 4)
	for suit := 0; suit < 4; suit++ {
		m := SuitMemory{Suit: string("CDHS"[suit]), VoidSeats: []int{}}
		for c := range seen {
			if cardValue(c)/13 == suit {
				m.Played++
			}
		}
		m.Remaining = 13 - m.Played
		for seat := 0; seat < 4; seat++ {
			if voids[suit][seat] {
				m.VoidSeats = append(m.VoidSeats, seat)
			}
		}
		result[suit] = m
	}
	return result
}

// observation is an allowlist. It never serializes a State or any other hand.
func observation(s *State, seat int) Observation {
	o := Observation{Mode: s.Mode, Seat: seat, ModuleVersion: "1.0.0", RuleProfileID: s.RuleProfileID, ObservationSchemaVersion: "1.0.0", FeatureVersion: "1.0.0", Phase: s.Phase, Hand: s.Hands[seat], Bids: s.Bids, Tricks: s.Tricks, Scores: s.Scores, Bags: s.Bags, Trick: s.Trick, History: s.History, Turn: s.Turn, Dealer: s.Dealer, HandNumber: s.HandNumber, HeartsBroken: s.HeartsBroken, SpadesBroken: s.SpadesBroken, Events: s.Events, PassDirection: s.PassDirection, Pass: PassMemory{Outgoing: []string{}, Incoming: []string{}}, LegalActions: actionsFor(s.Phase, s.Turn, s.Hands[seat], s.Trick, s.SpadesBroken, seat), Memory: memoryFor(s), KnownHoldings: []Play{}, HandResult: s.HandResult}
	for seat, h := range s.Hands {
		o.HandSizes[seat] = len(h)
	}
	return o
}

// Observe returns the exact frozen V1 actor-safe policy input, without a game
// ID, private aggregate, other hands, deal material, or saved future choices.
func Observe(state json.RawMessage, seat int) (json.RawMessage, error) {
	s, err := DecodeState(state)
	if err != nil {
		return nil, err
	}
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	return json.Marshal(observation(s, seat))
}

type publicAction struct {
	Kind string  `json:"kind"`
	Card *string `json:"card,omitempty"`
	Bid  *int    `json:"bid,omitempty"`
}

// gameView is a projection of the existing active public GameView schema.
// The schema remains authoritative; no private shape is embedded here.
type gameView struct {
	ID            string         `json:"id"`
	Mode          string         `json:"mode"`
	Phase         string         `json:"phase"`
	Hand          []string       `json:"hand"`
	HandCounts    [4]int         `json:"handCounts"`
	Bids          [4]*int        `json:"bids"`
	Tricks        [4]int         `json:"tricks"`
	Scores        [4]int         `json:"scores"`
	Bags          [4]int         `json:"bags"`
	Trick         []Play         `json:"trick"`
	History       []Trick        `json:"history"`
	Turn          *int           `json:"turn"`
	Dealer        int            `json:"dealer"`
	HandNumber    int            `json:"handNumber"`
	HeartsBroken  bool           `json:"heartsBroken"`
	SpadesBroken  bool           `json:"spadesBroken"`
	PassDirection string         `json:"passDirection"`
	Received      []string       `json:"received"`
	Outgoing      []string       `json:"outgoing"`
	HandResult    *HandResult    `json:"handResult"`
	CurrentWinner *int           `json:"currentWinner"`
	LegalActions  []publicAction `json:"legalActions"`
}

// SafeView is the existing public GameView projection. The integration layer
// must check it against generated active public schemas before serving it.
func SafeView(state json.RawMessage, seat int) (json.RawMessage, error) {
	s, err := DecodeState(state)
	if err != nil {
		return nil, err
	}
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	o := observation(s, seat)
	return json.Marshal(view(s.ID, o))
}
func view(id string, o Observation) gameView {
	v := gameView{ID: id, Mode: o.Mode, Phase: o.Phase, Hand: o.Hand, HandCounts: o.HandSizes, Bids: o.Bids, Tricks: o.Tricks, Scores: o.Scores, Bags: o.Bags, Trick: o.Trick, History: o.History, Turn: o.Turn, Dealer: o.Dealer, HandNumber: o.HandNumber, HeartsBroken: o.HeartsBroken, SpadesBroken: o.SpadesBroken, PassDirection: o.PassDirection, Received: o.Pass.Incoming, Outgoing: o.Pass.Outgoing, HandResult: o.HandResult, LegalActions: []publicAction{}}
	if len(o.Trick) > 0 {
		v.CurrentWinner = ptr(trickWinner(o.Trick))
	}
	for _, a := range o.LegalActions {
		v.LegalActions = append(v.LegalActions, publicAction{Kind: a.Kind, Card: a.Card, Bid: a.Bid})
	}
	return v
}
