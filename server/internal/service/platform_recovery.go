package service

import (
	"cardford/server/internal/records"
	"context"
	"encoding/json"
)

// Receipt recovery is read-only and independent of current purchase expiry,
// but it must still honor security revocation of the original delivery grant.
func (s *Service) platformReceiptReadable(ctx context.Context, owner, operation string, request json.RawMessage) error {
	// Playback receipts carry only the accepted running state and generation.
	// ReconcileService already authenticates the owner and current read access;
	// later pause/resume, control takeover or game changes must not rewrite or
	// block recovery of that original accepted acknowledgement.
	if operation == "playback" {
		return nil
	}
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
