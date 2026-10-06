package hearts

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
)

func persistSession(s *sessionState, after int) (json.RawMessage, []json.RawMessage, error) {
	if after < 0 || after > len(s.original.Events) {
		return nil, nil, fmt.Errorf("invalid event cursor")
	}
	hot := sessionPayload(s)
	hot.Events = []event{}
	raw, err := json.Marshal(hot)
	if err != nil {
		return nil, nil, err
	}
	events := make([]json.RawMessage, 0, len(s.original.Events)-after)
	for _, event := range s.original.Events[after:] {
		b, e := json.Marshal(event)
		if e != nil {
			return nil, nil, e
		}
		events = append(events, b)
	}
	return raw, events, nil
}
func readSessionHot(raw json.RawMessage) (sessionDocument, error) {
	var d sessionDocument
	if err := gamekernel.DecodeSessionJSON(raw, &d); err != nil {
		return d, err
	}
	if d.ModuleVersion != "2.0.0" || d.StateSchemaVersion != "2.0.0" || d.EventSchemaVersion != "2.0.0" || d.RuleProfileID != "hearts-training-1.0.0" || d.V1Compatibility.ModuleVersion != "1.0.0" || d.V1Compatibility.EventSchemaVersion != "1.0.0" || d.Events == nil || len(d.Events) != 0 || d.HandNumber < 1 || !safeInt(d.HandNumber) {
		return d, fmt.Errorf("invalid compact Hearts V2 pin/archive")
	}
	return d, nil
}
func OpenStoredSession(hot json.RawMessage, events []json.RawMessage) (gamekernel.BoundSession, error) {
	d, err := readSessionHot(hot)
	if err != nil {
		return nil, err
	}
	if len(events) > maxEvents {
		return nil, fmt.Errorf("Hearts event limit")
	}
	for _, raw := range events {
		var e event
		if err = decode(raw, &e); err != nil {
			return nil, err
		}
		d.Events = append(d.Events, e)
	}
	s := stateFromSessionDocument(d)
	if err = validateSessionState(s); err != nil {
		return nil, err
	}
	return bindHeartsSession(s)
}
func ValidateStoredSession(hot json.RawMessage, id, mode string) error {
	d, err := readSessionHot(hot)
	if err != nil {
		return err
	}
	if d.ID != id || mode != "hearts" {
		return fmt.Errorf("compact Hearts identity mismatch")
	}
	return nil
}
func StoredSessionWindow(hot json.RawMessage, revision int64) (string, error) {
	d, err := readSessionHot(hot)
	if err != nil {
		return "", err
	}
	n := heartsSessionNode(stateFromSessionDocument(d))
	return fmt.Sprintf("v2:%d:%s:%s", revision, n.Kind, n.Phase), nil
}
func StoredSessionUnit(hot json.RawMessage) (string, error) {
	d, err := readSessionHot(hot)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("hand:%d", d.HandNumber), nil
}
