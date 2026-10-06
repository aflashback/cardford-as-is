package hearts

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"strings"
)

func (s *snapshot) Persist(after int) (json.RawMessage, []json.RawMessage, error) {
	if after < 0 || after > len(s.state.Events) {
		return nil, nil, fmt.Errorf("invalid event cursor")
	}
	hot := *s.state
	hot.Events = []event{}
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
	var s state
	if err := decode(hot, &s); err != nil {
		return "", err
	}
	if s.HandNumber != 1 {
		return "", fmt.Errorf("unsupported Hearts access unit")
	}
	return "hand-1", nil
}
func StoredWindow(hot json.RawMessage, revision int64) (string, error) {
	var s state
	if err := decode(hot, &s); err != nil {
		return "", err
	}
	return fmt.Sprintf("v1:%d:%s", revision, s.Phase), nil
}
func ValidateSelectedCommand(raw json.RawMessage, actor int, candidateID string) error {
	var c struct {
		Type   string `json:"type"`
		Action struct {
			Kind   string      `json:"kind"`
			Passes [4][]string `json:"passes"`
		} `json:"action"`
	}
	if err := decode(raw, &c); err != nil {
		return err
	}
	if !seatOK(actor) || c.Type != "action" || c.Action.Kind != "pass-bundle" {
		return fmt.Errorf("expected atomic Hearts pass command")
	}
	for _, pass := range c.Action.Passes {
		seen := map[string]bool{}
		if len(pass) != 3 {
			return fmt.Errorf("invalid pass size")
		}
		for _, card := range pass {
			if !cardOK(card) || seen[card] {
				return fmt.Errorf("invalid pass cards")
			}
			seen[card] = true
		}
	}
	if candidateID != "" && "pass:"+strings.Join(sorted(c.Action.Passes[actor]), ",") != candidateID {
		return fmt.Errorf("sealed command differs from prepared actor selection")
	}
	return nil
}
func OpenStored(hot json.RawMessage, events []json.RawMessage) (gamekernel.Snapshot, error) {
	var s state
	if err := decode(hot, &s); err != nil {
		return nil, err
	}
	if len(s.Events) != 0 || len(events) > 2 {
		return nil, fmt.Errorf("invalid Hearts opening archive")
	}
	for _, raw := range events {
		var e event
		if err := decode(raw, &e); err != nil {
			return nil, err
		}
		s.Events = append(s.Events, e)
	}
	checked, err := checkedState(s)
	if err != nil {
		return nil, err
	}
	return &snapshot{state: checked}, nil
}
func ValidateStoredShape(hot json.RawMessage, id, mode string) error {
	var s state
	if err := decode(hot, &s); err != nil {
		return err
	}
	if s.ID != id || s.Mode != mode || s.ModuleVersion != "1.0.0" || s.RuleProfileID != "hearts-training-1.0.0" || s.EventSchemaVersion != "1.0.0" || len(s.Events) != 0 {
		return fmt.Errorf("hot Hearts identity or archive mismatch")
	}
	return nil
}
