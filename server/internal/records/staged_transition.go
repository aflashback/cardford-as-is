package records

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
)

// StagedTransition owns one computed next state and a private binding to its
// exact loaded origin/operation. Callers may project it to construct a receipt,
// but cannot substitute or edit its persisted contents.
type StagedTransition struct {
	before   *boundSnapshot
	command  []byte
	next     Document
	snapshot gamekernel.Snapshot
	events   []EventRecord
}

func cloneDocument(d Document) Document {
	d.Checkpoint.State = bytes.Clone(d.Checkpoint.State)
	d.Metadata.Policy.Components = append([]ComponentVersion{}, d.Metadata.Policy.Components...)
	d.Metadata.Controllers = append([]Controller{}, d.Metadata.Controllers...)
	d.Metadata.Competition.Competitors = append([]Competitor{}, d.Metadata.Competition.Competitors...)
	for i := range d.Metadata.Competition.Competitors {
		d.Metadata.Competition.Competitors[i].Seats = append([]int{}, d.Metadata.Competition.Competitors[i].Seats...)
	}
	return d
}
func cloneEvents(events []EventRecord) []EventRecord {
	result := append([]EventRecord{}, events...)
	for i := range result {
		result[i].Payload = bytes.Clone(result[i].Payload)
	}
	return result
}
func (s *StagedTransition) NextDocument() Document {
	if s == nil {
		return Document{}
	}
	return cloneDocument(s.next)
}
func (s *StagedTransition) NextSnapshot() gamekernel.Snapshot {
	if s == nil {
		return nil
	}
	return s.snapshot
}
func (s *StagedTransition) Events() []EventRecord {
	if s == nil {
		return nil
	}
	return cloneEvents(s.events)
}
func (c *DocumentCodec) StageTransition(d Document, s gamekernel.Snapshot, command json.RawMessage) (*StagedTransition, error) {
	before, err := c.bound(d, s)
	if err != nil {
		return nil, err
	}
	next, snapshot, events, err := c.AdvanceBound(d, s, command)
	if err != nil {
		return nil, err
	}
	return &StagedTransition{before: before, command: bytes.Clone(command), next: cloneDocument(next), snapshot: snapshot, events: cloneEvents(events)}, nil
}
func (c *DocumentCodec) AcceptStaged(d Document, s gamekernel.Snapshot, command json.RawMessage, staged *StagedTransition) (Document, []EventRecord, error) {
	before, err := c.bound(d, s)
	if err != nil {
		return Document{}, nil, err
	}
	r, _ := c.registration(d.Metadata)
	if !c.disposition(d.Metadata, r).Playable {
		return Document{}, nil, fmt.Errorf("session pin is read-only")
	}
	if staged == nil || staged.before != before || staged.snapshot == nil || !bytes.Equal(command, staged.command) {
		return Document{}, nil, fmt.Errorf("staged transition origin/operation mismatch")
	}
	if _, err = c.bound(staged.next, staged.snapshot); err != nil {
		return Document{}, nil, err
	}
	return cloneDocument(staged.next), cloneEvents(staged.events), nil
}
