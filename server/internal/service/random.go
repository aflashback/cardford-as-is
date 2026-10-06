package service

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
)

func randomID() (string, error) {
	var b [24]byte
	_, err := rand.Read(b[:])
	return hex.EncodeToString(b[:]), err
}

// Opening and subsequent chance are server-owned unbiased Fisher-Yates draws.
// Persistence records the actual deck; a seed never substitutes for that deck.
func freshDeck() ([]string, error) {
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
	return deck, nil
}
