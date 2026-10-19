package trix

import (
	"reflect"
	"testing"
)

// Keep the policy literal so the first run fails at policy admission, rather
// than failing to compile before the candidate implementation exists.
const frontierNativeTestPolicy = "trix-frontier-1.0.0"

// This is a complete native deal followed by two legal actions. Seat 1 owns
// H7, chooses Trix Jacks, and opens SJ. Seat 0 must then choose between DJ and
// S10: four distant diamonds are blocked by outside D10, whereas S9 is owned.
func frontierNativeGapState(t *testing.T, variant string, exchangeHidden bool) State {
	t.Helper()
	own := []string{"C2", "C4", "C6", "C8", "C10", "D3", "D5", "D7", "D9", "DJ", "H2", "S9", "S10"}
	deck := reasoningNativeDeck([4][]string{own, {"H7", "SJ"}, {}, {}})
	if exchangeHidden {
		left, right := -1, -1
		for index := 26; index < 39; index++ {
			if rank(deck[index]) != 2 {
				left = index
				break
			}
		}
		for index := 39; index < 52; index++ {
			if rank(deck[index]) != 2 {
				right = index
				break
			}
		}
		if left < 0 || right < 0 {
			t.Fatal("fixture cannot exchange two unannounced cards")
		}
		deck[left], deck[right] = deck[right], deck[left]
	}
	s, err := New(Config{ID: "frontier-native-gap", Variant: variant, ProfileVersion: "1.1.0", LayoutHistoryVersion: "1.0.0"}, deck)
	if err != nil {
		t.Fatal(err)
	}
	if s.Owner != 1 {
		t.Fatalf("fixture opening owner = %d", s.Owner)
	}
	for _, action := range []Action{{Kind: "choose-request", Request: "trix"}, {Kind: "layout-card", Card: "SJ"}} {
		s, err = Apply(s, s.Turn, action)
		if err != nil {
			t.Fatal(err)
		}
		if err = validateState(s); err != nil {
			t.Fatal(err)
		}
	}
	if s.Turn != 0 {
		t.Fatalf("fixture actor = %d", s.Turn)
	}
	return s
}

func TestFrontierNativeReachableGapChangesChoice(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			s := frontierNativeGapState(t, variant, false)
			o := Observe(s, s.Turn)
			legal := Legal(o)
			if len(legal) != 2 || ActionID(legal[0]) != "layout:DJ" || ActionID(legal[1]) != "layout:S10" || o.LayoutHistory == nil || len(o.LayoutHistory.Turns) != 1 {
				t.Fatalf("unexpected native choice: legal=%+v history=%+v", legal, o.LayoutHistory)
			}
			for _, policy := range []string{PolicyID, ReasoningPolicyID, HistoryPolicyID} {
				a, err := DecideWithPolicy(o, policy)
				if err != nil || ActionID(a) != "layout:DJ" {
					t.Fatalf("historical %s changed: %+v %v", policy, a, err)
				}
			}
			trace, err := BuildDecisionTrace(o, frontierNativeTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			if trace.SelectedCandidateID != "layout:S10" || trace.Candidates[0].Value != -1 || trace.Candidates[1].Value != 8 {
				t.Fatalf("gap credit was retained or connected path lost: %+v", trace)
			}
			pin, err := PinForPublicSchema(variant, "1.2.0")
			if err != nil {
				t.Fatal(err)
			}
			if err = ValidateDecisionTraceWithPin(o, trace, pin); err != nil {
				t.Fatal(err)
			}
			message, err := BuildCoachMessage(trace, "frontier-native-choice")
			if err != nil || message.SelectedAction != trace.SelectedCandidateID {
				t.Fatalf("coach did not share saved bot selection: %+v %v", message, err)
			}
			s, err = Apply(s, s.Turn, trace.Action)
			if err != nil {
				t.Fatal(err)
			}
			if err = validateState(s); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestFrontierNativeHiddenExchangePreservesActorTrace(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			first := frontierNativeGapState(t, variant, false)
			second := frontierNativeGapState(t, variant, true)
			if reflect.DeepEqual(first.Hands, second.Hands) {
				t.Fatal("hidden hands were not exchanged")
			}
			a, b := Observe(first, 0), Observe(second, 0)
			if !reflect.DeepEqual(a, b) {
				t.Fatal("exchange changed the actor's decision-time observation")
			}
			left, err := BuildDecisionTrace(a, frontierNativeTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			right, err := BuildDecisionTrace(b, frontierNativeTestPolicy)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(left, right) {
				t.Fatal("unobserved hands changed the saved frontier decision")
			}
		})
	}
}

func TestFrontierArchivedCaseKeepsNativeTieOrder(t *testing.T) {
	fixture, packet, err := readLayoutStudyFixture("testdata/layout-jacks-jd-s10.json")
	if err != nil {
		t.Fatal(err)
	}
	o := packet.Observation
	before := observationDigest(o)
	for _, policy := range []string{PolicyID, ReasoningPolicyID, HistoryPolicyID} {
		a, err := DecideWithPolicy(o, policy)
		if err != nil || ActionID(a) != "layout:DJ" {
			t.Fatalf("archived %s selection changed: %+v %v", policy, a, err)
		}
	}
	trace, err := BuildDecisionTrace(o, frontierNativeTestPolicy)
	if err != nil {
		t.Fatal(err)
	}
	if len(trace.Candidates) != 3 || trace.Candidates[0].Value != -1 || trace.Candidates[1].Value != 0 || trace.Candidates[2].Value != 0 {
		t.Fatalf("unexpected corrected archived scores: %+v", trace.Candidates)
	}
	if trace.SelectedCandidateID != "layout:HK" || trace.Status != "no-clear-preference" {
		t.Fatalf("isolated cards must preserve the legal tie order, not force S10: %+v", trace)
	}
	if err = ValidateDecisionTraceWithPin(o, trace, fixture.Pin); err != nil {
		t.Fatal(err)
	}
	message, err := BuildCoachMessage(trace, "frontier-archived-choice")
	if err != nil || message.SelectedAction != "layout:HK" || message.Status != "no-clear-preference" {
		t.Fatalf("archived coach tie differs from bot trace: %+v %v", message, err)
	}
	if before != observationDigest(o) || o.LayoutHistory != nil {
		t.Fatal("archived observation or unavailable chronology changed")
	}
}
