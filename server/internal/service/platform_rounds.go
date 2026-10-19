package service

import (
	"context"
	"encoding/json"
	"strings"

	"cardford/server/internal/games/trix"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

// Round history is read only on request from the existing persisted ledger.
// Load validates the native snapshot and current owner read permission. No
// analysis, bot preparation, concealed cards or reducer replay is exposed.
func (s *Service) platformRounds(ctx context.Context, owner, selected string) (transport.Response, error) {
	game := ""
	if selected != "" {
		at := strings.LastIndex(selected, ":trix-request:")
		if at <= 0 {
			return transport.Response{}, records.ErrReadDenied
		}
		game = selected[:at]
	}
	loaded, err := s.platformCurrent(ctx, owner, game)
	if err != nil {
		return transport.Response{}, err
	}
	if loaded.Document.Metadata.Pin.GameID != "trix" {
		return transport.Response{}, fail(404, "round-history-unavailable")
	}
	bound, err := s.codec.Session(loaded.Document, loaded.Snapshot)
	if err != nil {
		return transport.Response{}, err
	}
	raw, err := bound.Presentation(0)
	if err != nil {
		return transport.Response{}, err
	}
	var presentation struct {
		Observation trix.Observation `json:"observation"`
	}
	if err = json.Unmarshal(raw, &presentation); err != nil {
		return transport.Response{}, err
	}
	if selected == "" {
		return result("TrixRoundIndex", map[string]any{"gameId": loaded.Document.Metadata.GameID, "rounds": trix.CompletedRounds(presentation.Observation)})
	}
	history, ok := trix.SavedRound(presentation.Observation, selected)
	if !ok {
		return transport.Response{}, records.ErrReadDenied
	}
	return result("TrixRoundHistory", history)
}

// Transport-only trimming keeps the decision-time native observation and
// stored ledger intact. Live table packets carry totals, not score history.
func liveTrixProjection(raw json.RawMessage, field string) (json.RawMessage, error) {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	var observation trix.Observation
	if err := json.Unmarshal(envelope[field], &observation); err != nil {
		return nil, err
	}
	// Preserve the native observation and historical ledger. Project just the
	// current deal's seat-assigned points; team-only bonuses stay in totals.
	var seatTotals [4]int
	for _, entry := range observation.Ledger {
		if entry.DealNumber == observation.DealNumber && entry.Recipient.Kind == "seat" && entry.Recipient.Seat != nil {
			seat := *entry.Recipient.Seat
			if seat >= 0 && seat < len(seatTotals) {
				seatTotals[seat] += entry.Delta
			}
		}
	}
	observation.Ledger = []trix.LedgerEntry{}
	observation.WithheldBonuses = []trix.WithheldBonus{}
	var err error
	envelope[field], err = json.Marshal(struct {
		trix.Observation
		RequestSeatTotals [4]int `json:"requestSeatTotals"`
	}{observation, seatTotals})
	if err != nil {
		return nil, err
	}
	return json.Marshal(envelope)
}
