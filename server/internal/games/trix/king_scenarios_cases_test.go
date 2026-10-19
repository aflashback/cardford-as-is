package trix

import (
	"reflect"
	"strings"
	"testing"
)

// These are authored construction checks and literal rule expectations. They
// do not declare any opening double or voluntary witness action optimal.
func kingAuthoredFixture(t *testing.T, id string) kingScenarioFixture {
	t.Helper()
	corpus, _ := kingScenarioFixtures(t)
	for _, f := range corpus.Fixtures {
		if f.ID == id {
			return f
		}
	}
	t.Fatalf("missing authored fixture %s", id)
	return kingScenarioFixture{}
}

func kingAuthoredReplay(t *testing.T, f kingScenarioFixture, variant string, plays []string) State {
	t.Helper()
	s, err := kingScenarioNew(f, variant)
	if err != nil {
		t.Fatal(err)
	}
	request := "king"
	if strings.HasPrefix(variant, "complex") {
		request = "complex"
	}
	s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: request})
	if err != nil {
		t.Fatal(err)
	}
	for s.Phase == "declare-doubles" {
		cards := []string{}
		if s.Turn == 0 {
			cards = []string{"HK"}
		}
		s, err = Apply(s, s.Turn, Action{Kind: "declare-doubles", Cards: cards})
		if err != nil {
			t.Fatal(err)
		}
	}
	for i, card := range plays {
		s, err = Apply(s, s.Turn, Action{Kind: "play-card", Card: card})
		if err != nil {
			t.Fatalf("%s/%s authored play %d (%s): %v", f.ID, variant, i+1, card, err)
		}
	}
	return s
}

func TestKingScenarioAuthoredSixHeartCoverage(t *testing.T) {
	corpus, _ := kingScenarioFixtures(t)
	for _, f := range corpus.Fixtures {
		hearts := 0
		for _, c := range f.Hands[0] {
			if c[0] == 'H' {
				hearts++
			}
		}
		if hearts != 6 || !contains(f.Hands[0], "HK") {
			t.Fatalf("%s left the authored HK plus five hearts family", f.ID)
		}
	}
	// The actor's whole opening observation, not merely its heart count, is
	// identical in these private Ace-location variants. Fixture names are not
	// admitted through observation IDs.
	for _, variant := range Variants {
		var first Observation
		for index, id := range []string{"six-low-hearts-outside-ace-east", "six-low-hearts-outside-ace-north", "six-low-hearts-outside-ace-west"} {
			s, err := kingScenarioNew(kingAuthoredFixture(t, id), variant)
			if err != nil {
				t.Fatal(err)
			}
			o := Observe(s, 0)
			if index == 0 {
				first = o
			} else if !reflect.DeepEqual(first, o) {
				t.Fatalf("private Ace-location twin changed actor observation in %s", variant)
			}
		}
	}
}

func TestKingScenarioAuthoredLiteralBonusProvenance(t *testing.T) {
	cases := []struct {
		fixture, witness   string
		captor, soloBonus  int
		source             string
		complexCaptureCost int
	}{
		{"six-low-hearts-outside-ace-east", "release-under-public-ace", 3, 0, "", -165},
		{"six-low-hearts-outside-ace-east", "exhaust-cover-then-take-club-lead", 0, 3, "deal:1:trick:9", -175},
		{"six-low-hearts-outside-ace-east", "partner-return-to-publicly-known-void", 3, 0, "", -185},
		{"six-low-hearts-outside-ace-north", "release-under-north-ace", 2, 0, "", -165},
		{"six-hearts-own-ace-external-opening", "king-overtakes-on-external-lead", 0, 3, "deal:1:trick:1", -165},
		{"six-hearts-own-ace-owner-opening", "king-opening-with-no-external-giver", 0, -1, "", -165},
		{"six-low-hearts-short-side-suits", "exhaust-two-clubs-then-discard-king", 3, 0, "", -175},
	}
	for _, c := range cases {
		for _, variant := range Variants {
			t.Run(c.fixture+"/"+c.witness+"/"+variant, func(t *testing.T) {
				f := kingAuthoredFixture(t, c.fixture)
				var plays []string
				for _, w := range f.Witnesses {
					if w.ID == c.witness {
						plays = w.Plays
					}
				}
				if len(plays) == 0 {
					t.Fatal("missing literal witness")
				}
				s := kingAuthoredReplay(t, f, variant, plays)
				trick := s.Tricks[len(s.Tricks)-1]
				if trick.Winner != c.captor {
					t.Fatal("literal captor changed")
				}
				bonusCount, captureCost := 0, 0
				for _, e := range s.Ledger {
					if e.Trick == trick.Number && e.Recipient.Kind == "seat" && e.Recipient.Seat != nil && *e.Recipient.Seat == c.captor && e.Delta < 0 {
						captureCost += e.Delta
					}
					if e.Card != "HK" || e.Component != "double-bonus" {
						continue
					}
					bonusCount++
					if e.Delta != 75 {
						t.Fatal("king bonus changed")
					}
					if partners(variant) {
						want := "NS"
						if c.captor%2 == 0 {
							want = "EW"
						}
						if e.Recipient.Kind != "competitor" || e.Recipient.Competitor != want || e.LeadSourceRef != "" {
							t.Fatal("team bonus must go directly to the opposite team")
						}
					} else if c.soloBonus < 0 || e.Recipient.Kind != "seat" || e.Recipient.Seat == nil || *e.Recipient.Seat != c.soloBonus || e.LeadSourceRef != c.source {
						t.Fatal("literal Solo bonus recipient or external giver changed")
					}
				}
				wantCost := -150
				if strings.HasPrefix(variant, "complex") {
					wantCost = c.complexCaptureCost
				}
				if captureCost != wantCost {
					t.Fatalf("capturing trick components = %d, want %d", captureCost, wantCost)
				}
				withheld := 0
				for _, w := range s.WithheldBonuses {
					if w.Card == "HK" && w.BonusValue == 75 && w.Reason == "no_previous_external_leader" {
						withheld++
					}
				}
				if !partners(variant) && c.soloBonus == -1 {
					if bonusCount != 0 || withheld != 1 {
						t.Fatal("opening self-capture must withhold exactly one king bonus")
					}
				} else if bonusCount != 1 || withheld != 0 {
					t.Fatal("king bonus must be credited exactly once")
				}
			})
		}
	}
}

func TestKingScenarioAuthoredPartnerReturnPublicEvidence(t *testing.T) {
	f := kingAuthoredFixture(t, "six-low-hearts-outside-ace-east")
	var plays []string
	for _, w := range f.Witnesses {
		if w.ID == "partner-return-to-publicly-known-void" {
			plays = w.Plays
		}
	}
	if len(plays) != 12 {
		t.Fatal("missing three-trick partner return witness")
	}
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		s := kingAuthoredReplay(t, f, variant, plays[:8])
		o := Observe(s, 2)
		if s.Turn != 2 || len(o.Trick) != 0 || len(o.Tricks) != 2 {
			t.Fatal("North did not gain the lead after the two public diamond tricks")
		}
		voids := publicVoids(o)
		if !voids[0]['D'] || !voids[1]['D'] {
			t.Fatal("partner and West diamond voids must follow from public discards")
		}
		if holder, known := publicHolder(o, "HK"); !known || holder != 0 || !isDoubled(o, "HK") {
			t.Fatal("North must know partner's doubled King from its public declaration")
		}
		higher := remainingHigher(o, "D3")
		if !reflect.DeepEqual(higher, []string{"D5", "D6"}) {
			t.Fatalf("unexpected outside diamonds %v", higher)
		}
		for _, card := range higher {
			if !reflect.DeepEqual(possibleHolders(o, card), []int{3}) {
				t.Fatalf("%s was not publicly constrained to East", card)
			}
		}
		// Public ownership and void facts establish the exit. The partner's
		// choice to discard HK remains voluntary; the two earlier tricks are
		// an authored reachable history, not a proved optimal signaling plan.
		for _, eastFollow := range higher {
			branch := s
			for _, card := range []string{"D3", "S6", "HK", eastFollow} {
				var err error
				branch, err = Apply(branch, branch.Turn, Action{Kind: "play-card", Card: card})
				if err != nil {
					t.Fatal(err)
				}
			}
			if branch.Tricks[2].Winner != 3 {
				t.Fatal("publicly constrained diamond exit did not give East the King")
			}
		}
	}
}

func TestKingScenarioAuthoredTrapTailInvariant(t *testing.T) {
	f := kingAuthoredFixture(t, "six-low-hearts-outside-ace-east")
	w := f.Witnesses[1]
	s := kingAuthoredReplay(t, f, "basic-solo", w.Plays[:36])
	if len(s.Tricks) != 9 || s.Turn != 0 || !reflect.DeepEqual(s.Hands[0], []string{"H4", "H5", "H6", "HK"}) {
		t.Fatal("authored trap did not reach its four-heart lead")
	}
	assertTrap := func(state State) {
		t.Helper()
		for seat, hand := range state.Hands {
			for _, card := range hand {
				if (seat == 0) != (card[0] == 'H') {
					t.Fatal("only the king holder must retain hearts in this trap")
				}
			}
		}
	}
	assertTrap(s)
	// Exhaust every legal combination in the next trick. Every branch gives
	// seat zero the lead again and preserves the same shrinking invariant.
	// Hence the holder eventually captures HK under every remaining play order;
	// individual actions need not be forced and the opening was not proved bad.
	completed := 0
	var visit func(State)
	visit = func(state State) {
		if len(state.Tricks) == 10 {
			completed++
			if state.Tricks[9].Winner != 0 || state.Turn != 0 {
				t.Fatal("a heart-void seat overtook the only remaining heart holder")
			}
			assertTrap(state)
			return
		}
		for _, action := range Legal(Observe(state, state.Turn)) {
			next, err := Apply(state, state.Turn, action)
			if err != nil {
				t.Fatal(err)
			}
			visit(next)
		}
	}
	visit(s)
	if completed != 256 {
		t.Fatalf("authored next-trick branch count = %d, want 256", completed)
	}
}
