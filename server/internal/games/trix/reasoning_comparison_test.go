package trix

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestTrixOwnershipComparisonLegacyBytes(t *testing.T) {
	s := ownershipChoiceState(t, "complex-partners")
	o := Observe(s, 0)
	expected := map[string]string{
		ReasoningPolicyID: "00ec46e8666d7b36077cf405e2fab56199c6d16fb0537d8352a835ea751af40d",
		HistoryPolicyID:   "7eca3c3361ce5276607672bf8d4e0a2d0db2d14ac48289052fe8a0b3dca014b5",
		FrontierPolicyID:  "214d60ce56a809b784aa1fb7b4e5508175fe8fcab1c43da9610cbac0868b2870",
		OwnershipPolicyID: "ecab9142bc1f9a6ebe4ede8979bcdfe57794e9c1b81aec0ef260637aa10e8e9b",
	}
	for _, policy := range []string{ReasoningPolicyID, HistoryPolicyID, FrontierPolicyID, OwnershipPolicyID} {
		trace, err := BuildDecisionTrace(o, policy)
		if err != nil {
			t.Fatal(err)
		}
		message, err := BuildCoachMessage(trace, "comparison-legacy")
		if err != nil {
			t.Fatal(err)
		}
		advice, err := BuildAdviceFromTrace(trace, "comparison-legacy")
		if err != nil {
			t.Fatal(err)
		}
		bytes, err := json.Marshal([]any{trace, message, advice})
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(bytes)
		if hex.EncodeToString(sum[:]) != expected[policy] {
			t.Fatalf("%s changed legacy trace, coach or advice bytes", policy)
		}
	}
}

// A small actor-only position isolates the recorded study's S5/H3 mechanism.
// Revealed twos supply the exact holder here; suppression deductions remain
// independently covered by the native ownership tests and are not assumed.
func comparisonZeroOpeningObservation() Observation {
	turn, request := 2, "trix"
	return Observation{GameID: "trix", VariantID: "complex-partners", Seat: 2, Turn: &turn, Phase: "layout", Request: &request, DealNumber: 1, Kingdom: 1,
		Hand: []string{"H3", "S5"}, HandCounts: [4]int{0, 2, 2, 2}, FinishOrder: []int{0},
		Board:            []Row{{"C", 2, 14}, {"D", 2, 14}, {"H", 4, 14}, {"S", 6, 14}},
		TwoAnnouncements: &TwoAnnouncements{Status: "revealed", Cards: []Play{{0, "C2"}, {1, "D2"}, {3, "H2"}, {1, "S2"}}}, publicSchemaVersion: "1.1.0"}
}

func comparisonTrace(t *testing.T, o Observation) DecisionTrace {
	t.Helper()
	old, err := BuildDecisionTrace(o, OwnershipPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	trace, err := BuildDecisionTrace(o, OwnershipComparisonPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(old.Candidates, trace.Candidates) || !reflect.DeepEqual(old.Action, trace.Action) || !reflect.DeepEqual(old.OwnershipEvidence, trace.OwnershipEvidence) {
		t.Fatal("explanation revision changed scores, action or ownership")
	}
	if err = ValidateDecisionTrace(o, trace); err != nil {
		t.Fatal(err)
	}
	if _, err = BuildCoachMessage(trace, "comparison-test"); err != nil {
		t.Fatal(err)
	}
	return trace
}

func TestTrixOwnershipComparisonAvoidedOpponentOpening(t *testing.T) {
	o := comparisonZeroOpeningObservation()
	trace := comparisonTrace(t, o)
	if trace.SelectedCandidateID != "layout:S5" || trace.Candidates[0].Value != -8 || trace.Candidates[1].Value != 0 {
		t.Fatalf("fixture does not isolate S5/H3 contrast: %+v", trace.Candidates)
	}
	if trace.SchemaVersion != OwnershipComparisonTraceSchemaVersion || trace.Status != "tactical" || !strings.Contains(trace.Cue, "avoid opening the opponent's 2 of hearts") || !strings.Contains(trace.Summary, "Neither placement immediately opens another card") || !strings.Contains(trace.Summary, "immediate opponent-opening penalty") || !strings.Contains(trace.Summary, "does not establish a better final team finish") {
		t.Fatalf("comparative explanation missing: %+v", trace)
	}
	message, err := BuildCoachMessage(trace, "comparison-test")
	if err != nil || message.CueVersion != OwnershipComparisonCueVersion || message.SelectedAction != trace.SelectedCandidateID {
		t.Fatal("new cue or selected action differs", err)
	}
	unlock := false
	for _, fact := range message.Reason.Support {
		if fact.ID == "trix-layout-unlock-H3-H2" {
			unlock = true
		}
	}
	if !unlock {
		t.Fatal("main reason lacks alternative's exact unlock support")
	}
	raw, err := json.Marshal(trace)
	if err != nil {
		t.Fatal(err)
	}
	var saved DecisionTrace
	if err = json.Unmarshal(raw, &saved); err != nil {
		t.Fatal(err)
	}
	if err = ValidateDecisionTrace(o, saved); err != nil {
		t.Fatal("saved comparison failed round trip", err)
	}
	advice, err := BuildAdviceFromTrace(saved, "comparison-test")
	if err != nil || advice.Title != message.Cue || advice.Text != message.Reason.Summary {
		t.Fatal("coach and advice diverge", err)
	}
}

func TestTrixOwnershipComparisonArchivedSuppressedDecision(t *testing.T) {
	raw, err := os.ReadFile("testdata/ownership-comparison-s5-h3.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceDecisionID            string `json:"sourceDecisionId"`
		ExpectedPolicyID            string `json:"expectedPolicyId"`
		ExpectedPublicSchemaVersion string `json:"expectedPublicSchemaVersion"`
		ExpectedSelectedCandidateID string `json:"expectedSelectedCandidateId"`
		ExpectedLegacyTraceSHA256   string `json:"expectedLegacyTraceSha256"`
		ExpectedLegacyCoachSHA256   string `json:"expectedLegacyCoachSha256"`
		ExpectedLegacyAdviceSHA256  string `json:"expectedLegacyAdviceSha256"`
		ActorPacket                 struct {
			PublicSchemaVersion string      `json:"publicSchemaVersion"`
			Observation         Observation `json:"observation"`
		} `json:"actorPacket"`
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	o := fixture.ActorPacket.Observation
	if fixture.SourceDecisionID != "case-7c1e505108ccc85af15f2ab33c912891" || fixture.ExpectedPolicyID != OwnershipPolicyID || fixture.ExpectedPublicSchemaVersion != "1.2.0" || fixture.ActorPacket.PublicSchemaVersion != fixture.ExpectedPublicSchemaVersion || o.TwoAnnouncements != nil || !reflect.DeepEqual(o.Hand, []string{"H3", "S5"}) {
		t.Fatal("archived fixture lost source identity or suppressed actor input")
	}
	o.publicSchemaVersion = fixture.ExpectedPublicSchemaVersion
	pin, err := PinForPublicSchema(o.VariantID, o.publicSchemaVersion)
	if err != nil {
		t.Fatal(err)
	}
	old, err := BuildDecisionTrace(o, OwnershipPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	coach, err := BuildCoachMessage(old, fixture.SourceDecisionID)
	if err != nil {
		t.Fatal(err)
	}
	advice, err := BuildAdviceFromTrace(old, fixture.SourceDecisionID)
	if err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		name     string
		value    any
		expected string
	}{
		{"trace", old, fixture.ExpectedLegacyTraceSHA256},
		{"coach", coach, fixture.ExpectedLegacyCoachSHA256},
		{"advice", advice, fixture.ExpectedLegacyAdviceSHA256},
	} {
		bytes, err := json.Marshal(check.value)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(bytes)
		if hex.EncodeToString(sum[:]) != check.expected {
			t.Fatalf("archived legacy %s changed: got %s expected %s", check.name, hex.EncodeToString(sum[:]), check.expected)
		}
	}
	trace := comparisonTrace(t, o)
	if err = ValidateDecisionTraceWithPin(fixture.ActorPacket.Observation, trace, pin); err != nil {
		t.Fatal("archived parsed packet failed pinned audit", err)
	}
	if trace.SelectedCandidateID != fixture.ExpectedSelectedCandidateID || !trace.OwnershipEvidence.SuppressedOneTeam || trace.Candidates[0].Value != -8 || trace.Candidates[1].Value != 0 || trace.Cue != "Play 5 of spades - avoid opening the opponent's 2 of hearts." {
		t.Fatalf("archived S5/H3 comparison changed: %+v", trace)
	}
	selected, other := comparisonFor(trace, "layout:S5"), comparisonFor(trace, "layout:H3")
	if len(selected.OwnOpenings) != 0 || len(other.OwnOpenings) != 0 || len(other.KnownOpenings) != 1 || other.KnownOpenings[0].Card != "H2" || other.KnownOpenings[0].Holder != 3 {
		t.Fatal("archived comparison lacks proved opponent H2 or zero-opening facts")
	}
	t.Log(trace.Cue)
}

func TestTrixOwnershipComparisonTiesForcedAndMixedScores(t *testing.T) {
	for _, tc := range []struct {
		name, status string
		mutate       func(*Observation)
		avoidance    bool
	}{
		{"leading tie", "no-clear-preference", func(o *Observation) { o.publicSchemaVersion = "1.0.0"; o.TwoAnnouncements = nil }, false},
		{"forced release", "only-option", func(o *Observation) { o.Hand = []string{"H3"}; o.HandCounts[2]--; o.HandCounts[3]++ }, false},
		{"other score contribution", "tactical", func(o *Observation) { o.Hand = append(o.Hand, "S3"); o.HandCounts[2]++; o.HandCounts[1]-- }, false},
		{"own follow-up", "tactical", func(o *Observation) { o.Hand = append(o.Hand, "S4"); o.HandCounts[2]++; o.HandCounts[1]-- }, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			o := comparisonZeroOpeningObservation()
			tc.mutate(&o)
			trace := comparisonTrace(t, o)
			if trace.Status != tc.status || strings.Contains(trace.Cue, "avoid opening") != tc.avoidance {
				t.Fatalf("false tactical claim: %s %s", trace.Status, trace.Cue)
			}
			if tc.name == "leading tie" && (!strings.Contains(trace.Summary, "fixed legal order") || !strings.Contains(strings.Join(trace.Limitations, " "), "no unique tactical advantage")) {
				t.Fatal("tie became a tactical preference")
			}
			if tc.name == "forced release" && !strings.Contains(trace.Summary, "no strategic choice") {
				t.Fatal("forced move became a strategic choice")
			}
			if tc.name == "other score contribution" && (!strings.Contains(trace.Cue, "no immediate own-card follow-up") || strings.Contains(trace.Summary, "prefers connected paths")) {
				t.Fatal("zero-opening fallback claims an own path")
			}
			if tc.name == "own follow-up" && !strings.Contains(trace.Cue, "open a path through your remaining hand") {
				t.Fatal("actual own follow-up lost its explanation")
			}
		})
	}
}

func TestTrixOwnershipComparisonSavedTampering(t *testing.T) {
	o := comparisonZeroOpeningObservation()
	trace := comparisonTrace(t, o)
	for _, mutate := range []func(*DecisionTrace){
		func(t *DecisionTrace) { t.OwnershipComparisonEvidence.Comparisons[0].KnownOpenings[0].Holder = 0 },
		func(t *DecisionTrace) { t.OwnershipComparisonEvidence.Comparisons[0].KnownOpenings[0].Adjustment = -45 },
		func(t *DecisionTrace) { t.OwnershipComparisonEvidence.Comparisons[1].OwnOpenings = []string{"S4"} },
		func(t *DecisionTrace) { t.OwnershipComparisonEvidence.Comparisons[1].InheritedValue = 8 },
		func(t *DecisionTrace) { t.OwnershipComparisonEvidence = nil },
		func(t *DecisionTrace) { t.SchemaVersion = OwnershipTraceSchemaVersion },
		func(t *DecisionTrace) { t.PolicyID = OwnershipPolicyID },
		func(t *DecisionTrace) { t.Cue = "Play spades to win the deal." },
		func(t *DecisionTrace) {
			for i, fact := range t.Support {
				if fact.ID == "trix-layout-unlock-H3-H2" {
					t.Support = append(t.Support[:i], t.Support[i+1:]...)
					return
				}
			}
		},
	} {
		raw, _ := json.Marshal(trace)
		var changed DecisionTrace
		if err := json.Unmarshal(raw, &changed); err != nil {
			t.Fatal(err)
		}
		mutate(&changed)
		if ValidateDecisionTrace(o, changed) == nil {
			t.Fatal("rewritten comparison passed actor-packet validation")
		}
		if _, err := BuildCoachMessage(changed, "comparison-test"); err == nil {
			t.Fatal("rewritten comparison passed saved-message validation")
		}
	}
}

func TestTrixOwnershipComparisonPartnerReleaseAndOtherPhases(t *testing.T) {
	s := ownershipChoiceState(t, "basic-partners")
	trace := comparisonTrace(t, Observe(s, 0))
	if !strings.Contains(trace.Summary, "teammate") || strings.Contains(trace.Cue, "avoid opening the opponent") || strings.Contains(trace.Summary, "prefers connected paths") {
		t.Fatal("partner opening became an opponent claim")
	}
	for _, variant := range Variants {
		config := Config{ID: "comparison-phases", Variant: variant, LayoutHistoryVersion: "1.0.0"}
		if partners(variant) {
			config.ProfileVersion = "1.1.0"
		}
		state, err := New(config, shuffledTestDeck(83))
		if err != nil {
			t.Fatal(err)
		}
		o := Observe(state, state.Turn)
		request := comparisonTrace(t, o)
		if request.OwnershipComparisonEvidence.Coverage != "outside-scope" {
			t.Fatal("request decision gained layout evidence")
		}
		state, err = Apply(state, state.Turn, Action{Kind: "choose-request", Request: "trix"})
		if err != nil {
			t.Fatal(err)
		}
		comparisonTrace(t, Observe(state, state.Turn))
	}
}

func TestTrixOwnershipComparisonHiddenExchange(t *testing.T) {
	a := Observe(frontierNativeGapState(t, "complex-partners", false), 0)
	b := Observe(frontierNativeGapState(t, "complex-partners", true), 0)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("hidden exchange changed actor observation")
	}
	left, right := comparisonTrace(t, a), comparisonTrace(t, b)
	if !reflect.DeepEqual(left, right) {
		t.Fatal("hidden holdings changed comparison evidence")
	}
}
