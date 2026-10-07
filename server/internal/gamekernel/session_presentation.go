package gamekernel

import (
	"cardford/server/internal/contracts"
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
	if b.model.Presentation != nil {
		if !ValidSeat(seat) {
			return nil, fmt.Errorf("invalid presentation viewer")
		}
		raw, err := b.model.Presentation(b.model.Observe(b.state, seat))
		if err != nil {
			return nil, err
		}
		if err = contracts.Validate("RegisteredPresentation", raw); err != nil {
			return nil, err
		}
		var header struct {
			ID        string `json:"id"`
			GameID    string `json:"gameId"`
			VariantID string `json:"variantId"`
			Seat      int    `json:"seat"`
		}
		if err = json.Unmarshal(raw, &header); err != nil {
			return nil, err
		}
		id, _ := b.StorageIdentity()
		pin := b.Pin()
		if header.ID != id || header.GameID != pin.GameID || header.VariantID != pin.VariantID || header.Seat != seat {
			return nil, fmt.Errorf("module presentation identity mismatch")
		}
		return append(json.RawMessage(nil), raw...), nil
	}
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
