package hearts

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"reflect"
)

// sessionState reuses the frozen typed rules at an explicit private bridge.
// V2 continuation is a separate node; the V1 snapshot retains its old command.
type sessionState struct {
	original     *state
	awaitingDeal bool
}
type sessionResult struct {
	Points [4]int `json:"points"`
	Winner *int   `json:"winner,omitempty"`
}
type sessionCompatibility struct {
	ModuleVersion      string `json:"moduleVersion"`
	EventSchemaVersion string `json:"eventSchemaVersion"`
	SpadesBroken       bool   `json:"spadesBroken"`
}
type sessionDocument struct {
	ID                 string               `json:"id"`
	ModuleVersion      string               `json:"moduleVersion"`
	StateSchemaVersion string               `json:"stateSchemaVersion"`
	RuleProfileID      string               `json:"ruleProfileId"`
	EventSchemaVersion string               `json:"eventSchemaVersion"`
	Phase              string               `json:"phase"`
	Hands              [4][]string          `json:"hands"`
	Tricks             [4]int               `json:"tricks"`
	Scores             [4]int               `json:"scores"`
	Trick              []Play               `json:"trick"`
	History            []Trick              `json:"history"`
	Turn               *int                 `json:"turn"`
	Dealer             int                  `json:"dealer"`
	HandNumber         int                  `json:"handNumber"`
	HeartsBroken       bool                 `json:"heartsBroken"`
	Events             []event              `json:"events"`
	HandResult         *sessionResult       `json:"handResult,omitempty"`
	PassDirection      string               `json:"passDirection"`
	Passes             [4]pass              `json:"passes"`
	V1Compatibility    sessionCompatibility `json:"v1Compatibility"`
}

func SessionPin() gamekernel.Pin {
	return gamekernel.Pin{GameID: "hearts", VariantID: "solo", ModuleVersion: "2.0.0", RuleProfileID: "hearts-training-1.0.0", StateSchemaVersion: "2.0.0", ObservationSchemaVersion: "2.0.0", PublicSchemaVersion: "2.0.0", EventSchemaVersion: "2.0.0"}
}
func cloneSession(s *sessionState) *sessionState {
	return &sessionState{cloneState(s.original), s.awaitingDeal}
}
func sessionPhase(s *sessionState) string {
	if s.awaitingDeal {
		return "awaiting-deal"
	}
	return s.original.Phase
}
func sessionPayload(s *sessionState) sessionDocument {
	o := s.original
	d := sessionDocument{ID: o.ID, ModuleVersion: "2.0.0", StateSchemaVersion: "2.0.0", RuleProfileID: o.RuleProfileID, EventSchemaVersion: "2.0.0", Phase: sessionPhase(s), Hands: o.Hands, Tricks: o.Tricks, Scores: o.Scores, Trick: o.Trick, History: o.History, Turn: o.Turn, Dealer: o.Dealer, HandNumber: o.HandNumber, HeartsBroken: o.HeartsBroken, Events: o.Events, PassDirection: o.PassDirection, Passes: o.Passes, V1Compatibility: sessionCompatibility{"1.0.0", "1.0.0", o.SpadesBroken}}
	if o.HandResult != nil {
		d.HandResult = &sessionResult{o.HandResult.Points, o.HandResult.Winner}
	}
	return d
}
func stateFromSessionDocument(d sessionDocument) *sessionState {
	phase := d.Phase
	awaiting := phase == "awaiting-deal"
	if awaiting {
		phase = "hand-end"
	}
	s := &state{ID: d.ID, Mode: "hearts", ModuleVersion: "1.0.0", RuleProfileID: d.RuleProfileID, EventSchemaVersion: "1.0.0", Phase: phase, Hands: d.Hands, Tricks: d.Tricks, Scores: d.Scores, Trick: d.Trick, History: d.History, Turn: d.Turn, Dealer: d.Dealer, HandNumber: d.HandNumber, HeartsBroken: d.HeartsBroken, SpadesBroken: d.V1Compatibility.SpadesBroken, Events: d.Events, PassDirection: d.PassDirection, Passes: d.Passes}
	if d.HandResult != nil {
		s.HandResult = &handResult{Points: d.HandResult.Points, Winner: d.HandResult.Winner}
	}
	return &sessionState{s, awaiting}
}

// OpenSession imports only the exact native 2.0.0 payload. Legacy conversion is
// deliberately a separate entry point and does not rewrite an existing record.
func OpenSession(raw json.RawMessage) (gamekernel.BoundSession, error) {
	var d sessionDocument
	if err := gamekernel.DecodeSessionJSON(raw, &d); err != nil {
		return nil, err
	}
	if d.ModuleVersion != "2.0.0" || d.StateSchemaVersion != "2.0.0" || d.EventSchemaVersion != "2.0.0" || d.RuleProfileID != "hearts-training-1.0.0" || d.V1Compatibility.ModuleVersion != "1.0.0" || d.V1Compatibility.EventSchemaVersion != "1.0.0" {
		return nil, fmt.Errorf("unsupported Hearts session pin")
	}
	s := stateFromSessionDocument(d)
	if err := validateSessionState(s); err != nil {
		return nil, err
	}
	return bindHeartsSession(s)
}
func OpenV1Session(raw json.RawMessage) (gamekernel.BoundSession, error) {
	s, err := read(raw)
	if err != nil {
		return nil, err
	}
	return bindHeartsSession(&sessionState{original: s})
}

type sessionConfig struct {
	ID     string `json:"id"`
	Dealer int    `json:"dealer"`
}
type sessionDeal struct {
	Kind string   `json:"kind"`
	Deck []string `json:"deck"`
}

func parseSessionDeal(raw json.RawMessage) ([]string, error) {
	var c sessionDeal
	if err := gamekernel.DecodeSessionJSON(raw, &c); err != nil {
		return nil, err
	}
	if c.Kind != "deal" || len(c.Deck) != 52 {
		return nil, fmt.Errorf("creation/chance requires an explicit full deal")
	}
	seen := map[string]bool{}
	for _, card := range c.Deck {
		if !cardOK(card) || seen[card] {
			return nil, fmt.Errorf("invalid Hearts deal")
		}
		seen[card] = true
	}
	return c.Deck, nil
}
func StartSession(rawConfig, rawMaterial json.RawMessage) (gamekernel.BoundSession, error) {
	var c sessionConfig
	if err := gamekernel.DecodeSessionJSON(rawConfig, &c); err != nil {
		return nil, err
	}
	if !gamekernel.ValidIdentifier(c.ID) || !seatOK(c.Dealer) {
		return nil, fmt.Errorf("invalid Hearts configuration")
	}
	deck, err := parseSessionDeal(rawMaterial)
	if err != nil {
		return nil, err
	}
	s := initial(c.ID, c.Dealer)
	if err = deal(s, deck); err != nil {
		return nil, err
	}
	return bindHeartsSession(&sessionState{original: s})
}

// Native V2 import follows its own state codec. In particular the public event
// archive is shape checked, not reinterpreted as the stricter V1 event ledger.
func validateSessionState(v *sessionState) error {
	s := v.original
	if !gamekernel.ValidIdentifier(s.ID) || !seatOK(s.Dealer) || s.HandNumber < 1 || !safeInt(s.HandNumber) || (s.Turn != nil && !seatOK(*s.Turn)) {
		return fmt.Errorf("invalid Hearts identity/round")
	}
	switch sessionPhase(v) {
	case "pass", "play", "trick-end", "hand-end", "match-end", "awaiting-deal":
	default:
		return fmt.Errorf("invalid Hearts phase")
	}
	if s.PassDirection != passDirection(s.HandNumber) || s.Trick == nil || s.History == nil || s.Events == nil || len(s.Trick) > 4 || len(s.History) > 13 || len(s.Events) > maxEvents {
		return fmt.Errorf("invalid Hearts collections")
	}
	if v.awaitingDeal && s.Phase != "hand-end" {
		return fmt.Errorf("invalid Hearts pending deal")
	}
	for seat := 0; seat < 4; seat++ {
		if s.Hands[seat] == nil || len(s.Hands[seat]) > 13 || s.Tricks[seat] < 0 || s.Tricks[seat] > 13 || s.Scores[seat] < 0 || !safeInt(s.Scores[seat]) {
			return fmt.Errorf("invalid Hearts seat data")
		}
		p := s.Passes[seat]
		if p.Outgoing == nil || p.Incoming == nil || len(p.Outgoing) > 3 || len(p.Incoming) > 3 || (p.To != nil && !seatOK(*p.To)) || (p.From != nil && !seatOK(*p.From)) || (p.To == nil) != (p.From == nil) || len(p.Outgoing) != len(p.Incoming) || (p.To == nil && len(p.Outgoing) != 0) || (p.To != nil && len(p.Outgoing) != 3) {
			return fmt.Errorf("invalid Hearts pass memory")
		}
		for _, cards := range [][]string{s.Hands[seat], p.Outgoing, p.Incoming} {
			seen := map[string]bool{}
			for _, card := range cards {
				if !cardOK(card) || seen[card] {
					return fmt.Errorf("invalid Hearts card holding")
				}
				seen[card] = true
			}
		}
	}
	if s.HandResult != nil {
		if s.HandResult.Winner != nil && !seatOK(*s.HandResult.Winner) {
			return fmt.Errorf("invalid Hearts winner")
		}
		for _, p := range s.HandResult.Points {
			if p < 0 || p > 26 {
				return fmt.Errorf("invalid Hearts points")
			}
		}
	}
	for i, e := range s.Events {
		if err := validateSessionEvent(e); err != nil {
			return err
		}
		if e.ID != i+1 {
			return fmt.Errorf("invalid Hearts event order")
		}
	}
	checkPlays := func(plays []Play, complete bool) error {
		if len(plays) > 4 || (complete && len(plays) != 4) {
			return fmt.Errorf("invalid Hearts trick length")
		}
		seats := map[int]bool{}
		cards := map[string]bool{}
		for i, p := range plays {
			if !seatOK(p.Seat) || !cardOK(p.Card) || seats[p.Seat] || cards[p.Card] || (i > 0 && p.Seat != (plays[i-1].Seat+1)%4) {
				return fmt.Errorf("invalid Hearts trick order")
			}
			seats[p.Seat] = true
			cards[p.Card] = true
		}
		return nil
	}
	if err := checkPlays(s.Trick, false); err != nil {
		return err
	}
	for i, t := range s.History {
		if err := checkPlays(t.Plays, true); err != nil {
			return err
		}
		if !seatOK(t.Winner) || t.Winner != trickWinner(t.Plays) || (i > 0 && t.Plays[0].Seat != s.History[i-1].Winner) {
			return fmt.Errorf("invalid Hearts history winner/leader")
		}
	}
	duplicate := s.Phase == "trick-end"
	if duplicate && (len(s.Trick) != 4 || len(s.History) == 0 || !reflect.DeepEqual(s.Trick, s.History[len(s.History)-1].Plays)) {
		return fmt.Errorf("completed Hearts trick mismatch")
	}
	if !duplicate && len(s.Trick) == 4 {
		return fmt.Errorf("uncollected Hearts trick")
	}
	plays := []Play{}
	for _, t := range s.History {
		plays = append(plays, t.Plays...)
	}
	if !duplicate {
		plays = append(plays, s.Trick...)
	}
	seen := map[string]bool{}
	counts := [4]int{}
	wins := [4]int{}
	opening := [4][]string{}
	for seat, hand := range s.Hands {
		opening[seat] = append([]string{}, hand...)
		for _, card := range hand {
			if seen[card] {
				return fmt.Errorf("duplicate Hearts card")
			}
			seen[card] = true
		}
	}
	hearts, spades := false, false
	for _, p := range plays {
		if seen[p.Card] {
			return fmt.Errorf("duplicate played Hearts card")
		}
		seen[p.Card] = true
		counts[p.Seat]++
		opening[p.Seat] = append(opening[p.Seat], p.Card)
		hearts = hearts || p.Card[0] == 'H'
		spades = spades || p.Card[0] == 'S'
	}
	for _, t := range s.History {
		wins[t.Winner]++
	}
	if len(seen) != 52 || wins != s.Tricks || hearts != s.HeartsBroken || spades != s.SpadesBroken {
		return fmt.Errorf("Hearts conservation/count/flag mismatch")
	}
	for seat := 0; seat < 4; seat++ {
		if len(s.Hands[seat]) != 13-counts[seat] {
			return fmt.Errorf("Hearts seat count mismatch")
		}
	}
	if s.Phase == "pass" && (s.PassDirection == "hold" || s.Turn != nil || len(plays) > 0) {
		return fmt.Errorf("invalid Hearts sealed phase")
	}
	if s.Phase != "pass" && s.Turn == nil {
		return fmt.Errorf("missing Hearts actor")
	}
	complete := len(s.History) == 13
	if complete != (s.HandResult != nil) || ((s.Phase == "hand-end" || s.Phase == "match-end" || v.awaitingDeal) && (!complete || len(s.Trick) > 0)) || (complete && (s.Phase == "play" || s.Phase == "pass")) {
		return fmt.Errorf("invalid Hearts round boundary")
	}
	if s.HandResult != nil && (s.HandResult.Points != scorePoints(s.History) || !reflect.DeepEqual(s.HandResult.Winner, matchWinner(s.Scores))) {
		return fmt.Errorf("invalid Hearts hand result")
	}
	if s.HandNumber == 1 {
		expected := [4]int{}
		if s.HandResult != nil {
			expected = s.HandResult.Points
		}
		if s.Scores != expected {
			return fmt.Errorf("incorrect first Hearts hand score")
		}
	}
	ended := s.HandResult != nil && s.Phase != "trick-end" && s.HandResult.Winner != nil
	if (s.Phase == "match-end") != ended {
		return fmt.Errorf("invalid Hearts match boundary")
	}
	for seat, p := range s.Passes {
		if s.Phase == "pass" || s.PassDirection == "hold" {
			if p.To != nil {
				return fmt.Errorf("unexpected Hearts pass")
			}
		} else {
			offset := passOffset(s.PassDirection)
			to, from := (seat+offset)%4, (seat+4-offset)%4
			if p.To == nil || *p.To != to || p.From == nil || *p.From != from || !reflect.DeepEqual(p.Incoming, s.Passes[from].Outgoing) {
				return fmt.Errorf("invalid Hearts pass ownership")
			}
			for _, card := range p.Outgoing {
				if !has(opening[to], card) {
					return fmt.Errorf("invalid outgoing ownership")
				}
			}
			for _, card := range p.Incoming {
				if !has(opening[seat], card) {
					return fmt.Errorf("invalid incoming ownership")
				}
			}
		}
	}
	if len(plays) > 0 {
		current := []Play{}
		history := []Trick{}
		broken := false
		for _, p := range plays {
			probe := &state{Phase: "play", Turn: ptr(p.Seat), Hands: opening, Trick: current, History: history, HeartsBroken: broken}
			legal := false
			for _, a := range actions(probe, p.Seat) {
				if a.Card == p.Card {
					legal = true
				}
			}
			if !legal {
				return fmt.Errorf("illegal saved Hearts play")
			}
			opening[p.Seat] = without(opening[p.Seat], []string{p.Card})
			current = append(current, p)
			broken = broken || p.Card[0] == 'H'
			if len(current) == 4 {
				history = append(history, Trick{current, trickWinner(current)})
				current = []Play{}
			}
		}
	}
	if s.Phase != "pass" {
		var expected *int
		if len(s.Trick) > 0 && !duplicate {
			expected = ptr((s.Trick[len(s.Trick)-1].Seat + 1) % 4)
		} else if len(s.History) > 0 {
			expected = ptr(s.History[len(s.History)-1].Winner)
		} else {
			expected = openingSeat(s.Hands)
		}
		if !reflect.DeepEqual(expected, s.Turn) || (!duplicate && len(s.Trick) > 0 && len(s.History) > 0 && s.Trick[0].Seat != s.History[len(s.History)-1].Winner) {
			return fmt.Errorf("incorrect next Hearts actor")
		}
	}
	return nil
}
func validateSessionEvent(e event) error {
	if e.ID < 1 || !safeInt(e.ID) || textLength(e.Message) > 4000 || (e.Seat != nil && !seatOK(*e.Seat)) || (e.Card != nil && !cardOK(*e.Card)) {
		return fmt.Errorf("invalid Hearts event")
	}
	if (e.Type == "card-played" && (e.Seat == nil || e.Card == nil)) || (e.Type != "card-played" && e.Card != nil) || (e.Type != "card-played" && ((e.Type == "trick-resolved") != (e.Seat != nil))) {
		return fmt.Errorf("inconsistent Hearts event details")
	}
	switch e.Type {
	case "hand-started", "card-played", "cards-passed", "trick-resolved", "trick-collected", "moon-shot", "hand-scored":
		return nil
	}
	return fmt.Errorf("invalid Hearts event type")
}
