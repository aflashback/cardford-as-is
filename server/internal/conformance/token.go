// Package conformance contains a test-only non-card module. No application
// startup imports or registers it. Its native replay tests are not M06 service,
// persistence, public-contract, planner, or UI acceptance.
package conformance

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"sort"
)

const TokenGameID = "test-token"

type TokenConfig struct {
	ID      string `json:"id"`
	Variant string `json:"variant"`
	Opener  int    `json:"opener"`
}
type TokenChance struct {
	Kind   string `json:"kind"`
	Tokens []int  `json:"tokens"`
}
type Reveal struct {
	Seat  int `json:"seat"`
	Token int `json:"token"`
}
type Cycle struct {
	Reveals   []Reveal `json:"reveals"`
	Collector int      `json:"collector"`
}
type Competitor struct {
	ID    string `json:"id"`
	Seats []int  `json:"seats"`
}
type TokenObservation struct {
	GameID      string       `json:"gameId"`
	Variant     string       `json:"variant"`
	Seat        int          `json:"seat"`
	Phase       string       `json:"phase"`
	Own         []int        `json:"own"`
	Held        [4]int       `json:"held"`
	Current     []Reveal     `json:"current"`
	Cycles      []Cycle      `json:"cycles"`
	Collections [4]int       `json:"collections"`
	Competition []Competitor `json:"competition"`
	Turn        *int         `json:"turn"`
	Winners     []string     `json:"winners"`
}
type tokenState struct {
	Config      TokenConfig `json:"config"`
	Phase       string      `json:"phase"`
	Holdings    [4][]int    `json:"holdings"`
	Current     []Reveal    `json:"current"`
	Cycles      []Cycle     `json:"cycles"`
	Collections [4]int      `json:"collections"`
}
type TokenSnapshot struct{ state tokenState }

func TokenPin(variant string) (gamekernel.Pin, error) {
	if _, err := TokenCompetition(variant); err != nil {
		return gamekernel.Pin{}, err
	}
	return gamekernel.Pin{GameID: TokenGameID, VariantID: variant, ModuleVersion: "2.0.0", RuleProfileID: "token-conformance-1.0.0", StateSchemaVersion: "2.0.0", ObservationSchemaVersion: "2.0.0", PublicSchemaVersion: "2.0.0", EventSchemaVersion: "2.0.0"}, nil
}
func TokenCompetition(variant string) ([]Competitor, error) {
	switch variant {
	case "individual":
		return []Competitor{{"seat-0", []int{0}}, {"seat-1", []int{1}}, {"seat-2", []int{2}}, {"seat-3", []int{3}}}, nil
	case "neighbour-teams":
		return []Competitor{{"A", []int{0, 1}}, {"B", []int{2, 3}}}, nil
	default:
		return nil, fmt.Errorf("unsupported token variant")
	}
}

// StartToken consumes game-owned opaque numeric chance, never a 52-card deck,
// dealer or Spades-shaped control. nil material retains an explicit chance node.
func StartToken(config, material json.RawMessage) (*TokenSnapshot, error) {
	var c TokenConfig
	if err := gamekernel.DecodeSessionJSON(config, &c); err != nil {
		return nil, err
	}
	if !gamekernel.ValidIdentifier(c.ID) || !gamekernel.ValidSeat(c.Opener) {
		return nil, fmt.Errorf("invalid token configuration")
	}
	if _, err := TokenCompetition(c.Variant); err != nil {
		return nil, err
	}
	s := tokenState{Config: c, Phase: "chance", Current: []Reveal{}, Cycles: []Cycle{}}
	for seat := range s.Holdings {
		s.Holdings[seat] = []int{}
	}
	initial := &TokenSnapshot{state: s}
	if len(material) == 0 {
		return initial, nil
	}
	return initial.supply(material)
}
func OpenToken(raw json.RawMessage) (gamekernel.Snapshot, error) {
	var s tokenState
	if err := gamekernel.DecodeSessionJSON(raw, &s); err != nil {
		return nil, err
	}
	if err := validateTokenState(s); err != nil {
		return nil, err
	}
	return &TokenSnapshot{state: s}, nil
}
func cloneToken(s tokenState) tokenState {
	for seat := range s.Holdings {
		s.Holdings[seat] = append([]int{}, s.Holdings[seat]...)
	}
	s.Current = append([]Reveal{}, s.Current...)
	cycles := make([]Cycle, len(s.Cycles))
	for i, cycle := range s.Cycles {
		cycles[i] = Cycle{Reveals: append([]Reveal{}, cycle.Reveals...), Collector: cycle.Collector}
	}
	s.Cycles = cycles
	return s
}
func (s *TokenSnapshot) Export() (json.RawMessage, error) { return json.Marshal(s.state) }
func (s *TokenSnapshot) Node() gamekernel.Node {
	switch s.state.Phase {
	case "chance":
		return gamekernel.Node{Kind: "chance", Phase: "token-layout", RequestID: "token-layout:1", Request: json.RawMessage(`{"kind":"token-layout","count":20}`)}
	case "reveal":
		opener := s.state.Config.Opener
		if n := len(s.state.Cycles); n > 0 {
			opener = s.state.Cycles[n-1].Collector
		}
		seat := (opener + len(s.state.Current)) % 4
		return gamekernel.Node{Kind: "actor", Phase: "reveal", Seat: &seat}
	case "collect":
		return gamekernel.Node{Kind: "automatic", Phase: "collect", TransitionID: fmt.Sprintf("collect:%d", len(s.state.Cycles)+1)}
	default:
		return gamekernel.Node{Kind: "session-complete", Phase: "complete"}
	}
}
func (s *TokenSnapshot) supply(raw json.RawMessage) (*TokenSnapshot, error) {
	var chance TokenChance
	if err := gamekernel.DecodeSessionJSON(raw, &chance); err != nil {
		return nil, err
	}
	if s.state.Phase != "chance" || chance.Kind != "token-layout" || len(chance.Tokens) != 20 {
		return nil, fmt.Errorf("invalid token chance")
	}
	next := cloneToken(s.state)
	seen := map[int]bool{}
	for i, token := range chance.Tokens {
		if token < 1 || token > 20 || seen[token] {
			return nil, fmt.Errorf("invalid or duplicate token")
		}
		seen[token] = true
		seat := (s.state.Config.Opener + i) % 4
		next.Holdings[seat] = append(next.Holdings[seat], token)
	}
	for seat := range next.Holdings {
		sort.Ints(next.Holdings[seat])
	}
	next.Phase = "reveal"
	return &TokenSnapshot{state: next}, validateTokenState(next)
}
func (s *TokenSnapshot) Apply(raw json.RawMessage) (gamekernel.Snapshot, error) {
	var kind struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &kind); err != nil {
		return nil, err
	}
	node := s.Node()
	next := cloneToken(s.state)
	switch kind.Kind {
	case "chance":
		var command struct {
			Kind      string          `json:"kind"`
			RequestID string          `json:"requestId"`
			Material  json.RawMessage `json:"material"`
		}
		if err := gamekernel.DecodeSessionJSON(raw, &command); err != nil {
			return nil, err
		}
		if node.Kind != "chance" || command.RequestID != node.RequestID {
			return nil, fmt.Errorf("wrong token chance request")
		}
		return s.supply(command.Material)
	case "actor":
		var command struct {
			Kind  string `json:"kind"`
			Seat  int    `json:"seat"`
			Token int    `json:"token"`
		}
		if err := gamekernel.DecodeSessionJSON(raw, &command); err != nil {
			return nil, err
		}
		if node.Kind != "actor" || command.Seat != *node.Seat {
			return nil, fmt.Errorf("wrong token actor")
		}
		found := false
		for i, token := range next.Holdings[command.Seat] {
			if token == command.Token {
				next.Holdings[command.Seat] = append(next.Holdings[command.Seat][:i], next.Holdings[command.Seat][i+1:]...)
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("token not held")
		}
		next.Current = append(next.Current, Reveal{command.Seat, command.Token})
		if len(next.Current) == 4 {
			next.Phase = "collect"
		}
	case "automatic":
		var command struct {
			Kind         string `json:"kind"`
			TransitionID string `json:"transitionId"`
		}
		if err := gamekernel.DecodeSessionJSON(raw, &command); err != nil {
			return nil, err
		}
		if node.Kind != "automatic" || command.TransitionID != node.TransitionID {
			return nil, fmt.Errorf("wrong token collection")
		}
		collector := tokenCollector(next.Current)
		next.Cycles = append(next.Cycles, Cycle{Reveals: append([]Reveal{}, next.Current...), Collector: collector})
		next.Collections[collector]++
		next.Current = []Reveal{}
		next.Phase = "reveal"
		if len(next.Cycles) == 5 {
			next.Phase = "complete"
		}
	default:
		return nil, fmt.Errorf("unsupported token command")
	}
	if err := validateTokenState(next); err != nil {
		return nil, err
	}
	return &TokenSnapshot{state: next}, nil
}
func tokenCollector(reveals []Reveal) int {
	winner := reveals[0]
	for _, reveal := range reveals[1:] {
		if reveal.Token > winner.Token {
			winner = reveal
		}
	}
	return winner.Seat
}
func (s *TokenSnapshot) Project(seat int) (gamekernel.Projection, error) {
	if !gamekernel.ValidSeat(seat) {
		return gamekernel.Projection{}, fmt.Errorf("invalid token viewer")
	}
	competition, _ := TokenCompetition(s.state.Config.Variant)
	o := TokenObservation{GameID: TokenGameID, Variant: s.state.Config.Variant, Seat: seat, Phase: s.state.Phase,
		Own: append([]int{}, s.state.Holdings[seat]...), Current: append([]Reveal{}, s.state.Current...), Cycles: cloneToken(s.state).Cycles,
		Collections: s.state.Collections, Competition: competition, Winners: []string{}}
	for viewer, tokens := range s.state.Holdings {
		o.Held[viewer] = len(tokens)
	}
	node := s.Node()
	o.Turn = node.Seat
	if s.state.Phase == "complete" {
		lowest := 6
		for _, competitor := range competition {
			total := 0
			for _, member := range competitor.Seats {
				total += s.state.Collections[member]
			}
			if total < lowest {
				lowest = total
				o.Winners = []string{}
			}
			if total == lowest {
				o.Winners = append(o.Winners, competitor.ID)
			}
		}
	}
	raw, err := json.Marshal(o)
	if err != nil {
		return gamekernel.Projection{}, err
	}
	ids := []string{}
	if node.Kind == "actor" && *node.Seat == seat {
		for _, token := range o.Own {
			ids = append(ids, fmt.Sprintf("reveal:%d", token))
		}
	}
	return gamekernel.Projection{Observation: append(json.RawMessage(nil), raw...), View: raw, CandidateIDs: ids}, nil
}

func validateTokenState(s tokenState) error {
	if !gamekernel.ValidIdentifier(s.Config.ID) || !gamekernel.ValidSeat(s.Config.Opener) {
		return fmt.Errorf("invalid token identity")
	}
	if _, err := TokenCompetition(s.Config.Variant); err != nil {
		return err
	}
	if s.Current == nil || s.Cycles == nil || len(s.Cycles) > 5 {
		return fmt.Errorf("invalid token history")
	}
	seen := map[int]bool{}
	count := [4]int{}
	check := func(seat, token int) error {
		if !gamekernel.ValidSeat(seat) || token < 1 || token > 20 || seen[token] {
			return fmt.Errorf("token conservation or seat violation")
		}
		seen[token] = true
		count[seat]++
		return nil
	}
	for seat, held := range s.Holdings {
		if held == nil {
			return fmt.Errorf("missing token holding")
		}
		for _, token := range held {
			if err := check(seat, token); err != nil {
				return err
			}
		}
	}
	opener, collections := s.Config.Opener, [4]int{}
	for _, cycle := range s.Cycles {
		if len(cycle.Reveals) != 4 || cycle.Collector != tokenCollector(cycle.Reveals) {
			return fmt.Errorf("invalid token cycle result")
		}
		for i, reveal := range cycle.Reveals {
			if reveal.Seat != (opener+i)%4 {
				return fmt.Errorf("invalid token reveal chronology")
			}
			if err := check(reveal.Seat, reveal.Token); err != nil {
				return err
			}
		}
		collections[cycle.Collector]++
		opener = cycle.Collector
	}
	for i, reveal := range s.Current {
		if reveal.Seat != (opener+i)%4 || i >= 4 {
			return fmt.Errorf("invalid token current chronology")
		}
		if err := check(reveal.Seat, reveal.Token); err != nil {
			return err
		}
	}
	if collections != s.Collections {
		return fmt.Errorf("token score differs from history")
	}
	if s.Phase == "chance" {
		if len(seen) != 0 || len(s.Current) != 0 || len(s.Cycles) != 0 {
			return fmt.Errorf("nonempty token chance root")
		}
		return nil
	}
	if len(seen) != 20 || count != [4]int{5, 5, 5, 5} {
		return fmt.Errorf("token material was lost or invented")
	}
	if (s.Phase == "reveal" && len(s.Cycles) < 5 && len(s.Current) < 4) ||
		(s.Phase == "collect" && len(s.Cycles) < 5 && len(s.Current) == 4) ||
		(s.Phase == "complete" && len(s.Cycles) == 5 && len(s.Current) == 0) {
		return nil
	}
	return fmt.Errorf("invalid token lifecycle")
}
