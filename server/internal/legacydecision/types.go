// Package legacydecision freezes the original V1 actor-scoped decision DTOs.
// It contains no game strategy and does not accept authoritative private games.
package legacydecision

import (
	"encoding/json"
	"fmt"
)

type Seat = int
type Card = string
type Suit = string

type Action struct {
	Kind  string   `json:"kind"`
	Seat  int      `json:"seat"`
	Card  string   `json:"card,omitempty"`
	Bid   int      `json:"-"`
	Cards []string `json:"cards,omitempty"`
}

func (a Action) MarshalJSON() ([]byte, error) {
	switch a.Kind {
	case "play":
		return json.Marshal(struct {
			Kind string `json:"kind"`
			Seat int    `json:"seat"`
			Card string `json:"card"`
		}{a.Kind, a.Seat, a.Card})
	case "bid":
		return json.Marshal(struct {
			Kind string `json:"kind"`
			Seat int    `json:"seat"`
			Bid  int    `json:"bid"`
		}{a.Kind, a.Seat, a.Bid})
	case "pass":
		return json.Marshal(struct {
			Kind  string   `json:"kind"`
			Seat  int      `json:"seat"`
			Cards []string `json:"cards"`
		}{a.Kind, a.Seat, a.Cards})
	}
	return nil, fmt.Errorf("invalid action kind %q", a.Kind)
}
func (a *Action) UnmarshalJSON(raw []byte) error {
	var v struct {
		Kind  string
		Seat  int
		Card  string
		Bid   int
		Cards []string
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	*a = Action{v.Kind, v.Seat, v.Card, v.Bid, v.Cards}
	return nil
}

type Play struct {
	Seat int    `json:"seat"`
	Card string `json:"card"`
}
type Trick struct {
	Plays  []Play `json:"plays"`
	Winner int    `json:"winner"`
}
type PassMemory struct {
	Outgoing []string `json:"outgoing"`
	Incoming []string `json:"incoming"`
	To       *int     `json:"to"`
	From     *int     `json:"from"`
}
type SuitMemory struct {
	Suit      string `json:"suit"`
	Played    int    `json:"played"`
	Remaining int    `json:"remaining"`
	VoidSeats []int  `json:"voidSeats"`
}
type HandResult struct {
	Points []int `json:"points"`
	Bags   []int `json:"bags"`
	Winner *int  `json:"winner,omitempty"`
}
type Event struct {
	ID      int    `json:"id"`
	Type    string `json:"type"`
	Message string `json:"message"`
	Seat    *int   `json:"seat,omitempty"`
	Card    string `json:"card,omitempty"`
	Bid     *int   `json:"bid,omitempty"`
}
type Observation struct {
	Mode                     string       `json:"mode"`
	Seat                     int          `json:"seat"`
	ModuleVersion            string       `json:"moduleVersion"`
	RuleProfileID            string       `json:"ruleProfileId"`
	ObservationSchemaVersion string       `json:"observationSchemaVersion"`
	FeatureVersion           string       `json:"featureVersion"`
	Phase                    string       `json:"phase"`
	Hand                     []string     `json:"hand"`
	HandSizes                []int        `json:"handSizes"`
	Bids                     []*int       `json:"bids"`
	Tricks                   []int        `json:"tricks"`
	Scores                   []int        `json:"scores"`
	Bags                     []int        `json:"bags"`
	Trick                    []Play       `json:"trick"`
	History                  []Trick      `json:"history"`
	Turn                     *int         `json:"turn"`
	Dealer                   int          `json:"dealer"`
	HandNumber               int          `json:"handNumber"`
	HeartsBroken             bool         `json:"heartsBroken"`
	SpadesBroken             bool         `json:"spadesBroken"`
	Events                   []Event      `json:"events"`
	HandResult               *HandResult  `json:"handResult,omitempty"`
	PassDirection            string       `json:"passDirection"`
	Pass                     PassMemory   `json:"pass"`
	LegalActions             []Action     `json:"legalActions"`
	Memory                   []SuitMemory `json:"memory"`
	KnownHoldings            []Play       `json:"knownHoldings"`
}
type Reason struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Text      string   `json:"text"`
	ActionIDs []string `json:"actionIds,omitempty"`
}
type CardOutcome struct {
	ActionID         string `json:"actionId"`
	CurrentWinner    int    `json:"currentWinner"`
	GuaranteedWinner *int   `json:"guaranteedWinner"`
	CanBeOvertakenBy []int  `json:"canBeOvertakenBy"`
	CoversPartnerNil bool   `json:"coversPartnerNil"`
	TrumpRisk        []int  `json:"trumpRisk"`
	IsMaster         bool   `json:"isMaster"`
}
type PossibleOwner struct {
	Card  string `json:"card"`
	Seats []int  `json:"seats"`
}
type Facts struct {
	Mode                 string           `json:"mode"`
	Seat                 int              `json:"seat"`
	LegalCount           int              `json:"legalCount"`
	LedSuit              *string          `json:"ledSuit"`
	CurrentWinner        *int             `json:"currentWinner"`
	ActorsAfter          []int            `json:"actorsAfter"`
	TricksRemaining      int              `json:"tricksRemaining"`
	OwnBid               *int             `json:"ownBid"`
	OwnTricks            int              `json:"ownTricks"`
	OwnNil               string           `json:"ownNil"`
	Partner              *int             `json:"partner"`
	PartnerNil           *string          `json:"partnerNil"`
	ContractBid          *int             `json:"contractBid"`
	CreditedTricks       *int             `json:"creditedTricks"`
	ContractNeeded       *int             `json:"contractNeeded"`
	OldBags              *int             `json:"oldBags"`
	BagRoom              *int             `json:"bagRoom"`
	NextOrdinaryBagDelta *int             `json:"nextOrdinaryBagDelta"`
	ScoreToTarget        *int             `json:"scoreToTarget"`
	SuitLengths          map[string]int   `json:"suitLengths"`
	Voids                map[string][]int `json:"voids"`
	PlayedCards          []string         `json:"playedCards"`
	OutstandingCards     []string         `json:"outstandingCards"`
	PossibleOwners       []PossibleOwner  `json:"possibleOwners"`
	KnowledgeComplete    bool             `json:"knowledgeComplete"`
	CardOutcomes         []CardOutcome    `json:"cardOutcomes"`
}
type Candidate struct {
	Action      Action   `json:"action"`
	ReasonIDs   []string `json:"reasonIds"`
	Disposition string   `json:"disposition"`
	Evidence    string   `json:"evidence"`
}
type Effect struct {
	ID    string  `json:"id"`
	Delta float64 `json:"delta"`
}
type TraceCandidate struct {
	ActionID string   `json:"actionId"`
	Score    *float64 `json:"score"`
	Effects  []Effect `json:"effects"`
	TieOrder int      `json:"tieOrder"`
}
type ScenarioCheck struct {
	ID     string `json:"id"`
	Result string `json:"result"`
}
type Trace struct {
	SchemaVersion    string           `json:"schemaVersion"`
	PolicyVersion    string           `json:"policyVersion"`
	CatalogVersion   string           `json:"catalogVersion"`
	SelectedActionID string           `json:"selectedActionId"`
	SelectedBy       string           `json:"selectedBy"`
	ScenarioChecks   []ScenarioCheck  `json:"scenarioChecks"`
	Candidates       []TraceCandidate `json:"candidates"`
	Limitations      []string         `json:"limitations"`
}
type Analysis struct {
	SchemaVersion string      `json:"schemaVersion"`
	PolicyVersion string      `json:"policyVersion"`
	Provenance    string      `json:"provenance"`
	Action        Action      `json:"action"`
	ScenarioIDs   []string    `json:"scenarioIds"`
	Reasons       []Reason    `json:"reasons"`
	Facts         Facts       `json:"facts"`
	Candidates    []Candidate `json:"candidates"`
	Limitations   []string    `json:"limitations"`
	Trace         *Trace      `json:"trace,omitempty"`
}
type Advice struct {
	Focus           string   `json:"focus"`
	Notice          string   `json:"notice"`
	Reason          string   `json:"reason"`
	Suggestion      string   `json:"suggestion"`
	Card            string   `json:"card,omitempty"`
	Pass            []string `json:"pass,omitempty"`
	Bid             *int     `json:"bid,omitempty"`
	HighlightSuit   string   `json:"highlightSuit,omitempty"`
	Provenance      string   `json:"provenance"`
	PolicyVersion   string   `json:"policyVersion"`
	ReasonIDs       []string `json:"reasonIds"`
	Evidence        string   `json:"evidence"`
	CueVersion      *string  `json:"cueVersion,omitempty"`
	Outcome         string   `json:"outcome,omitempty"`
	Explanation     string   `json:"explanation,omitempty"`
	ConsideredCards []string `json:"consideredCards,omitempty"`
	ConsideredBids  []int    `json:"consideredBids,omitempty"`
}

func Ptr[T any](v T) *T { return &v }
func Value[T any](p *T) (v T) {
	if p != nil {
		v = *p
	}
	return
}
