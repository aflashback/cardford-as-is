package cardcontinuation

import (
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/rollout"
	"encoding/json"
	"fmt"
	"slices"
)

func random(seed *uint32) uint32 {
	*seed += 0x6d2b79f5
	x := (*seed ^ (*seed >> 15)) * (1 | *seed)
	x ^= x + (x^(x>>7))*(61|x)
	return x ^ (x >> 14)
}
func shuffle(w *rollout.Work, cards []string, seed *uint32) error {
	for i := len(cards) - 1; i > 0; i-- {
		n := uint32(i + 1)
		threshold := -n % n
		for {
			if e := w.Sampler(1); e != nil {
				return e
			}
			v := random(seed)
			if v < threshold {
				continue
			}
			j := int(v % n)
			cards[i], cards[j] = cards[j], cards[i]
			break
		}
	}
	return nil
}
func sampleOpeningHands(w *rollout.Work, o d.Observation, seed uint32) ([4][]string, error) {
	var hands [4][]string
	if len(o.Hand) != 13 {
		return hands, fmt.Errorf("opening actor hand must be complete")
	}
	unknown := []string{}
	for _, c := range d.FullDeck() {
		if !slices.Contains(o.Hand, c) {
			unknown = append(unknown, c)
		}
	}
	if e := shuffle(w, unknown, &seed); e != nil {
		return hands, e
	}
	hands[o.Seat] = append([]string{}, o.Hand...)
	offset := 0
	for seat := 0; seat < 4; seat++ {
		if seat != o.Seat {
			if o.HandSizes[seat] != 13 {
				return hands, fmt.Errorf("invalid opening hand sizes")
			}
			hands[seat] = d.Sorted(unknown[offset : offset+13])
			offset += 13
		}
	}
	return hands, nil
}

// Each hypothetical actor remembers an internally consistent synthetic pass.
// The root's incoming/outgoing memories remain exact; other exchanges are
// reconstructed from synthetic own holdings and public played-card chronology.
func withSyntheticExchanges(w *rollout.Work, o d.Observation, hands [4][]string, raw json.RawMessage, seed uint32) (json.RawMessage, error) {
	offset := map[string]int{"left": 1, "right": 3, "across": 2}[o.PassDirection]
	if offset == 0 {
		return nil, fmt.Errorf("unsupported pass direction")
	}
	original := [4][]string{}
	for seat := 0; seat < 4; seat++ {
		original[seat] = append([]string{}, hands[seat]...)
	}
	for _, t := range o.History {
		for _, p := range t.Plays {
			original[p.Seat] = append(original[p.Seat], p.Card)
		}
	}
	for _, p := range o.Trick {
		original[p.Seat] = append(original[p.Seat], p.Card)
	}
	passes := [4]d.PassMemory{}
	for seat := 0; seat < 4; seat++ {
		to := (seat + offset) % 4
		cards := append([]string{}, original[to]...)
		if len(cards) != 13 {
			return nil, fmt.Errorf("incomplete synthetic exchange history")
		}
		if e := shuffle(w, cards, &seed); e != nil {
			return nil, e
		}
		out := cards[:3]
		if seat == o.Seat {
			out = o.Pass.Outgoing
		}
		if to == o.Seat {
			out = o.Pass.Incoming
		}
		passes[seat] = d.PassMemory{Outgoing: d.Sorted(out), Incoming: []string{}, To: d.Ptr(to), From: d.Ptr((seat - offset + 4) % 4)}
	}
	for seat := 0; seat < 4; seat++ {
		passes[seat].Incoming = d.Sorted(passes[*passes[seat].From].Outgoing)
	}
	var state map[string]json.RawMessage
	if e := json.Unmarshal(raw, &state); e != nil {
		return nil, e
	}
	encoded, e := json.Marshal(passes)
	if e != nil {
		return nil, e
	}
	state["passes"] = encoded
	return json.Marshal(state)
}
