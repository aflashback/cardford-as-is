package spades

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
)

// snapshot's private state is owned by this package. Constructors import strict
// bytes, exported projections are newly encoded, and Apply clones before write.
type snapshot struct{ state *State }

func Start(config json.RawMessage, deal []string) (gamekernel.Snapshot, error) {
	s, err := createState(config, deal)
	if err != nil {
		return nil, err
	}
	if err = validateState(s); err != nil {
		return nil, err
	}
	return &snapshot{state: s}, nil
}
func Open(raw json.RawMessage) (gamekernel.Snapshot, error) {
	s, err := DecodeState(raw)
	if err != nil {
		return nil, err
	}
	return &snapshot{state: s}, nil
}
func (s *snapshot) Export() (json.RawMessage, error) { return json.Marshal(s.state) }
func (s *snapshot) Apply(command json.RawMessage) (gamekernel.Snapshot, error) {
	next := cloneState(s.state)
	if err := applyCommand(next, command); err != nil {
		return nil, err
	}
	if err := validateState(next); err != nil {
		return nil, err
	}
	return &snapshot{state: next}, nil
}
func (s *snapshot) Project(seat int) (gamekernel.Projection, error) {
	if !seatOK(seat) {
		return gamekernel.Projection{}, fmt.Errorf("invalid seat")
	}
	o := observation(s.state, seat)
	ob, err := json.Marshal(o)
	if err != nil {
		return gamekernel.Projection{}, err
	}
	v, err := json.Marshal(view(s.state.ID, o))
	if err != nil {
		return gamekernel.Projection{}, err
	}
	ids := []string{}
	for _, a := range o.LegalActions {
		ids = append(ids, actionID(a))
	}
	return gamekernel.Projection{Observation: ob, View: v, CandidateIDs: ids}, nil
}
func cloneState(s *State) *State {
	n := cloneStateForTransition(s)
	for i, e := range n.Events {
		if e.Seat != nil {
			n.Events[i].Seat = ptr(*e.Seat)
		}
		if e.Card != nil {
			n.Events[i].Card = ptr(*e.Card)
		}
		if e.Bid != nil {
			n.Events[i].Bid = ptr(*e.Bid)
		}
	}
	return n
}

// cloneStateForTransition owns every mutable field and a separate event slice.
// Trusted reducers only append events; existing event values and their pointer
// fields are immutable. Import/binding uses cloneState to detach those pointers
// too, while every externally exposed observation or document is encoded/copied.
func cloneStateForTransition(s *State) *State {
	n := *s
	for seat := 0; seat < 4; seat++ {
		n.Hands[seat] = append([]string{}, s.Hands[seat]...)
		if s.Bids[seat] != nil {
			n.Bids[seat] = ptr(*s.Bids[seat])
		}
		p := s.Passes[seat]
		n.Passes[seat] = PassMemory{Outgoing: append([]string{}, p.Outgoing...), Incoming: append([]string{}, p.Incoming...)}
		if p.To != nil {
			n.Passes[seat].To = ptr(*p.To)
		}
		if p.From != nil {
			n.Passes[seat].From = ptr(*p.From)
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
	// One play can emit card-played, trick-resolved and hand-scored. Reserving
	// their slots avoids copying the entire archive again on the first append;
	// this is only a capacity hint, and append still grows for any extra events.
	n.Events = make([]Event, len(s.Events), len(s.Events)+3)
	copy(n.Events, s.Events)
	if s.HandResult != nil {
		r := *s.HandResult
		if r.Winner != nil {
			r.Winner = ptr(*r.Winner)
		}
		n.HandResult = &r
	}
	return &n
}
