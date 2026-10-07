package legacydecision

import (
	"context"
	"fmt"
	"math/big"
)

const SamplerVersion = "uniform-constraint-counting-1.0.0"

// SampleHands ports the original uniform constraint-counting sampler. It only
// accepts an actor observation. No production deal or future event is an input.
func SampleHands(ctx context.Context, o Observation, seed uint32) ([4][]string, error) {
	var hands [4][]string
	fail := func() ([4][]string, error) { return hands, fmt.Errorf("sample unavailable: inconsistent observation") }
	if err := ValidateObservationContext(ctx, o); err != nil {
		return hands, err
	}
	if o.Phase != "play" {
		return fail()
	}
	public := map[string]bool{}
	chronology := [][]Play{}
	for _, t := range o.History {
		chronology = append(chronology, t.Plays)
	}
	chronology = append(chronology, o.Trick)
	restricted := [4]string{}
	penaltyOnly := [4]bool{}
	hearts, spades := false, false
	for ti, plays := range chronology {
		if len(plays) == 0 {
			continue
		}
		lead := CardSuit(plays[0].Card)
		if o.Mode == "hearts" && lead == "H" && !hearts {
			restricted[plays[0].Seat] = "H"
		}
		if o.Mode != "hearts" && lead == "S" && !spades {
			restricted[plays[0].Seat] = "S"
		}
		for _, p := range plays {
			if public[p.Card] {
				return fail()
			}
			public[p.Card] = true
			if o.Mode == "hearts" && ti == 0 && lead == "C" && CardSuit(p.Card) != "C" && (CardSuit(p.Card) == "H" || p.Card == "SQ") {
				penaltyOnly[p.Seat] = true
			}
			hearts = hearts || CardSuit(p.Card) == "H"
			spades = spades || CardSuit(p.Card) == "S"
		}
	}
	total := len(public)
	for _, n := range o.HandSizes {
		total += n
	}
	if total != 52 || hearts != o.HeartsBroken || spades != o.SpadesBroken {
		return fail()
	}
	voids := map[string]map[int]bool{}
	for _, m := range GetMemory(o) {
		voids[m.Suit] = map[int]bool{}
		for _, s := range m.VoidSeats {
			voids[m.Suit][s] = true
		}
	}
	forbidden := func(seat int, card string) bool {
		return voids[CardSuit(card)][seat] || (restricted[seat] != "" && CardSuit(card) != restricted[seat]) || (penaltyOnly[seat] && CardSuit(card) != "H" && card != "SQ") || (o.Mode == "hearts" && len(o.History) == 0 && len(o.Trick) == 0 && card == "C2" && (o.Turn == nil || seat != *o.Turn))
	}
	known := map[string]bool{}
	for i := range hands {
		hands[i] = []string{}
	}
	hands[o.Seat] = append([]string{}, o.Hand...)
	for _, c := range o.Hand {
		if public[c] || forbidden(o.Seat, c) {
			return fail()
		}
		known[c] = true
	}
	expected := map[string]int{}
	if o.Pass.To != nil {
		for _, c := range o.Pass.Outgoing {
			if !public[c] {
				expected[c] = *o.Pass.To
			}
		}
	}
	if len(expected) != len(o.KnownHoldings) {
		return fail()
	}
	for _, h := range o.KnownHoldings {
		seat, ok := expected[h.Card]
		if !ok || seat != h.Seat || known[h.Card] || public[h.Card] || h.Seat == o.Seat || forbidden(h.Seat, h.Card) {
			return fail()
		}
		known[h.Card] = true
		hands[h.Seat] = append(hands[h.Seat], h.Card)
	}
	seats := []int{}
	capacity := [3]int{}
	for s := 0; s < 4; s++ {
		if s != o.Seat {
			capacity[len(seats)] = o.HandSizes[s] - len(hands[s])
			if capacity[len(seats)] < 0 {
				return fail()
			}
			seats = append(seats, s)
		}
	}
	type group struct {
		cards   []string
		allowed [3]bool
	}
	groups := []group{}
	masks := map[int]int{}
	for _, c := range FullDeck() {
		if known[c] || public[c] {
			continue
		}
		mask := 0
		allow := [3]bool{}
		for i, s := range seats {
			allow[i] = !forbidden(s, c)
			if allow[i] {
				mask |= 1 << i
			}
		}
		index, ok := masks[mask]
		if !ok {
			index = len(groups)
			masks[mask] = index
			groups = append(groups, group{cards: []string{}, allowed: allow})
		}
		groups[index].cards = append(groups[index].cards, c)
	}
	allocations := func(index int, cap [3]int) [][3]int {
		g := groups[index]
		limits := [3]int{}
		for i := 0; i < 3; i++ {
			if g.allowed[i] {
				limits[i] = min(cap[i], len(g.cards))
			}
		}
		out := [][3]int{}
		for a := 0; a <= limits[0]; a++ {
			for b := 0; b <= limits[1]; b++ {
				c := len(g.cards) - a - b
				if c >= 0 && c <= limits[2] {
					out = append(out, [3]int{a, b, c})
				}
			}
		}
		return out
	}
	weight := func(index int, a [3]int) *big.Int {
		n := int64(len(groups[index].cards))
		return new(big.Int).Mul(new(big.Int).Binomial(n, int64(a[0])), new(big.Int).Binomial(n-int64(a[0]), int64(a[1])))
	}
	cache := map[[4]int]*big.Int{}
	operations := 0
	var count func(int, [3]int) (*big.Int, error)
	count = func(index int, cap [3]int) (*big.Int, error) {
		operations++
		if operations > 250000 {
			return nil, fmt.Errorf("sample unavailable: budget exhausted")
		}
		if operations%128 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		if index == len(groups) {
			if cap == [3]int{} {
				return big.NewInt(1), nil
			}
			return big.NewInt(0), nil
		}
		key := [4]int{index, cap[0], cap[1], cap[2]}
		if v := cache[key]; v != nil {
			return new(big.Int).Set(v), nil
		}
		v := big.NewInt(0)
		for _, a := range allocations(index, cap) {
			remaining := [3]int{cap[0] - a[0], cap[1] - a[1], cap[2] - a[2]}
			tail, err := count(index+1, remaining)
			if err != nil {
				return nil, err
			}
			v.Add(v, new(big.Int).Mul(weight(index, a), tail))
		}
		cache[key] = new(big.Int).Set(v)
		return v, nil
	}
	random := func() uint32 {
		seed += 0x6d2b79f5
		x := (seed ^ (seed >> 15)) * (1 | seed)
		x ^= x + (x^(x>>7))*(61|x)
		return x ^ (x >> 14)
	}
	below := func(limit *big.Int) (*big.Int, error) {
		if limit.Sign() <= 0 {
			return nil, fmt.Errorf("sample unavailable: impossible")
		}
		if limit.Cmp(big.NewInt(1)) == 0 {
			return big.NewInt(0), nil
		}
		bits := limit.BitLen()
		mask := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), uint(bits)), big.NewInt(1))
		for attempt := 0; attempt < 256; attempt++ {
			v := big.NewInt(0)
			for n := 0; n < (bits+31)/32; n++ {
				v.Lsh(v, 32)
				v.Or(v, new(big.Int).SetUint64(uint64(random())))
			}
			v.And(v, mask)
			if v.Cmp(limit) < 0 {
				return v, nil
			}
		}
		return nil, fmt.Errorf("sample unavailable: budget exhausted")
	}
	totalWays, err := count(0, capacity)
	if err != nil {
		return hands, err
	}
	if totalWays.Sign() == 0 {
		return fail()
	}
	for index, g := range groups {
		ways, err := count(index, capacity)
		if err != nil {
			return hands, err
		}
		draw, err := below(ways)
		if err != nil {
			return hands, err
		}
		selected := [3]int{}
		found := false
		for _, a := range allocations(index, capacity) {
			remaining := [3]int{capacity[0] - a[0], capacity[1] - a[1], capacity[2] - a[2]}
			tail, err := count(index+1, remaining)
			if err != nil {
				return hands, err
			}
			w := new(big.Int).Mul(weight(index, a), tail)
			if draw.Cmp(w) < 0 {
				selected = a
				found = true
				break
			}
			draw.Sub(draw, w)
		}
		if !found {
			return fail()
		}
		cards := append([]string{}, g.cards...)
		for i := len(cards) - 1; i > 0; i-- {
			j, err := below(big.NewInt(int64(i + 1)))
			if err != nil {
				return hands, err
			}
			cards[i], cards[j.Int64()] = cards[j.Int64()], cards[i]
		}
		offset := 0
		for i, s := range seats {
			hands[s] = append(hands[s], cards[offset:offset+selected[i]]...)
			offset += selected[i]
			capacity[i] -= selected[i]
		}
	}
	for i := range hands {
		hands[i] = Sorted(hands[i])
	}
	return hands, ctx.Err()
}
