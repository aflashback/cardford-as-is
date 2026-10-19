package trix

import (
	"context"
	"encoding/json"
	"math/rand/v2"
	"reflect"
	"testing"
)

// These tests catch missing phase support, leaking private fixture/chance state,
// native scoring drift, and falsely completed work after a deterministic cap.
func evaluationFixture(t *testing.T, variant, request string, remaining int) State {
	t.Helper()
	profile := ""
	if partners(variant) {
		profile = "1.1.0"
	}
	s, err := New(Config{ID: "evaluation-native", Variant: variant, ProfileVersion: profile}, Deck())
	if err != nil {
		t.Fatal(err)
	}
	if request == "" {
		return s
	}
	s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: request})
	if err != nil {
		t.Fatal(err)
	}
	for n := 0; n < 400 && s.Phase != "round-complete"; n++ {
		if remaining == 52 || s.Phase == "playing" && len(s.Tricks) == 13-remaining {
			return s
		}
		a, e := Decide(Observe(s, s.Turn))
		if e != nil {
			t.Fatal(e)
		}
		s, e = Apply(s, s.Turn, a)
		if e != nil {
			t.Fatal(e)
		}
	}
	return s
}

func TestEvaluationAllNativePhasesAndVariants(t *testing.T) {
	for _, variant := range Variants {
		for _, phase := range []string{"choose-request", "declare-doubles", "playing", "layout"} {
			t.Run(variant+"/"+phase, func(t *testing.T) {
				request := ""
				if phase == "declare-doubles" {
					request = "queens"
					if variant[:7] == "complex" {
						request = "complex"
					}
				}
				if phase == "playing" {
					request = "lutoosh"
					if variant[:7] == "complex" {
						request = "complex"
					}
				}
				if phase == "layout" {
					request = "trix"
				}
				s := evaluationFixture(t, variant, request, 52)
				for phase == "playing" && s.Phase == "declare-doubles" {
					var e error
					s, e = Apply(s, s.Turn, Action{Kind: "declare-doubles", Cards: []string{}})
					if e != nil {
						t.Fatal(e)
					}
				}
				o := Observe(s, s.Turn)
				// These original fixtures deliberately retain their pre-chronology
				// configurations, so evaluate their exact historical module pins.
				pin := LegacyPin(variant)
				if partners(variant) {
					pin = AnnouncedPin(variant)
				}
				c := DefaultRequestEvaluationConfig()
				c.Worlds = 2
				got, e := EvaluateRequest(context.Background(), o, pin, c)
				if e != nil {
					t.Fatal(e)
				}
				if got.Status != "completed" || len(got.Values) != 2 || len(got.CandidateIDs) != len(Legal(o)) {
					t.Fatalf("incomplete coverage: %+v", got)
				}
				for _, row := range got.Values {
					if len(row) != len(Legal(o)) {
						t.Fatal("unpaired root row")
					}
				}
				again, e := EvaluateRequest(context.Background(), o, pin, c)
				if e != nil || !reflect.DeepEqual(got, again) {
					t.Fatal("nonreproducible actor-only evaluation", e)
				}
			})
		}
	}
}

func TestEvaluationNativeForcedEndgameAndBounds(t *testing.T) {
	s := evaluationFixture(t, "basic-solo", "lutoosh", 1)
	o := Observe(s, s.Turn)
	c := DefaultRequestEvaluationConfig()
	c.Worlds = 2
	got, e := EvaluateRequest(context.Background(), o, LegacyPin(s.Config.Variant), c)
	if e != nil {
		t.Fatal(e)
	}
	// Ordered suit hands leave seat 2 (all hearts) leading the final trick;
	// its HA wins a lutoosh trick worth exactly -15 additional points.
	if got.Status != "completed" || len(got.Values) != 2 || got.Values[0][0] != -15 || got.Values[1][0] != -15 {
		t.Fatalf("native residual score mismatch: %+v", got)
	}
	c.MaxSteps = 1
	capped, e := EvaluateRequest(context.Background(), o, LegacyPin(s.Config.Variant), c)
	if e != nil || capped.Status != "incomplete" || capped.Work.Steps > 1 || len(capped.Values) != 0 {
		t.Fatalf("partial world published: %+v %v", capped, e)
	}
	c = DefaultRequestEvaluationConfig()
	c.MaxSamplerOperations = 1
	capped, e = EvaluateRequest(context.Background(), o, LegacyPin(s.Config.Variant), c)
	if e != nil || capped.Status != "incomplete" || capped.Work.SamplerOperations > 1 {
		t.Fatalf("sampler cap: %+v %v", capped, e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	capped, e = EvaluateRequest(ctx, o, LegacyPin(s.Config.Variant), DefaultRequestEvaluationConfig())
	if e != context.Canceled || capped.Status != "incomplete" {
		t.Fatalf("cancellation lost: %+v %v", capped, e)
	}
}

func TestEvaluationObservationOnlyIgnoresPrivateWorld(t *testing.T) {
	s := evaluationFixture(t, "basic-solo", "", 52)
	o := Observe(s, s.Turn)
	s.Hands[0], s.Hands[1] = s.Hands[1], s.Hands[0]
	s.Config.FixtureID = "private-fixture-never-read"
	changed := Observe(s, s.Turn)
	a, _ := json.Marshal(o)
	b, _ := json.Marshal(changed)
	if string(a) != string(b) {
		t.Fatal("fixture leaked private change")
	}
	c := DefaultRequestEvaluationConfig()
	c.Worlds = 1
	x, e := EvaluateRequest(context.Background(), o, LegacyPin(o.VariantID), c)
	if e != nil {
		t.Fatal(e)
	}
	y, e := EvaluateRequest(context.Background(), changed, LegacyPin(o.VariantID), c)
	if e != nil || !reflect.DeepEqual(x, y) {
		t.Fatal("hidden-world dependence")
	}
	renamed := o
	renamed.ID = "different-run-and-session"
	y, e = EvaluateRequest(context.Background(), renamed, LegacyPin(o.VariantID), c)
	if e != nil || !reflect.DeepEqual(x, y) {
		t.Fatal("run identity entered semantic sampling stream")
	}
}

func sampledEvaluationWorld(t *testing.T, s State, seed uint64) State {
	t.Helper()
	c := DefaultRequestEvaluationConfig()
	work := EvaluationWork{}
	p, e := newEvaluationSampler(Observe(s, s.Turn), s.Config, &evaluationMeter{context.Background(), c, &work})
	if e != nil {
		t.Fatal(e)
	}
	world, e := p.world(rand.New(rand.NewPCG(seed, seed+1)))
	if e != nil {
		t.Fatalf("sampling failed after %+v: %v", work, e)
	}
	if e = validateState(world); e != nil {
		t.Fatal(e)
	}
	if !p.matches(world) {
		t.Fatal("sample does not reproduce actor observation")
	}
	return world
}

func TestEvaluationSamplerRespectsVoidsAndDeclarations(t *testing.T) {
	s := evaluationFixture(t, "basic-solo", "lutoosh", 12)
	for i := uint64(1); i < 4; i++ {
		world := sampledEvaluationWorld(t, s, i)
		for _, seat := range []int{0, 1, 3} {
			for _, card := range world.Hands[seat] {
				if card[0] == 'H' {
					t.Fatal("failed-to-follow seat reacquired hearts")
				}
			}
		}
	}
	s = evaluationFixture(t, "basic-partners", "queens", 52)
	for s.Phase == "declare-doubles" {
		cards := []string{}
		for _, card := range s.Hands[s.Turn] {
			if rank(card) == 12 {
				cards = append(cards, card)
			}
		}
		var e error
		s, e = Apply(s, s.Turn, Action{Kind: "declare-doubles", Cards: cards})
		if e != nil {
			t.Fatal(e)
		}
	}
	world := sampledEvaluationWorld(t, s, 7)
	for _, d := range s.Declarations {
		for _, card := range d.Cards {
			if !contains(world.Hands[d.Seat], card) {
				t.Fatal("declared card assigned to a different player")
			}
		}
	}
}

func TestEvaluationInitialH7ConstraintDoesNotLeakIntoLaterDeals(t *testing.T) {
	s := evaluationFixture(t, "basic-solo", "lutoosh", 0)
	var e error
	s, e = Continue(s)
	if e != nil {
		t.Fatal(e)
	}
	deck := Deck()
	deck[0], deck[31] = deck[31], deck[0] // move H7 from seat 2 to seat 0
	s, e = Supply(s, deck)
	if e != nil {
		t.Fatal(e)
	}
	if s.DealNumber != 2 || s.Owner != 2 || !contains(s.Hands[0], "H7") {
		t.Fatal("invalid second-deal fixture")
	}
	seenOther := false
	for i := uint64(1); i <= 6; i++ {
		world := sampledEvaluationWorld(t, s, i)
		if !contains(world.Hands[s.Owner], "H7") {
			seenOther = true
		}
	}
	if !seenOther {
		t.Fatal("first-deal H7 ownership incorrectly retained")
	}
}

func TestEvaluationLayoutWitnessPreservesTimestampedPassesAndAnnouncements(t *testing.T) {
	for _, profile := range []string{"", "1.1.0"} {
		deck := evaluationShuffledDeck(27)
		for seat, card := range twoCards {
			for i, c := range deck {
				if c == card {
					deck[seat*13], deck[i] = deck[i], deck[seat*13]
					break
				}
			}
		}
		s, e := New(Config{ID: "layout-witness", Variant: "basic-partners", ProfileVersion: profile}, deck)
		if e != nil {
			t.Fatal(e)
		}
		s, e = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
		if e != nil {
			t.Fatal(e)
		}
		sampledEvaluationWorld(t, s, 9)
		for step := 0; step < 14; step++ {
			a, e := Decide(Observe(s, s.Turn))
			if e != nil {
				t.Fatal(e)
			}
			s, e = Apply(s, s.Turn, a)
			if e != nil {
				t.Fatal(e)
			}
			if step >= 4 && len(s.Passes) > 0 {
				break
			}
		}
		if len(s.Passes) == 0 {
			t.Fatal("fixture contains no timestamped pass")
		}
		world := sampledEvaluationWorld(t, s, 19)
		for _, pass := range s.Passes {
			for _, card := range world.Hands[pass.Seat] {
				if placeable(pass.Board, card) {
					t.Fatal("sample ignored prior pass frontier")
				}
			}
		}
		if profile == "1.1.0" && (Observe(world, world.Turn).TwoAnnouncements == nil || Observe(world, world.Turn).TwoAnnouncements.Status != "revealed") {
			t.Fatal("revealed current-profile twos lost")
		}
	}
}

func evaluationShuffledDeck(seed uint64) []string {
	deck := Deck()
	r := rand.New(rand.NewPCG(seed, seed+1))
	r.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
	return deck
}

func TestEvaluationContinuationPinIsExecutable(t *testing.T) {
	s, e := New(Config{ID: "continuation-pin", Variant: "basic-partners", ProfileVersion: "1.1.0"}, evaluationShuffledDeck(19))
	if e != nil {
		t.Fatal(e)
	}
	o := Observe(s, s.Turn)
	c := DefaultRequestEvaluationConfig()
	c.Worlds = 1
	baseline, e := EvaluateRequest(context.Background(), o, AnnouncedPin(o.VariantID), c)
	if e != nil {
		t.Fatal(e)
	}
	for i := range c.Policies {
		c.Policies[i] = ReasoningPolicyID
	}
	candidate, e := EvaluateRequest(context.Background(), o, AnnouncedPin(o.VariantID), c)
	if e != nil {
		t.Fatal(e)
	}
	if baseline.Status != "completed" || candidate.Status != "completed" {
		t.Fatal("continuation comparison incomplete")
	}
	if reflect.DeepEqual(baseline.Values, candidate.Values) {
		t.Fatal("distinct continuation policy pin had no effect in targeted native fixture")
	}
}

func TestEvaluationRejectsMalformedObservationWithoutPanic(t *testing.T) {
	s := evaluationFixture(t, "basic-solo", "lutoosh", 1)
	var e error
	s, e = Apply(s, s.Turn, Legal(Observe(s, s.Turn))[0])
	if e != nil {
		t.Fatal(e)
	}
	o := Observe(s, s.Turn)
	o.Hand[0] = ""
	defer func() {
		if recover() != nil {
			t.Fatal("malformed actor card panicked before validation")
		}
	}()
	if _, e := EvaluateRequest(context.Background(), o, LegacyPin(o.VariantID), DefaultRequestEvaluationConfig()); e == nil {
		t.Fatal("invalid actor card admitted")
	}
}

func TestEvaluationPartnersAbsentAnnouncementConstrainsOriginalTwos(t *testing.T) {
	deck := evaluationShuffledDeck(27)
	for i, card := range twoCards {
		for j, c := range deck {
			if c == card {
				deck[i], deck[j] = deck[j], deck[i]
				break
			}
		}
	}
	s, e := New(Config{ID: "all-twos-team", Variant: "basic-partners", ProfileVersion: "1.1.0"}, deck)
	if e != nil {
		t.Fatal(e)
	}
	s, e = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
	if e != nil {
		t.Fatal(e)
	}
	if Observe(s, s.Turn).TwoAnnouncements != nil {
		t.Fatal("invalid absence fixture")
	}
	for i := uint64(1); i <= 3; i++ {
		world := sampledEvaluationWorld(t, s, i)
		teams := [2]bool{}
		for seat, hand := range world.Hands {
			for _, card := range hand {
				if rank(card) == 2 {
					teams[seat%2] = true
				}
			}
		}
		if teams[0] && teams[1] {
			t.Fatal("absent current-profile announcement sampled twos split across teams")
		}
	}
}

func TestEvaluationExactDoubledKingEndgameMargins(t *testing.T) {
	for _, tc := range []struct {
		variant, request string
		want             float64
	}{{"basic-solo", "king", -150}, {"basic-partners", "king", -225}, {"complex-solo", "complex", -200}, {"complex-partners", "complex", -275}} {
		t.Run(tc.variant, func(t *testing.T) {
			profile := ""
			if partners(tc.variant) {
				profile = "1.1.0"
			}
			s, e := New(Config{ID: "exact-king-endgame", Variant: tc.variant, ProfileVersion: profile}, Deck())
			if e != nil {
				t.Fatal(e)
			}
			s, e = Apply(s, s.Turn, Action{Kind: "choose-request", Request: tc.request})
			if e != nil {
				t.Fatal(e)
			}
			for s.Phase == "declare-doubles" {
				cards := []string{}
				if s.Turn == 2 {
					cards = []string{"HK"}
				}
				s, e = Apply(s, s.Turn, Action{Kind: "declare-doubles", Cards: cards})
				if e != nil {
					t.Fatal(e)
				}
			}
			// Play ranks 2 through Q in every suit using legal native transitions.
			// All hearts belong to seat 2, which wins every trick; K/A remain.
			for len(s.Tricks) < 11 {
				s, e = Apply(s, s.Turn, Legal(Observe(s, s.Turn))[0])
				if e != nil {
					t.Fatal(e)
				}
			}
			if !reflect.DeepEqual(s.Hands[2], []string{"HK", "HA"}) {
				t.Fatal("wrong native endgame")
			}
			c := DefaultRequestEvaluationConfig()
			pin := LegacyPin(tc.variant)
			if partners(tc.variant) {
				pin = AnnouncedPin(tc.variant)
			}
			got, e := EvaluateRequest(context.Background(), Observe(s, s.Turn), pin, c)
			if e != nil {
				t.Fatal(e)
			}
			// King = -150 to its capturing seat. Partners additionally routes +75
			// to the opposing team; Solo self-capture with no outside giver withholds
			// that bonus. Complex adds two tricks (-30) and two diamonds (-20).
			if got.Status != "completed" || len(got.CandidateIDs) != 2 {
				t.Fatal("exact two-option endgame incomplete")
			}
			for _, row := range got.Values {
				for _, value := range row {
					if value != tc.want {
						t.Fatalf("got %v want exact native margin %v", value, tc.want)
					}
				}
			}
		})
	}
}

func TestEvaluationRejectsMalformedDeclarationCard(t *testing.T) {
	s := evaluationFixture(t, "basic-solo", "queens", 52)
	var e error
	s, e = Apply(s, s.Turn, Action{Kind: "declare-doubles", Cards: []string{}})
	if e != nil {
		t.Fatal(e)
	}
	o := Observe(s, s.Turn)
	o.Declarations[0].Cards = []string{"XQ"}
	c := DefaultRequestEvaluationConfig()
	c.MaxSamplerOperations = 1000
	if _, e = EvaluateRequest(context.Background(), o, LegacyPin(o.VariantID), c); e == nil {
		t.Fatal("invalid declaration treated as insufficient work")
	}
}
