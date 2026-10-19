package trix

import (
	"context"
	"encoding/json"
	"reflect"
	"sort"
	"testing"
)

// Obtain the input through a full legal native prefix, never a manufactured
// small state. The fixture deal is private and is not an evaluator argument.
func jacksEndingTestPosition(t *testing.T, variant string) State {
	t.Helper()
	for seed := 1; seed <= 40; seed++ {
		config := Config{ID: "ending-native", Variant: variant, LayoutHistoryVersion: "1.0.0"}
		if partners(variant) {
			config.ProfileVersion = "1.1.0"
		}
		s, err := New(config, shuffledTestDeck(seed))
		if err != nil {
			t.Fatal(err)
		}
		s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
		if err != nil {
			t.Fatal(err)
		}
		for step := 0; step < maxLayoutTurns && s.Phase == "layout"; step++ {
			o := Observe(s, s.Turn)
			remaining, active := 0, 0
			for _, n := range o.HandCounts {
				remaining += n
				if n > 0 {
					active++
				}
			}
			if remaining <= 8 && active >= 3 && len(Legal(o)) >= 2 {
				return s
			}
			s, err = Apply(s, s.Turn, Legal(o)[0])
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	t.Fatal("no bounded native fixture found")
	return State{}
}

func TestJacksEndingNativeObjectivesAndTiming(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			s := jacksEndingTestPosition(t, variant)
			o := Observe(s, s.Turn)
			before, _ := json.Marshal(o)
			got, err := EvaluateJacksEnding(context.Background(), o, Pin(variant), DefaultJacksEndingConfig())
			if err != nil || got.Status != "completed" || len(got.Rows) == 0 || !got.EnumerationComplete {
				t.Fatalf("native ending: %+v %v", got, err)
			}
			if got.Work.Worlds != len(got.Rows) || len(got.CandidateIDs) != len(Legal(o)) {
				t.Fatal("incomplete legal/paired coverage")
			}
			for _, row := range got.Rows {
				if len(row.Profiles) != len(got.Configuration.Profiles) {
					t.Fatal("missing continuation profile")
				}
				for _, profile := range row.Profiles {
					if len(profile.Roots) != len(got.CandidateIDs) {
						t.Fatal("unpaired legal roots")
					}
					for i, root := range profile.Roots {
						if root.CandidateID != got.CandidateIDs[i] || len(root.FinishOrder) != 4 || root.SeatPoints[0]+root.SeatPoints[1]+root.SeatPoints[2]+root.SeatPoints[3] != 500 {
							t.Fatalf("native awards lost: %+v", root)
						}
						for finish, seat := range root.FinishOrder {
							if root.SeatPoints[seat] != 200-50*finish {
								t.Fatal("finish and native seat ledger disagree")
							}
						}
						if partners(variant) {
							want := root.SeatPoints[o.Seat] + root.SeatPoints[(o.Seat+2)%4]
							if root.TeamPoints == nil || *root.TeamPoints != want || root.ObjectivePoints != want || root.Margin != float64(2*want-500) {
								t.Fatal("team points confused with margin")
							}
						} else if root.TeamPoints != nil || root.PartnerPoints != nil || root.ObjectivePoints != root.SeatPoints[o.Seat] || root.Margin != float64(root.OwnPoints)-float64(500-root.OwnPoints)/3 {
							t.Fatal("Solo acquired partnership objective")
						}
						counts := o.HandCounts
						board := append([]Row{}, o.Board...)
						placed, passes := map[string]int{}, [4]int{}
						firstPlayable := map[string]int{}
						for _, card := range Deck() {
							if placeable(board, card) {
								firstPlayable[card] = 0
							}
						}
						for j, turn := range root.Turns {
							newlyPlayable := []string{}
							if turn.Offset != j+1 || counts[turn.Seat] == 0 {
								t.Fatal("turn offset or skipped finished seat changed")
							}
							if turn.Action.Kind == "layout-pass" {
								passes[turn.Seat]++
							} else {
								card := turn.Action.Card
								if !placeable(board, card) {
									t.Fatal("reported illegal placement")
								}
								counts[turn.Seat]--
								placed[card] = turn.Offset
								r := &board[suitIndex(card)]
								if r.Low == 0 {
									r.Low, r.High = 11, 11
								} else if rank(card) < r.Low {
									r.Low = rank(card)
								} else {
									r.High = rank(card)
								}
								for _, enabled := range Deck() {
									if _, known := firstPlayable[enabled]; !known && placeable(board, enabled) {
										firstPlayable[enabled] = turn.Offset
										newlyPlayable = append(newlyPlayable, enabled)
									}
								}
							}
							if turn.HandCountsAfter != counts {
								t.Fatal("reported count transition changed")
							}
							if !reflect.DeepEqual(turn.NewlyPlayable, newlyPlayable) {
								t.Fatal("immediate board enabling disagrees with placement")
							}
						}
						if counts != [4]int{} || passes != root.PassCounts {
							t.Fatal("lost passes or remaining cards")
						}
						if len(root.ReleaseTimes) != len(placed) {
							t.Fatal("missing card timing")
						}
						for _, release := range root.ReleaseTimes {
							if release.PlacementOffset != placed[release.Card] || release.FirstPlayableOffset != firstPlayable[release.Card] || release.PlacementOffset <= release.FirstPlayableOffset {
								t.Fatalf("unlock and placement conflated: %+v", release)
							}
						}
					}
				}
			}
			after, _ := json.Marshal(o)
			if string(before) != string(after) {
				t.Fatal("mutated actor observation")
			}
		})
	}
}

func TestJacksEndingCapsCancellationAndProfiles(t *testing.T) {
	s := jacksEndingTestPosition(t, "basic-partners")
	o := Observe(s, s.Turn)
	c := DefaultJacksEndingConfig()
	c.MaxSteps = 1
	got, err := EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || got.Status != "incomplete" || got.EnumerationComplete || len(got.Rows) != 0 || got.Work.Steps > 1 {
		t.Fatalf("partial allocation published: %+v %v", got, err)
	}
	c = DefaultJacksEndingConfig()
	c.MaxSamplerOperations = 1
	got, err = EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || got.Status != "incomplete" || got.Work.SamplerOperations > 1 {
		t.Fatalf("sampler cap lost: %+v %v", got, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	got, err = EvaluateJacksEnding(ctx, o, Pin(o.VariantID), DefaultJacksEndingConfig())
	if err != context.Canceled || got.Status != "incomplete" || len(got.Rows) != 0 {
		t.Fatal("cancellation lost", err)
	}
	c = DefaultJacksEndingConfig()
	c.Profiles[0].Policies[0] = "private-oracle"
	if _, err = EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), c); err == nil {
		t.Fatal("accepted unknown continuation")
	}
	if _, err = EvaluateJacksEnding(nil, o, Pin(o.VariantID), DefaultJacksEndingConfig()); err == nil {
		t.Fatal("accepted nil context")
	}
}

func TestJacksEndingIdentityAndScope(t *testing.T) {
	s := jacksEndingTestPosition(t, "complex-partners")
	o := Observe(s, s.Turn)
	a, err := EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), DefaultJacksEndingConfig())
	if err != nil {
		t.Fatal(err)
	}
	o.ID = "renamed-private-session"
	b, err := EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), DefaultJacksEndingConfig())
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("identity affected semantic comparison", err)
	}
	if _, err = EvaluateJacksEnding(context.Background(), o, AnnouncedPin(o.VariantID), DefaultJacksEndingConfig()); err == nil {
		t.Fatal("accepted changed exact pin")
	}
	historical := evaluationFixture(t, "basic-partners", "trix", 52)
	got, err := EvaluateJacksEnding(context.Background(), Observe(historical, historical.Turn), AnnouncedPin("basic-partners"), DefaultJacksEndingConfig())
	if err != nil || got.Status != "outside-scope" || len(got.Rows) != 0 {
		t.Fatal("historical chronology silently invented", err)
	}
}

// Independent enumeration intentionally uses no sampler masks, memo counts or
// reconstruction helpers: brute-force all capacity allocations, restore each
// publicly placed card, then start a native deal and replay its entire prefix.
func jacksEndingBruteWorlds(t *testing.T, o Observation) []State {
	t.Helper()
	unseen := []string{}
	for _, card := range Deck() {
		if !contains(o.Hand, card) && !boardHas(o.Board, card) {
			unseen = append(unseen, card)
		}
	}
	worlds := []State{}
	hands := [4][]string{}
	hands[o.Seat] = append([]string{}, o.Hand...)
	left := o.HandCounts
	left[o.Seat] = 0
	wanted, _ := json.Marshal(o)
	var visit func(int, [4][]string, [4]int)
	visit = func(index int, current [4][]string, available [4]int) {
		if index < len(unseen) {
			for seat := range current {
				if available[seat] == 0 {
					continue
				}
				next := current
				next[seat] = append(append([]string{}, current[seat]...), unseen[index])
				counts := available
				counts[seat]--
				visit(index+1, next, counts)
			}
			return
		}
		original := [4][]string{}
		for seat := range current {
			original[seat] = append([]string{}, current[seat]...)
		}
		for _, turn := range o.LayoutHistory.Turns {
			if turn.Kind == "layout-card" {
				original[turn.Seat] = append(original[turn.Seat], turn.Card)
			}
		}
		deck := []string{}
		for _, hand := range original {
			if len(hand) != 13 {
				t.Fatal("independent original hand conservation failed")
			}
			sort.Slice(hand, func(i, j int) bool { return cardLess(hand[i], hand[j]) })
			deck = append(deck, hand...)
		}
		config := Config{ID: o.ID, Variant: o.VariantID, LayoutHistoryVersion: "1.0.0"}
		if partners(o.VariantID) {
			config.ProfileVersion = "1.1.0"
		}
		s, err := New(config, deck)
		if err != nil {
			t.Fatal(err)
		}
		if s.Turn != o.Owner {
			return
		}
		s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
		if err != nil {
			t.Fatal(err)
		}
		for _, turn := range o.LayoutHistory.Turns {
			s, err = Apply(s, turn.Seat, Action{Kind: turn.Kind, Card: turn.Card})
			if err != nil {
				return
			}
		}
		actual, _ := json.Marshal(Observe(s, o.Seat))
		if string(actual) == string(wanted) {
			worlds = append(worlds, s)
		}
	}
	visit(0, hands, left)
	return worlds
}

func TestJacksEndingCompleteAllocationsAndNativePolicyOracle(t *testing.T) {
	s := jacksEndingTestPosition(t, "basic-partners")
	o := Observe(s, s.Turn)
	worlds := jacksEndingBruteWorlds(t, o)
	if len(worlds) < 2 {
		t.Fatalf("test requires ambiguous allocations, got %d", len(worlds))
	}
	c := DefaultJacksEndingConfig()
	result, err := EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || result.Status != "completed" || len(result.Rows) != len(worlds) {
		t.Fatalf("enumeration lost native worlds: brute %d got %+v %v", len(worlds), result, err)
	}
	for i, world := range worlds {
		if result.Rows[i].Ordinal != i+1 {
			t.Fatal("duplicate allocation identity")
		}
		for pi, profile := range c.Profiles {
			for ri, root := range Legal(o) {
				got := result.Rows[i].Profiles[pi].Roots[ri]
				if got.Turns[0].LegalCount != len(Legal(o)) {
					t.Fatal("root legal count changed")
				}
				branch, err := Apply(world, o.Seat, root)
				if err != nil {
					t.Fatal(err)
				}
				unforced, turn := 0, 1
				for branch.Phase != "round-complete" {
					seat := branch.Turn
					observed := Observe(branch, seat)
					legalCount := len(Legal(observed))
					if legalCount > 1 {
						unforced++
					}
					action, err := DecideWithPolicy(observed, profile.Policies[seat])
					if err != nil {
						t.Fatal(err)
					}
					if got.Turns[turn].LegalCount != legalCount || got.Turns[turn].Seat != seat || ActionID(got.Turns[turn].Action) != ActionID(action) {
						t.Fatal("future actor observation policy differs")
					}
					turn++
					branch, err = Apply(branch, seat, action)
					if err != nil {
						t.Fatal(err)
					}
				}
				if got.UnforcedFutureDecisions != unforced || !reflect.DeepEqual(got.FinishOrder, branch.FinishOrder) || got.Margin != evaluationScore(branch, o.Seat) || got.ResidualMargin != evaluationScore(branch, o.Seat)-evaluationScore(world, o.Seat) {
					t.Fatal("native policy/scoring oracle disagrees")
				}
			}
		}
	}
	c.MaxAllocations = 1
	limited, err := EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || limited.Status != "incomplete" || limited.EnumerationComplete || len(limited.Rows) != 1 || !reflect.DeepEqual(limited.Rows[0], result.Rows[0]) {
		t.Fatalf("completed prefix mislabeled or pairing lost: %+v %v", limited, err)
	}
	// Completing precisely the last feasible allocation must be distinguishable
	// from hitting the cap before another feasible allocation exists.
	c.MaxAllocations = len(worlds)
	exactCap, err := EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || exactCap.Status != "completed" || len(exactCap.Rows) != len(worlds) {
		t.Fatal("exact allocation cap did not complete", err)
	}
}

func TestJacksEndingAlreadyFinishedSeatRetainsAward(t *testing.T) {
	s := jacksEndingTestPosition(t, "basic-partners")
	for len(s.FinishOrder) == 0 {
		var err error
		s, err = Apply(s, s.Turn, Legal(Observe(s, s.Turn))[0])
		if err != nil {
			t.Fatal(err)
		}
	}
	winner := s.FinishOrder[0]
	o := Observe(s, s.Turn)
	result, err := EvaluateJacksEnding(context.Background(), o, Pin(o.VariantID), DefaultJacksEndingConfig())
	if err != nil || result.Status != "completed" {
		t.Fatal("finished-seat fixture failed", err)
	}
	for _, row := range result.Rows {
		for _, profile := range row.Profiles {
			for _, root := range profile.Roots {
				if root.FinishOrder[0] != winner || root.SeatPoints[winner] != 200 || root.SeatPoints[0]+root.SeatPoints[1]+root.SeatPoints[2]+root.SeatPoints[3] != 500 {
					t.Fatal("previously awarded finish discarded")
				}
			}
		}
	}
}
