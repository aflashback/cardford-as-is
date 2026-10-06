package hearts

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"strings"
)

type snapshot struct{ state *state }

func Start(config json.RawMessage, deal []string) (gamekernel.Snapshot, error) {
	s, err := createState(config, deal)
	if err != nil {
		return nil, err
	}
	s, err = checkedState(*s)
	if err != nil {
		return nil, err
	}
	return &snapshot{state: s}, nil
}
func Open(raw json.RawMessage) (gamekernel.Snapshot, error) {
	s, err := read(raw)
	if err != nil {
		return nil, err
	}
	return &snapshot{state: s}, nil
}
func (s *snapshot) Export() (json.RawMessage, error) { return json.Marshal(s.state) }
func (s *snapshot) Apply(command json.RawMessage) (gamekernel.Snapshot, error) {
	next, err := applyTo(cloneState(s.state), command)
	if err != nil {
		return nil, err
	}
	next, err = checkedState(*next)
	if err != nil {
		return nil, err
	}
	return &snapshot{state: next}, nil
}
func (s *snapshot) Project(seat int) (gamekernel.Projection, error) {
	if !seatOK(seat) {
		return gamekernel.Projection{}, fmt.Errorf("invalid seat")
	}
	o := observation(s.state, seat)
	choices := o["legalActions"].([]action)
	ob, err := json.Marshal(o)
	if err != nil {
		return gamekernel.Projection{}, err
	}
	v, err := json.Marshal(view(s.state, seat, choices))
	if err != nil {
		return gamekernel.Projection{}, err
	}
	ids := []string{}
	for _, a := range choices {
		if a.Kind == "pass" {
			ids = append(ids, "pass:"+strings.Join(a.Cards, ","))
		} else {
			ids = append(ids, "play:"+a.Card)
		}
	}
	return gamekernel.Projection{Observation: ob, View: v, CandidateIDs: ids}, nil
}
func cloneState(s *state) *state {
	n := *s
	for i := 0; i < 4; i++ {
		n.Hands[i] = append([]string{}, s.Hands[i]...)
		if s.Bids[i] != nil {
			n.Bids[i] = ptr(*s.Bids[i])
		}
		p := s.Passes[i]
		n.Passes[i] = pass{Outgoing: append([]string{}, p.Outgoing...), Incoming: append([]string{}, p.Incoming...)}
		if p.To != nil {
			n.Passes[i].To = ptr(*p.To)
		}
		if p.From != nil {
			n.Passes[i].From = ptr(*p.From)
		}
	}
	if s.Turn != nil {
		n.Turn = ptr(*s.Turn)
	}
	n.Trick = append([]Play{}, s.Trick...)
	n.History = make([]Trick, len(s.History))
	for i, t := range s.History {
		n.History[i] = Trick{Plays: append([]Play{}, t.Plays...), Winner: t.Winner}
	}
	n.Events = append([]event{}, s.Events...)
	return &n
}
