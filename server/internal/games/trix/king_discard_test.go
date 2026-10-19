package trix

// CFL-14 is deliberately test-only. No runtime selector imports this comparison.
import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"reflect"
	"testing"
)

const kingDiscardVersion = "trix-king-discard-1.0.0"

// Both studies use the same public result schema. Only observations, semantic
// seed namespaces, scope, and continuation start position differ.
type kingDiscardCase = kingReturnCase
type kingDiscardProfile = kingReturnProfile
type kingDiscardConfig = kingReturnConfig
type kingDiscardRelease = kingReturnRelease
type kingDiscardRoot = kingReturnRoot
type kingDiscardProfileResult = kingReturnProfileResult
type kingDiscardSelection = kingReturnSelection
type kingDiscardWorld = kingReturnWorld
type kingDiscardResult = kingReturnResult

func kingDiscardConfiguration() kingDiscardConfig {
	c := kingReturnConfiguration()
	c.Streams = []string{"king-discard-primary", "king-discard-confirmation"}
	return c
}

func kingDiscardValidate(in kingDiscardCase) (Config, []Action, error) {
	o := in.Observation
	if in.CaseID == "" || len(in.CaseID) > 100 || o.GameID != "trix" || (o.VariantID != "basic-partners" && o.VariantID != "complex-partners") || in.RulePin != Pin(o.VariantID) {
		return Config{}, nil, fmt.Errorf("king discard requires a unique case identity and current exact Partners pin")
	}
	if len(o.ID) > 100 || o.ID == "" || o.Seat != 0 || o.Phase != "playing" || o.Turn == nil || *o.Turn != 0 || o.Owner < 0 || o.Owner > 3 || o.Kingdom != 1 || o.DealNumber != 1 || o.Request == nil || o.VariantID == "basic-partners" && *o.Request != "king" || o.VariantID == "complex-partners" && *o.Request != "complex" || len(o.Tricks) != 2 || len(o.Trick) != 2 || len(o.Hand) != 11 || o.HandCounts != [4]int{11, 10, 10, 11} {
		return Config{}, nil, fmt.Errorf("king discard requires South's third-trick discard observation")
	}
	if len(o.Declarations) != 4 || len(o.Board) != 4 || len(o.RemainingRequests) > 5 || len(o.Ledger) > 64 || len(o.WithheldBonuses) > 16 || len(o.Totals) > 4 || len(o.RequestTotals) > 4 || len(o.KingdomTotals) > 4 || len(o.Winners) > 4 || len(o.Passes) != 0 || len(o.FinishOrder) != 0 || o.TwoAnnouncements != nil {
		return Config{}, nil, fmt.Errorf("oversized or out-of-scope king discard public context")
	}
	// The fixed actor scope uses only literal own cards and public plays, never
	// original outside hands. A different position requires a new study version.
	if o.Owner != 3 || !reflect.DeepEqual(o.Hand, []string{"C3", "C4", "C5", "C6", "CA", "H2", "H3", "H4", "H5", "H6", "HK"}) ||
		!reflect.DeepEqual(o.Trick, []Play{{Seat: 2, Card: "D3"}, {Seat: 1, Card: "S6"}}) {
		return Config{}, nil, fmt.Errorf("unexpected fixed South actor hand or partial trick")
	}
	expected := []Trick{
		{Number: 1, Leader: 3, Winner: 3, Plays: []Play{{Seat: 3, Card: "DA"}, {Seat: 2, Card: "D8"}, {Seat: 1, Card: "S4"}, {Seat: 0, Card: "D2"}}},
		{Number: 2, Leader: 3, Winner: 2, Plays: []Play{{Seat: 3, Card: "D4"}, {Seat: 2, Card: "DK"}, {Seat: 1, Card: "S5"}, {Seat: 0, Card: "C2"}}},
	}
	if !reflect.DeepEqual(o.Tricks, expected) || in.ReferenceCandidateID != "play:CA" || in.AlternativeCandidateID != "play:HK" {
		return Config{}, nil, fmt.Errorf("unexpected public prefix or comparison roots")
	}
	for i, d := range o.Declarations {
		if d.Seat != 3-i || len(d.Ref) > 128 || (d.Seat == 0 && !reflect.DeepEqual(d.Cards, []string{"HK"})) || (d.Seat != 0 && len(d.Cards) != 0) {
			return Config{}, nil, fmt.Errorf("requires controlled public HK-only double declarations")
		}
	}
	config, err := evaluationProfile(in.RulePin, o)
	if err != nil {
		return Config{}, nil, err
	}
	if err = ValidateLayoutHistoryObservation(o); err != nil {
		return Config{}, nil, err
	}
	// Derive the remaining public metadata from the fixed public prefix. This
	// scaffold has card-count placeholders, not outside cards, and is never a
	// sampled world or a policy input. Scores use only already public tricks.
	public := State{Config: config, Phase: "playing", Turn: 0, Kingdom: 1, DealNumber: 1, Owner: 3,
		Request: *o.Request, Trick: o.Trick, Tricks: expected,
		Board:         []Row{{Suit: "C"}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}},
		LayoutHistory: &LayoutHistory{Version: "1.0.0", Status: "available", Turns: []LayoutTurn{}}}
	for _, r := range requests(o.VariantID) {
		if r != *o.Request {
			public.RemainingRequests = append(public.RemainingRequests, r)
		}
	}
	public.Hands[0] = o.Hand
	for seat := 1; seat < 4; seat++ {
		public.Hands[seat] = make([]string, o.HandCounts[seat])
	}
	for i := 0; i < 4; i++ {
		cards := []string{}
		if i == 3 {
			cards = []string{"HK"}
		}
		public.Declarations = append(public.Declarations, Declaration{Seat: 3 - i, Cards: cards, Ref: fmt.Sprintf("deal:1:declaration:%d", i+1)})
	}
	for _, tr := range expected {
		if tr.Leader != tr.Winner {
			public.LastExternalLeader[tr.Winner] = &LeadSource{Seat: tr.Leader, Trick: tr.Number}
		}
		scoreTrick(&public, tr)
	}
	want, _ := json.Marshal(Observe(public, 0))
	have, _ := json.Marshal(o)
	if string(want) != string(have) {
		return Config{}, nil, fmt.Errorf("unexpected fixed South public context")
	}
	legal := Legal(o)
	ids := map[string]bool{}
	for _, a := range legal {
		if a.Kind != "play-card" {
			return Config{}, nil, fmt.Errorf("non-play root")
		}
		ids[ActionID(a)] = true
	}
	if in.ReferenceCandidateID == in.AlternativeCandidateID || !ids[in.ReferenceCandidateID] || !ids[in.AlternativeCandidateID] {
		return Config{}, nil, fmt.Errorf("reference and alternative must be distinct legal roots")
	}
	return config, legal, nil
}

func kingDiscardContinuation(world State, root Action, profile kingDiscardProfile, meter *evaluationMeter) (kingDiscardRoot, error) {
	out := kingDiscardRoot{CandidateID: ActionID(root)}
	if err := meter.step(); err != nil {
		return out, err
	}
	branch, err := Apply(world, 0, root)
	if err != nil {
		return out, err
	}
	for branch.Phase != "round-complete" {
		if err = meter.step(); err != nil {
			return out, err
		}
		actor := branch.Turn
		a, e := DecideWithPolicy(Observe(branch, actor), profile.Policies[actor])
		if e != nil {
			return out, e
		}
		branch, err = Apply(branch, actor, a)
		if err != nil {
			return out, err
		}
	}
	// Reuse the native literal scoring/provenance oracle. Team bonuses are
	// competitor entries, so they are counted once, never once per teammate.
	finished := kingScenarioRun{}
	if err = kingScenarioFinish(&finished, branch); err != nil {
		return out, err
	}
	out.TeamPoints = finished.ObjectivePoints
	out.ComponentTotals = finished.ComponentTotals
	out.RequestTotals = finished.RequestTotals
	out.CompletedTricks = finished.CompletedTricks
	out.KingCapture = finished.KingCapture
	out.Ledger = finished.Ledger
	out.WithheldBonuses = finished.WithheldBonuses
	out.FirstTrick = branch.Tricks[len(world.Tricks)]
	for _, e := range branch.Ledger {
		if e.Card != "HK" || e.Component != "king" && e.Component != "double-bonus" {
			continue
		}
		if e.Recipient.Kind == "competitor" && e.Recipient.Competitor == "NS" || e.Recipient.Kind == "seat" && e.Recipient.Seat != nil && *e.Recipient.Seat%2 == 0 {
			out.KingNetPoints += e.Delta
		}
	}
	for _, tr := range branch.Tricks {
		for i, p := range tr.Plays {
			if p.Card == "HK" {
				ordinal := (tr.Number-1)*4 + i + 1
				out.KingRelease = kingDiscardRelease{p.Seat, tr.Number, ordinal, ordinal - (len(world.Tricks)*4 + len(world.Trick))}
			}
		}
	}
	return out, nil
}

// Only the strict actor observation and pin enter the sampler. Identity is
// normalized by evaluationDigest; case IDs and source-deal identities are not seeds.
func kingDiscardEvaluate(ctx context.Context, in kingDiscardCase, c kingDiscardConfig) (out kingDiscardResult, err error) {
	out = kingDiscardResult{CaseID: in.CaseID, ReferenceCandidateID: in.ReferenceCandidateID, AlternativeCandidateID: in.AlternativeCandidateID, ActorObservation: in.Observation, Version: kingDiscardVersion, Status: "incomplete", RulePin: in.RulePin, Objective: "combined-team-request-points", CandidateIDs: []string{}, Streams: append([]string{}, c.Streams...), Rows: []kingDiscardWorld{}, Limitations: []string{
		"Synthetic remaining allocations conditional on actor cards and public hard constraints, checked by full native public chronology replay; not actual hidden hands, calibrated behavioral beliefs or independent game origins.",
		"Both independently seeded streams sample with replacement; every legal root and fixed continuation profile shares each world. Future decisions receive only Observe(branch, actor).",
		"Complete means both fixed streams finished; incomplete output retains only fully paired worlds and supplies no ranking. No optimal-play, stronger-policy, acceptable-action or promotion label is established.",
		"Full combined NS request points are the objective. King net points include HK capture and its own double bonus; Complex costs and other declared-card bonuses remain separate ledger components.",
		"South sees a partial trick and cannot copy deductions from North's private cards. King capturer and future release timing are continuation outcomes, not actor-visible facts.",
	}}
	if ctx == nil {
		return out, fmt.Errorf("context required")
	}
	// Reduced world/budget counts are available only to bounded unit checks.
	fixed := kingDiscardConfiguration()
	if c.WorldsPerStream < 1 || c.WorldsPerStream > fixed.WorldsPerStream || c.MaxSamplerOperations < 1 || c.MaxSamplerOperations > fixed.MaxSamplerOperations || c.MaxSteps < 1 || c.MaxSteps > fixed.MaxSteps || !reflect.DeepEqual(c.Profiles, fixed.Profiles) || !reflect.DeepEqual(c.Streams, fixed.Streams) {
		return out, fmt.Errorf("invalid fixed king discard configuration")
	}
	config, legal, e := kingDiscardValidate(in)
	if e != nil {
		return out, e
	}
	for _, a := range legal {
		out.CandidateIDs = append(out.CandidateIDs, ActionID(a))
	}
	for _, profile := range c.Profiles {
		a, e := DecideWithPolicy(in.Observation, profile.Policies[in.Observation.Seat])
		if e != nil {
			return out, e
		}
		out.PolicySelections = append(out.PolicySelections, kingDiscardSelection{profile.ID, ActionID(a)})
	}
	digest := evaluationDigest(in.Observation, in.RulePin)
	out.InputDigest = hex.EncodeToString(digest[:])
	mc := DefaultRequestEvaluationConfig()
	mc.MaxSamplerOperations = c.MaxSamplerOperations
	mc.MaxSteps = c.MaxSteps
	meter := &evaluationMeter{ctx: ctx, config: mc, work: &out.Work}
	finish := func(e error) (kingDiscardResult, error) {
		if errors.Is(e, errEvaluationBudget) || errors.Is(e, context.Canceled) || errors.Is(e, context.DeadlineExceeded) {
			out.Limitations = append(out.Limitations, e.Error())
			return out, nil
		}
		return out, e
	}
	sampler, e := newEvaluationSampler(in.Observation, config, meter)
	if e != nil {
		return finish(e)
	}
	unique := map[string]bool{}
	for _, stream := range c.Streams {
		for ordinal := 0; ordinal < c.WorldsPerStream; ordinal++ {
			seed := sha256.Sum256(append(digest[:], []byte(fmt.Sprintf("/%s/%s/%d", kingDiscardVersion, stream, ordinal))...))
			rng := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:16])))
			world, e := sampler.world(rng)
			if e != nil {
				return finish(e)
			}
			raw, e := json.Marshal(world.Hands)
			if e != nil {
				return out, e
			}
			hash := sha256.Sum256(raw)
			identity := hex.EncodeToString(hash[:])
			row := kingDiscardWorld{Stream: stream, Ordinal: ordinal + 1, AllocationDigest: identity, Profiles: []kingDiscardProfileResult{}}
			for _, profile := range c.Profiles {
				pr := kingDiscardProfileResult{ProfileID: profile.ID, Roots: []kingDiscardRoot{}}
				for _, root := range legal {
					value, e := kingDiscardContinuation(world, root, profile, meter)
					if e != nil {
						return finish(e)
					}
					pr.Roots = append(pr.Roots, value)
				}
				row.Profiles = append(row.Profiles, pr)
			}
			out.Rows = append(out.Rows, row)
			out.Work.Worlds++
			if unique[identity] {
				out.RepeatedSamples++
			} else {
				unique[identity] = true
				out.UniqueAllocations++
			}
		}
	}
	out.Status = "completed"
	out.SamplingComplete = true
	return out, nil
}

func kingDiscardTestObservation(t *testing.T, variant string) kingDiscardCase {
	t.Helper()
	corpus, _ := kingScenarioFixtures(t)
	s := kingDiscardTestState(t, corpus.Fixtures[0], variant)
	return kingDiscardCase{"king-discard-" + variant, Pin(variant), Observe(s, 0), "play:CA", "play:HK"}
}

func kingDiscardTestState(t *testing.T, f kingScenarioFixture, variant string) State {
	t.Helper()
	s, err := kingScenarioNew(f, variant)
	if err != nil {
		t.Fatal(err)
	}
	request := "king"
	if variant == "complex-partners" {
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
	for _, card := range []string{"DA", "D8", "S4", "D2", "D4", "DK", "S5", "C2", "D3", "S6"} {
		s, err = Apply(s, s.Turn, Action{Kind: "play-card", Card: card})
		if err != nil {
			t.Fatal(err)
		}
	}
	return s
}

func TestKingDiscardCommonWorldsAndIdentity(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) { kingDiscardCheckCommonWorlds(t, variant) })
	}
}

func kingDiscardCheckCommonWorlds(t *testing.T, variant string) {
	t.Helper()
	in := kingDiscardTestObservation(t, variant)
	before, _ := json.Marshal(in)
	c := kingDiscardConfiguration()
	c.WorldsPerStream = 1
	out, err := kingDiscardEvaluate(context.Background(), in, c)
	if err != nil {
		t.Fatal(err)
	}
	if !out.SamplingComplete || len(out.Rows) != 2 || out.Work.Worlds != 2 {
		t.Fatalf("incomplete bounded comparison: %+v", out.Work)
	}
	if out.Work.Steps != 2*11*4*42 || len(out.CandidateIDs) != 11 {
		t.Fatal("bounded roots or exact continuation work changed")
	}
	t.Logf("%s current South selections: %+v", variant, out.PolicySelections)
	if len(out.PolicySelections) != 4 {
		t.Fatal("missing current profile root selections")
	}
	for i, selection := range out.PolicySelections {
		a, e := DecideWithPolicy(in.Observation, c.Profiles[i].Policies[0])
		if e != nil || selection.ProfileID != c.Profiles[i].ID || selection.CandidateID != ActionID(a) {
			t.Fatal("current profile root selection changed")
		}
		want := "play:HK"
		if c.Profiles[i].Policies[0] == OwnershipComparisonPolicyID {
			want = "play:CA"
		}
		if selection.CandidateID != want {
			t.Fatal("fixed current South policy choice changed")
		}
	}
	for _, row := range out.Rows {
		if len(row.Profiles) != 4 {
			t.Fatal("missing paired profiles")
		}
		for _, pr := range row.Profiles {
			if len(pr.Roots) != len(out.CandidateIDs) {
				t.Fatal("missing paired roots")
			}
			for i, r := range pr.Roots {
				if r.CandidateID != out.CandidateIDs[i] || r.FirstTrick.Plays[2].Card != Legal(in.Observation)[i].Card || r.CompletedTricks != 13 || r.KingRelease.PlayOrdinal-r.KingRelease.ContinuationPlayOrdinal != 10 {
					t.Fatal("root, full request, or release timing changed")
				}
				if !reflect.DeepEqual(r.FirstTrick.Plays[:2], in.Observation.Trick) || r.FirstTrick.Plays[2].Seat != 0 || r.FirstTrick.Plays[3].Seat != 3 {
					t.Fatal("partial trick or South root position changed")
				}
				if r.CandidateID == "play:HK" && (r.KingRelease.PlayOrdinal != 11 || r.KingRelease.ContinuationPlayOrdinal != 1 || r.KingCapture.Trick != 3) {
					t.Fatal("immediate HK release timing changed")
				}
				// Independent team-routing sum. A competitor bonus belongs to
				// NS once even though NS contains two seats.
				team, king, bonusCount := 0, 0, 0
				for _, e := range r.Ledger {
					mine := e.Recipient.Kind == "competitor" && e.Recipient.Competitor == "NS"
					if e.Recipient.Kind == "seat" && e.Recipient.Seat != nil {
						mine = *e.Recipient.Seat == 0 || *e.Recipient.Seat == 2
					}
					if mine {
						team += e.Delta
						if e.Card == "HK" {
							king += e.Delta
						}
					}
					if e.Card == "HK" && e.Component == "double-bonus" {
						bonusCount++
						if e.Delta != 75 || e.Recipient.Kind != "competitor" {
							t.Fatal("literal team HK bonus changed")
						}
					}
				}
				wantKing := 75
				if r.KingCapture.Seat%2 == 0 {
					wantKing = -150
				}
				if team != r.TeamPoints || king != r.KingNetPoints || r.KingNetPoints != wantKing || bonusCount != 1 {
					t.Fatal("full team score or once-only literal HK bonus changed")
				}
				components := 0
				for _, value := range r.ComponentTotals["NS"] {
					components += value
				}
				if components != r.TeamPoints {
					t.Fatal("component ledger changed full objective")
				}
			}
		}
	}
	after, _ := json.Marshal(in)
	if string(before) != string(after) {
		t.Fatal("input observation mutated")
	}
	var decoded kingDiscardCase
	if err = json.Unmarshal(before, &decoded); err != nil {
		t.Fatal(err)
	}
	decoded.CaseID = "different-case"
	decoded.Observation.ID = "different-original-identity"
	other, err := kingDiscardEvaluate(context.Background(), decoded, c)
	if err != nil {
		t.Fatal(err)
	}
	if out.InputDigest != other.InputDigest || !reflect.DeepEqual(out.Rows, other.Rows) {
		t.Fatal("original identity or JSON roundtrip changed semantic comparison")
	}
	// Full native replay must reproduce every actor-visible field, not merely
	// deal capacity and void masks. Sampling never receives the fixture hands.
	config, _, err := kingDiscardValidate(in)
	if err != nil {
		t.Fatal(err)
	}
	work := EvaluationWork{}
	mc := DefaultRequestEvaluationConfig()
	meter := &evaluationMeter{context.Background(), mc, &work}
	sampler, err := newEvaluationSampler(in.Observation, config, meter)
	if err != nil {
		t.Fatal(err)
	}
	w, err := sampler.world(rand.New(rand.NewPCG(11, 23)))
	if err != nil || !sampler.matches(w) {
		t.Fatalf("full native history replay: %v", err)
	}
}

func TestKingDiscardIncompleteAndFixedScope(t *testing.T) {
	in := kingDiscardTestObservation(t, "complex-partners")
	c := kingDiscardConfiguration()
	c.WorldsPerStream = 1
	c.MaxSteps = 1
	out, err := kingDiscardEvaluate(context.Background(), in, c)
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "incomplete" || out.SamplingComplete || len(out.Rows) != 0 || out.Work.Worlds != 0 || out.UniqueAllocations != 0 || out.RepeatedSamples != 0 {
		t.Fatal("partially paired world escaped")
	}
	// Permit exactly one paired world plus the first action of the next.
	c.MaxSteps = 11*4*42 + 1
	out, err = kingDiscardEvaluate(context.Background(), in, c)
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "incomplete" || out.SamplingComplete || len(out.Rows) != 1 || out.Work.Worlds != 1 || out.UniqueAllocations != 1 || out.RepeatedSamples != 0 {
		t.Fatal("incomplete output did not retain exactly its fully paired prefix")
	}
	bad := in
	bad.RulePin.PublicSchemaVersion = "1.1.0"
	if _, _, err = kingDiscardValidate(bad); err == nil {
		t.Fatal("historical pin accepted")
	}
	bad = in
	bad.AlternativeCandidateID = "play:HA"
	if _, _, err = kingDiscardValidate(bad); err == nil {
		t.Fatal("illegal root accepted")
	}
	c = kingDiscardConfiguration()
	c.Profiles[0].Policies[0] = OwnershipComparisonPolicyID
	if _, err = kingDiscardEvaluate(context.Background(), in, c); err == nil {
		t.Fatal("mutable continuation configuration accepted")
	}
}

// These are private negative-control fixtures, never sampler inputs. Outside
// ownership changes while South's complete actor observation stays identical.
func TestKingDiscardIdenticalObservationAmbiguityTwins(t *testing.T) {
	corpus, _ := kingScenarioFixtures(t)
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			original := kingDiscardTestState(t, corpus.Fixtures[0], variant)
			raw, _ := json.Marshal(corpus.Fixtures[0])
			var twin kingScenarioFixture
			if err := json.Unmarshal(raw, &twin); err != nil {
				t.Fatal(err)
			}
			for _, pair := range [][2]string{{"D5", "H8"}, {"D6", "H9"}} {
				east, north := -1, -1
				for i, card := range twin.Hands[3] {
					if card == pair[0] {
						east = i
					}
				}
				for i, card := range twin.Hands[2] {
					if card == pair[1] {
						north = i
					}
				}
				if east < 0 || north < 0 {
					t.Fatal("ambiguity swap absent")
				}
				twin.Hands[3][east], twin.Hands[2][north] = twin.Hands[2][north], twin.Hands[3][east]
			}
			other := kingDiscardTestState(t, twin, variant)
			o, p := Observe(original, 0), Observe(other, 0)
			if !reflect.DeepEqual(o, p) {
				t.Fatal("outside ownership leaked into South observation")
			}
			if !reflect.DeepEqual(Legal(o), Legal(p)) || evaluationDigest(o, Pin(variant)) != evaluationDigest(p, Pin(variant)) {
				t.Fatal("ambiguity changed legal roots or semantic seed")
			}
			config, _, err := kingDiscardValidate(kingDiscardCase{"twin-check", Pin(variant), o, "play:CA", "play:HK"})
			if err != nil {
				t.Fatal(err)
			}
			work := EvaluationWork{}
			meter := &evaluationMeter{context.Background(), DefaultRequestEvaluationConfig(), &work}
			sampler, err := newEvaluationSampler(o, config, meter)
			if err != nil || !sampler.matches(original) || !sampler.matches(other) {
				t.Fatal("ambiguity twins fail complete actor reconstruction", err)
			}
			for _, policy := range []string{PolicyID, OwnershipComparisonPolicyID} {
				a, ta, err := kingScenarioDecision(o, policy)
				if err != nil {
					t.Fatal(err)
				}
				b, tb, err := kingScenarioDecision(p, policy)
				if err != nil || !reflect.DeepEqual(a, b) || !reflect.DeepEqual(ta, tb) {
					t.Fatal("identical South observation changed policy choice or trace")
				}
			}
			// In the original East must follow with D5/D6 and wins. In the twin
			// East is diamond-void: every legal response leaves North's D3 winning.
			for i, state := range []State{original, other} {
				branch, err := Apply(state, 0, Action{Kind: "play-card", Card: "HK"})
				if err != nil {
					t.Fatal(err)
				}
				captor := 3
				if i == 1 {
					captor = 2
				}
				for _, response := range Legal(Observe(branch, branch.Turn)) {
					completed, err := Apply(branch, branch.Turn, response)
					if err != nil || completed.Tricks[2].Winner != captor {
						t.Fatal("immediate capturer is not forced by actual complete deal")
					}
				}
				for _, profile := range kingDiscardConfiguration().Profiles {
					mc := DefaultRequestEvaluationConfig()
					work := EvaluationWork{}
					meter := &evaluationMeter{context.Background(), mc, &work}
					released, err := kingDiscardContinuation(state, Action{Kind: "play-card", Card: "HK"}, profile, meter)
					if err != nil || released.KingCapture.Seat != captor || released.KingCapture.Trick != 3 || released.KingRelease.PlayOrdinal != 11 || released.KingRelease.ContinuationPlayOrdinal != 1 {
						t.Fatal("immediate release failed full request oracle", err)
					}
					withheld, err := kingDiscardContinuation(state, Action{Kind: "play-card", Card: "CA"}, profile, meter)
					if err != nil || withheld.CompletedTricks != 13 {
						t.Fatal("withheld king did not finish full request", err)
					}
					if i == 1 && (withheld.KingCapture.Seat != 1 || withheld.KingCapture.Trick != 4 || withheld.KingNetPoints != 75 || released.KingNetPoints != -150 || withheld.TeamPoints-released.TeamPoints != 225) {
						t.Fatal("withholding CA no longer avoids the twin's immediate team HK capture")
					}
					t.Logf("twin=%t profile=%s CA full team=%d king=%d captor=%d trick=%d immediate HK team=%d king=%d", i == 1, profile.ID, withheld.TeamPoints, withheld.KingNetPoints, withheld.KingCapture.Seat, withheld.KingCapture.Trick, released.TeamPoints, released.KingNetPoints)
				}
			}
		})
	}
}

func TestKingDiscardExactHardConstraintAmbiguityCount(t *testing.T) {
	in := kingDiscardTestObservation(t, "basic-partners")
	config, _, err := kingDiscardValidate(in)
	if err != nil {
		t.Fatal(err)
	}
	work := EvaluationWork{}
	meter := &evaluationMeter{context.Background(), DefaultRequestEvaluationConfig(), &work}
	sampler, err := newEvaluationSampler(in.Observation, config, meter)
	if err != nil {
		t.Fatal(err)
	}
	if sampler.capacities != [4]int{0, 10, 10, 11} {
		t.Fatal("remaining South observation capacities changed")
	}
	diamonds := []string{}
	noEast := *sampler
	noEast.masks = append([]uint8{}, sampler.masks...)
	noEast.memo = map[[4]int]uint64{}
	ownerPinned := false
	for i, card := range sampler.cards {
		if card == "H7" {
			ownerPinned = sampler.masks[i] == 1<<3
		}
		if card[0] == 'D' {
			diamonds = append(diamonds, card)
			if sampler.masks[i] != (1<<2 | 1<<3) {
				t.Fatal("public West diamond void lost")
			}
			noEast.masks[i] &^= 1 << 3
		}
	}
	if !ownerPinned || !reflect.DeepEqual(diamonds, []string{"D5", "D6", "D7", "D9", "D10", "DJ", "DQ"}) {
		t.Fatal("actor-only unseen diamonds or opening H7 owner pin changed")
	}
	total, err := sampler.count(sampler.capacities)
	if err != nil {
		t.Fatal(err)
	}
	void, err := noEast.count(noEast.capacities)
	if err != nil {
		t.Fatal(err)
	}
	// Uniform hard-constraint allocations only. This combinatorial ratio does
	// not weight earlier voluntary choices or any intended partner signal.
	if total != 211373057896 || void != 327202876 || total != 646*void {
		t.Fatalf("exact prior count changed: total=%d East-void=%d", total, void)
	}
}
