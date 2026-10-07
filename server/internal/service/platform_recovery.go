package service

import (
	"cardford/server/internal/records"
	"context"
	"encoding/json"
)

// Receipt recovery is read-only and independent of current purchase expiry,
// but it must still honor security revocation of the original delivery grant.
func (s *Service) platformReceiptReadable(ctx context.Context, owner, operation string, request json.RawMessage) error {
	if operation != "platform-advice" && operation != "platform-notes" && operation != "platform-exposures" {
		return nil
	}
	var q platformHelpCommand
	if err := json.Unmarshal(request, &q); err != nil {
		return err
	}
	kind, level := "advice", q.RequestedLevel
	if operation == "platform-notes" {
		kind, level = "notes", 1
		q.DecisionID = records.PlatformDecisionID(q.GameID, q.ExpectedRevision)
	}
	if operation == "platform-exposures" {
		level = q.DisplayedLevel
	}
	_, err := s.store.ReadPlatformHelp(ctx, owner, q.GameID, q.DecisionID, kind, level)
	return err
}
