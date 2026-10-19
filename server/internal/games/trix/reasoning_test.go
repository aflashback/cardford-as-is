package trix

import (
	"bytes"
	"cardford/server/internal/contracts"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func reasoningPlay(variant, request string) Observation {
	turn := 0
	return Observation{GameID: "trix", VariantID: variant, Seat: 0, Turn: &turn, Phase: "playing", Request: &request, DealNumber: 1, Kingdom: 1, Hand: []string{"SQ", "D2"}, HandCounts: [4]int{2, 2, 2, 2}, Trick: []Play{{Seat: 2, Card: "CA"}, {Seat: 1, Card: "C3"}}}
}

func TestTrixReasoningDoesNotFeedUnbeatableTeammate(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		request := "queens"
		if variant == "complex-partners" {
			request = "complex"
		}
		o := reasoningPlay(variant, request)
		baseline, err := DecideWithPolicy(o, PolicyID)
		if err != nil || baseline.Card != "SQ" {
			t.Fatalf("historical action changed: %+v %v", baseline, err)
		}
		a, err := DecideWithPolicy(o, ReasoningPolicyID)
		if err != nil || a.Card != "D2" {
			t.Fatalf("fed own team: %+v %v", a, err)
		}
		trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		m, err := BuildCoachMessage(trace, "saved-decision")
		if err != nil {
			t.Fatal(err)
		}
		if m.SelectedAction != "play:D2" || m.Status != "tactical" || !strings.Contains(m.Reason.Summary, "team") || !strings.Contains(strings.Join(m.Reason.Alternatives, " "), "queen") || !strings.Contains(strings.Join(m.Reason.Limitations, " "), "future") {
			t.Fatalf("incomplete tactical reason: %+v", m)
		}
	}
}

func TestTrixReasoningEnemyCaptureAndSoloAreDifferentObjectives(t *testing.T) {
	for _, variant := range []string{"basic-solo", "complex-solo", "basic-partners", "complex-partners"} {
		request := "queens"
		if strings.HasPrefix(variant, "complex") {
			request = "complex"
		}
		o := reasoningPlay(variant, request)
		if partners(variant) {
			o.Trick = []Play{{Seat: 1, Card: "CA"}}
		}
		a, err := DecideWithPolicy(o, ReasoningPolicyID)
		if err != nil || a.Card != "SQ" {
			t.Fatalf("%s failed enemy release: %+v %v", variant, a, err)
		}
		trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		if !partners(variant) && strings.Contains(trace.Summary, "teammate") {
			t.Fatal("solo assumed a partner")
		}
	}
}

func TestTrixReasoningOvertakingIsConditionalUnlessPubliclyExcluded(t *testing.T) {
	o := reasoningPlay("basic-partners", "queens")
	o.Trick[0].Card = "CK"
	trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	text, _ := json.Marshal(trace.Support)
	if !bytes.Contains(text, []byte("conditional")) || !bytes.Contains(text, []byte("overtake")) {
		t.Fatalf("missing uncertainty: %s", text)
	}
	o.Tricks = []Trick{{Number: 1, Leader: 2, Winner: 2, Plays: []Play{{2, "C10"}, {1, "C4"}, {0, "C5"}, {3, "H3"}}}}
	trace, err = BuildDecisionTrace(o, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	text, _ = json.Marshal(trace.Support)
	if !bytes.Contains(text, []byte("trix-void-3-C")) || !bytes.Contains(text, []byte("cannot overtake")) {
		t.Fatalf("ignored exact void: %s", text)
	}
}

func TestTrixReasoningLayoutUsesRevealedPartnerTwoButNotHiddenSuits(t *testing.T) {
	turn, request := 0, "trix"
	o := Observation{GameID: "trix", VariantID: "basic-partners", Seat: 0, Turn: &turn, Phase: "layout", Request: &request, Hand: []string{"C3", "D3", "D2"}, HandCounts: [4]int{3, 4, 1, 4}, Board: []Row{{"C", 4, 14}, {"D", 4, 14}, {"H", 11, 11}, {"S", 11, 11}}, TwoAnnouncements: &TwoAnnouncements{Status: "revealed", Cards: []Play{{2, "C2"}}}}
	a, err := DecideWithPolicy(o, ReasoningPolicyID)
	if err != nil || a.Card != "C3" {
		t.Fatalf("failed to open teammate's last card: %+v %v", a, err)
	}
	trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(trace.Summary, "teammate") || !strings.Contains(trace.Summary, "finish") {
		t.Fatalf("missing team finish purpose: %s", trace.Summary)
	}
	counts := [4]int{1, 1, 1, 1}
	o.TwoAnnouncements = &TwoAnnouncements{Status: "hidden", Counts: &counts}
	a, err = DecideWithPolicy(o, ReasoningPolicyID)
	if err != nil || a.Card != "D3" {
		t.Fatalf("hidden suits treated as known: %+v %v", a, err)
	}
	o.VariantID = "basic-solo"
	o.TwoAnnouncements = nil
	a, err = DecideWithPolicy(o, ReasoningPolicyID)
	if err != nil || a.Card != "D3" {
		t.Fatalf("solo team objective: %+v %v", a, err)
	}
}

func TestTrixReasoningPreparationSavesTraceAndRejectsTransplant(t *testing.T) {
	for _, r := range Installations() {
		config, _ := json.Marshal(Config{ID: "trace-test", Variant: r.Pin.VariantID})
		material, _ := json.Marshal(Chance{Deck: shuffledTestDeck(19)})
		b, err := r.Start(config, material)
		if err != nil {
			t.Fatal(err)
		}
		n, _ := b.Node()
		p, err := b.PrepareComplete(context.Background(), *n.Seat, ReasoningPolicyID, "trace-id")
		if err != nil {
			t.Fatal(err)
		}
		if p.Detail.Schema != "TrixDecisionTrace" {
			t.Fatalf("missing private trace: %s", p.Detail.Schema)
		}
		if err = contracts.Validate("TrixAdvice", p.Advice.Bytes); err != nil {
			t.Fatalf("native advice schema: %v", err)
		}
		var trace DecisionTrace
		if err = json.Unmarshal(p.Detail.Bytes, &trace); err != nil {
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
		m, err := BuildCoachMessage(trace, "trace-id")
		if err != nil || m.SelectedAction != p.Prepared.CandidateID {
			t.Fatalf("saved trace/action mismatch: %+v %v", m, err)
		}
		mutated := packet.Observation
		mutated.Hand = append([]string{}, mutated.Hand...)
		mutated.Hand[0] = "invalid"
		if ValidateDecisionTrace(mutated, trace) == nil {
			t.Fatal("transplanted trace accepted")
		}
		wrong := r.Pin
		wrong.PublicSchemaVersion = "9.0.0"
		if ValidateDecisionTraceWithPin(packet.Observation, trace, wrong) == nil {
			t.Fatal("different public profile accepted")
		}
		baseline, err := b.PrepareComplete(context.Background(), *n.Seat, PolicyID, "baseline-id")
		if err != nil || baseline.Detail.Schema != "RegisteredAnalysis" {
			t.Fatalf("baseline output changed: %+v %v", baseline, err)
		}
	}
}

func TestTrixReasoningForcedAndTiesDoNotClaimPreference(t *testing.T) {
	turn, request := 0, "diamonds"
	o := Observation{GameID: "trix", VariantID: "basic-solo", Seat: 0, Turn: &turn, Phase: "playing", Request: &request, Hand: []string{"C2"}, Trick: []Play{{1, "CA"}}}
	trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	m, err := BuildCoachMessage(trace, "only")
	if err != nil || m.Status != "only-option" {
		t.Fatalf("forced claim: %+v %v", m, err)
	}
	o.Hand = []string{"C2", "S2"}
	o.Trick = nil
	trace, err = BuildDecisionTrace(o, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	m, err = BuildCoachMessage(trace, "tie")
	if err != nil || m.Status != "no-clear-preference" {
		t.Fatalf("tie claim: %+v %v", m, err)
	}
	if _, err = DecideWithPolicy(o, "unknown-policy"); err == nil {
		t.Fatal("unknown policy silently admitted")
	}
}

func TestTrixReasoningRequestAndDoublingUseOwnEscapeCover(t *testing.T) {
	for _, variant := range Variants {
		turn := 0
		o := Observation{GameID: "trix", VariantID: variant, Seat: 0, Turn: &turn, Owner: 1, Phase: "choose-request", RemainingRequests: requests(variant), Hand: []string{"CJ", "DJ", "HJ", "SJ"}}
		trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		if trace.Action.Request != "trix" || !strings.Contains(trace.Cue, "Trix Jacks") {
			t.Fatalf("Jack openings ignored: %+v", trace)
		}
		request := "queens"
		if strings.HasPrefix(variant, "complex") {
			request = "complex"
		}
		o.Phase = "declare-doubles"
		o.Request = &request
		o.Hand = []string{"SQ", "S2", "S3", "S4", "S5", "S6", "S7", "S8"}
		trace, err = BuildDecisionTrace(o, ReasoningPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		if len(trace.Action.Cards) != 1 || trace.Action.Cards[0] != "SQ" {
			t.Fatalf("conditional own cover unused: %+v", trace.Action)
		}
		if !strings.Contains(trace.Summary, "not a guarantee") {
			t.Fatal("conditional double presented as certain")
		}
		if partners(variant) && !strings.Contains(trace.Summary, "opposing team") {
			t.Fatal("team double downside omitted")
		}
		if !partners(variant) && strings.Contains(trace.Summary, "teammate") {
			t.Fatal("solo double assumed a partner")
		}
		o.Hand = []string{"SQ", "SA", "SK"}
		trace, err = BuildDecisionTrace(o, ReasoningPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		if len(trace.Action.Cards) != 0 {
			t.Fatalf("unsafe double accepted: %+v", trace.Action)
		}
		m, err := BuildCoachMessage(trace, "double-cover")
		if err != nil {
			t.Fatal(err)
		}
		if len(m.Reason.Alternatives) != 1 || !strings.Contains(m.Reason.Alternatives[0], "queen of spades") {
			t.Fatal("no concrete doubling alternative")
		}
	}
}

func TestTrixReasoningRejectsReboundWorseActionAndForgedClaims(t *testing.T) {
	o := reasoningPlay("basic-partners", "queens")
	trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range trace.Candidates {
		if c.Action.Card == "SQ" {
			wrong := trace
			wrong.Action = c.Action
			wrong.SelectedCandidateID = c.CandidateID
			wrong.Support = append(relevantSupport(o, c.Action), c.Support...)
			wrong.Support = append(wrong.Support, support("trix-heuristic-preference", "policy", "A fixed deterministic heuristic compares every legal action; its scores are not calibrated probabilities."))
			wrong = renderTrace(wrong)
			if ValidateDecisionTrace(o, wrong) == nil {
				t.Fatal("rebound lower-score action accepted as original selection")
			}
		}
	}
	for _, mutate := range []func(*DecisionTrace){
		func(x *DecisionTrace) { x.Cue = "Play 2 of diamonds - guarantees victory." },
		func(x *DecisionTrace) { x.Status = "only-option" },
		func(x *DecisionTrace) { x.Summary = "This is optimal play. " + x.Summary },
		func(x *DecisionTrace) { x.Alternatives = []string{"All alternatives lose."} },
		func(x *DecisionTrace) { x.Candidates[0].Value += 999 },
		func(x *DecisionTrace) { x.Support[0].Text = "No legal actions." },
	} {
		raw, _ := json.Marshal(trace)
		var wrong DecisionTrace
		_ = json.Unmarshal(raw, &wrong)
		mutate(&wrong)
		if ValidateDecisionTrace(o, wrong) == nil {
			t.Fatal("forged trace accepted")
		}
	}
}

func TestTrixReasoningNativeSecuredTeamDiscard(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		own := []string{}
		for _, c := range Deck() {
			if c[0] == 'S' {
				own = append(own, c)
			}
		}
		other := []string{"CA", "H7"}
		for _, c := range Deck() {
			if c[0] == 'C' && c != "CA" && c != "C3" {
				other = append(other, c)
			}
		}
		deck := reasoningNativeDeck([4][]string{own, {"C3"}, other, {}})
		s, err := New(Config{ID: "native-capture", Variant: variant, ProfileVersion: "1.1.0"}, deck)
		if err != nil {
			t.Fatal(err)
		}
		request := "queens"
		if strings.HasPrefix(variant, "complex") {
			request = "complex"
		}
		s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: request})
		if err != nil {
			t.Fatal(err)
		}
		for s.Phase == "declare-doubles" {
			s, err = Apply(s, s.Turn, Action{Kind: "declare-doubles", Cards: []string{}})
			if err != nil {
				t.Fatal(err)
			}
		}
		for _, card := range []string{"CA", "C3"} {
			s, err = Apply(s, s.Turn, Action{Kind: "play-card", Card: card})
			if err != nil {
				t.Fatal(err)
			}
		}
		if err = validateState(s); err != nil {
			t.Fatal(err)
		}
		o := Observe(s, s.Turn)
		trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
		if err != nil {
			t.Fatal(err)
		}
		baseline, _ := Decide(o)
		if baseline.Card != "SQ" || trace.Action.Card == "SQ" {
			t.Fatalf("native team capture branch: baseline=%+v candidate=%+v", baseline, trace.Action)
		}
		if err = ValidateDecisionTraceWithPin(o, trace, AnnouncedPin(variant)); err != nil {
			t.Fatal(err)
		}
		m, err := BuildCoachMessage(trace, "native-capture")
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(m.Reason.Summary, "team") || len(m.Reason.Alternatives) == 0 {
			t.Fatalf("native reason incomplete: %+v", m)
		}
		s, err = Apply(s, s.Turn, trace.Action)
		if err != nil {
			t.Fatal(err)
		}
		last := Legal(Observe(s, s.Turn))[0]
		s, err = Apply(s, s.Turn, last)
		if err != nil {
			t.Fatal(err)
		}
		if err = validateState(s); err != nil {
			t.Fatal(err)
		}
	}
}

func TestTrixReasoningNativeLayoutAnnouncementAndPassEvidence(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		own := []string{"C3", "D3", "D2"}
		for _, c := range Deck() {
			if c[0] == 'H' && rank(c) >= 3 && rank(c) <= 12 {
				own = append(own, c)
			}
		}
		teammate := []string{"C2", "D4"}
		for _, c := range Deck() {
			if c[0] == 'C' && rank(c) >= 4 {
				teammate = append(teammate, c)
			}
		}
		s, err := New(Config{ID: "native-layout", Variant: variant, ProfileVersion: "1.1.0"}, reasoningNativeDeck([4][]string{own, {}, teammate, {}}))
		if err != nil {
			t.Fatal(err)
		}
		s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for step := 0; step < 160 && s.Phase == "layout"; step++ {
			o := Observe(s, s.Turn)
			legal := Legal(o)
			if s.Turn == 0 && placeable(o.Board, "C3") && placeable(o.Board, "D3") && o.TwoAnnouncements != nil && o.TwoAnnouncements.Status == "revealed" {
				if len(o.TwoAnnouncements.Cards) != 4 {
					t.Fatal("incomplete native public announcement")
				}
				trace, err := BuildDecisionTrace(o, ReasoningPolicyID)
				if err != nil {
					t.Fatal(err)
				}
				if err = ValidateDecisionTraceWithPin(o, trace, AnnouncedPin(variant)); err != nil {
					t.Fatal(err)
				}
				for _, c := range trace.Candidates {
					if c.Action.Card == "C3" {
						text, _ := json.Marshal(c.Support)
						if !bytes.Contains(text, []byte("trix-layout-unlock-C3-C2")) {
							t.Fatalf("ignored native announced teammate two: %s", text)
						}
					}
				}
				m, err := BuildCoachMessage(trace, "native-layout")
				if err != nil {
					t.Fatal(err)
				}
				raw, _ := json.Marshal(m)
				if err = contracts.Validate("CoachMessage", raw); err != nil {
					t.Fatal(err)
				}
				found = true
				break
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
			s, err = Apply(s, s.Turn, a)
			if err != nil {
				t.Fatal(err)
			}
			if err = validateState(s); err != nil {
				t.Fatal(err)
			}
		}
		if !found {
			t.Fatal("native layout fixture did not reach advertised public-two choice")
		}
	}
}

// Complete 52-card authored deals use the real native reducer and its legal
// actions; scoring unit fixtures above deliberately isolate individual factors.
func reasoningNativeDeck(required [4][]string) []string {
	used := map[string]bool{}
	for _, hand := range required {
		for _, c := range hand {
			used[c] = true
		}
	}
	left := []string{}
	for _, c := range Deck() {
		if !used[c] {
			left = append(left, c)
		}
	}
	deck := []string{}
	for _, hand := range required {
		missing := 13 - len(hand)
		deck = append(deck, hand...)
		deck = append(deck, left[:missing]...)
		left = left[missing:]
	}
	return deck
}
