// Package compatibility wires only the unexposed M02A test slice.
package compatibility

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
)

func Registry() *gamekernel.Registry {
	r := gamekernel.NewRegistry()
	h := gamekernel.Funcs{CreateFunc: hearts.Create, ApplyFunc: hearts.Apply, ObserveFunc: hearts.Observe, LegalFunc: hearts.Legal, SafeViewFunc: hearts.SafeView, CandidateIDsFunc: hearts.CandidateIDs, ValidateFunc: hearts.Validate}
	s := gamekernel.Funcs{CreateFunc: spades.Create, ApplyFunc: spades.Apply, ObserveFunc: spades.Observe, LegalFunc: spades.Legal, SafeViewFunc: spades.SafeView, CandidateIDsFunc: spades.CandidateIDs, ValidateFunc: spades.Validate}
	for mode, m := range map[string]gamekernel.Module{"hearts": h, "spades-solo": s, "spades-partners": s} {
		if err := r.Register(mode, m); err != nil {
			panic(err)
		}
	}
	return r
}
