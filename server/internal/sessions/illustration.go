package sessions

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
	"context"
	"fmt"
)

// Illustrate dispatches an installed game-owned adapter. Only the original
// actor observation and an explicit seed enter the synthetic referee.
func Illustrate(ctx context.Context, pin gamekernel.Pin, obs d.Observation, candidate string, seed uint32, policy string) ([]d.Observation, error) {
	if pin.ModuleVersion != "2.0.0" {
		return nil, fmt.Errorf("original continuation adapter unavailable")
	}
	if pin.GameID == "hearts" && pin.VariantID == "solo" {
		return hearts.Illustrate(ctx, obs, candidate, seed, policy)
	}
	if pin.GameID == "spades" && (pin.VariantID == "solo" || pin.VariantID == "partners") {
		return spades.Illustrate(ctx, obs, candidate, seed, policy)
	}
	return nil, fmt.Errorf("unregistered continuation")
}
