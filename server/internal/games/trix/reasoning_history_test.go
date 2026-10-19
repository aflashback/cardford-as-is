package trix

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"reflect"
	"strings"
	"testing"
)

// Complete native replay validates each allocation, and every continuation
// below is forced. This oracle does not invoke a selector for future seats.
func historyTestOutcomes(t *testing.T, o Observation) [][]float64 {
	t.Helper()
	c := DefaultRequestEvaluationConfig()
	w := EvaluationWork{}
	config, err := evaluationProfile(tracePin(o), o)
	if err != nil {
		t.Fatal(err)
	}
	p, err := newEvaluationSampler(o, config, &evaluationMeter{context.Background(), c, &w})
	if err != nil {
		t.Fatal(err)
	}
	rows := [][]float64{}
	var visit func(int, [4][]string, [4]int)
	visit = func(i int, hands [4][]string, left [4]int) {
		if i < len(p.cards) {
			for seat := 0; seat < 4; seat++ {
				if left[seat] == 0 || p.masks[i]&(1<<seat) == 0 {
					continue
				}
				next := hands
				next[seat] = append(append([]string{}, hands[seat]...), p.cards[i])
				counts := left
				counts[seat]--
				visit(i+1, next, counts)
			}
			return
		}
		s, ok, e := p.reconstruct(hands, rand.New(rand.NewPCG(1, 2)))
		if e != nil {
			t.Fatal(e)
		}
		if !ok {
			return
		}
		row := []float64{}
		for _, a := range Legal(o) {
			branch, e := Apply(s, o.Seat, a)
			if e != nil {
				t.Fatal(e)
			}
			for branch.Phase != "round-complete" {
				legal := Legal(Observe(branch, branch.Turn))
				if len(legal) != 1 {
					t.Fatal("oracle continuation not forced")
				}
				branch, e = Apply(branch, branch.Turn, legal[0])
				if e != nil {
					t.Fatal(e)
				}
			}
			row = append(row, evaluationScore(branch, o.Seat)-evaluationScore(s, o.Seat))
		}
		rows = append(rows, row)
	}
	hands := [4][]string{}
	hands[o.Seat] = o.Hand
	visit(0, hands, p.capacities)
	return rows
}

func historyTestDominant(rows [][]float64) int {
	for i := 0; i < 2; i++ {
		good, strict := true, false
		for _, row := range rows {
			good = good && row[i] >= row[1-i]
			strict = strict || row[i] > row[1-i]
		}
		if len(rows) > 0 && good && strict {
			return i
		}
	}
	return -1
}

func historyNativePosition(t *testing.T, variant string, seed int) Observation {
	t.Helper()
	s := historyNativeState(t, variant, seed)
	return Observe(s, s.Turn)
}

func historyNativeState(t *testing.T, variant string, seed int) State {
	t.Helper()
	profile := ""
	if partners(variant) {
		profile = "1.1.0"
	}
	s, err := New(Config{ID: "history-native", Variant: variant, ProfileVersion: profile}, shuffledTestDeck(seed))
	if err != nil {
		t.Fatal(err)
	}
	request := "queens"
	if variant[:7] == "complex" {
		request = "complex"
	}
	s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: request})
	if err != nil {
		t.Fatal(err)
	}
	for s.Phase != "round-complete" {
		o := Observe(s, s.Turn)
		if len(o.Tricks) == 11 && len(o.Trick) == 3 {
			return s
		}
		a, e := Decide(o)
		if e != nil {
			t.Fatal(e)
		}
		s, e = Apply(s, s.Turn, a)
		if e != nil {
			t.Fatal(e)
		}
	}
	t.Fatal("native position not reached")
	return State{}
}

func TestHistoryPenaltyEndgameDominance(t *testing.T) {
	for _, fixture := range []struct {
		variant         string
		seed            int
		prior, selected string
		worlds          int
		digest          string
	}{
		{"basic-solo", 34, "play:CA", "play:DK", 4, "59f9563dc4a084918774d1bec9199adea267ce23cefba3377268e87746e0fd39"},
		{"basic-partners", 34, "play:CA", "play:DK", 4, "d7c55c19cfa3c53a78a761953d4f0b6539d523bba85f98c4d3e3c670951ab244"},
		{"complex-solo", 26, "play:DA", "play:SA", 2, "0f825c694ced908988bd6b75e82623966b513aad8cbd685534df1e39fa1b0e33"},
		{"complex-partners", 141, "play:DA", "play:SA", 1, "ff7964361e0e78ef33ed4008841031ca00179f9f14dfd36a4a4264692f050280"},
	} {
		t.Run(fixture.variant, func(t *testing.T) {
			o := historyNativePosition(t, fixture.variant, fixture.seed)
			prior, err := BuildDecisionTrace(o, ReasoningPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(prior)
			if fmt.Sprintf("%x", sha256.Sum256(raw)) != fixture.digest {
				t.Fatal("pre-change v1 trace bytes changed")
			}
			if ActionID(prior.Action) != fixture.prior {
				t.Fatalf("changed v1: %s", ActionID(prior.Action))
			}
			rows := historyTestOutcomes(t, o)
			if len(rows) != fixture.worlds || ActionID(Legal(o)[historyTestDominant(rows)]) != fixture.selected {
				t.Fatalf("oracle mismatch %v", rows)
			}
			trace, err := BuildDecisionTrace(o, "trix-history-1.0.0")
			if err != nil {
				t.Fatal(err)
			}
			if ActionID(trace.Action) != fixture.selected {
				t.Fatalf("missed request-end dominance: %s", ActionID(trace.Action))
			}
			if !strings.Contains(trace.Summary, "every feasible allocation") {
				t.Fatalf("missing comparison scope: %s", trace.Summary)
			}
			if trace.HistoryEvidence == nil || trace.HistoryEvidence.Coverage != "complete" || trace.HistoryEvidence.Allocations != fixture.worlds {
				t.Fatal("missing complete saved evidence")
			}
			if !trace.HistoryEvidence.Eligible || !trace.HistoryEvidence.SelectedChanged || trace.HistoryEvidence.PriorReasoningCandidateID != fixture.prior || trace.HistoryEvidence.DominantCandidateID != fixture.selected {
				t.Fatal("activation or action-change evidence mismatch")
			}
			for _, comparison := range trace.HistoryEvidence.Comparisons {
				if comparison.CandidateID == fixture.selected && (comparison.Worse != 0 || comparison.Better == 0 || comparison.Equal+comparison.Better != fixture.worlds) {
					t.Fatalf("false dominance %+v", comparison)
				}
			}
			if err = ValidateDecisionTrace(o, trace); err != nil {
				t.Fatal(err)
			}
			message, err := BuildCoachMessage(trace, "history-decision")
			if err != nil {
				t.Fatal(err)
			}
			bot, err := DecideWithPolicy(o, "trix-history-1.0.0")
			if err != nil || message.SelectedAction != ActionID(bot) {
				t.Fatalf("bot/coach mismatch %v", err)
			}
		})
	}
}

func TestHistoryCrossingAllocationsRetainV1(t *testing.T) {
	for _, fixture := range []struct {
		variant string
		seed    int
	}{{"basic-solo", 26}, {"basic-partners", 26}, {"complex-solo", 203}, {"complex-partners", 26}} {
		t.Run(fixture.variant, func(t *testing.T) {
			o := historyNativePosition(t, fixture.variant, fixture.seed)
			rows := historyTestOutcomes(t, o)
			better, worse := false, false
			for _, row := range rows {
				better = better || row[0] > row[1]
				worse = worse || row[0] < row[1]
			}
			if historyTestDominant(rows) >= 0 || !better || !worse {
				t.Fatalf("not a crossing counterexample %v", rows)
			}
			trace, err := BuildDecisionTrace(o, HistoryPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			prior, _ := BuildDecisionTrace(o, ReasoningPolicyID)
			if ActionID(trace.Action) != ActionID(prior.Action) || trace.HistoryEvidence.Coverage != "complete" {
				t.Fatal("unproved candidate promoted")
			}
			if !trace.HistoryEvidence.Eligible || trace.HistoryEvidence.SelectedChanged || trace.HistoryEvidence.DominantCandidateID != "" {
				t.Fatal("ambiguous allocation counted as tactic activation")
			}
			for i, c := range trace.Candidates {
				if c.Value != prior.Candidates[i].Value || c.Reason != prior.Candidates[i].Reason {
					t.Fatal("uncertain action weights changed")
				}
			}
			for _, c := range trace.HistoryEvidence.Comparisons {
				if c.Worse == 0 || c.Better == 0 {
					t.Fatal("crossing allocation uncertainty disappeared")
				}
			}
		})
	}
}

func TestHistorySavedPreparationProfilesAndEvidenceTampering(t *testing.T) {
	for _, r := range Installations() {
		config, _ := json.Marshal(Config{ID: "history-prepare", Variant: r.Pin.VariantID})
		material, _ := json.Marshal(Chance{Deck: shuffledTestDeck(34)})
		b, err := r.Start(config, material)
		if err != nil {
			t.Fatal(err)
		}
		n, _ := b.Node()
		prepared, err := b.PrepareComplete(context.Background(), *n.Seat, HistoryPolicyID, "history-prepared")
		if err != nil {
			t.Fatal(err)
		}
		var trace DecisionTrace
		if err = json.Unmarshal(prepared.Detail.Bytes, &trace); err != nil {
			t.Fatal(err)
		}
		raw, _ := b.Packet(*n.Seat)
		var packet struct {
			Observation Observation `json:"observation"`
		}
		_ = json.Unmarshal(raw, &packet)
		if err = ValidateDecisionTraceWithPin(packet.Observation, trace, r.Pin); err != nil {
			t.Fatal(err)
		}
		message, err := BuildCoachMessage(trace, "history-prepared")
		if err != nil || message.SelectedAction != prepared.Prepared.CandidateID || message.PolicyVersion != HistoryPolicyID || message.CueVersion != HistoryCueVersion {
			t.Fatalf("preparation parity %v", err)
		}
		if trace.HistoryEvidence.Coverage != "outside-scope" {
			t.Fatal("request-choice falsely covered")
		}
		trace.HistoryEvidence.Allocations = 6
		if ValidateDecisionTraceWithPin(packet.Observation, trace, r.Pin) == nil {
			t.Fatal("forged saved evidence accepted")
		}
	}
	// A transplanted count or arithmetic result cannot become an exact fact.
	o := historyNativePosition(t, "basic-partners", 34)
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	trace.HistoryEvidence.Comparisons[0].MinimumScaledDelta = 999
	if ValidateDecisionTrace(o, trace) == nil {
		t.Fatal("forged exact margin accepted")
	}
	trace, err = BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	trace.SchemaVersion = DecisionTraceSchemaVersion
	if _, err = BuildCoachMessage(trace, "wrong-version"); err == nil {
		t.Fatal("candidate identified as legacy trace")
	}
}

func TestHistoryActorObservationInvarianceAndOutsideScope(t *testing.T) {
	s := historyNativeState(t, "basic-partners", 34)
	o := Observe(s, s.Turn)
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	// Different concealed hands and private fixture metadata cannot affect the
	// actor-only DTO or the trace built from it. Feasible replay permutations
	// are separately enumerated by the complete native-history outcome oracle.
	s.Hands[1], s.Hands[2] = s.Hands[2], s.Hands[1]
	s.Config.FixtureID = "private-unused-fixture"
	changed := Observe(s, s.Turn)
	if !reflect.DeepEqual(o, changed) {
		t.Fatal("concealed permutation entered observation")
	}
	permuted, err := BuildDecisionTrace(changed, HistoryPolicyID)
	if err != nil || !reflect.DeepEqual(trace, permuted) {
		t.Fatal("concealed permutation entered saved trace")
	}
	renamed := o
	renamed.ID = "another-session"
	again, err := BuildDecisionTrace(renamed, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if ActionID(trace.Action) != ActionID(again.Action) || !reflect.DeepEqual(trace.HistoryEvidence, again.HistoryEvidence) {
		t.Fatal("session identity changed evidence or action")
	}
	// Current private transport data is the public DTO only; serialization loses
	// the internal schema marker, so validation supplies the saved exact pin.
	raw, _ := json.Marshal(o)
	var parsed Observation
	_ = json.Unmarshal(raw, &parsed)
	again, err = BuildDecisionTrace(parsed, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(trace.Candidates, again.Candidates) || !reflect.DeepEqual(trace.HistoryEvidence, again.HistoryEvidence) {
		t.Fatal("private/internal marker altered action reasoning")
	}
	o.Trick = o.Trick[:2]
	trace, err = BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	prior, _ := BuildDecisionTrace(o, ReasoningPolicyID)
	if trace.HistoryEvidence.Coverage != "outside-scope" || !reflect.DeepEqual(trace.Candidates, prior.Candidates) {
		t.Fatal("three-seat future choices treated as forced")
	}
}

func TestHistoryInconsistentHistoryCannotProveDominance(t *testing.T) {
	o := historyNativePosition(t, "basic-partners", 34)
	// A repeated card fails conservation/native replay. No incomplete set can
	// supply a dominance ranking, even if the small endgame shape still matches.
	o.Tricks[0].Plays[0].Card = o.Hand[0]
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	prior, _ := BuildDecisionTrace(o, ReasoningPolicyID)
	if trace.HistoryEvidence.Coverage != "invalid-context" || trace.HistoryEvidence.Allocations != 0 || trace.HistoryEvidence.DominantCandidateID != "" || !reflect.DeepEqual(trace.Candidates, prior.Candidates) {
		t.Fatal("inconsistent history supplied exact dominance")
	}
}

func TestHistoryNativeEvaluatorContinuationAdmission(t *testing.T) {
	o := historyNativePosition(t, "complex-partners", 141)
	c := DefaultRequestEvaluationConfig()
	for seat := range c.Policies {
		c.Policies[seat] = HistoryPolicyID
	}
	result, err := EvaluateRequest(context.Background(), o, AnnouncedPin(o.VariantID), c)
	if err != nil || result.Status != "completed" || len(result.Values) != 2 {
		t.Fatalf("candidate continuation admission %v %+v", err, result)
	}
	oracle := historyTestOutcomes(t, o)
	for _, row := range result.Values {
		if !reflect.DeepEqual(row, oracle[0]) {
			t.Fatalf("native score mismatch %v vs %v", row, oracle[0])
		}
	}
}

func TestHistoryLayoutPassesTwosAndVoluntaryEvidenceGap(t *testing.T) {
	turn, request := 0, "trix"
	counts := [4]int{1, 1, 1, 1}
	o := Observation{GameID: "trix", VariantID: "basic-partners", Seat: 0, Turn: &turn, Phase: "layout", Request: &request, Hand: []string{"C3", "D3", "D2"}, HandCounts: [4]int{3, 4, 1, 4}, Board: []Row{{"C", 4, 14}, {"D", 4, 14}, {"H", 11, 11}, {"S", 11, 11}}, TwoAnnouncements: &TwoAnnouncements{Status: "hidden", Counts: &counts}}
	passBoard := []Row{{"C", 11, 11}, {"D", 11, 11}, {"H", 11, 11}, {"S", 11, 11}}
	o.Passes = []LayoutPass{{Seat: 2, Board: passBoard, Ref: "forced-2"}}
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if len(trace.HistoryEvidence.Signals) != 0 {
		t.Fatal("board or forced jack fabricated voluntary choices")
	}
	facts, _ := json.Marshal(trace.FactCatalog)
	if !strings.Contains(string(facts), "trix-history-layout-evidence-gap") || !strings.Contains(string(facts), "trix-hidden-twos") {
		t.Fatal("lost early count restriction or chronology gap")
	}
	if containsInt(possibleHolders(o, "CQ"), 2) {
		t.Fatal("pass ignored exact placeable card")
	}
	if !containsInt(possibleHolders(o, "H3"), 2) {
		t.Fatal("pass excludes future newly opened frontier")
	}
	o.TwoAnnouncements = &TwoAnnouncements{Status: "revealed", Cards: []Play{{2, "C2"}}}
	trace, err = BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if trace.Action.Card != "C3" {
		t.Fatal("later public owner ignored")
	}
	if err = ValidateDecisionTrace(o, trace); err != nil {
		t.Fatal(err)
	}
}

func TestHistoryBehavioralSignalsStayConditional(t *testing.T) {
	o := reasoningPlay("basic-partners", "king")
	o.Declarations = []Declaration{{Seat: 2, Cards: []string{"HK"}, Ref: "double-2"}}
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if len(trace.HistoryEvidence.Signals) != 1 || !strings.Contains(trace.HistoryEvidence.Signals[0].Interpretation, "may suggest") || !strings.Contains(trace.HistoryEvidence.Signals[0].Interpretation, "proves ownership of the king only") {
		t.Fatal("double converted to ownership inference")
	}
	if seats := possibleHolders(o, "HA"); len(seats) != 3 {
		t.Fatalf("double proved ace owner %v", seats)
	}
	prior, _ := BuildDecisionTrace(o, ReasoningPolicyID)
	if !reflect.DeepEqual(trace.Candidates, prior.Candidates) {
		t.Fatal("uncalibrated behavioral action weights")
	}
	// The later public club proves a voluntary alternative to the heart lead.
	// Not playing HA on that lead is not evidence of its absence.
	o.Declarations = nil
	o.Tricks = []Trick{{Number: 1, Plays: []Play{{2, "H3"}, {1, "H4"}, {0, "H5"}, {3, "H6"}}}, {Number: 2, Plays: []Play{{2, "C4"}, {1, "C5"}, {0, "C6"}, {3, "C7"}}}}
	trace, err = BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, signal := range trace.HistoryEvidence.Signals {
		if signal.Chosen == "H3" {
			found = true
			if !contains(signal.KnownAlternatives, "C4") || !strings.Contains(signal.Interpretation, "does not prove its absence") {
				t.Fatal("ace absence or unproved alternative signal")
			}
		}
	}
	if !found {
		t.Fatal("ignored proven voluntary heart lead")
	}
	if !containsInt(possibleHolders(o, "HA"), 2) {
		t.Fatal("not playing ace became absence")
	}
	// Removing the evidence of another legal card removes the behavioral signal.
	o.Tricks = o.Tricks[:1]
	o.Trick = nil
	trace, err = BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	for _, signal := range trace.HistoryEvidence.Signals {
		if signal.Seat == 2 {
			t.Fatal("possibly forced action became behavioral signal")
		}
	}
	for _, fact := range trace.FactCatalog {
		if strings.HasPrefix(fact.ID, "trix-history-heart") && fact.Kind != "conditional" {
			t.Fatal("behavior classified as exact")
		}
	}
}

func containsInt(values []int, target int) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}
