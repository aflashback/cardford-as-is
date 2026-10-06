package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestM03ReviewAlternativeIndependentOriginalAndFutureExposure(t *testing.T) {
	s, s2, loaded, _, a := workFixture(t, 3, true)
	ctx := context.Background()
	w, err := s.QueueWork(ctx, workRequest(t, s, loaded, a, 0, "human-analysis"))
	if err != nil {
		t.Fatal(err)
	}
	lease, err := s.ClaimWork(ctx, "owner", w.ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	parent := workDecision(t, w, lease, "original-parent")
	if _, err = s.PublishWork(ctx, "owner", lease, parent); err != nil {
		t.Fatal(err)
	}
	if _, err = workBidCommit(t, s, loaded, a, "original-move", 0, nil, parent); err != nil {
		t.Fatal(err)
	}
	live, err := s.Load(ctx, "owner", "game")
	if err != nil {
		t.Fatal(err)
	}
	r := ReviewAlternativeRequest{RecordVersion: RecordVersion, TrialID: "alternative-1", OwnerID: "owner", ParentGameID: "game", ParentDecisionID: parent.ID, ParentRevision: parent.Revision, ParentReceiptID: parent.ReceiptID, SourceInputDigest: parent.InputDigest, AlternativeCandidateID: "bid:2", ExpectedLiveRevision: live.Document.Revision, ExpectedWindowID: live.WindowID, Admission: a}
	view, err := loaded.Snapshot.Project(0)
	if err != nil {
		t.Fatal(err)
	}
	result, _ := json.Marshal(map[string]any{"trialId": r.TrialID, "decisionId": parent.ID, "label": "Possible continuation", "liveRevision": live.Document.Revision, "frames": []any{map[string]any{"game": view.View, "action": nil, "decisionId": parent.ID, "notes": []string{"Fixture only"}}}})
	saved, err := s.SaveReviewAlternative(ctx, r, result)
	if err != nil {
		t.Fatal(err)
	}
	if !saved.FutureExposed || !bytes.Equal(saved.Result, result) {
		t.Fatal("original provenance or result bytes lost")
	}
	current, err := s.Load(ctx, "owner", "game")
	if err != nil || current.Document.Revision != 1 {
		t.Fatal("review alternative mutated live game")
	}
	if _, err = s2.SaveReviewAlternative(ctx, r, []byte(`{"different":"result"}`)); err != nil {
		t.Fatalf("same request did not reuse original: %v", err)
	}
	changed := r
	changed.AlternativeCandidateID = "bid:99"
	if _, err = s2.SaveReviewAlternative(ctx, changed, result); !errors.Is(err, ErrCommandDigest) {
		t.Fatalf("alternative request identity reused: %v", err)
	}
	invalid := r
	invalid.TrialID = "invalid-alternative"
	invalid.AlternativeCandidateID = "bid:99"
	if _, err = s.SaveReviewAlternative(ctx, invalid, result); err == nil {
		t.Fatal("ineligible historical candidate accepted")
	}
	access, _ := s.ReadAccess(ctx, "owner")
	if _, err = s.ChangeAccess(ctx, "owner", access.Generation, AccessChange{CanRead: true, ActiveGameID: "new-game"}); err != nil {
		t.Fatal(err)
	}
	again, err := s2.ReadReviewAlternative(ctx, "owner", r.TrialID)
	if err != nil || !again.FutureExposed || !bytes.Equal(again.Result, result) {
		t.Fatalf("original alternative unavailable after access change: %v", err)
	}
	original, err := s.ReadDecision(ctx, "owner", parent.ID)
	if err != nil || !SamePreparedBytes(original, parent) {
		t.Fatalf("review rewrote parent: %v", err)
	}
	if _, err = s.pool.Exec(ctx, "UPDATE m03_review_trials SET future_exposed=false WHERE trial_id=$1", r.TrialID); err == nil {
		t.Fatal("completed alternative provenance mutable")
	}
}
