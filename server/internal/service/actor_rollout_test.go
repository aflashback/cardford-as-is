package service

import (
	"bytes"
	"context"
	"testing"
	"time"

	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/records"
	"cardford/server/internal/strategy/installation"
)

// This acceptance check uses normal private deals and the real worker, durable
// receipt, advice delivery and command routes. No selected move is fabricated.
func TestM05ActorRolloutAsyncServicePersistenceAndRestart(t *testing.T) {
	codec, err := records.NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	if err = installation.InstallActorRollout(codec, true); err != nil {
		t.Fatal(err)
	}
	a, b, _ := serviceStoresWithCodec(t, codec)
	first := serviceHost(t, a, codec)
	fresh, err := records.NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	if err = installation.InstallActorRollout(fresh, false); err != nil {
		t.Fatal(err)
	}
	second := serviceHost(t, b, fresh)
	p := first.player(t)
	receipt, _ := first.createGame(t, p, "spades", "solo", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	var humanDecision string
	var saved []byte
	botCount := 0
	for step := 0; step < 4; step++ {
		before := first.snapshot(t, p, game)
		bound, e := codec.Session(before.Document, before.Snapshot)
		if e != nil {
			t.Fatal(e)
		}
		node, e := bound.Node()
		if e != nil || node.Kind != "actor" || node.Seat == nil {
			t.Fatalf("expected opening bid actor: %+v %v", node, e)
		}
		actor := *node.Seat
		purpose := "bot-action"
		if actor == 0 {
			purpose = "human-analysis"
		}
		prepared := rolloutReady(t, first, p, game, before.Document.Revision, lease, purpose, 90*time.Second)
		decisions := rolloutPrepared(t, first, p, before, prepared)
		if len(decisions) != 1 || decisions[0].Actor != actor {
			t.Fatal("wrong persisted actor")
		}
		command := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": before.Document.Revision, "controlLeaseToken": lease, "preparedDecisionId": prepared["preparedDecisionId"]}
		path := "/api/session/advance"
		if actor == 0 {
			humanDecision = records.PlatformDecisionID(game, before.Document.Revision)
			body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": before.Document.Revision, "controlLeaseToken": lease, "decisionId": humanDecision, "requestedLevel": 3, "unlock": true}
			saved = first.request(t, p, "POST", "/api/platform/advice", body, 200)
			_, original, e := records.OriginalDecision(decisions[0])
			if e != nil {
				t.Fatal(e)
			}
			advice := decodeMap(t, saved)["advice"].(map[string]any)
			if advice["policyVersion"] != d.ActorRolloutPolicy || advice["reason"] != original.Original.Reason {
				t.Fatal("delivered coach reasoning differs from saved result")
			}
			command["candidateId"] = decisions[0].SelectedCandidateID
			command["preparedWorkIds"] = prepared["workIds"]
			path = "/api/session/actions"
		} else {
			command["kind"] = "bot"
			botCount++
		}
		first.request(t, p, "POST", path, command, 200)
	}
	if humanDecision == "" || botCount != 3 {
		t.Fatal("all opening bids were not exercised")
	}
	first.app.Close()
	second.request(t, p, "GET", "/api/sessions/"+game, nil, 200)
	retained, err := platformReviewRequest(t, second, p, "platform-saved-advice", humanDecision, nil)
	if err != nil || !bytes.Equal(saved, retained.Body) {
		t.Fatalf("saved help changed after fresh-codec restart: %v\nbefore=%s\nafter=%s", err, saved, retained.Body)
	}
	before := second.snapshot(t, p, game)
	bound, err := fresh.Session(before.Document, before.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	node, err := bound.Node()
	if err != nil || node.Seat == nil {
		t.Fatalf("restart decision node: %+v %v", node, err)
	}
	purpose := "bot-action"
	if *node.Seat == 0 {
		purpose = "human-analysis"
	}
	prepared := rolloutReady(t, second, p, game, before.Document.Revision, lease, purpose, 90*time.Second)
	rolloutPrepared(t, second, p, before, prepared)
}

func TestM05ActorRolloutHeartsSealedFourActors(t *testing.T) {
	codec, err := records.NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	if err = installation.InstallActorRollout(codec, true); err != nil {
		t.Fatal(err)
	}
	a, _, _ := serviceStoresWithCodec(t, codec)
	h := serviceHost(t, a, codec)
	p := h.player(t)
	receipt, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	before := h.snapshot(t, p, game)
	prepared := rolloutReady(t, h, p, game, before.Document.Revision, lease, "human-analysis", 170*time.Second)
	decisions := rolloutPrepared(t, h, p, before, prepared)
	if len(decisions) != 4 {
		t.Fatal("sealed preparation did not include four actors")
	}
	seen := map[int]bool{}
	human := ""
	for _, decision := range decisions {
		if seen[decision.Actor] {
			t.Fatal("duplicate sealed actor")
		}
		seen[decision.Actor] = true
		if decision.Actor == 0 {
			human = decision.SelectedCandidateID
		}
	}
	if human == "" {
		t.Fatal("missing human pass")
	}
	unchanged := h.snapshot(t, p, game)
	if unchanged.Document.Revision != before.Document.Revision {
		t.Fatal("preparation advanced sealed live state")
	}
	h.request(t, p, "POST", "/api/session/actions", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": before.Document.Revision, "controlLeaseToken": lease, "candidateId": human, "preparedDecisionId": prepared["preparedDecisionId"], "preparedWorkIds": prepared["workIds"]}, 200)
	after := h.snapshot(t, p, game)
	if after.Document.Revision != before.Document.Revision+1 {
		t.Fatal("sealed choices were not committed atomically")
	}
}

func rolloutPrepared(t *testing.T, h *testHost, p *testPlayer, before *records.Loaded, view map[string]any) []records.DecisionRecord {
	t.Helper()
	principal, err := h.store.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithPrincipal(context.Background(), principal)
	var decisions []records.DecisionRecord
	for _, id := range view["workIds"].([]any) {
		decision, e := h.store.ReadPrepared(ctx, p.owner, id.(string))
		if e != nil {
			t.Fatal(e)
		}
		if e = h.codec.ValidateDecision(before.Document, before.Snapshot, decision); e != nil {
			t.Fatal(e)
		}
		analysis, advice, e := records.OriginalDecision(decision)
		if e != nil {
			t.Fatal(e)
		}
		if decision.Policy.ID != d.ActorRolloutPolicy || analysis.Rollout == nil || analysis.Rollout.Result.ExecutionStatus != "completed" || analysis.Rollout.Result.Coverage.Completed != 2 || d.ActionID(analysis.Original.Action) != decision.SelectedCandidateID || advice.Original.PolicyVersion != d.ActorRolloutPolicy {
			t.Fatal("persisted decision omitted exact original rollout reasoning")
		}
		decisions = append(decisions, decision)
	}
	return decisions
}

func rolloutReady(t *testing.T, h *testHost, p *testPlayer, game string, revision int64, lease, purpose string, wait time.Duration) map[string]any {
	t.Helper()
	started := time.Now()
	deadline := started.Add(wait)
	view := decodeMap(t, h.request(t, p, "POST", "/api/session/prepare", map[string]any{"gameId": game, "expectedRevision": revision, "controlLeaseToken": lease, "purpose": purpose}, 0))
	if view["status"] != "queued" && view["status"] != "running" && view["status"] != "completed" {
		t.Fatal("invalid asynchronous preparation status", view["status"])
	}
	for _, id := range view["workIds"].([]any) {
		for {
			work := decodeMap(t, h.request(t, p, "GET", "/api/work/"+id.(string), nil, 0))
			switch work["status"] {
			case "completed":
				goto completed
			case "rejected", "canceled":
				t.Fatalf("rollout preparation did not complete: %+v", work)
			}
			if time.Now().After(deadline) {
				t.Fatal("bounded wait exhausted; remaining rollout acceptance unverified")
			}
			time.Sleep(100 * time.Millisecond)
		}
	completed:
	}
	t.Logf("M05 real preparation purpose=%s actors=%d elapsed=%s", purpose, len(view["workIds"].([]any)), time.Since(started).Round(time.Millisecond))
	return view
}
