package beliefs

import (
	"context"
	"encoding/json"
	"math"
	"reflect"
	"testing"

	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
)

// Native legal full deals preserve the owner's exact clockwise J,A,6,Q order.
// The partner starts with Q only in diamonds in the first allocation, QK in
// the second. A non-diamond swap preserves every seat capacity and actor hand.
func queenFixture(t *testing.T, nilBid bool) (d.Observation, []Allocation) {
	t.Helper()
	hands := [4][]string{{"DA"}, {"D6", "DK"}, {"DQ"}, {"DJ"}}
	assigned := map[string]bool{"DA": true, "D6": true, "DK": true, "DQ": true, "DJ": true}
	for _, card := range d.FullDeck() {
		if assigned[card] {
			continue
		}
		for _, seat := range []int{0, 1, 3, 2} {
			if len(hands[seat]) < 13 && (seat != 2 || d.CardSuit(card) != "D") {
				hands[seat] = append(hands[seat], card)
				break
			}
		}
	}
	deck := []string{}
	for i := 0; i < 13; i++ {
		for _, seat := range []int{3, 0, 1, 2} {
			deck = append(deck, hands[seat][i])
		}
	}
	raw, err := spades.Create(json.RawMessage(`{"id":"queen","mode":"spades-partners","dealer":2}`), deck)
	if err != nil {
		t.Fatal(err)
	}
	apply := func(v any) {
		b, _ := json.Marshal(v)
		raw, err = spades.Apply(raw, b)
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, seat := range []int{3, 0, 1, 2} {
		bid := 3
		if seat == 2 && nilBid {
			bid = 0
		}
		apply(map[string]any{"type": "action", "action": d.Action{Kind: "bid", Seat: seat, Bid: bid}})
	}
	for _, p := range []d.Play{{3, "DJ"}, {0, "DA"}, {1, "D6"}, {2, "DQ"}} {
		apply(map[string]any{"type": "action", "action": d.Action{Kind: "play", Seat: p.Seat, Card: p.Card}})
		for i, c := range hands[p.Seat] {
			if c == p.Card {
				hands[p.Seat] = append(hands[p.Seat][:i], hands[p.Seat][i+1:]...)
				break
			}
		}
	}
	apply(map[string]any{"type": "collect-trick"})
	b, err := spades.Observe(raw, 0)
	if err != nil {
		t.Fatal(err)
	}
	var o d.Observation
	if err = json.Unmarshal(b, &o); err != nil {
		t.Fatal(err)
	}
	second := hands
	for s := range second {
		second[s] = append([]string{}, hands[s]...)
	}
	swap := second[2][0]
	for i, c := range second[1] {
		if c == "DK" {
			second[1][i] = swap
		}
	}
	second[2][0] = "DK"
	return o, []Allocation{{Hands: hands, PriorWeight: 1}, {Hands: second, PriorWeight: 1}}
}

func cfg(styles ...Style) Config {
	c := DefaultConfig()
	c.Mode = "style-mixture"
	for seat := range c.Players {
		for _, s := range styles {
			c.Players[seat] = append(c.Players[seat], StyleWeight{Style: s, Weight: 1})
		}
	}
	return c
}

func TestQueenUnderAceCounterworlds(t *testing.T) {
	o, worlds := queenFixture(t, false)
	a, err := AnalyzeAllocations(context.Background(), o, worlds, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Weights) != 2 || math.Abs(a.Weights[0]-.5) > 1e-12 {
		t.Fatalf("constraint-only changed prior: %+v", a)
	}
	b, err := AnalyzeAllocations(context.Background(), o, worlds, cfg(UniformLegal))
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(b.Weights[0]-2.0/3) > 1e-12 || math.Abs(b.Weights[1]-1.0/3) > 1e-12 {
		t.Fatalf("uniform behavior must supply 1 vs 1/2 likelihood: %+v", b.Weights)
	}
	if len(b.EvidenceIDs) != 1 {
		t.Fatalf("own or irrelevant actions counted: %+v", b.EvidenceIDs)
	}
	for _, m := range b.Cards {
		if m.Card == "DK" && (m.Probability[2] <= 0 || m.Status != "conditional") {
			t.Fatalf("soft clue removed feasible King: %+v", m)
		}
	}
}

func TestNilEquivalentHonors(t *testing.T) {
	o, w := queenFixture(t, true)
	a, err := AnalyzeAllocations(context.Background(), o, w, cfg(NilEquivalentHonors))
	if err != nil {
		t.Fatal(err)
	}
	b, err := AnalyzeAllocations(context.Background(), o, w, cfg(HighestSafe))
	if err != nil {
		t.Fatal(err)
	}
	if a.Weights[1] <= b.Weights[1] || b.Weights[1] <= 0 {
		t.Fatalf("equivalent QK or positive mistakes lost: %v / %v", a.Weights, b.Weights)
	}
}

func TestEvidenceAppliedOnce(t *testing.T) {
	o, w := queenFixture(t, false)
	a, err := AnalyzeAllocations(context.Background(), o, w, cfg(UniformLegal))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(a.EvidenceIDs, []string{"hand:1/play:3"}) {
		t.Fatalf("expected only fourth public play: %v", a.EvidenceIDs)
	}
	o.Events = append(o.Events, o.Events[len(o.Events)-1])
	if _, err = AnalyzeAllocations(context.Background(), o, w, cfg(UniformLegal)); err == nil {
		t.Fatal("duplicate event accepted")
	}
}

func TestBeliefReplayDeterminism(t *testing.T) {
	o, w := queenFixture(t, false)
	c := cfg(ConserveHonors, HighestSafe, UniformLegal)
	a, e := AnalyzeAllocations(context.Background(), o, w, c)
	if e != nil {
		t.Fatal(e)
	}
	b, e := AnalyzeAllocations(context.Background(), o, w, c)
	if e != nil || !reflect.DeepEqual(a, b) {
		t.Fatalf("nonrepeatable: %v", e)
	}
}

func TestBeliefInsufficientSupport(t *testing.T) {
	o, w := queenFixture(t, false)
	c := DefaultConfig()
	c.MinEffectiveSamples = 3
	a, e := AnalyzeAllocations(context.Background(), o, w, c)
	if e != nil {
		t.Fatal(e)
	}
	if a.Status != "insufficient-support" || a.FallbackReason == "" {
		t.Fatalf("missing support gate: %+v", a)
	}
	c.MaxOperations = 1
	a, e = AnalyzeAllocations(context.Background(), o, w, c)
	if e != nil || a.Status != "budget-exhausted" || len(a.Cards) != 0 {
		t.Fatalf("partial posterior escaped: %+v %v", a, e)
	}
}

func TestLikelihoodActorBoundary(t *testing.T) {
	o, w := queenFixture(t, false)
	h, e := HistoryInputs(o, w[0].Hands)
	if e != nil {
		t.Fatal(e)
	}
	if len(h) != 4 {
		t.Fatal(len(h))
	}
	if len(h[1].Observation.Trick) != 1 || len(h[1].Observation.History) != 0 || len(h[1].Observation.Events) != 0 {
		t.Fatal("later plays leaked into Ace decision")
	}
	if reflect.DeepEqual(h[3].Observation.Hand, o.Hand) {
		t.Fatal("observer hand substituted for partner hand")
	}
	if len(h[3].Observation.Trick) != 3 || h[3].Observation.Seat != 2 {
		t.Fatal("fourth-seat cutoff lost")
	}
}

func TestBeliefExactEnumeration(t *testing.T) {
	o, w := queenFixture(t, false)
	// Exhaustive two-world mathematical population with known prior masses.
	w[1].PriorWeight = 3
	got, err := AnalyzeAllocations(context.Background(), o, w, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(got.Weights[0]-.25) > 1e-12 || math.Abs(got.Weights[1]-.75) > 1e-12 {
		t.Fatal(got.Weights)
	}
	for _, card := range got.Cards {
		sum := 0.0
		for _, p := range card.Probability {
			sum += p
		}
		if math.Abs(sum-1) > 1e-12 {
			t.Fatalf("card marginal not normalized: %+v", card)
		}
	}
	for _, suit := range got.Suits {
		sum := 0.0
		for _, p := range suit.CountProbability {
			sum += p
		}
		if math.Abs(sum-1) > 1e-12 {
			t.Fatalf("suit marginal not normalized: %+v", suit)
		}
	}
}

func TestPersistentStyleIsSummedOutsideHistoryProduct(t *testing.T) {
	o, w := queenFixture(t, false)
	history, err := HistoryInputs(o, w[1].Hands)
	if err != nil {
		t.Fatal(err)
	}
	first := history[3]
	second := first
	second.ID = "next-applicable-event"
	second.Action.Card = "DK"
	c := cfg(ConserveHonors, HighestSafe)
	value, ids := LogLikelihood([]HistoricalInput{first, second}, 0, c)
	// Each persistent style gives .95*.05. Mixing anew per move gives .25,
	// which is the exact regression this test rejects.
	if math.Abs(math.Exp(value)-.0475) > 1e-12 || len(ids) != 2 {
		t.Fatalf("style changed between events: %g %v", math.Exp(value), ids)
	}
}

func TestRightKingLeadAndPartnerLowerRemainPossible(t *testing.T) {
	o, w := queenFixture(t, false)
	third := w[0]
	for seat := range third.Hands {
		third.Hands[seat] = append([]string{}, w[0].Hands[seat]...)
	}
	swap := third.Hands[3][0]
	for i, c := range third.Hands[1] {
		if c == "DK" {
			third.Hands[1][i] = swap
		}
	}
	third.Hands[3][0] = "DK"
	w = append(w, third)
	got, err := AnalyzeAllocations(context.Background(), o, w, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range got.Cards {
		if m.Card == "DK" {
			for _, seat := range []int{1, 2, 3} {
				if math.Abs(m.Probability[seat]-1.0/3) > 1e-12 {
					t.Fatalf("invented King-left proof: %+v", m)
				}
			}
		}
	}
	// Deliberate legal-error support: an unexpected queen must never zero Q+low.
	low := w[0]
	for seat := range low.Hands {
		low.Hands[seat] = append([]string{}, w[0].Hands[seat]...)
	}
	for i, c := range low.Hands[1] {
		if d.CardSuit(c) == "D" && d.CardRank(c) < 12 {
			low.Hands[1][i], low.Hands[2][0] = low.Hands[2][0], c
			break
		}
	}
	got, err = AnalyzeAllocations(context.Background(), o, []Allocation{w[0], low}, cfg(ConserveHonors))
	if err != nil {
		t.Fatal(err)
	}
	if got.Weights[1] <= 0 {
		t.Fatal("legal low-card counterworld erased")
	}
}

func TestHardVoidRejectsBehaviorCounterworld(t *testing.T) {
	o, w := queenFixture(t, false)
	raw, err := d.SyntheticWorld(o, w[0].Hands)
	if err != nil {
		t.Fatal(err)
	}
	// Play a complete legal clubs trick; partner discards because it has no club.
	for i := 0; i < 4; i++ {
		var state struct{ Turn *int }
		json.Unmarshal(raw, &state)
		obs, err := spades.Observe(raw, *state.Turn)
		if err != nil {
			t.Fatal(err)
		}
		var own d.Observation
		json.Unmarshal(obs, &own)
		action := own.LegalActions[0]
		command, _ := json.Marshal(map[string]any{"type": "action", "action": action})
		raw, err = spades.Apply(raw, command)
		if err != nil {
			t.Fatal(err)
		}
	}
	raw, err = spades.Apply(raw, json.RawMessage(`{"type":"collect-trick"}`))
	if err != nil {
		t.Fatal(err)
	}
	var state struct {
		Hands [4][]string
		Turn  *int
	}
	json.Unmarshal(raw, &state)
	encoded, err := spades.Observe(raw, *state.Turn)
	if err != nil {
		t.Fatal(err)
	}
	json.Unmarshal(encoded, &o)
	if _, err = HistoryInputs(o, state.Hands); err != nil {
		t.Fatal(err)
	}
	// Observer is the club ace winner at seat 1. Move an unseen club from seat
	// 0 into the partner who already failed to follow; capacities still match.
	state.Hands[0][0], state.Hands[2][0] = state.Hands[2][0], state.Hands[0][0]
	if _, err = HistoryInputs(o, state.Hands); err == nil {
		t.Fatal("soft model overrode hard historical void")
	}
}

func TestFutureRuffCanBeOverruffed(t *testing.T) {
	o, w := queenFixture(t, false)
	hands := w[0].Hands
	// Retain an actor diamond for the later lead, give partner the low trump,
	// and leave the right opponent a higher trump. The already observed J/A/6/Q
	// trick remains legal in this complete deck.
	for i, c := range hands[1] {
		if c == "D2" {
			hands[1][i], hands[0][0] = hands[0][0], c
			break
		}
	}
	for i, c := range hands[2] {
		if c == "S3" {
			for j, r := range hands[3] {
				if r == "S2" {
					hands[2][i], hands[3][j] = r, c
				}
			}
		}
	}
	o.Hand = d.Sorted(hands[0])
	o.LegalActions = d.ActionsFor(o)
	if _, err := HistoryInputs(o, hands); err != nil {
		t.Fatal(err)
	}
	raw, err := d.SyntheticWorld(o, hands)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []d.Play{{0, "D2"}, {1, "D3"}, {2, "S2"}, {3, "S3"}} {
		command, _ := json.Marshal(map[string]any{"type": "action", "action": d.Action{Kind: "play", Seat: p.Seat, Card: p.Card}})
		raw, err = spades.Apply(raw, command)
		if err != nil {
			t.Fatal(err)
		}
	}
	var state struct{ History []d.Trick }
	json.Unmarshal(raw, &state)
	if len(state.History) != 2 || state.History[1].Winner != 3 {
		t.Fatal("future partner ruff incorrectly guaranteed team trick")
	}
}

func TestOwnKingOverridesBehavioralLocationGuess(t *testing.T) {
	o, w := queenFixture(t, false)
	hands := w[0].Hands
	for i, c := range hands[1] {
		if c == "DK" {
			hands[1][i], hands[0][0] = hands[0][0], c
		}
	}
	o.Hand = d.Sorted(hands[0])
	o.LegalActions = d.ActionsFor(o)
	got, err := AnalyzeAllocations(context.Background(), o, []Allocation{{Hands: hands, PriorWeight: 1}}, cfg(HighestSafe))
	if err != nil {
		t.Fatal(err)
	}
	for _, card := range got.Cards {
		if card.Card == "DK" && (card.Probability[0] != 1 || card.Status != "known-own") {
			t.Fatalf("soft clue overrode own King: %+v", card)
		}
	}
}

func TestBeliefNormalizationStaysWithinProbabilityBounds(t *testing.T) {
	o, fixture := queenFixture(t, false)
	for _, row := range []struct {
		n    int
		mass float64
	}{{2, .1}, {6, 1}, {8, 1}, {64, 1}, {8, 1e200}, {8, 1e-200}} {
		worlds := make([]Allocation, row.n)
		for i := range worlds {
			worlds[i] = fixture[i%2]
			worlds[i].PriorWeight = row.mass
		}
		c := DefaultConfig()
		c.MinEffectiveSamples = float64(row.n)
		got, err := AnalyzeAllocations(context.Background(), o, worlds, c)
		if err != nil {
			t.Fatal(err)
		}
		if got.Status != "completed" {
			t.Errorf("n=%d mass=%g equal weights failed ESS gate: %.17g", row.n, row.mass, got.EffectiveSamples)
		}
		check := func(values []float64) {
			for _, p := range values {
				if !finite(p) || p < 0 || p > 1 {
					t.Errorf("n=%d mass=%g probability outside strict schema bounds: %.17g", row.n, row.mass, p)
					return
				}
			}
		}
		for _, card := range got.Cards {
			check(card.Probability[:])
			if card.Status == "known-own" && card.Probability[o.Seat] != 1 {
				t.Errorf("known own card not exactly certain: %.17g", card.Probability[o.Seat])
			}
		}
		for _, suit := range got.Suits {
			check(suit.CountProbability[:])
		}
	}
}

func TestBeliefESSToleranceDoesNotHideInsufficientSupportOrInvalidMass(t *testing.T) {
	o, worlds := queenFixture(t, false)
	worlds[1].PriorWeight = 1.001
	got, err := AnalyzeAllocations(context.Background(), o, worlds, DefaultConfig())
	if err != nil || got.Status != "insufficient-support" {
		t.Fatalf("real ESS deficit accepted: %+v %v", got, err)
	}
	worlds[1].PriorWeight = 1
	c := DefaultConfig()
	c.MinEffectiveSamples = math.Nextafter(2, 3)
	got, err = AnalyzeAllocations(context.Background(), o, worlds, c)
	if err != nil || got.Status != "completed" {
		t.Fatalf("one-ulp ESS boundary was treated as substantive insufficiency: %+v %v", got, err)
	}
	c.MinEffectiveSamples = 2 + 1e-10
	got, err = AnalyzeAllocations(context.Background(), o, worlds, c)
	if err != nil || got.Status != "insufficient-support" {
		t.Fatalf("threshold relaxed materially: %+v %v", got, err)
	}
	for _, invalid := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		worlds[1].PriorWeight = invalid
		if _, err = AnalyzeAllocations(context.Background(), o, worlds, DefaultConfig()); err == nil {
			t.Fatalf("invalid prior was normalized away: %v", invalid)
		}
	}
}
