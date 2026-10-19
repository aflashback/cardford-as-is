package trix

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

const ownershipTestPolicy = "trix-ownership-1.0.0"

func ownershipOpening(t *testing.T, variant, profile string, chronology bool, cards [4][]string) State {
	t.Helper()
	config := Config{ID: "ownership-native", Variant: variant, ProfileVersion: profile}
	if chronology {
		config.LayoutHistoryVersion = "1.0.0"
	}
	s, err := New(config, reasoningNativeDeck(cards))
	if err != nil {
		t.Fatal(err)
	}
	s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestTrixOwnershipNativeOpeningConstraints(t *testing.T) {
	for _, tc := range []struct {
		name        string
		cards       [4][]string
		assignments int
		owners      []int
		min, max    [4]int
	}{
		{"announced zero and own elimination", [4][]string{{"H7", "C2", "D2", "H2"}, {"S2"}, {}, {}}, 1, []int{1}, [4]int{3, 1, 0, 0}, [4]int{3, 1, 0, 0}},
		{"counts leave two suit assignments", [4][]string{{"H7", "C2", "D2"}, {"H2"}, {}, {"S2"}}, 2, []int{1, 3}, [4]int{2, 1, 0, 1}, [4]int{2, 1, 0, 1}},
		{"suppressed zero actor ambiguous", [4][]string{{"H7"}, {}, {"C2", "D2", "H2", "S2"}, {}}, 17, []int{1, 2, 3}, [4]int{0, 0, 0, 0}, [4]int{0, 4, 4, 4}},
		{"suppressed all four actor", [4][]string{{"H7", "C2", "D2", "H2", "S2"}, {}, {}, {}}, 1, []int{0}, [4]int{4, 0, 0, 0}, [4]int{4, 0, 0, 0}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := ownershipOpening(t, "complex-partners", "1.1.0", true, tc.cards)
			trace, err := BuildDecisionTrace(Observe(s, 0), ownershipTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			e := trace.OwnershipEvidence
			if e.Assignments != tc.assignments || !reflect.DeepEqual(e.Twos[3].OriginalOwners, tc.owners) || e.OriginalCountMin != tc.min || e.OriginalCountMax != tc.max || e.RemainingCountMin != tc.min || e.RemainingCountMax != tc.max {
				t.Fatalf("incorrect original-count support: %+v", e)
			}
		})
	}
}

func TestTrixOwnershipNativePrefixIdentifiesSuppressedTeam(t *testing.T) {
	for _, tc := range []struct {
		name  string
		cards [4][]string
		team  int
	}{
		{"partner", [4][]string{{"H7"}, {}, {"C2", "D2", "H2", "S2"}, {}}, 0},
		{"opponents", [4][]string{{"H7"}, {"C2", "D2"}, {}, {"H2", "S2"}}, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := ownershipOpening(t, "basic-partners", "1.1.0", true, tc.cards)
			before := Observe(s, 0)
			for step := 0; step < 208 && s.Phase == "layout"; step++ {
				a := Legal(Observe(s, s.Turn))[0]
				var err error
				s, err = Apply(s, s.Turn, a)
				if err != nil {
					t.Fatal(err)
				}
				if a.Kind != "layout-card" || rank(a.Card) != 2 {
					continue
				}
				o := Observe(s, 0)
				if err = ValidateLayoutHistoryObservation(o); err != nil {
					t.Fatal(err)
				}
				e, err := fourTwosOwnership(o)
				if err != nil {
					t.Fatal(err)
				}
				for _, two := range e.Twos {
					for _, owner := range two.OriginalOwners {
						if owner%2 != tc.team {
							t.Fatalf("public two failed to identify team: %+v", e)
						}
					}
					if two.Played && len(two.PossibleHolders) != 0 {
						t.Fatal("played two still held")
					}
				}
				initial, err := fourTwosOwnership(before)
				if err != nil || initial.Assignments != 17 {
					t.Fatalf("later public play leaked into frozen prefix: %+v %v", initial, err)
				}
				return
			}
			t.Fatal("native prefix never played a two")
		})
	}
}

func TestTrixOwnershipNativeOriginalTwosSurvivePlayingThem(t *testing.T) {
	s := ownershipOpening(t, "basic-partners", "1.1.0", true, [4][]string{{"H7", "C2", "H2", "SA"}, {}, {"D2", "S2"}, {}})
	for step := 0; step < 208 && s.Phase == "layout"; step++ {
		legal := Legal(Observe(s, s.Turn))
		a := legal[0]
		if s.Turn == 0 {
			for _, candidate := range legal {
				if candidate.Card != "SA" {
					a = candidate
					break
				}
			}
		}
		var err error
		s, err = Apply(s, s.Turn, a)
		if err != nil {
			t.Fatal(err)
		}
		if !boardHas(s.Board, "C2") || !boardHas(s.Board, "H2") {
			continue
		}
		e, err := fourTwosOwnership(Observe(s, 0))
		if err != nil {
			t.Fatal(err)
		}
		if e.OriginalCountMin[0] != 2 || e.OriginalCountMax[0] != 2 || e.RemainingCountMin[0] != 0 || e.RemainingCountMax[0] != 0 {
			t.Fatalf("current zero lost original ownership: %+v", e)
		}
		for _, two := range e.Twos {
			if two.Card == "C2" || two.Card == "H2" {
				if !two.Played || !reflect.DeepEqual(two.OriginalOwners, []int{0}) || len(two.PossibleHolders) != 0 {
					t.Fatalf("played ownership lost: %+v", two)
				}
			}
		}
		return
	}
	t.Fatal("native prefix did not play actor twos")
}

func TestTrixOwnershipUnknownAndHistoricalFallback(t *testing.T) {
	for _, tc := range []struct {
		name, variant, profile string
		history, unknown       bool
	}{
		{"legacy", "basic-partners", "", false, false},
		{"unknown with chronology", "basic-partners", "1.1.0", true, true},
		{"solo", "basic-solo", "", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := ownershipOpening(t, tc.variant, tc.profile, tc.history, [4][]string{{"H7", "C2", "D2", "H2"}, {}, {"S2"}, {}})
			o := Observe(s, 0)
			if tc.unknown {
				o.publicSchemaVersion = ""
				if _, err := BuildDecisionTrace(o, ownershipTestPolicy); err == nil {
					t.Fatal("untrusted profile admitted ownership policy")
				}
				return
			}
			old, err := BuildDecisionTrace(o, HistoryPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			trace, err := BuildDecisionTrace(o, ownershipTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			if trace.OwnershipEvidence.Eligible || !reflect.DeepEqual(trace.Candidates, old.Candidates) || !actionsEqual(trace.Action, old.Action) {
				t.Fatal("fallback borrowed ownership deductions")
			}
			if err = ValidateDecisionTrace(o, trace); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestTrixOwnershipKnownContradictionsFailClosed(t *testing.T) {
	s := ownershipOpening(t, "basic-partners", "1.1.0", false, [4][]string{{"H7", "C2", "D2", "H2"}, {"S2"}, {}, {}})
	for _, tc := range []struct {
		name   string
		mutate func(*Observation)
	}{
		{"five twos", func(o *Observation) { (*o.TwoAnnouncements.Counts)[0] = 5 }},
		{"displayed one-team four", func(o *Observation) { *o.TwoAnnouncements.Counts = [4]int{4, 0, 0, 0} }},
		{"own cards exceed original count", func(o *Observation) { *o.TwoAnnouncements.Counts = [4]int{2, 2, 0, 0} }},
		{"revealed too soon", func(o *Observation) {
			o.TwoAnnouncements = &TwoAnnouncements{Status: "revealed", Cards: []Play{{0, "C2"}, {0, "D2"}, {0, "H2"}, {1, "S2"}}}
		}},
		{"pass conflicts own two", func(o *Observation) {
			o.Passes = []LayoutPass{{Seat: 0, Board: []Row{{"C", 3, 11}, {"D", 0, 0}, {"H", 0, 0}, {"S", 0, 0}}, Ref: "forged"}}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			o := Observe(s, 0)
			tc.mutate(&o)
			if _, err := BuildDecisionTrace(o, ownershipTestPolicy); err == nil {
				t.Fatal("contradictory evidence admitted")
			}
		})
	}
}

func TestTrixOwnershipSavedEvidenceAndCoach(t *testing.T) {
	s := ownershipOpening(t, "basic-partners", "1.1.0", true, [4][]string{{"H7", "C2", "D2", "H2"}, {}, {"S2"}, {}})
	o := Observe(s, 0)
	trace, err := BuildDecisionTrace(o, ownershipTestPolicy)
	if err != nil {
		t.Fatal(err)
	}
	message, err := BuildCoachMessage(trace, "ownership-test")
	if err != nil || message.SelectedAction != trace.SelectedCandidateID || message.CueVersion != OwnershipCueVersion {
		t.Fatalf("saved coach differs: %+v %v", message, err)
	}
	for _, change := range []func(*DecisionTrace){
		func(t *DecisionTrace) { t.OwnershipEvidence.Assignments++ },
		func(t *DecisionTrace) { t.OwnershipEvidence.Twos[3].PossibleHolders = []int{1} },
		func(t *DecisionTrace) { t.OwnershipEvidence.OriginalCountMin[0] = 0 },
		func(t *DecisionTrace) { t.OwnershipEvidence = nil },
		func(t *DecisionTrace) { t.PolicyID = HistoryPolicyID },
	} {
		raw, _ := json.Marshal(trace)
		var wrong DecisionTrace
		json.Unmarshal(raw, &wrong)
		change(&wrong)
		if ValidateDecisionTraceWithPin(o, wrong, Pin(o.VariantID)) == nil {
			t.Fatal("tampered ownership accepted")
		}
	}
	for _, policy := range []string{ReasoningPolicyID, HistoryPolicyID, FrontierPolicyID} {
		old, err := BuildDecisionTrace(o, policy)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(old)
		if strings.Contains(string(raw), "ownershipEvidence") {
			t.Fatal("new evidence leaked into older policy")
		}
		if err = ValidateDecisionTraceWithPin(o, old, Pin(o.VariantID)); err != nil {
			t.Fatal(err)
		}
	}
	observationJSON, _ := json.Marshal(o)
	var parsed Observation
	if err = json.Unmarshal(observationJSON, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.publicSchemaVersion != "" {
		t.Fatal("packet unexpectedly serialized internal profile")
	}
	if _, err = BuildDecisionTrace(parsed, ownershipTestPolicy); err == nil {
		t.Fatal("parsed packet invented profile for new selection")
	}
	if err = ValidateDecisionTraceWithPin(parsed, trace, Pin(o.VariantID)); err != nil {
		t.Fatalf("trusted pin cannot audit parsed frozen packet: %v", err)
	}
}

func TestTrixOwnershipNativeHiddenExchangePreservesActorTrace(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		first := frontierNativeGapState(t, variant, false)
		second := frontierNativeGapState(t, variant, true)
		if reflect.DeepEqual(first.Hands, second.Hands) {
			t.Fatal("fixture did not change private cards")
		}
		a, b := Observe(first, 0), Observe(second, 0)
		if !reflect.DeepEqual(a, b) {
			t.Fatal("fixture changed actor information")
		}
		left, err := BuildDecisionTrace(a, ownershipTestPolicy)
		if err != nil {
			t.Fatal(err)
		}
		right, err := BuildDecisionTrace(b, ownershipTestPolicy)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(left, right) {
			t.Fatal("unobserved hand exchange changed decision or evidence")
		}
	}
}

func TestTrixOwnershipNativeRetainsLastCardOpeningWeight(t *testing.T) {
	s := ownershipChoiceState(t, "basic-partners")
	for step := 0; step < 32 && s.Phase == "layout"; step++ {
		o := Observe(s, s.Turn)
		if s.Turn == 0 && o.HandCounts[2] == 1 && contains(o.Hand, "C3") {
			old, err := BuildDecisionTrace(o, HistoryPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			trace, err := BuildDecisionTrace(o, ownershipTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			for i, c := range trace.Candidates {
				if c.Action.Card == "C3" {
					if c.Value-old.Candidates[i].Value != 45 {
						t.Fatalf("last-card opening weight changed: old=%+v new=%+v", old.Candidates[i], c)
					}
					return
				}
			}
			t.Fatal("C3 is not legal at claimed ending")
		}
		legal := Legal(o)
		a := legal[0]
		if s.Turn == 0 {
			for _, candidate := range legal {
				if candidate.Card != "C3" {
					a = candidate
					break
				}
			}
		}
		var err error
		s, err = Apply(s, s.Turn, a)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("native prefix missed partner last-card opening")
}

func TestTrixOwnershipNativeCompleteJacksCoachSanity(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners", "basic-solo", "complex-solo"} {
		t.Run(variant, func(t *testing.T) {
			config := Config{ID: "ownership-complete", Variant: variant, LayoutHistoryVersion: "1.0.0"}
			if partners(variant) {
				config.ProfileVersion = "1.1.0"
			}
			s, err := New(config, shuffledTestDeck(83))
			if err != nil {
				t.Fatal(err)
			}
			originalOwners := map[string]int{}
			for seat, hand := range s.Hands {
				for _, card := range hand {
					if rank(card) == 2 {
						originalOwners[card] = seat
					}
				}
			}
			before, err := BuildDecisionTrace(Observe(s, s.Turn), ownershipTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			history, err := BuildDecisionTrace(Observe(s, s.Turn), HistoryPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			if before.OwnershipEvidence.Eligible || !reflect.DeepEqual(before.Candidates, history.Candidates) {
				t.Fatal("ownership altered request phase")
			}
			s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
			if err != nil {
				t.Fatal(err)
			}
			for step := 0; step < 208 && s.Phase == "layout"; step++ {
				o := Observe(s, s.Turn)
				trace, err := BuildDecisionTrace(o, ownershipTestPolicy)
				if err != nil {
					t.Fatal(err)
				}
				// The private native hands are test-only truth. Every real prefix,
				// including late passes and shrinking capacities, must retain it.
				for _, two := range trace.OwnershipEvidence.Twos {
					originalRetained, currentRetained := false, false
					for _, seat := range two.OriginalOwners {
						if seat == originalOwners[two.Card] {
							originalRetained = true
						}
					}
					for _, seat := range two.PossibleHolders {
						if seat == originalOwners[two.Card] {
							currentRetained = true
						}
					}
					if !originalRetained || (!two.Played && !currentRetained) || (two.Played && len(two.PossibleHolders) != 0) {
						t.Fatalf("excluded native owner at turn%d: %+v", step, two)
					}
				}
				if trace.OwnershipEvidence.Eligible {
					for seat, hand := range s.Hands {
						held := 0
						for _, card := range hand {
							if rank(card) == 2 {
								held++
							}
						}
						if held < trace.OwnershipEvidence.RemainingCountMin[seat] || held > trace.OwnershipEvidence.RemainingCountMax[seat] {
							t.Fatalf("excluded actual remaining count at turn%d seat%d", step, seat)
						}
					}
				}
				if err = ValidateDecisionTraceWithPin(o, trace, Pin(variant)); err != nil {
					t.Fatal(err)
				}
				message, err := BuildCoachMessage(trace, "ownership-complete")
				if err != nil || message.SelectedAction != trace.SelectedCandidateID {
					t.Fatalf("coach parity failure: %v", err)
				}
				if _, err = BuildAdviceFromTrace(trace, "ownership-complete"); err != nil {
					t.Fatal(err)
				}
				s, err = Apply(s, s.Turn, trace.Action)
				if err != nil {
					t.Fatal(err)
				}
			}
			if s.Phase != "round-complete" || len(s.FinishOrder) != 4 {
				t.Fatalf("Jacks did not complete: %s", s.Phase)
			}
			total := 0
			for _, score := range Observe(s, 0).RequestTotals {
				total += score.Total
			}
			if total != 500 {
				t.Fatalf("wrong native finish total %d", total)
			}
		})
	}
}

func ownershipChoiceState(t *testing.T, variant string) State {
	t.Helper()
	own := []string{"C3", "D3", "D2", "H2", "S2"}
	for _, card := range Deck() {
		if card[0] == 'H' && rank(card) >= 4 && rank(card) <= 11 {
			own = append(own, card)
		}
	}
	partner := []string{"C2", "D4"}
	for _, card := range Deck() {
		if card[0] == 'C' && rank(card) >= 4 {
			partner = append(partner, card)
		}
	}
	s := ownershipOpening(t, variant, "1.1.0", true, [4][]string{own, {}, partner, {}})
	for step := 0; step < 208 && s.Phase == "layout"; step++ {
		o := Observe(s, s.Turn)
		legal := Legal(o)
		if s.Turn == 0 && placeable(o.Board, "C3") && placeable(o.Board, "D3") {
			return s
		}
		a := legal[0]
		if s.Turn == 0 {
			for _, candidate := range legal {
				if candidate.Card != "C3" && candidate.Card != "D3" && candidate.Card != "D2" {
					a = candidate
					break
				}
			}
		}
		if s.Turn == 2 {
			for _, candidate := range legal {
				if candidate.Card == "D4" {
					a = candidate
					break
				}
			}
		}
		if s.Turn == 1 {
			for _, candidate := range legal {
				if candidate.Card == "H3" {
					a = candidate
					break
				}
			}
		}
		var err error
		s, err = Apply(s, s.Turn, a)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("native prefix did not reach lower-opening choice")
	return State{}
}

func TestTrixOwnershipNativeImmediateOpeningChangesChoice(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			s := ownershipChoiceState(t, variant)
			o := Observe(s, 0)
			old, err := BuildDecisionTrace(o, HistoryPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			trace, err := BuildDecisionTrace(o, ownershipTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			if old.SelectedCandidateID != "layout:D3" || trace.SelectedCandidateID != "layout:C3" || !trace.OwnershipEvidence.SelectedChanged {
				t.Fatalf("expected new public partner opening activation: old=%s new=%s candidates=%+v", old.SelectedCandidateID, trace.SelectedCandidateID, trace.Candidates)
			}
			for _, c := range trace.Candidates {
				if c.Action.Card == "C3" && c.Value != 8 {
					t.Fatalf("inherited opening weight changed: %+v", c)
				}
			}
			if err = ValidateDecisionTraceWithPin(o, trace, Pin(variant)); err != nil {
				t.Fatal(err)
			}
		})
	}
}

// A missing ownership-policy branch must fail on real native observations,
// before referring to new evidence Go types that have not been implemented.
func TestTrixOwnershipNativeSuppressedThreeProvesPartnerFourth(t *testing.T) {
	s := ownershipOpening(t, "basic-partners", "1.1.0", true, [4][]string{{"H7", "C2", "D2", "H2"}, {}, {"S2"}, {}})
	o := Observe(s, s.Turn)
	if o.Seat != 0 || o.TwoAnnouncements != nil {
		t.Fatal("fixture does not suppress one-team twos")
	}
	trace, err := BuildDecisionTrace(o, ownershipTestPolicy)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(trace)
	var saved struct {
		Ownership struct {
			Assignments int `json:"assignments"`
			Twos        []struct {
				Card    string `json:"card"`
				Owners  []int  `json:"originalOwners"`
				Holders []int  `json:"possibleHolders"`
			} `json:"twos"`
		} `json:"ownershipEvidence"`
	}
	if err = json.Unmarshal(raw, &saved); err != nil {
		t.Fatal(err)
	}
	if saved.Ownership.Assignments != 1 || len(saved.Ownership.Twos) != 4 {
		t.Fatalf("missing joint ownership evidence: %s", raw)
	}
	last := saved.Ownership.Twos[3]
	if last.Card != "S2" || !reflect.DeepEqual(last.Owners, []int{2}) || !reflect.DeepEqual(last.Holders, []int{2}) {
		t.Fatalf("suppressed fourth two was not proved to partner: %+v", last)
	}
}
