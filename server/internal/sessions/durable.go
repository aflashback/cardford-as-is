package sessions

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
)

// DurableSnapshot bridges the registered lifecycle to M03 compact persistence.
// It carries the actual V2 module payload, without the in-memory M02 journal.
// The repository independently owns append-only command/event/decision records.
type DurableSnapshot struct{ session gamekernel.BoundSession }

func Durable(s gamekernel.BoundSession) (gamekernel.Snapshot, error) {
	if s == nil || s.EventCount() < 0 {
		return nil, fmt.Errorf("session has no durable game adapter")
	}
	id, mode := s.StorageIdentity()
	if id == "" || mode == "" || s.UnitID() == "" {
		return nil, fmt.Errorf("invalid durable identity")
	}
	return &DurableSnapshot{session: s}, nil
}
func (s *DurableSnapshot) Session() gamekernel.BoundSession { return s.session }
func (s *DurableSnapshot) Apply(raw json.RawMessage) (gamekernel.Snapshot, error) {
	op, err := DecodeOperation(raw)
	if err != nil {
		return nil, err
	}
	next, err := ApplyOperation(s.session, op)
	if err != nil {
		return nil, err
	}
	return Durable(next.Next)
}
func (s *DurableSnapshot) Export() (json.RawMessage, error) { return s.session.SerializePrivate() }
func (s *DurableSnapshot) Project(actor int) (gamekernel.Projection, error) {
	view, err := s.session.View(actor)
	if err != nil {
		return gamekernel.Projection{}, err
	}
	p := gamekernel.Projection{View: view, CandidateIDs: []string{}}
	n, err := s.session.Node()
	if err != nil {
		return p, err
	}
	eligible := n.Kind == "actor" && n.Seat != nil && *n.Seat == actor
	if n.Kind == "sealed" {
		for _, seat := range n.Actors {
			eligible = eligible || seat == actor
		}
	}
	if !eligible {
		return p, nil
	}
	packet, err := s.session.Packet(actor)
	if err != nil {
		return p, err
	}
	var data struct {
		Candidates []gamekernel.PublicCandidate `json:"candidates"`
	}
	if err = json.Unmarshal(packet, &data); err != nil {
		return p, err
	}
	p.Observation = packet
	for _, c := range data.Candidates {
		p.CandidateIDs = append(p.CandidateIDs, c.ID)
	}
	return p, nil
}
func (s *DurableSnapshot) Persist(after int) (json.RawMessage, []json.RawMessage, error) {
	return s.session.Persist(after)
}
func (s *DurableSnapshot) EventCount() int                   { return s.session.EventCount() }
func (s *DurableSnapshot) StorageIdentity() (string, string) { return s.session.StorageIdentity() }
func (s *DurableSnapshot) UnitID() string                    { return s.session.UnitID() }
