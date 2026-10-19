package trix

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func layoutPreferencePrefix(t *testing.T, steps int) State {
	t.Helper()
	hands := [4][]string{{"H7", "CJ", "DJ", "SJ"}, {"CQ", "CK", "CA", "HJ", "D10"}, {"H10"}, {}}
	s := currentChronologyState(t, "basic-partners", completeHands(t, hands))
	s = mustApply(t, s, 0, Action{Kind: "choose-request", Request: "trix"})
	actions := []Action{{Kind: "layout-card", Card: "CJ"}, {Kind: "layout-pass"}, {Kind: "layout-pass"}, {Kind: "layout-card", Card: "CQ"}, {Kind: "layout-card", Card: "DJ"}, {Kind: "layout-pass"}, {Kind: "layout-card", Card: "DQ"}, {Kind: "layout-card", Card: "CK"}, {Kind: "layout-card", Card: "SJ"}, {Kind: "layout-card", Card: "S10"}, {Kind: "layout-card", Card: "DK"}, {Kind: "layout-card", Card: "HJ"}}
	for _, action := range actions[:steps] {
		s = mustApply(t, s, s.Turn, action)
	}
	return s
}

func layoutFactSummary(t *testing.T, o Observation, id string) string {
	t.Helper()
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	for _, fact := range trace.FactCatalog {
		if fact.ID == id {
			if fact.Kind != "exact" {
				t.Fatalf("public choice provenance is not exact: %+v", fact)
			}
			return fact.Text
		}
	}
	t.Fatalf("missing public chronology fact %s", id)
	return ""
}

func TestTrixLayoutHistorySignalsUseOnlyPresentPublicPrefix(t *testing.T) {
	// A later same-seat jack proves an alternative at an earlier upper play,
	// but cannot enter the saved earlier prefix before that jack is public.
	early := Observe(layoutPreferencePrefix(t, 4), 0)
	earlyTrace, err := BuildDecisionTrace(early, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	frozen, _ := json.Marshal(earlyTrace)
	for _, signal := range earlyTrace.HistoryEvidence.Signals {
		if signal.ID == "trix-history-layout-voluntary-4" {
			t.Fatal("future HJ became an earlier voluntary-choice signal")
		}
	}
	if summary := layoutFactSummary(t, early, "trix-history-layout-turn-4"); !strings.Contains(summary, "choice status: unknown") {
		t.Fatal("absence of a known alternative became forced")
	}
	later := Observe(layoutPreferencePrefix(t, 12), 0)
	trace, err := BuildDecisionTrace(later, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	repeated := false
	for _, signal := range trace.HistoryEvidence.Signals {
		if signal.ID == "trix-history-layout-voluntary-4" {
			found = true
			if signal.Seat != 1 || signal.Ref != "deal:1:layout-turn:4" || signal.Chosen != "CQ" || !reflect.DeepEqual(signal.KnownAlternatives, []string{"HJ"}) {
				t.Fatalf("unproved or missing earlier alternative: %+v", signal)
			}
		}
		if signal.ID == "trix-history-layout-repeated-upper-1" {
			repeated = true
			if !strings.Contains(signal.Interpretation, "may") || !strings.Contains(signal.Interpretation, "changes no action score") {
				t.Fatalf("unqualified or weighted intent claim: %+v", signal)
			}
		}
	}
	if !found || !repeated {
		t.Fatalf("missing voluntary/repeated cues: %+v", trace.HistoryEvidence.Signals)
	}
	if summary := layoutFactSummary(t, later, "trix-history-layout-turn-4"); !strings.Contains(summary, "choice status: voluntary") || !strings.Contains(summary, "HJ") {
		t.Fatal("missing exact voluntary-choice provenance")
	}
	after, _ := json.Marshal(earlyTrace)
	if !bytes.Equal(frozen, after) {
		t.Fatal("later public play rewrote saved earlier trace")
	}
	if err = ValidateDecisionTrace(early, earlyTrace); err != nil {
		t.Fatal("earlier prefix no longer audits", err)
	}
}

func TestTrixLayoutHistorySignalsKeepPlacementOwnershipSeparateFromForcing(t *testing.T) {
	s := layoutPreferencePrefix(t, 12)
	o := Observe(s, 0)
	if summary := layoutFactSummary(t, o, "trix-history-layout-turn-2"); !strings.Contains(summary, "choice status: forced") {
		t.Fatal("accepted pass lacks exact forced status")
	}
	if summary := layoutFactSummary(t, o, "trix-history-layout-turn-1"); !strings.Contains(summary, "choice status: voluntary") || !strings.Contains(summary, "DJ, SJ") {
		t.Fatal("actor's known alternatives not sorted and deduplicated")
	}
	for s.Phase == "layout" {
		s = mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
	}
	o = Observe(s, 0)
	facts := traceFactCatalog(o, HistoryPolicyID, &HistoryEvidence{Coverage: "outside-scope", Signals: historySignals(o)})
	lastCard := 0
	for _, turn := range s.LayoutHistory.Turns {
		if turn.Kind != "layout-card" || turn.HandCountsBefore[turn.Seat] != 1 {
			continue
		}
		lastCard++
		found := false
		for _, fact := range facts {
			if fact.ID == "trix-history-layout-turn-"+strconv.Itoa(turn.Ordinal) {
				found = strings.Contains(fact.Text, "choice status: forced")
			}
		}
		if !found {
			t.Fatalf("last-card placement treated as preference: %+v", turn)
		}
	}
	if lastCard != 4 {
		t.Fatal("native layout did not finish all four hands")
	}
}

func TestTrixLayoutHistorySignalsChangeNoActionWeights(t *testing.T) {
	s := layoutPreferencePrefix(t, 12)
	o := Observe(s, 0)
	prior, err := BuildDecisionTrace(o, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	history, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prior.Candidates, history.Candidates) || prior.SelectedCandidateID != history.SelectedCandidateID {
		t.Fatal("conditional history cue changed layout action ranking")
	}
	legacy := o
	legacy.LayoutHistory = nil
	legacy.publicSchemaVersion = "1.1.0"
	old, err := BuildDecisionTrace(legacy, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	foundGap := false
	for _, fact := range old.FactCatalog {
		if fact.ID == "trix-history-layout-evidence-gap" {
			foundGap = true
		}
	}
	if !foundGap {
		t.Fatal("legacy missing-history limit was removed")
	}
	for _, fact := range history.FactCatalog {
		if fact.ID == "trix-history-layout-evidence-gap" {
			t.Fatal("available chronology still reported missing")
		}
	}
	bad := Observe(clone(s), 0)
	bad.LayoutHistory.Turns[3].BoardBefore[0].High = 14
	if _, err = BuildDecisionTrace(bad, HistoryPolicyID); err == nil {
		t.Fatal("malformed public chronology supplied strategic evidence")
	}
}
