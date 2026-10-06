// Package hearts implements the original V1 Hearts rules and safe observations.
// The compatibility adapter is unexposed; service activation is separate.
package hearts

import (
	"cardford/server/internal/contracts"
	"encoding/json"
	"fmt"
	"reflect"
	"unicode/utf16"
)

const maxSafeInteger = 9007199254740991
const maxEvents = 100000

type config struct {
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
type pass struct {
	Outgoing []string `json:"outgoing"`
	Incoming []string `json:"incoming"`
	To       *int     `json:"to"`
	From     *int     `json:"from"`
}
type event struct {
	ID      int     `json:"id"`
	Type    string  `json:"type"`
	Message string  `json:"message"`
	Seat    *int    `json:"seat,omitempty"`
	Card    *string `json:"card,omitempty"`
}
type handResult struct {
	Points [4]int `json:"points"`
	Bags   [4]int `json:"bags"`
	Winner *int   `json:"winner,omitempty"`
}
type state struct {
	ID                 string      `json:"id"`
	Mode               string      `json:"mode"`
	ModuleVersion      string      `json:"moduleVersion"`
	RuleProfileID      string      `json:"ruleProfileId"`
	EventSchemaVersion string      `json:"eventSchemaVersion"`
	Phase              string      `json:"phase"`
	Hands              [4][]string `json:"hands"`
	Bids               [4]*int     `json:"bids"`
	Tricks             [4]int      `json:"tricks"`
	Scores             [4]int      `json:"scores"`
	Bags               [4]int      `json:"bags"`
	Trick              []Play      `json:"trick"`
	History            []Trick     `json:"history"`
	Turn               *int        `json:"turn"`
	Dealer             int         `json:"dealer"`
	HandNumber         int         `json:"handNumber"`
	HeartsBroken       bool        `json:"heartsBroken"`
	SpadesBroken       bool        `json:"spadesBroken"`
	Events             []event     `json:"events"`
	PassDirection      string      `json:"passDirection"`
	Passes             [4]pass     `json:"passes"`
	HandResult         *handResult `json:"handResult,omitempty"`
}
type action struct {
	Kind  string   `json:"kind"`
	Seat  int      `json:"seat"`
	Cards []string `json:"cards,omitempty"`
	Card  string   `json:"card,omitempty"`
}
type command struct {
	Type   string          `json:"type"`
	Action json.RawMessage `json:"action,omitempty"`
	Deal   []string        `json:"deal,omitempty"`
}

func ptr[T any](v T) *T       { return &v }
func seatOK(v int) bool       { return v >= 0 && v < 4 }
func safeInt(v int) bool      { return v >= -maxSafeInteger && v <= maxSafeInteger }
func textLength(v string) int { return len(utf16.Encode([]rune(v))) }

// ParseJSON rejects duplicate keys, malformed Unicode and unsafe numbers;
// round-trip equality enforces exact closed fields, casing, null and array shape.
func decode(raw []byte, out any) error {
	a, err := contracts.ParseJSON(raw)
	if err != nil {
		return err
	}
	if err = json.Unmarshal(raw, out); err != nil {
		return err
	}
	b, err := json.Marshal(out)
	if err != nil {
		return err
	}
	v, err := contracts.ParseJSON(b)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(a, v) {
		return fmt.Errorf("invalid closed Hearts shape")
	}
	return nil
}
func read(raw json.RawMessage) (*state, error) {
	var s state
	if err := decode(raw, &s); err != nil {
		return nil, err
	}
	return checkedState(s)
}
func Validate(raw json.RawMessage) error { _, err := read(raw); return err }
func Create(raw json.RawMessage, deck []string) (json.RawMessage, error) {
	s, err := createState(raw, deck)
	if err != nil {
		return nil, err
	}
	return json.Marshal(s)
}
func Apply(raw, cmd json.RawMessage) (json.RawMessage, error) {
	s, err := read(raw)
	if err != nil {
		return nil, err
	}
	s, err = applyTo(s, cmd)
	if err != nil {
		return nil, err
	}
	return json.Marshal(s)
}

// Score independently checks a complete played hand before arithmetic.
func Score(raw json.RawMessage) ([4]int, error) {
	var history []Trick
	if err := decode(raw, &history); err != nil {
		return [4]int{}, err
	}
	if len(history) != 13 {
		return [4]int{}, fmt.Errorf("expected complete hand")
	}
	seen := map[string]bool{}
	for i, t := range history {
		if len(t.Plays) != 4 || !seatOK(t.Winner) {
			return [4]int{}, fmt.Errorf("invalid trick")
		}
		if i > 0 && t.Plays[0].Seat != history[i-1].Winner {
			return [4]int{}, fmt.Errorf("incorrect next leader")
		}
		for j, p := range t.Plays {
			if !seatOK(p.Seat) || p.Seat != (t.Plays[0].Seat+j)%4 || !cardOK(p.Card) || seen[p.Card] {
				return [4]int{}, fmt.Errorf("invalid complete hand")
			}
			seen[p.Card] = true
		}
		if trickWinner(t.Plays) != t.Winner {
			return [4]int{}, fmt.Errorf("incorrect winner")
		}
	}
	return scorePoints(history), nil
}
