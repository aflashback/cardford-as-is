package coachlab

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"context"
	"fmt"
	"strings"
)

func policyVersion(id string) (string, bool) {
	switch id {
	case "spades-tactics-2.1.0":
		return "2.1.0", true
	case "spades-partner-resource-5.0.0":
		return "5.0.0", true
	case "hearts-baseline-1.0.0", "trix-deterministic-1.0.0", "trix-reasoning-1.0.0", "trix-history-1.0.0", trix.FrontierPolicyID, trix.OwnershipPolicyID, trix.OwnershipComparisonPolicyID:
		return "1.0.0", true
	}
	return "", false
}
func ValidatePolicy(s sessions.Selector, p SeatPolicyPin) error {
	v, ok := policyVersion(p.ID)
	if !ok || v != p.Version || !gamekernel.ValidSeat(p.Seat) {
		return fmt.Errorf("uninstalled deterministic seat pin")
	}
	if s.GameID == "trix" {
		if !trix.SupportsPolicy(p.ID) {
			return fmt.Errorf("Trix policy/variant mismatch")
		}
		return nil
	}
	if strings.HasPrefix(p.ID, "trix-") {
		return fmt.Errorf("policy/variant mismatch")
	}
	if s.GameID == "hearts" && p.ID != "hearts-baseline-1.0.0" || s.GameID == "spades" && p.ID == "hearts-baseline-1.0.0" || p.ID == "spades-partner-resource-5.0.0" && s.VariantID != "partners" {
		return fmt.Errorf("policy/variant mismatch")
	}
	return nil
}
func Prepare(ctx context.Context, b gamekernel.BoundSession, p SeatPolicyPin, id string) (gamekernel.CompletePreparation, error) {
	pin := b.Pin()
	s := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
	if err := ValidatePolicy(s, p); err != nil {
		return gamekernel.CompletePreparation{}, err
	}
	return b.PrepareComplete(ctx, p.Seat, p.ID, id)
}
