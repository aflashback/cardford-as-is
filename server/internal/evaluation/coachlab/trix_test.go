package coachlab

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
)

func testTrixEnvelope(t *testing.T, variant string) RunEnvelope {
	e := testEnvelope(t, "spades-partners")
	e.SchemaVersion = "coach-lab-run-2.0.0"
	e.Base.SchemaVersion = "multi-game-evaluation-2.0.0"
	e.Base.Variant = "trix-" + variant
	pin := trix.Pin(variant)
	e.Base.RuleProfile.ID = pin.RuleProfileID
	e.Lab.Selector = sessions.Selector{GameID: "trix", VariantID: variant, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
	e.Base.Candidate.ID = "trix-deterministic-1.0.0"
	e.Base.Reference.ID = e.Base.Candidate.ID
	e.Lab.Config = json.RawMessage(`{"id":"trix-lab","variant":"` + variant + `"}`)
	for i := range e.Lab.SeatPolicies {
		e.Lab.SeatPolicies[i] = SeatPolicyPin{i, e.Base.Candidate.ID, "1.0.0"}
	}
	e.Base.MaxWallMS = 240000
	e.Lab.Caps.MaxWallMS = 240000
	return e
}

func TestTrixAdapterPreservesHistoricalSelector(t *testing.T) {
	pin := trix.LegacyPin("basic-partners")
	selector := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
	adapter, err := NewAdapter(selector)
	if err != nil {
		t.Fatal(err)
	}
	config, _ := json.Marshal(trix.Config{ID: "historical-lab", Variant: pin.VariantID})
	material, _ := json.Marshal(trix.Chance{Deck: trix.Deck()})
	bound, err := adapter.Start(config, material)
	if err != nil || bound.Pin() != pin {
		t.Fatalf("historical adapter changed pin: %v", err)
	}
	raw, err := bound.SerializePrivate()
	if err != nil {
		t.Fatal(err)
	}
	resumed, err := adapter.Open(raw)
	if err != nil || resumed.Pin() != pin {
		t.Fatalf("historical adapter cannot resume: %v", err)
	}
}

func TestTrixBlindPacketPreservesPublicTwosAnnouncement(t *testing.T) {
	e := testTrixEnvelope(t, "basic-partners")
	a, err := NewAdapter(e.Lab.Selector)
	if err != nil {
		t.Fatal(err)
	}
	config, _ := json.Marshal(trix.Config{ID: "blind-twos", Variant: "basic-partners"})
	material, _ := json.Marshal(trix.Chance{Deck: trix.Deck()})
	bound, err := a.Start(config, material)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := bound.Node()
	transition, err := bound.Commit(*n.Seat, "choose:trix")
	if err != nil {
		t.Fatal(err)
	}
	bound = transition.Next
	n, _ = bound.Node()
	p, err := Prepare(context.Background(), bound, SeatPolicyPin{*n.Seat, trix.PolicyID, "1.0.0"}, "announcement")
	if err != nil {
		t.Fatal(err)
	}
	binding, _ := bound.PreparationBinding(*n.Seat, trix.PolicyID)
	record := DecisionRecord{ActorPacket: binding.Packet, LegalCandidates: []LabCandidate{}, SelectedCandidateID: p.Prepared.CandidateID}
	blind, err := ExportBlindPacket(record)
	if err != nil {
		t.Fatal(err)
	}
	var packet struct {
		Observation struct {
			TwoAnnouncements *trix.TwoAnnouncements `json:"twoAnnouncements"`
		} `json:"observation"`
	}
	if err = json.Unmarshal(blind.ActorPacket, &packet); err != nil {
		t.Fatal(err)
	}
	if packet.Observation.TwoAnnouncements == nil || packet.Observation.TwoAnnouncements.Counts == nil || *packet.Observation.TwoAnnouncements.Counts != [4]int{1, 1, 1, 1} {
		t.Fatal("public announcement disappeared from blind actor evidence")
	}
	if blind.RuleProfileID != "trix-basic-partners-1.1.0" {
		t.Fatal("current blind rules changed to historical rules")
	}
}

func TestTrixCandidatePolicyAdmissionAndSeatAssignment(t *testing.T) {
	e := testTrixEnvelope(t, "basic-partners")
	e.Base.Candidate.ID = "trix-reasoning-1.0.0"
	if err := e.Validate(); err != nil {
		t.Fatal(err)
	}
	specs := EpisodeSpecs(e)
	if specs[0].Policies[0].ID != trix.PolicyID || specs[1].Policies[0].ID != "trix-reasoning-1.0.0" || specs[1].Policies[1].ID != trix.PolicyID {
		t.Fatal("paired arms ignored per-seat Trix candidate")
	}
	foreign := testEnvelope(t, "spades-partners")
	if ValidatePolicy(foreign.Lab.Selector, SeatPolicyPin{0, "trix-reasoning-1.0.0", "1.0.0"}) == nil {
		t.Fatal("Trix candidate entered another game")
	}
}
func TestTrixNativeAdapterCollectsExactPreparation(t *testing.T) {
	for _, variant := range []string{"basic-solo", "basic-partners", "complex-solo", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			e := testTrixEnvelope(t, variant)
			raw, _ := json.Marshal(e)
			if _, err := DecodeRun(raw); err != nil {
				t.Fatal(err)
			}
			wrong := e
			wrong.SchemaVersion = "coach-lab-run-1.0.0"
			wrongRaw, _ := json.Marshal(wrong)
			if _, err := DecodeRun(wrongRaw); err == nil {
				t.Fatal("Trix manifest entered the frozen H/S envelope branch")
			}
			a, err := NewAdapter(e.Lab.Selector)
			if err != nil {
				t.Fatal(err)
			}
			s, err := NewEpisodeState(e, EpisodeSpecs(e)[0], a)
			if err != nil {
				t.Fatal(err)
			}
			n, _ := s.Session.Node()
			p, err := PrepareRecord(context.Background(), s, *n.Seat)
			if err != nil {
				t.Fatal(err)
			}
			if p.Preparation.Advice.Schema != "TrixAdvice" || len(p.Decision.CoachMessage) == 0 {
				t.Fatal("lost module original or explicit coaching gap")
			}
			if _, err := ExportBlindPacket(p.Decision); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestTrixAuditRejectsForgedSavedCueAndAnalysis(t *testing.T) {
	e := testTrixEnvelope(t, "basic-solo")
	a, err := NewAdapter(e.Lab.Selector)
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewEpisodeState(e, EpisodeSpecs(e)[0], a)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := s.Session.Node()
	saved, err := PrepareRecord(context.Background(), s, *n.Seat)
	if err != nil {
		t.Fatal(err)
	}
	var message contracts.CoachMessage
	if err = json.Unmarshal(saved.Decision.CoachMessage, &message); err != nil {
		t.Fatal(err)
	}
	message.Cue = "Play Ace of spades to win this trump trick."
	forged := saved.Decision
	forged.CoachMessage, _ = json.Marshal(message)
	if AuditTrixDecision(forged).Status != "failed" {
		t.Fatal("audit accepted a cue naming an unrelated action and nonexistent trump")
	}
	var analysis map[string]any
	_ = json.Unmarshal(saved.Decision.OriginalAnalysis, &analysis)
	analysis["hiddenHands"] = []string{"SA"}
	forged = saved.Decision
	forged.OriginalAnalysis, _ = json.Marshal(analysis)
	forged.RegisteredAnalysis = forged.OriginalAnalysis
	if AuditTrixDecision(forged).Status != "failed" {
		t.Fatal("audit accepted unknown original analysis fields")
	}
}

func TestTrixCandidateRecordUsesSavedTraceAcrossPhasesAndProfiles(t *testing.T) {
	for _, installed := range trix.Installations() {
		pin := installed.Pin
		t.Run(pin.RuleProfileID, func(t *testing.T) {
			e := testTrixEnvelope(t, pin.VariantID)
			e.Lab.Selector = sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
			e.Base.RuleProfile.ID = pin.RuleProfileID
			e.Base.Candidate.ID = trix.ReasoningPolicyID
			for i := range e.Lab.SeatPolicies {
				e.Lab.SeatPolicies[i] = SeatPolicyPin{i, trix.ReasoningPolicyID, "1.0.0"}
			}
			a, err := NewAdapter(e.Lab.Selector)
			if err != nil {
				t.Fatal(err)
			}
			penalty := "queens"
			if pin.VariantID == "complex-solo" || pin.VariantID == "complex-partners" {
				penalty = "complex"
			}
			seen := map[string]bool{}
			for _, request := range []string{"trix", penalty} {
				config, _ := json.Marshal(trix.Config{ID: "saved-trace", Variant: pin.VariantID})
				material, _ := json.Marshal(trix.Chance{Deck: trix.Deck()})
				b, err := a.Start(config, material)
				if err != nil {
					t.Fatal(err)
				}
				s := &EpisodeState{Spec: EpisodeSpecs(e)[1], Adapter: a, Session: b, Pending: map[int]PreparedRecord{}, MaxDecisionMS: 5000}
				for step := 0; step < 6; step++ {
					n, _ := s.Session.Node()
					if n.Seat == nil {
						t.Fatal("fixture ended before phase checks")
					}
					native, err := Prepare(context.Background(), s.Session, s.Spec.Policies[*n.Seat], "schema-probe")
					if err != nil {
						t.Fatal(err)
					}
					if err = contracts.Validate("TrixAdvice", native.Advice.Bytes); err != nil {
						t.Fatal(err)
					}
					saved, err := PrepareRecord(context.Background(), s, *n.Seat)
					if err != nil {
						t.Fatal(err)
					}
					seen[saved.Decision.Phase] = true
					if saved.Preparation.Detail.Schema != "TrixDecisionTrace" || bytes.Equal(saved.Decision.OriginalAnalysis, saved.Decision.RegisteredAnalysis) {
						t.Fatal("lost original private trace or replaced registered projection")
					}
					var trace trix.DecisionTrace
					if err = json.Unmarshal(saved.Decision.OriginalAnalysis, &trace); err != nil {
						t.Fatal(err)
					}
					message, err := trix.BuildCoachMessage(trace, saved.Decision.DecisionID)
					if err != nil {
						t.Fatal(err)
					}
					raw, _ := json.Marshal(message)
					if !jsonEqual(raw, saved.Decision.CoachMessage) || saved.Decision.Audit.Status == "failed" {
						t.Fatal("coach used a different action or trace")
					}
					if err = verifyTrixPreparation(saved); err != nil {
						t.Fatal(err)
					}
					changed := saved.Decision
					trace.Support[0].Text = "Known trump winner with all hidden cards."
					changed.OriginalAnalysis, _ = json.Marshal(trace)
					if AuditTrixDecision(changed).Status != "failed" {
						t.Fatal("audit accepted forged exact saved fact")
					}
					var original trix.Advice
					_ = json.Unmarshal(saved.Decision.OriginalAdvice, &original)
					original.Text = "A different original reason."
					changed = saved.Decision
					changed.OriginalAdvice, _ = json.Marshal(original)
					if AuditTrixDecision(changed).Status != "failed" {
						t.Fatal("audit accepted advice no longer bound to saved trace")
					}
					action := saved.Decision.SelectedCandidateID
					if step == 0 {
						action = "choose:" + request
					}
					transition, err := s.Session.Commit(*n.Seat, action)
					if err != nil {
						t.Fatal(err)
					}
					s.Session = transition.Next
					s.Revision++
				}
			}
			for _, phase := range []string{"choose-request", "declare-doubles", "playing", "layout"} {
				if !seen[phase] {
					t.Fatalf("fixture omitted %s", phase)
				}
			}
		})
	}
}
func TestTrixCompleteNativeSchedule(t *testing.T) {
	for _, variant := range []string{"basic-solo", "basic-partners", "complex-solo", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			e := testTrixEnvelope(t, variant)
			j, err := OpenJournal(filepath.Join(t.TempDir(), "run"), e, false)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = j.Close() })
			r, err := Run(context.Background(), e, j)
			if err != nil {
				t.Fatal(err)
			}
			_ = j.Close()
			rounds := 20
			if variant == "complex-solo" || variant == "complex-partners" {
				rounds = 8
			}
			if r.Status != "complete" {
				t.Fatalf("Trix trajectory not complete: %+v", r)
			}
			for _, ep := range r.Episodes {
				if ep.Outcome == nil || ep.Outcome.Rounds != rounds || len(ep.Outcome.WinnerIDs) == 0 {
					t.Fatalf("wrong module completion: %+v", ep)
				}
			}
		})
	}
}
