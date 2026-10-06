// Package hearts implements only the M02A opening sealed-pass and scoring seam.
// It is not registered in any production catalog. Later play fails closed.
package hearts

import (
	"cardford/server/internal/contracts"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"unicode/utf16"
)

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
	ID      int    `json:"id"`
	Type    string `json:"type"`
	Message string `json:"message"`
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
}
type action struct {
	Kind  string   `json:"kind"`
	Seat  int      `json:"seat"`
	Cards []string `json:"cards,omitempty"`
	Card  string   `json:"card,omitempty"`
}

func ptr(v int) *int    { return &v }
func seatOK(v int) bool { return v >= 0 && v < 4 }
func rank(c string) int {
	ranks := []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"}
	for i, r := range ranks {
		if len(c) > 1 && c[1:] == r {
			return i + 2
		}
	}
	return -1
}
func cardOK(c string) bool { return len(c) >= 2 && strings.Contains("CDHS", c[:1]) && rank(c) > 0 }
func sorted(v []string) []string {
	r := append([]string{}, v...)
	sort.Slice(r, func(i, j int) bool {
		a, b := r[i], r[j]
		if a[0] != b[0] {
			return strings.IndexByte("CDHS", a[0]) < strings.IndexByte("CDHS", b[0])
		}
		return rank(a) < rank(b)
	})
	return r
}
func has(v []string, c string) bool {
	for _, a := range v {
		if a == c {
			return true
		}
	}
	return false
}

// Strict round-trip shape validation rejects unknown/missing/null fields and
// wrong casing, in addition to ParseJSON's duplicate/UTF-8/depth checks.
func decode(raw []byte, out any) error {
	a, e := contracts.ParseJSON(raw)
	if e != nil {
		return e
	}
	if e = json.Unmarshal(raw, out); e != nil {
		return e
	}
	b, e := json.Marshal(out)
	if e != nil {
		return e
	}
	v, e := contracts.ParseJSON(b)
	if e != nil {
		return e
	}
	if !reflect.DeepEqual(a, v) {
		return fmt.Errorf("invalid closed Hearts shape")
	}
	return nil
}
func initial(id string, dealer int) *state {
	s := &state{ID: id, Mode: "hearts", ModuleVersion: "1.0.0", RuleProfileID: "hearts-training-1.0.0", EventSchemaVersion: "1.0.0", Phase: "pass", Dealer: dealer, HandNumber: 1, Trick: []Play{}, History: []Trick{}, PassDirection: "left", Events: []event{{1, "hand-started", "Hand 1 dealt. Pass three cards left."}}}
	for i := 0; i < 4; i++ {
		s.Hands[i] = []string{}
		s.Passes[i] = pass{Outgoing: []string{}, Incoming: []string{}}
	}
	return s
}
func Create(raw json.RawMessage, deck []string) (json.RawMessage, error) {
	s, e := createState(raw, deck)
	if e != nil {
		return nil, e
	}
	return json.Marshal(s)
}
func createState(raw json.RawMessage, deck []string) (*state, error) {
	var c config
	if e := decode(raw, &c); e != nil {
		return nil, e
	}
	if c.ID == "" || len(utf16.Encode([]rune(c.ID))) > 256 || c.Mode != "hearts" || !seatOK(c.Dealer) {
		return nil, fmt.Errorf("invalid Hearts configuration")
	}
	if len(deck) != 52 {
		return nil, fmt.Errorf("expected recorded full deck")
	}
	seen := map[string]bool{}
	s := initial(c.ID, c.Dealer)
	for i, card := range deck {
		if !cardOK(card) || seen[card] {
			return nil, fmt.Errorf("invalid deal")
		}
		seen[card] = true
		seat := (c.Dealer + 1 + i) % 4
		s.Hands[seat] = append(s.Hands[seat], card)
	}
	for i := 0; i < 4; i++ {
		s.Hands[i] = sorted(s.Hands[i])
	}
	return s, nil
}
func read(raw json.RawMessage) (*state, error) {
	var s state
	if e := decode(raw, &s); e != nil {
		return nil, e
	}
	return checkedState(s)
}
func checkedState(s state) (*state, error) {
	if s.ID == "" || len(utf16.Encode([]rune(s.ID))) > 256 || !seatOK(s.Dealer) {
		return nil, fmt.Errorf("invalid identity")
	}
	expected := initial(s.ID, s.Dealer)
	seen := map[string]bool{}
	for i, h := range s.Hands {
		if len(h) != 13 {
			return nil, fmt.Errorf("only opening Hearts checkpoints supported")
		}
		for _, c := range h {
			if !cardOK(c) || seen[c] {
				return nil, fmt.Errorf("invalid cards")
			}
			seen[c] = true
		}
		expected.Hands[i] = sorted(h)
	}
	if s.Phase == "play" {
		expected.Phase = "play"
		for i, p := range s.Passes {
			to, from := (i+1)%4, (i+3)%4
			if p.To == nil || *p.To != to || p.From == nil || *p.From != from || len(p.Outgoing) != 3 || len(p.Incoming) != 3 {
				return nil, fmt.Errorf("invalid pass memory")
			}
			seenPass := map[string]bool{}
			for _, c := range p.Outgoing {
				if !has(s.Hands[to], c) || seenPass[c] {
					return nil, fmt.Errorf("invalid known holding")
				}
				seenPass[c] = true
			}
			if !reflect.DeepEqual(p.Incoming, s.Passes[from].Outgoing) {
				return nil, fmt.Errorf("inconsistent exchange")
			}
			expected.Passes[i] = pass{sorted(p.Outgoing), sorted(p.Incoming), ptr(to), ptr(from)}
			if has(s.Hands[i], "C2") {
				expected.Turn = ptr(i)
			}
		}
		expected.Events = append(expected.Events, event{2, "cards-passed", fmt.Sprintf("Three cards passed left. %s lead with the 2 of Clubs.", []string{"You", "West", "North", "East"}[*expected.Turn])})
	} else if s.Phase != "pass" {
		return nil, fmt.Errorf("unsupported Hearts continuation")
	}
	if !reflect.DeepEqual(s, *expected) {
		return nil, fmt.Errorf("unsupported or inconsistent Hearts opening state")
	}
	return &s, nil
}
func Validate(raw json.RawMessage) error { _, e := read(raw); return e }
func Apply(raw, cmd json.RawMessage) (json.RawMessage, error) {
	s, e := read(raw)
	if e != nil {
		return nil, e
	}
	s, e = applyTo(s, cmd)
	if e != nil {
		return nil, e
	}
	out, e := json.Marshal(s)
	if e == nil {
		e = Validate(out)
	}
	return out, e
}
func applyTo(s *state, cmd json.RawMessage) (*state, error) {
	var c struct {
		Type   string `json:"type"`
		Action struct {
			Kind   string      `json:"kind"`
			Passes [4][]string `json:"passes"`
		} `json:"action"`
	}
	if e := decode(cmd, &c); e != nil {
		return nil, e
	}
	if s.Phase != "pass" || c.Type != "action" || c.Action.Kind != "pass-bundle" {
		return nil, fmt.Errorf("unsupported Hearts continuation")
	}
	for seat, p := range c.Action.Passes {
		if len(p) != 3 {
			return nil, fmt.Errorf("pass needs three cards")
		}
		seen := map[string]bool{}
		for _, card := range p {
			if !has(s.Hands[seat], card) || seen[card] {
				return nil, fmt.Errorf("illegal pass")
			}
			seen[card] = true
		}
	}
	var hands [4][]string
	for seat, h := range s.Hands {
		hands[seat] = []string{}
		for _, card := range h {
			if !has(c.Action.Passes[seat], card) {
				hands[seat] = append(hands[seat], card)
			}
		}
		from, to := (seat+3)%4, (seat+1)%4
		hands[seat] = sorted(append(hands[seat], c.Action.Passes[from]...))
		s.Passes[seat] = pass{sorted(c.Action.Passes[seat]), sorted(c.Action.Passes[from]), ptr(to), ptr(from)}
	}
	s.Hands = hands
	s.Phase = "play"
	for i, h := range hands {
		if has(h, "C2") {
			s.Turn = ptr(i)
		}
	}
	s.Events = append(s.Events, event{2, "cards-passed", fmt.Sprintf("Three cards passed left. %s lead with the 2 of Clubs.", []string{"You", "West", "North", "East"}[*s.Turn])})
	return s, nil
}
func actions(s *state, seat int) []action {
	a := []action{}
	if s.Phase == "pass" {
		h := s.Hands[seat]
		for i := 0; i < len(h)-2; i++ {
			for j := i + 1; j < len(h)-1; j++ {
				for k := j + 1; k < len(h); k++ {
					a = append(a, action{Kind: "pass", Seat: seat, Cards: []string{h[i], h[j], h[k]}})
				}
			}
		}
	} else if s.Turn != nil && *s.Turn == seat {
		a = append(a, action{Kind: "play", Seat: seat, Card: "C2"})
	}
	return a
}
func Legal(raw json.RawMessage, seat int) (json.RawMessage, error) {
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	s, e := read(raw)
	if e != nil {
		return nil, e
	}
	return json.Marshal(actions(s, seat))
}
func CandidateIDs(raw json.RawMessage, seat int) ([]string, error) {
	b, e := Legal(raw, seat)
	if e != nil {
		return nil, e
	}
	var a []action
	json.Unmarshal(b, &a)
	ids := []string{}
	for _, v := range a {
		if v.Kind == "pass" {
			ids = append(ids, "pass:"+strings.Join(v.Cards, ","))
		} else {
			ids = append(ids, "play:"+v.Card)
		}
	}
	return ids, nil
}
func Observe(raw json.RawMessage, seat int) (json.RawMessage, error) {
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	s, e := read(raw)
	if e != nil {
		return nil, e
	}
	return json.Marshal(observation(s, seat))
}
func observation(s *state, seat int) map[string]any {
	memory := []any{}
	for _, suit := range []string{"C", "D", "H", "S"} {
		memory = append(memory, map[string]any{"suit": suit, "played": 0, "remaining": 13, "voidSeats": []int{}})
	}
	known := []Play{}
	p := s.Passes[seat]
	if p.To != nil {
		for _, c := range p.Outgoing {
			known = append(known, Play{*p.To, c})
		}
	}
	return map[string]any{"mode": s.Mode, "seat": seat, "moduleVersion": s.ModuleVersion, "ruleProfileId": s.RuleProfileID, "observationSchemaVersion": "1.0.0", "featureVersion": "1.0.0", "phase": s.Phase, "hand": s.Hands[seat], "handSizes": [4]int{13, 13, 13, 13}, "bids": s.Bids, "tricks": s.Tricks, "scores": s.Scores, "bags": s.Bags, "trick": s.Trick, "history": s.History, "turn": s.Turn, "dealer": s.Dealer, "handNumber": s.HandNumber, "heartsBroken": false, "spadesBroken": false, "events": s.Events, "passDirection": s.PassDirection, "pass": p, "legalActions": actions(s, seat), "memory": memory, "knownHoldings": known}
}
func SafeView(raw json.RawMessage, seat int) (json.RawMessage, error) {
	if !seatOK(seat) {
		return nil, fmt.Errorf("invalid seat")
	}
	s, e := read(raw)
	if e != nil {
		return nil, e
	}
	return json.Marshal(view(s, seat, actions(s, seat)))
}
func view(s *state, seat int, choices []action) map[string]any {
	publicActions := []any{}
	for _, a := range choices {
		if a.Kind == "pass" {
			publicActions = append(publicActions, map[string]any{"kind": "pass", "cards": a.Cards})
		} else {
			publicActions = append(publicActions, map[string]any{"kind": "play", "card": a.Card})
		}
	}
	return map[string]any{"id": s.ID, "mode": s.Mode, "phase": s.Phase, "hand": s.Hands[seat], "handCounts": [4]int{13, 13, 13, 13}, "bids": s.Bids, "tricks": s.Tricks, "scores": s.Scores, "bags": s.Bags, "trick": s.Trick, "history": s.History, "turn": s.Turn, "dealer": s.Dealer, "handNumber": s.HandNumber, "heartsBroken": false, "spadesBroken": false, "passDirection": s.PassDirection, "received": s.Passes[seat].Incoming, "outgoing": s.Passes[seat].Outgoing, "handResult": nil, "currentWinner": nil, "legalActions": publicActions}
}

// Score accepts a complete played hand only, independently checking cards,
// player order and winners before arithmetic; it cannot resume live play.
func Score(raw json.RawMessage) ([4]int, error) {
	var ts []Trick
	var points [4]int
	if e := decode(raw, &ts); e != nil {
		return points, e
	}
	if len(ts) != 13 {
		return points, fmt.Errorf("expected complete hand")
	}
	seen := map[string]bool{}
	for index, t := range ts {
		if len(t.Plays) != 4 || !seatOK(t.Winner) {
			return points, fmt.Errorf("invalid trick")
		}
		if index > 0 && t.Plays[0].Seat != ts[index-1].Winner {
			return points, fmt.Errorf("incorrect next leader")
		}
		win := t.Plays[0]
		for i, p := range t.Plays {
			if !seatOK(p.Seat) || p.Seat != (t.Plays[0].Seat+i)%4 || !cardOK(p.Card) || seen[p.Card] {
				return points, fmt.Errorf("invalid complete hand")
			}
			seen[p.Card] = true
			if p.Card[0] == win.Card[0] && rank(p.Card) > rank(win.Card) {
				win = p
			}
			if p.Card == "SQ" {
				points[t.Winner] += 13
			} else if p.Card[0] == 'H' {
				points[t.Winner]++
			}
		}
		if win.Seat != t.Winner {
			return points, fmt.Errorf("incorrect winner")
		}
	}
	for seat, p := range points {
		if p == 26 {
			for i := range points {
				points[i] = 26
			}
			points[seat] = 0
			break
		}
	}
	return points, nil
}
