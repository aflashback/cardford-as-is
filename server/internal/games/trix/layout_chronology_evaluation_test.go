package trix

import (
	"context"
	"encoding/json"
	"testing"
)

func TestChronologyTraceAndEvaluationRetainExactPublicPin(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			config := Config{ID: "chronology-evaluation", Variant: variant, LayoutHistoryVersion: "1.0.0"}
			if partners(variant) {
				config.ProfileVersion = "1.1.0"
			}
			state, err := New(config, shuffledTestDeck(34))
			if err != nil {
				t.Fatal(err)
			}
			state, err = Apply(state, state.Turn, Action{Kind: "choose-request", Request: "trix"})
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 5; i++ {
				action, err := Decide(Observe(state, state.Turn))
				if err != nil {
					t.Fatal(err)
				}
				state, err = Apply(state, state.Turn, action)
				if err != nil {
					t.Fatal(err)
				}
			}
			o := Observe(state, state.Turn)
			trace, err := BuildDecisionTrace(o, HistoryPolicyID)
			if err != nil {
				t.Fatal(err)
			}
			if trace.PublicSchemaVersion != "1.2.0" || trace.RuleProfileID != Pin(variant).RuleProfileID {
				t.Fatalf("new observation rebound: %+v", trace)
			}
			if err = ValidateDecisionTraceWithPin(o, trace, Pin(variant)); err != nil {
				t.Fatal(err)
			}
			c := DefaultRequestEvaluationConfig()
			c.Worlds = 2
			result, err := EvaluateRequest(context.Background(), o, Pin(variant), c)
			if err != nil || result.Status != "completed" || len(result.Values) != 2 {
				t.Fatalf("chronology evaluation: %s %+v %v", result.Status, result.Work, err)
			}
			if result.RulePin != Pin(variant) {
				t.Fatal("evaluation discarded the public-history profile")
			}
			// A historical observation cannot silently gain chronology, nor can the
			// new profile accept an observation with the chronology removed.
			_, err = EvaluateRequest(context.Background(), o, LegacyPin(variant), c)
			if err == nil {
				t.Fatal("accepted new history under old pin")
			}
			o.LayoutHistory = nil
			_, err = EvaluateRequest(context.Background(), o, Pin(variant), c)
			if err == nil {
				t.Fatal("accepted missing current chronology")
			}
		})
	}
}

func TestChronologyTracePreservesAnnouncementOnlyHistoricalProfile(t *testing.T) {
	s, err := New(Config{ID: "historical-announcement", Variant: "basic-partners", ProfileVersion: "1.1.0"}, shuffledTestDeck(34))
	if err != nil {
		t.Fatal(err)
	}
	o := Observe(s, s.Turn)
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if trace.PublicSchemaVersion != "1.1.0" || trace.RuleProfileID != "trix-basic-partners-1.1.0" {
		t.Fatal("historical trace rebound to new module")
	}
	raw, _ := json.Marshal(o)
	var wire map[string]json.RawMessage
	_ = json.Unmarshal(raw, &wire)
	if _, ok := wire["layoutHistory"]; ok {
		t.Fatal("historical observation acquired new knowledge")
	}
	if err = ValidateDecisionTraceWithPin(o, trace, AnnouncedPin("basic-partners")); err != nil {
		t.Fatal(err)
	}
}
