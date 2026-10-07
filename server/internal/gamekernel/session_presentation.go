package gamekernel

import (
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"fmt"
)

func (b *boundSession[S, O, A]) LegacyObservation(seat int) (json.RawMessage, error) {
	if !ValidSeat(seat) || b.model.LegacyObservation == nil {
		return nil, fmt.Errorf("legacy presentation adapter unavailable")
	}
	raw, err := b.model.LegacyObservation(b.model.Observe(b.state, seat))
	if err != nil {
		return nil, err
	}
	var o d.Observation
	if err = DecodeSessionJSON(raw, &o); err != nil {
		return nil, err
	}
	if o.Seat != seat {
		return nil, fmt.Errorf("presentation actor mismatch")
	}
	if err = d.ValidateObservation(o); err != nil {
		return nil, err
	}
	return append(json.RawMessage(nil), raw...), nil
}
func (b *boundSession[S, O, A]) Presentation(seat int) (json.RawMessage, error) {
	raw, err := b.LegacyObservation(seat)
	if err != nil {
		return nil, err
	}
	var o d.Observation
	if err = json.Unmarshal(raw, &o); err != nil {
		return nil, err
	}
	id, _ := b.StorageIdentity()
	return d.Presentation(id, o)
}
