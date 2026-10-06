// Package spades owns the deterministic Spades compatibility slice. Its JSON
// facade reads and writes the frozen V1 private shape; none of it is a player API.
package spades

import "encoding/json"

const maxSafeInteger = 9007199254740991

type Config struct {
	ID     string `json:"id"`
	Mode   string `json:"mode"`
	Dealer int    `json:"dealer"`
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
type HandResult struct {
	Points [4]int `json:"points"`
	Bags   [4]int `json:"bags"`
	Winner *int   `json:"winner,omitempty"`
}
type Event struct {
	ID      int     `json:"id"`
	Type    string  `json:"type"`
	Message string  `json:"message"`
	Seat    *int    `json:"seat,omitempty"`
	Card    *string `json:"card,omitempty"`
	Bid     *int    `json:"bid,omitempty"`
}

// State is private, game-owned data. It never crosses a player-facing boundary.
type State struct {
	ID                 string        `json:"id"`
	Mode               string        `json:"mode"`
	ModuleVersion      string        `json:"moduleVersion"`
	RuleProfileID      string        `json:"ruleProfileId"`
	EventSchemaVersion string        `json:"eventSchemaVersion"`
	Phase              string        `json:"phase"`
	Hands              [4][]string   `json:"hands"`
	Bids               [4]*int       `json:"bids"`
	Tricks             [4]int        `json:"tricks"`
	Scores             [4]int        `json:"scores"`
	Bags               [4]int        `json:"bags"`
	Trick              []Play        `json:"trick"`
	History            []Trick       `json:"history"`
	Turn               *int          `json:"turn"`
	Dealer             int           `json:"dealer"`
	HandNumber         int           `json:"handNumber"`
	HeartsBroken       bool          `json:"heartsBroken"`
	SpadesBroken       bool          `json:"spadesBroken"`
	Events             []Event       `json:"events"`
	HandResult         *HandResult   `json:"handResult,omitempty"`
	PassDirection      string        `json:"passDirection"`
	Passes             [4]PassMemory `json:"passes"`
}
type Action struct {
	Kind string  `json:"kind"`
	Seat int     `json:"seat"`
	Card *string `json:"card,omitempty"`
	Bid  *int    `json:"bid,omitempty"`
}
type savedCommand struct {
	Type   string   `json:"type"`
	Action *Action  `json:"action,omitempty"`
	Deal   []string `json:"deal,omitempty"`
}
type SuitMemory struct {
	Suit      string `json:"suit"`
	Played    int    `json:"played"`
	Remaining int    `json:"remaining"`
	VoidSeats []int  `json:"voidSeats"`
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
	HandSizes                [4]int       `json:"handSizes"`
	Bids                     [4]*int      `json:"bids"`
	Tricks                   [4]int       `json:"tricks"`
	Scores                   [4]int       `json:"scores"`
	Bags                     [4]int       `json:"bags"`
	Trick                    []Play       `json:"trick"`
	History                  []Trick      `json:"history"`
	Turn                     *int         `json:"turn"`
	Dealer                   int          `json:"dealer"`
	HandNumber               int          `json:"handNumber"`
	HeartsBroken             bool         `json:"heartsBroken"`
	SpadesBroken             bool         `json:"spadesBroken"`
	Events                   []Event      `json:"events"`
	PassDirection            string       `json:"passDirection"`
	Pass                     PassMemory   `json:"pass"`
	LegalActions             []Action     `json:"legalActions"`
	Memory                   []SuitMemory `json:"memory"`
	KnownHoldings            []Play       `json:"knownHoldings"`
	HandResult               *HandResult  `json:"handResult,omitempty"`
}

func ptr[T any](v T) *T  { return &v }
func seatOK(s int) bool  { return s >= 0 && s < 4 }
func safeInt(n int) bool { return n >= -maxSafeInteger && n <= maxSafeInteger }
func ruleProfile(mode string) string {
	switch mode {
	case "spades-solo":
		return "spades-solo-training-1.0.0"
	case "spades-partners":
		return "spades-training-1.0.0"
	}
	return ""
}

// DecodeState is the checked V1 compatibility import. Unknown or malformed
// fields fail closed before semantic validation; it does not repair saved data.
func DecodeState(raw json.RawMessage) (*State, error) {
	var s State
	if err := strictDecode(raw, &s); err != nil {
		return nil, err
	}
	if err := validateState(&s); err != nil {
		return nil, err
	}
	return &s, nil
}

// EncodeState is the checked compatibility export.
func EncodeState(s *State) (json.RawMessage, error) {
	if err := validateState(s); err != nil {
		return nil, err
	}
	return json.Marshal(s)
}
