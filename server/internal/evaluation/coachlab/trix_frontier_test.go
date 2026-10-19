package coachlab

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestTrixFrontierCandidateAdmissionAndSavedTrace(t *testing.T) {
	const frontier = trix.FrontierPolicyID
	for _, variant := range trix.Variants {
		pins := []gamekernel.Pin{trix.Pin(variant), trix.LegacyPin(variant)}
		if variant == "basic-partners" || variant == "complex-partners" {
			pins = append(pins, trix.AnnouncedPin(variant))
		}
		for _, pin := range pins {
			t.Run(variant+"/"+pin.ModuleVersion, func(t *testing.T) {
				e := testTrixEnvelope(t, variant)
				e.Base.Candidate.ID = frontier
				e.Base.Reference.ID = trix.HistoryPolicyID
				e.Base.RuleProfile.ID = pin.RuleProfileID
				e.Lab.Selector = sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
				if err := e.Validate(); err != nil {
					t.Fatal(err)
				}
				specs := EpisodeSpecs(e)
				if specs[0].Policies[0].ID != trix.HistoryPolicyID || specs[1].Policies[0].ID != frontier || specs[1].Policies[1].ID != trix.PolicyID {
					t.Fatal("paired arm or background identity changed")
				}
				adapter, err := NewAdapter(e.Lab.Selector)
				if err != nil {
					t.Fatal(err)
				}
				episode, err := NewEpisodeState(e, specs[1], adapter)
				if err != nil {
					t.Fatal(err)
				}
				if episode.Session.Pin() != pin {
					t.Fatal("native profile changed during candidate admission")
				}
				node, err := episode.Session.Node()
				if err != nil || node.Seat == nil {
					t.Fatalf("actor node: %v", err)
				}
				actor := *node.Seat
				episode.Spec.Policies[actor] = SeatPolicyPin{actor, frontier, "1.0.0"}
				prepared, err := Prepare(context.Background(), episode.Session, episode.Spec.Policies[actor], "frontier-original")
				if err != nil {
					t.Fatal(err)
				}
				again, err := Prepare(context.Background(), episode.Session, episode.Spec.Policies[actor], "frontier-original")
				if err != nil || !reflect.DeepEqual(prepared, again) {
					t.Fatal("candidate preparation did not reproduce", err)
				}
				record, err := prepareTrixRecord(episode, actor, "frontier-original", prepared)
				if err != nil {
					t.Fatal(err)
				}
				if err := verifyTrixPreparation(record); err != nil {
					t.Fatal(err)
				}
				var trace trix.DecisionTrace
				if err := json.Unmarshal(record.Decision.OriginalAnalysis, &trace); err != nil {
					t.Fatal(err)
				}
				message, err := savedTrixMessage(record.Decision)
				if err != nil || trace.PolicyID != frontier || trace.PolicyVersion != "1.0.0" || trace.SelectedCandidateID != prepared.Prepared.CandidateID || message.SelectedAction != trace.SelectedCandidateID || message.PolicyVersion != frontier {
					t.Fatal("saved bot/trace/coach policy or action disagrees", err)
				}
				if trace.RuleProfileID != pin.RuleProfileID || trace.PublicSchemaVersion != pin.PublicSchemaVersion || trace.VariantID != pin.VariantID || record.Decision.Audit.Status == "failed" {
					t.Fatal("saved trace profile or exact audit disagrees")
				}
			})
		}
	}
}

func TestTrixFrontierPinAndContinuationIsolation(t *testing.T) {
	const frontier = trix.FrontierPolicyID
	e := testTrixEnvelope(t, "basic-partners")
	for _, pin := range []SeatPolicyPin{{0, frontier, "2.0.0"}, {4, frontier, "1.0.0"}, {0, "trix-frontier-9.0.0", "1.0.0"}} {
		if ValidatePolicy(e.Lab.Selector, pin) == nil {
			t.Fatal("invalid candidate/version/seat admitted")
		}
	}
	for _, game := range []string{"spades-partners", "hearts-solo"} {
		foreign := testEnvelope(t, game)
		if ValidatePolicy(foreign.Lab.Selector, SeatPolicyPin{0, frontier, "1.0.0"}) == nil {
			t.Fatal("frontier policy admitted to foreign game")
		}
	}
	c := DefaultTrixEvaluationConfig("", "")
	c.Request.Policies[0] = frontier
	if err := c.Validate(); err != nil {
		t.Fatal("installed frontier continuation rejected", err)
	}
	c.Request.Policies[0] = "trix-frontier-9.0.0"
	if c.Validate() == nil {
		t.Fatal("unknown frontier continuation admitted")
	}
}

func TestTrixFrontierChangedActionSavedRecord(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			e := testTrixEnvelope(t, variant)
			e.Base.Candidate.ID = trix.FrontierPolicyID
			e.Base.Reference.ID = trix.HistoryPolicyID
			adapter, err := NewAdapter(e.Lab.Selector)
			if err != nil {
				t.Fatal(err)
			}
			// An authored complete deal makes DJ and S10 the two legal root
			// actions. The history control credits distant blocked diamonds;
			// the frontier candidate instead selects its connected spade path.
			hands := [4][]string{{"C2", "C4", "C6", "C8", "C10", "D3", "D5", "D7", "D9", "DJ", "H2", "S9", "S10"}, {"H7", "SJ"}, {}, {}}
			used := map[string]bool{}
			for _, hand := range hands {
				for _, card := range hand {
					used[card] = true
				}
			}
			remaining := []string{}
			for _, card := range trix.Deck() {
				if !used[card] {
					remaining = append(remaining, card)
				}
			}
			deck := []string{}
			for _, hand := range hands {
				missing := 13 - len(hand)
				deck = append(deck, hand...)
				deck = append(deck, remaining[:missing]...)
				remaining = remaining[missing:]
			}
			material, _ := json.Marshal(trix.Chance{Deck: deck})
			bound, err := adapter.Start(e.Lab.Config, material)
			if err != nil {
				t.Fatal(err)
			}
			for _, action := range []string{"choose:trix", "layout:SJ"} {
				node, _ := bound.Node()
				transition, err := bound.Commit(*node.Seat, action)
				if err != nil {
					t.Fatal(err)
				}
				bound = transition.Next
			}
			control, err := Prepare(context.Background(), bound, SeatPolicyPin{0, trix.HistoryPolicyID, "1.0.0"}, "frontier-control")
			if err != nil || control.Prepared.CandidateID != "layout:DJ" {
				t.Fatal("historical control changed", err)
			}
			spec := EpisodeSpecs(e)[1]
			episode := &EpisodeState{Spec: spec, Adapter: adapter, Session: bound, Config: e.Lab.Config, Revision: 2, Rounds: 1}
			prepared, err := Prepare(context.Background(), bound, spec.Policies[0], "frontier-changed")
			if err != nil || prepared.Prepared.CandidateID != "layout:S10" {
				t.Fatal("frontier preparation did not select connected path", err)
			}
			record, err := prepareTrixRecord(episode, 0, "frontier-changed", prepared)
			if err != nil {
				t.Fatal(err)
			}
			if err = verifyTrixPreparation(record); err != nil {
				t.Fatal(err)
			}
			var trace trix.DecisionTrace
			if err = json.Unmarshal(record.Decision.OriginalAnalysis, &trace); err != nil {
				t.Fatal(err)
			}
			if trace.FrontierEvidence == nil || !trace.FrontierEvidence.Eligible || !trace.FrontierEvidence.SelectedChanged || trace.FrontierEvidence.PriorCandidateID != control.Prepared.CandidateID || trace.HistoryEvidence == nil {
				t.Fatal("changed action did not retain frontier and inherited evidence")
			}
			blind, err := ExportBlindPacket(record.Decision)
			if err != nil || blind.RuleProfileID != e.Base.RuleProfile.ID {
				t.Fatal("frontier blind export lost its exact rules", err)
			}
			changed := record
			trace.FrontierEvidence.SelectedChanged = false
			changed.Decision.OriginalAnalysis, _ = json.Marshal(trace)
			if verifyTrixPreparation(changed) == nil || AuditTrixDecision(changed.Decision).Status != "failed" {
				t.Fatal("rewritten frontier comparison evidence passed the saved audit")
			}
		})
	}
}
