package trix

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"sort"
	"testing"
)

func jacksTimingFixture(t *testing.T, id, variant string) State {
	t.Helper()
	fixtures, _ := jacksEndingFixtures(t)
	for _, f := range fixtures {
		if f.ID == id {
			return jacksEndingReplayFixture(t, f, variant)
		}
	}
	t.Fatal("unknown timing fixture", id)
	return State{}
}

// Catches wrong score units, root/profile pairing, and a timing recorder that
// mistakes board availability for actual placement. Literal awards come from
// the existing hand-checked forced prefix, independently of the new sampler.
func TestJacksTimingForcedFinishAndAtomicBudgets(t *testing.T) {
	s := jacksTimingFixture(t, "forced-five-card-release", "complex-partners")
	o := Observe(s, s.Turn)
	c := DefaultJacksTimingConfig()
	c.WorldsPerStream = 2
	got, err := EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || got.Status != "completed" || !got.SamplingComplete || len(got.Rows) != 4 || got.UniqueAllocations != 1 || got.RepeatedSamples != 3 || got.Work.Worlds != 4 {
		t.Fatalf("forced sampling: %+v %v", got, err)
	}
	stepsPerRow := 0
	for i, row := range got.Rows {
		if row.Stream != got.Streams[i/2] || row.Ordinal != i%2+1 || len(row.Profiles) != len(c.Profiles) {
			t.Fatal("lost stream identity or complete profile pairing")
		}
		for pi, profile := range row.Profiles {
			if profile.ProfileID != c.Profiles[pi].ID || len(profile.Roots) != 2 {
				t.Fatal("lost root/profile pairing")
			}
			for _, root := range profile.Roots {
				want := 250
				if root.CandidateID == "layout:CK" {
					want = 150
				}
				if root.TeamPoints == nil || *root.TeamPoints != want || root.ObjectivePoints != want || root.OwnPoints != 100 || root.Margin != float64(2*want-500) || root.UnforcedFutureDecisions != 0 {
					t.Fatalf("literal forced awards changed: %+v", root)
				}
				for _, release := range root.ReleaseTimes {
					if release.PlacementOffset <= release.FirstPlayableOffset {
						t.Fatal("availability confused with placement")
					}
				}
				if i == 0 {
					stepsPerRow += len(root.Turns)
				}
			}
		}
	}
	for _, limit := range []int{stepsPerRow - 1, stepsPerRow + 1} {
		limited := c
		limited.MaxSteps = limit
		partial, e := EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), limited)
		wantRows := 0
		if limit > stepsPerRow {
			wantRows = 1
		}
		if e != nil || partial.Status != "incomplete" || partial.SamplingComplete || len(partial.Rows) != wantRows || partial.Work.Steps != limit || partial.Work.Worlds != wantRows {
			t.Fatalf("published a partly paired world: %+v %v", partial, e)
		}
		if wantRows == 1 && !reflect.DeepEqual(partial.Rows[0], got.Rows[0]) {
			t.Fatal("completed prefix changed on exhaustion")
		}
	}
}

// Catches a per-profile resample, hidden-world selector, changed continuation
// policy or sampled path absent from the independently enumerated native worlds.
func TestJacksTimingCommonWorldsMatchNativeOracle(t *testing.T) {
	s := jacksTimingFixture(t, "two-lower-upper", "basic-partners")
	o := Observe(s, 0)
	worlds := jacksEndingBruteWorlds(t, o)
	byDigest := map[string]State{}
	for _, world := range worlds {
		hands := world.Hands
		for seat := range hands {
			hands[seat] = append([]string{}, hands[seat]...)
			sort.Slice(hands[seat], func(i, j int) bool { return cardLess(hands[seat][i], hands[seat][j]) })
		}
		raw, _ := json.Marshal(hands)
		digest := sha256.Sum256(raw)
		byDigest[hex.EncodeToString(digest[:])] = world
	}
	c := DefaultJacksTimingConfig()
	c.WorldsPerStream = 8
	got, err := EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || got.Status != "completed" || got.UniqueAllocations < 2 {
		t.Fatalf("ambiguous native sampling failed: %+v %v", got, err)
	}
	for _, row := range got.Rows {
		world, ok := byDigest[row.AllocationDigest]
		if !ok {
			t.Fatal("sampled a native-incompatible allocation")
		}
		for pi, profile := range row.Profiles {
			for ri, root := range profile.Roots {
				branch := world
				for ti, turn := range root.Turns {
					view := Observe(branch, branch.Turn)
					action := Legal(o)[ri]
					if ti > 0 {
						action, err = DecideWithPolicy(view, c.Profiles[pi].Policies[branch.Turn])
					}
					if err != nil || turn.Seat != branch.Turn || !reflect.DeepEqual(turn.Action, action) || turn.LegalCount != len(Legal(view)) {
						t.Fatal("continuation did not use its actor observation", err)
					}
					branch, err = Apply(branch, branch.Turn, action)
					if err != nil {
						t.Fatal(err)
					}
				}
				if branch.Phase != "round-complete" || !reflect.DeepEqual(root.FinishOrder, branch.FinishOrder) || root.Margin != evaluationScore(branch, o.Seat) {
					t.Fatal("sampled root differs from independent native replay")
				}
			}
		}
	}
	// Profile order cannot select different hidden worlds for the same ordinal.
	c.Profiles[0], c.Profiles[2] = c.Profiles[2], c.Profiles[0]
	reordered, err := EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || len(reordered.Rows) != len(got.Rows) {
		t.Fatal(err)
	}
	for i, row := range reordered.Rows {
		if row.AllocationDigest != got.Rows[i].AllocationDigest || !reflect.DeepEqual(row.Profiles[0], got.Rows[i].Profiles[2]) {
			t.Fatal("profile order changed common worlds")
		}
	}
}

// These fixtures exchange the actual partner's low card and ace without
// changing the actor's information. Their differing real hands must not seed
// evaluation. Also protects session-ID invariance and input immutability.
func TestJacksTimingHiddenWorldAndIdentityInvariance(t *testing.T) {
	c := DefaultJacksTimingConfig()
	c.WorldsPerStream = 2
	var first JacksTimingResult
	for i, id := range []string{"partner-zero-twos-lower", "partner-zero-twos-ace"} {
		s := jacksTimingFixture(t, id, "basic-partners")
		o := Observe(s, 0)
		before, _ := json.Marshal(o)
		result, err := EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), c)
		after, _ := json.Marshal(o)
		if err != nil || string(before) != string(after) || result.Status != "completed" {
			t.Fatal("input mutated or rejected", err)
		}
		if i == 0 {
			first = result
		} else if !reflect.DeepEqual(first, result) {
			t.Fatal("concealed fixture holdings or session identity affected evaluation")
		}
	}
}

// Initial C3 parity alone misses the benefit. Protect later D3/H3/S3 before
// CK and the +100 team points under Ownership continuations on every sample.
func TestJacksTimingPreservesAllTwosLaterReleaseBenefit(t *testing.T) {
	s := jacksTimingFixture(t, "partner-all-twos", "complex-partners")
	c := DefaultJacksTimingConfig()
	c.WorldsPerStream = 3
	got, err := EvaluateJacksTiming(context.Background(), Observe(s, 0), Pin("complex-partners"), c)
	if err != nil || got.Status != "completed" {
		t.Fatal(err)
	}
	for _, row := range got.Rows {
		for _, profile := range row.Profiles {
			for _, root := range profile.Roots {
				if root.CandidateID != "layout:C3" {
					continue
				}
				wantPoints, wantPath := 150, []string{"C3", "CK", "D3", "H3", "S3"}
				if profile.ProfileID == "ownership" {
					wantPoints, wantPath = 250, []string{"C3", "D3", "H3", "S3", "CK"}
				}
				path := []string{}
				for _, turn := range root.Turns {
					if turn.Seat == 0 && turn.Action.Kind == "layout-card" {
						path = append(path, turn.Action.Card)
					}
				}
				if root.ObjectivePoints != wantPoints || root.OwnPoints != 100 || !reflect.DeepEqual(path, wantPath) {
					t.Fatalf("positive later-turn mechanism changed: %s %+v", profile.ProfileID, root)
				}
			}
		}
	}
}

func TestJacksTimingScopeValidationAndCancellation(t *testing.T) {
	s := jacksTimingFixture(t, "forced-five-card-release", "basic-partners")
	o := Observe(s, 0)
	c := DefaultJacksTimingConfig()
	c.MaxSamplerOperations = 1
	got, err := EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), c)
	if err != nil || got.Status != "incomplete" || len(got.Rows) != 0 || got.Work.SamplerOperations > 1 {
		t.Fatal("sampler cap lost", err)
	}
	c = DefaultJacksTimingConfig()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if got, err = EvaluateJacksTiming(ctx, o, Pin(o.VariantID), c); err != context.Canceled || got.SamplingComplete || len(got.Rows) > 0 {
		t.Fatal("cancellation lost", err)
	}
	if _, err = EvaluateJacksTiming(nil, o, Pin(o.VariantID), c); err == nil {
		t.Fatal("accepted nil context")
	}
	if _, err = EvaluateJacksTiming(context.Background(), o, AnnouncedPin(o.VariantID), c); err == nil {
		t.Fatal("accepted wrong exact pin")
	}
	malformed := o
	malformed.Hand = append([]string{}, o.Hand...)
	malformed.Hand[0] = ""
	if _, err = EvaluateJacksTiming(context.Background(), malformed, Pin(o.VariantID), c); err == nil {
		t.Fatal("accepted malformed actor card")
	}
	legacy := o
	legacy.LayoutHistory = nil
	legacy.publicSchemaVersion = "1.1.0"
	if got, err = EvaluateJacksTiming(context.Background(), legacy, AnnouncedPin(o.VariantID), c); err != nil || got.Status != "outside-scope" || got.SamplingComplete {
		t.Fatal("silently invented legacy chronology", err)
	}
	for _, mutate := range []func(*JacksTimingConfig){
		func(c *JacksTimingConfig) { c.WorldsPerStream = 0 },
		func(c *JacksTimingConfig) { c.WorldsPerStream = 129 },
		func(c *JacksTimingConfig) { c.MaxSteps = 2000001 },
		func(c *JacksTimingConfig) { c.Profiles[0].Policies[0] = "oracle" },
		func(c *JacksTimingConfig) { c.Profiles[1].ID = c.Profiles[0].ID },
	} {
		bad := DefaultJacksTimingConfig()
		mutate(&bad)
		if _, err = EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), bad); err == nil {
			t.Fatal("accepted malformed bounded configuration")
		}
	}
}

func TestJacksTimingRejectsMalformedCardBeforeHistoryReplay(t *testing.T) {
	s, err := New(Config{ID: "timing-bad-card", Variant: "basic-partners", ProfileVersion: "1.1.0", LayoutHistoryVersion: "1.0.0"}, shuffledTestDeck(7))
	if err != nil {
		t.Fatal(err)
	}
	s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
	if err != nil {
		t.Fatal(err)
	}
	for steps := 0; steps < 100 && s.Phase == "layout"; steps++ {
		actor := s.Turn
		action := Legal(Observe(s, actor))[0]
		s, err = Apply(s, actor, action)
		if err != nil {
			t.Fatal(err)
		}
		if action.Kind == "layout-pass" {
			o := Observe(s, actor)
			o.Hand[0] = ""
			if _, err := EvaluateJacksTiming(context.Background(), o, Pin(o.VariantID), DefaultJacksTimingConfig()); err == nil {
				t.Fatal("accepted malformed current card at a public pass")
			}
			return
		}
	}
	t.Fatal("fixture failed to reach a public pass")
}

// A sampled study must actually cover larger positions, while retaining the
// individual objective for Solo. Exact endings deliberately stop at 12 cards.
func TestJacksTimingLargerCurrentPositionsAndSoloObjective(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			config := Config{ID: "timing-large", Variant: variant, LayoutHistoryVersion: "1.0.0"}
			if partners(variant) {
				config.ProfileVersion = "1.1.0"
			}
			s, err := New(config, shuffledTestDeck(7))
			if err != nil {
				t.Fatal(err)
			}
			s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
			if err != nil {
				t.Fatal(err)
			}
			c := DefaultJacksTimingConfig()
			c.WorldsPerStream = 1
			c.Profiles = []JacksEndingProfile{{ID: "baseline", Policies: [4]string{PolicyID, PolicyID, PolicyID, PolicyID}}}
			o := Observe(s, s.Turn)
			got, err := EvaluateJacksTiming(context.Background(), o, Pin(variant), c)
			if err != nil || got.Status != "completed" || len(got.Rows) != 2 {
				t.Fatalf("larger-than-ending scope failed: %+v %v", got.Work, err)
			}
			for _, row := range got.Rows {
				for _, root := range row.Profiles[0].Roots {
					if partners(variant) {
						if got.Objective != "combined-team-request-points" || root.TeamPoints == nil || root.ObjectivePoints != root.SeatPoints[o.Seat]+root.SeatPoints[(o.Seat+2)%4] {
							t.Fatal("lost Partners objective")
						}
					} else if got.Objective != "own-request-points" || root.TeamPoints != nil || root.PartnerPoints != nil || root.ObjectivePoints != root.SeatPoints[o.Seat] {
						t.Fatal("Solo acquired a partner objective")
					}
				}
			}
		})
	}
}
