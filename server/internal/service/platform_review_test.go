package service

import (
	"bytes"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"
)

func platformReviewRequest(t *testing.T, h *testHost, p *testPlayer, operation, id string, body any) (transport.Response, error) {
	t.Helper()
	principal, err := h.store.Authenticate(context.Background(), p.token)
	if err != nil {
		return transport.Response{}, err
	}
	raw, _ := json.Marshal(body)
	return h.app.platformReview(records.WithPrincipal(context.Background(), principal), p.owner, transport.Request{Operation: operation, CommandID: id, Tab: p.tab, Token: p.token, Body: raw})
}

// platformStep exercises the accepted narrow command path, and deliberately
// chooses the last legal human action rather than the policy recommendation.
func platformStep(t *testing.T, h *testHost, p *testPlayer, game, lease string) (*records.Loaded, string, bool) {
	t.Helper()
	l := h.snapshot(t, p, game)
	bound, err := h.codec.Session(l.Document, l.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	node, err := bound.Node()
	if err != nil {
		t.Fatal(err)
	}
	if node.Kind == "round-complete" || node.Kind == "session-complete" {
		return l, "", false
	}
	body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": l.Document.Revision, "controlLeaseToken": lease}
	path := "/api/session/advance"
	human := false
	candidate := ""
	switch node.Kind {
	case "actor", "sealed":
		actor := 0
		if node.Seat != nil {
			actor = *node.Seat
		}
		purpose := "bot-action"
		human = actor == 0
		if human {
			purpose = "human-analysis"
		}
		prepared := h.ready(t, p, game, l.Document.Revision, lease, purpose)
		if human {
			input, err := h.codec.PreparationInput(l.Document, l.Snapshot, 0)
			if err != nil {
				t.Fatal(err)
			}
			candidate = input.CandidateIDs[len(input.CandidateIDs)-1]
			body["candidateId"] = candidate
			body["preparedDecisionId"] = prepared["preparedDecisionId"]
			body["preparedWorkIds"] = prepared["workIds"]
			path = "/api/session/actions"
		} else {
			body["kind"] = "bot"
			body["preparedDecisionId"] = prepared["preparedDecisionId"]
		}
	case "automatic":
		body["kind"] = "automatic"
		body["transitionId"] = node.TransitionID
	default:
		t.Fatalf("unexpected lifecycle %s", node.Kind)
	}
	h.request(t, p, "POST", path, body, 200)
	return l, candidate, human
}

func TestM04EReviewOriginalAdviceLevelsTrialIsolationAndRestart(t *testing.T) {
	a, b, codec := serviceStores(t)
	h := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	p := h.player(t)
	receipt, _ := h.createGame(t, p, "spades", "partners", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	var source *records.Loaded
	candidate := ""
	for step := 0; step < 15; step++ {
		before, chosen, human := platformStep(t, h, p, game, lease)
		if human && strings.HasPrefix(chosen, "play:") {
			source, candidate = before, chosen
			break
		}
	}
	if source == nil {
		t.Fatal("human play not reached")
	}
	live := h.snapshot(t, p, game)
	decision := records.PlatformDecisionID(game, source.Document.Revision)
	adviceBody := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "requestedLevel": 1, "unlock": true}
	notice, err := platformReviewRequest(t, h, p, "platform-advice", "", adviceBody)
	if err != nil {
		t.Fatal("source advice", err)
	}
	v := decodeMap(t, notice.Body)["advice"].(map[string]any)
	if _, ok := v["card"]; ok {
		t.Fatal("notice leaked suggested card")
	}
	if v["suggestion"] != "" || v["reason"] != "" {
		t.Fatal("notice leaked suggestion or consideration")
	}
	repeated, err := platformReviewRequest(t, second, p, "platform-advice", "", adviceBody)
	if err != nil || !bytes.Equal(notice.Body, repeated.Body) {
		t.Fatal("original advice changed across instances", err)
	}
	if _, e := platformReviewRequest(t, h, p, "platform-saved-advice", decision, nil); e == nil {
		t.Fatal("saved read created missing level3")
	}
	var fullAdvice []byte
	for _, level := range []int{2, 3} {
		next := map[string]any{}
		for k, v := range adviceBody {
			next[k] = v
		}
		next["commandId"] = p.id()
		next["requestedLevel"] = level
		next["unlock"] = false
		delivered, e := platformReviewRequest(t, h, p, "platform-advice", "", next)
		if e != nil {
			t.Fatal(e)
		}
		view := decodeMap(t, delivered.Body)["advice"].(map[string]any)
		if level == 3 {
			fullAdvice = delivered.Body
		}
		if view["requestedLevel"] != float64(level) {
			t.Fatal("wrong delivered level")
		}
		if level == 2 {
			if view["suggestion"] != "" {
				t.Fatal("level2 suggestion leak")
			}
			if _, ok := view["card"]; ok {
				t.Fatal("level2 card leak")
			}
		}
	}
	readOnly, e := platformReviewRequest(t, second, p, "platform-saved-advice", decision, nil)
	if e != nil || !bytes.Equal(readOnly.Body, fullAdvice) {
		t.Fatal("saved original requires control or changed output", e)
	}
	sourceAccess, e := platformReviewRequest(t, h, p, "platform-review-access", decision, nil)
	if e != nil {
		t.Fatal(e)
	}
	if len(decodeMap(t, sourceAccess.Body)["savedAdviceLevels"].([]any)) != 3 {
		t.Fatal("saved delivery levels omitted")
	}
	notesBody := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease}
	notes, err := platformReviewRequest(t, h, p, "platform-notes", "", notesBody)
	if err != nil {
		t.Fatal("off-turn notes", err)
	}
	recoveredNotes := decodeMap(t, second.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": notesBody["commandId"], "operation": "platform-notes", "request": notesBody}, 200))
	if !reflect.DeepEqual(recoveredNotes["receipt"], decodeMap(t, notes.Body)) {
		t.Fatal("lost notes receipt changed")
	}
	index, err := platformReviewRequest(t, h, p, "platform-reviews", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	cases := decodeMap(t, index.Body)["cases"].([]any)
	found := false
	for _, item := range cases {
		c := item.(map[string]any)
		if c["decisionId"] == decision {
			found = true
			action := c["action"].(map[string]any)
			if "play:"+action["card"].(string) != candidate {
				t.Fatal("review replaced actual choice with policy suggestion")
			}
		}
	}
	if !found {
		t.Fatal("source missing from index")
	}
	replay, err := platformReviewRequest(t, h, p, "platform-review", decision, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(decodeMap(t, replay.Body)["frames"].([]any)) < 2 {
		t.Fatal("original replay missing action")
	}
	trialBody := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "trialId": "isolated-trial", "alternativeCandidateId": candidate}
	status, err := platformReviewRequest(t, h, p, "platform-review-trial", decision, trialBody)
	if err != nil {
		t.Fatal("trial start", err)
	}
	deadline := time.Now().Add(12 * time.Second)
	for decodeMap(t, status.Body)["status"] != "completed" {
		if time.Now().After(deadline) {
			t.Fatalf("trial did not complete: %s", status.Body)
		}
		time.Sleep(10 * time.Millisecond)
		status, err = platformReviewRequest(t, second, p, "platform-review-status", trialBody["commandId"].(string), nil)
		if err != nil {
			t.Fatal(err)
		}
		if decodeMap(t, status.Body)["status"] == "unavailable" {
			t.Fatal("trial unavailable")
		}
	}
	after := h.snapshot(t, p, game)
	if after.Document.Revision != live.Document.Revision || !bytes.Equal(after.Document.Checkpoint.State, live.Document.Checkpoint.State) {
		t.Fatal("hypothetical continuation changed live state")
	}
	recovered, err := platformReviewRequest(t, second, p, "platform-review-trial", decision, trialBody)
	if err != nil || !bytes.Equal(recovered.Body, status.Body) {
		t.Fatal("accepted continuation changed", err)
	}
	for operation, request := range map[string]map[string]any{"platform-advice": adviceBody, "platform-review-trial": trialBody} {
		result := decodeMap(t, second.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": request["commandId"], "operation": operation, "request": request}, 200))
		if result["status"] != "accepted" {
			t.Fatal("original help receipt not reconciled")
		}
	}
	principal, err := a.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithPrincipal(context.Background(), principal)
	if err = a.RevokeGrant(ctx, p.owner, records.LocalGrantID(p.owner, "spades", "partners")); err != nil {
		t.Fatal(err)
	}
	if _, err = platformReviewRequest(t, h, p, "platform-review-status", trialBody["commandId"].(string), nil); err == nil {
		t.Fatal("revoked source trial remained readable")
	}
	if _, err = platformReviewRequest(t, h, p, "platform-advice", "", adviceBody); err == nil {
		t.Fatal("revoked source advice remained readable")
	}
	if _, err = platformReviewRequest(t, h, p, "platform-saved-advice", decision, nil); err == nil {
		t.Fatal("read-only saved advice bypassed revocation")
	}
	for operation, request := range map[string]map[string]any{"platform-advice": adviceBody, "platform-review-trial": trialBody} {
		second.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": request["commandId"], "operation": operation, "request": request}, 403)
	}
	second.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": notesBody["commandId"], "operation": "platform-notes", "request": notesBody}, 403)
}

func TestM04EPreviousHandUnlockIsIndependentOfCurrentHand(t *testing.T) {
	a, _, codec := serviceStores(t)
	h := serviceHost(t, a, codec)
	p := h.player(t)
	receipt, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	var source *records.Loaded
	candidate := ""
	for step := 0; step < 75; step++ {
		before, chosen, human := platformStep(t, h, p, game, lease)
		if human && strings.HasPrefix(chosen, "play:") && source == nil {
			source, candidate = before, chosen
		}
		bound, err := codec.Session(before.Document, before.Snapshot)
		if err != nil {
			t.Fatal(err)
		}
		node, _ := bound.Node()
		if node.Kind == "round-complete" {
			break
		}
	}
	if source == nil {
		t.Fatal("source missing")
	}
	principal, err := a.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	stats, err := a.PlatformStats(records.WithPrincipal(context.Background(), principal), p.owner, game)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Decisions >= 14 || stats.Decisions < 1 {
		t.Fatalf("forced hand decisions counted: %+v", stats)
	}
	for n := 0; n < 2; n++ {
		current := h.snapshot(t, p, game)
		h.request(t, p, "POST", "/api/session/next-hand", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": current.Document.Revision, "controlLeaseToken": lease}, 200)
	}
	live := h.snapshot(t, p, game)
	h.request(t, p, "POST", "/api/access/unlocks", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease, "toolId": "advice"}, 200)
	decision := records.PlatformDecisionID(game, source.Document.Revision)
	trial := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "trialId": "old-hand", "alternativeCandidateId": candidate}
	if _, err := platformReviewRequest(t, h, p, "platform-review-trial", decision, trial); err == nil {
		t.Fatal("current-hand unlock authorized previous-hand continuation")
	}
	advice := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "requestedLevel": 1, "unlock": true}
	if _, err := platformReviewRequest(t, h, p, "platform-advice", "", advice); err != nil {
		t.Fatal("explicit previous hand unlock", err)
	}
	access, err := platformReviewRequest(t, h, p, "platform-review-access", decision, nil)
	if err != nil {
		t.Fatal(err)
	}
	if decodeMap(t, access.Body)["unlocked"] != true {
		t.Fatal("source remains locked")
	}
}
