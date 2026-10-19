package coachlab

import (
	"cardford/server/internal/games/trix"
	"context"
	"encoding/json"
	"testing"
)

func TestTrixHistoryCandidateAdmissionAndSavedTrace(t *testing.T) {
	const history = "trix-history-1.0.0"
	for _, variant := range []string{"basic-solo", "basic-partners", "complex-solo", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			e := testTrixEnvelope(t, variant)
			e.Base.Candidate.ID = history
			e.Base.Reference.ID = trix.ReasoningPolicyID
			if err := e.Validate(); err != nil {
				t.Fatal(err)
			}
			specs := EpisodeSpecs(e)
			if specs[0].Policies[0].ID != trix.ReasoningPolicyID || specs[1].Policies[0].ID != history {
				t.Fatal("candidate/control identity changed")
			}
			adapter, err := NewAdapter(e.Lab.Selector)
			if err != nil {
				t.Fatal(err)
			}
			episode, err := NewEpisodeState(e, specs[1], adapter)
			if err != nil {
				t.Fatal(err)
			}
			node, err := episode.Session.Node()
			if err != nil || node.Seat == nil {
				t.Fatalf("actor node: %v", err)
			}
			actor := *node.Seat
			episode.Spec.Policies[actor] = SeatPolicyPin{actor, history, "1.0.0"}
			prepared, err := Prepare(context.Background(), episode.Session, episode.Spec.Policies[actor], "history-original")
			if err != nil {
				t.Fatal(err)
			}
			record, err := prepareTrixRecord(episode, actor, "history-original", prepared)
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
			if trace.PolicyID != history || trace.SelectedCandidateID != prepared.Prepared.CandidateID {
				t.Fatal("bot/trace selection disagrees")
			}
			if record.Decision.Audit.Status == "failed" {
				t.Fatal("saved trace audit failed")
			}
		})
	}
	foreign := testEnvelope(t, "spades-partners")
	if ValidatePolicy(foreign.Lab.Selector, SeatPolicyPin{0, history, "1.0.0"}) == nil {
		t.Fatal("history policy admitted to foreign game")
	}
}
