package sessions

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	"crypto/rand"
	"encoding/json"
	"math/big"
)

// Current-game chance composition belongs to installed adapters, not Service.
func defaultInstallation(b registration) Registration {
	r := Registration{Pin: b.pin, Descriptor: b.descriptor, Mode: b.pin.GameID, Start: b.start, Open: b.open}
	if b.pin.GameID == "hearts" {
		r.OpenStored, r.ValidateHot, r.Window, r.Unit = hearts.OpenStoredSession, hearts.ValidateStoredSession, hearts.StoredSessionWindow, hearts.StoredSessionUnit
	} else {
		variant := b.pin.VariantID
		r.Mode = "spades-" + variant
		r.OpenStored = func(hot json.RawMessage, events []json.RawMessage) (gamekernel.BoundSession, error) {
			return spades.OpenStoredSession(variant, hot, events)
		}
		r.ValidateHot, r.Window, r.Unit = spades.ValidateStoredSession, spades.StoredSessionWindow, spades.StoredSessionUnit
	}
	r.Bootstrap = func(id string) (json.RawMessage, json.RawMessage, error) {
		config, err := json.Marshal(map[string]any{"id": id, "dealer": 0})
		if err != nil {
			return nil, nil, err
		}
		material, err := cardChance()
		return config, material, err
	}
	r.NextChance = func(gamekernel.Node) (json.RawMessage, error) { return cardChance() }
	return r
}
func cardChance() (json.RawMessage, error) {
	deck := make([]string, 0, 52)
	for _, suit := range []string{"C", "D", "H", "S"} {
		for _, rank := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, suit+rank)
		}
	}
	for i := len(deck) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return nil, err
		}
		j := int(n.Int64())
		deck[i], deck[j] = deck[j], deck[i]
	}
	return json.Marshal(map[string]any{"kind": "deal", "deck": deck})
}
