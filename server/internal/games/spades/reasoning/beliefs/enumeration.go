package beliefs

import (
	d "cardford/server/internal/legacydecision"
	"context"
	"fmt"
)

type Enumeration struct {
	Status      string       `json:"status"`
	Operations  int          `json:"operations"`
	Allocations []Allocation `json:"-"`
}

// EnumerateEnding is an exhaustive diagnostic control only for at most nine
// unseen cards. It publishes no partial set when its declared work is exhausted.
func EnumerateEnding(ctx context.Context, o d.Observation, maxUnknown, maxOperations int) (out Enumeration, err error) {
	out.Status = "budget-exhausted"
	if ctx == nil || maxUnknown < 1 || maxUnknown > 9 || maxOperations < 1 {
		return out, fmt.Errorf("invalid exact-ending work configuration")
	}
	if err = d.ValidateObservationContext(ctx, o); err != nil {
		return out, err
	}
	known := map[string]bool{}
	for _, c := range o.Hand {
		known[c] = true
	}
	for _, tr := range o.History {
		for _, p := range tr.Plays {
			known[p.Card] = true
		}
	}
	for _, p := range o.Trick {
		known[p.Card] = true
	}
	unknown := []string{}
	for _, c := range d.FullDeck() {
		if !known[c] {
			unknown = append(unknown, c)
		}
	}
	if len(unknown) > maxUnknown {
		return out, fmt.Errorf("exact ending exceeds declared unseen-card bound")
	}
	hands := [4][]string{}
	hands[o.Seat] = append([]string{}, o.Hand...)
	exhausted := false
	charge := func(n int) bool {
		if n > maxOperations-out.Operations {
			exhausted = true
			return false
		}
		out.Operations += n
		return true
	}
	var walk func(int) error
	walk = func(index int) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !charge(1) {
			return nil
		}
		if index == len(unknown) {
			if !charge(52 + len(o.Events) + (4*len(o.History)+len(o.Trick))*60) {
				return nil
			}
			if _, e := HistoryInputs(o, hands); e == nil {
				v := Allocation{PriorWeight: 1}
				for seat, cs := range hands {
					v.Hands[seat] = d.Sorted(cs)
				}
				out.Allocations = append(out.Allocations, v)
			}
			return nil
		}
		for seat := 0; seat < 4; seat++ {
			if seat == o.Seat || len(hands[seat]) >= o.HandSizes[seat] {
				continue
			}
			hands[seat] = append(hands[seat], unknown[index])
			if e := walk(index + 1); e != nil {
				return e
			}
			hands[seat] = hands[seat][:len(hands[seat])-1]
			if exhausted {
				return nil
			}
		}
		return nil
	}
	err = walk(0)
	if err != nil || exhausted {
		out.Allocations = nil
		return out, err
	}
	if len(out.Allocations) == 0 {
		return out, fmt.Errorf("no feasible exact allocation")
	}
	out.Status = "completed-exact"
	return out, nil
}
