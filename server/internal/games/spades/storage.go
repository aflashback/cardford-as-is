package spades

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
)

// Persist serializes only the bounded current position and the newly emitted
// event suffix. Historical events remain immutable append-only repository rows.
// History is current-hand knowledge (at most thirteen tricks), so it stays hot.
func (s *snapshot) Persist(after int) (json.RawMessage, []json.RawMessage, error) {
	if after < 0 || after > len(s.state.Events) {
		return nil, nil, fmt.Errorf("invalid event cursor")
	}
	hot := *s.state
	hot.Events = []Event{}
	raw, err := json.Marshal(&hot)
	if err != nil {
		return nil, nil, err
	}
	events := make([]json.RawMessage, 0, len(s.state.Events)-after)
	for _, event := range s.state.Events[after:] {
		b, err := json.Marshal(event)
		if err != nil {
			return nil, nil, err
		}
		events = append(events, b)
	}
	return raw, events, nil
}
func (s *snapshot) EventCount() int                   { return len(s.state.Events) }
func (s *snapshot) StorageIdentity() (string, string) { return s.state.ID, s.state.Mode }
func (s *snapshot) UnitID() string                    { return fmt.Sprintf("hand-%d", s.state.HandNumber) }
func StoredUnitID(hot json.RawMessage) (string, error) {
	var s State
	if err := strictDecode(hot, &s); err != nil {
		return "", err
	}
	if s.HandNumber < 1 || !safeInt(s.HandNumber) {
		return "", fmt.Errorf("invalid Spades access unit")
	}
	return fmt.Sprintf("hand-%d", s.HandNumber), nil
}
func StoredWindow(hot json.RawMessage, revision int64) (string, error) {
	var s State
	if err := strictDecode(hot, &s); err != nil {
		return "", err
	}
	return fmt.Sprintf("v1:%d:%s", revision, s.Phase), nil
}

// ValidateSelectedCommand binds a stored bot choice to the actual accepted
// actor operation. Human choices may differ from their saved recommendation.
func ValidateSelectedCommand(raw json.RawMessage, actor int, candidateID string) error {
	var c savedCommand
	if err := strictDecode(raw, &c); err != nil {
		return err
	}
	if c.Type != "action" || c.Deal != nil {
		return fmt.Errorf("decision requires actor command")
	}
	if err := validateAction(c.Action); err != nil {
		return err
	}
	if c.Action.Seat != actor || candidateID != "" && actionID(*c.Action) != candidateID {
		return fmt.Errorf("command differs from prepared actor selection")
	}
	return nil
}

// OpenStored imports the compact state once, restores archived events as typed
// values, and validates the complete original position without command replay.
func OpenStored(hot json.RawMessage, events []json.RawMessage) (gamekernel.Snapshot, error) {
	if _, err := contracts.ParseJSON(hot); err != nil {
		return nil, err
	}
	var state State
	if err := strictDecode(hot, &state); err != nil {
		return nil, err
	}
	if len(state.Events) != 0 || len(events) > 100000 {
		return nil, fmt.Errorf("invalid separated event archive")
	}
	for _, raw := range events {
		if _, err := contracts.ParseJSON(raw); err != nil {
			return nil, err
		}
		var event Event
		if err := strictDecode(raw, &event); err != nil {
			return nil, err
		}
		state.Events = append(state.Events, event)
	}
	if err := validateState(&state); err != nil {
		return nil, err
	}
	return &snapshot{state: &state}, nil
}

// ValidateStoredShape checks the bounded hot payload and immutable identity;
// only OpenStored with the exact archive establishes a usable snapshot.
func ValidateStoredShape(hot json.RawMessage, id, mode string) error {
	if _, err := contracts.ParseJSON(hot); err != nil {
		return err
	}
	var state State
	if err := strictDecode(hot, &state); err != nil {
		return err
	}
	if state.ID != id || state.Mode != mode || state.ModuleVersion != "1.0.0" || state.RuleProfileID != ruleProfile(mode) || state.EventSchemaVersion != "1.0.0" || len(state.Events) != 0 {
		return fmt.Errorf("hot Spades identity or archive mismatch")
	}
	return nil
}
