package service

import (
	"bytes"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"encoding/json"
	"testing"
)

func TestCoachUIActionSetComparison(t *testing.T) {
	for _, test := range []struct {
		left, right string
		equal       bool
	}{
		{`{"kind":"declare-doubles"}`, `{"kind":"declare-doubles","cards":[]}`, true},
		{`{"kind":"declare-doubles","cards":["HQ","HK"]}`, `{"kind":"declare-doubles","cards":["HK","HQ"]}`, true},
		{`{"kind":"pass","cards":["C2","D3","H4"]}`, `{"kind":"pass","cards":["H4","C2","D3"]}`, true},
		{`{"kind":"pass","cards":["C2","D3","H4"]}`, `{"kind":"pass","cards":["C2","D3","D3"]}`, false},
		{`{"kind":"play","card":"C2"}`, `{"kind":"play","card":"D3"}`, false},
	} {
		if got := sameCoachUIAction(json.RawMessage(test.left), json.RawMessage(test.right)); got != test.equal {
			t.Fatalf("action set comparison %s / %s: %v", test.left, test.right, got)
		}
	}
}

func TestCoachUIHTTPSelectionCommittedProofAndReplay(t *testing.T) {
	a, b, codec := serviceStores(t)
	h := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	p := h.player(t)
	receipt, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	before := h.snapshot(t, p, game)
	decision := records.PlatformDecisionID(game, before.Document.Revision)
	start := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": before.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "kind": "cue"}
	original := h.request(t, p, "POST", "/api/platform/coach/sessions", start, 200)
	saved := decodeMap(t, original)
	session := saved["session"].(map[string]any)
	sid := session["sessionId"].(string)
	items := session["items"].([]any)
	itemID := items[0].(map[string]any)["itemId"].(string)
	if got := second.request(t, p, "POST", "/api/platform/coach/sessions", start, 200); !bytes.Equal(got, original) {
		t.Fatal("receipt changed across instances")
	}
	start["kind"] = "review"
	h.request(t, p, "POST", "/api/platform/coach/sessions", start, 409)
	start["kind"] = "cue"
	replayBefore := h.request(t, p, "GET", "/api/platform/coach/items/"+itemID+"/replay", nil, 200)
	bound, e := codec.Session(before.Document, before.Snapshot)
	if e != nil {
		t.Fatal(e)
	}
	candidates, e := coachUICandidates(bound)
	if e != nil || len(candidates) == 0 {
		t.Fatal(e)
	}
	var pass struct {
		Cards []string `json:"cards"`
	}
	_ = json.Unmarshal(candidates[len(candidates)-1].Public, &pass)
	appendBody := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": before.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "sessionId": sid, "kind": "selection", "selectedCards": pass.Cards[:1]}
	h.request(t, p, "POST", "/api/platform/coach/items", appendBody, 200)
	appendBody["commandId"] = p.id()
	appendBody["selectedCards"] = []string{"C2", "C2"}
	h.request(t, p, "POST", "/api/platform/coach/items", appendBody, 400)
	permuted := append([]string{}, pass.Cards...)
	permuted[0], permuted[2] = permuted[2], permuted[0]
	confirmed := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": before.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "sessionId": sid, "kind": "confirmed", "action": map[string]any{"kind": "pass", "cards": permuted}}
	h.request(t, p, "POST", "/api/platform/coach/items", confirmed, 409)
	_, chosen, human := platformStep(t, h, p, game, lease)
	if !human || chosen != candidates[len(candidates)-1].ID {
		t.Fatal("fixture confirmation did not select expected candidate")
	}
	live := h.snapshot(t, p, game)
	confirmed["commandId"] = p.id()
	confirmed["expectedRevision"] = live.Document.Revision
	h.request(t, p, "POST", "/api/platform/coach/items", confirmed, 200)
	confirmed["commandId"] = p.id()
	confirmed["action"] = candidates[0].Public
	h.request(t, p, "POST", "/api/platform/coach/items", confirmed, 400)
	if got := h.request(t, p, "GET", "/api/platform/coach/items/"+itemID+"/replay", nil, 200); !bytes.Equal(got, replayBefore) {
		t.Fatal("saved Why changed after live action")
	}
	appendBody["commandId"] = p.id()
	appendBody["expectedRevision"] = live.Document.Revision
	appendBody["selectedCards"] = pass.Cards[:1]
	h.request(t, p, "POST", "/api/platform/coach/items", appendBody, 409)
	foreign := h.player(t)
	h.request(t, foreign, "GET", "/api/platform/coach/sessions/"+sid, nil, 403)
	h.request(t, foreign, "GET", "/api/platform/coach/items/"+itemID+"/replay", nil, 403)
	feedback := map[string]any{"commandId": p.id(), "itemId": itemID, "expectedFeedbackRevision": 0, "value": "helpful", "reason": "clear", "text": "Saved comment"}
	h.request(t, p, "POST", "/api/platform/coach/feedback", feedback, 200)
	status := decodeMap(t, h.request(t, p, "GET", "/api/platform/coach", nil, 200))
	if status["provider"].(map[string]any)["source"] != "mock" || len(status["recent"].([]any)) != 1 {
		t.Fatal("status", status)
	}
}

func TestCoachUICardSelectionAndVerifiedPostplay(t *testing.T) {
	a, _, codec := serviceStores(t)
	h := serviceHost(t, a, codec)
	p := h.player(t)
	receipt, _ := h.createGame(t, p, "spades", "solo", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	for step := 0; step < 20; step++ {
		source := h.snapshot(t, p, game)
		b, e := codec.Session(source.Document, source.Snapshot)
		if e != nil {
			t.Fatal(e)
		}
		node, e := b.Node()
		if e != nil {
			t.Fatal(e)
		}
		if node.Phase != "play" || !coachUIHuman(b) {
			platformStep(t, h, p, game, lease)
			continue
		}
		candidates, e := coachUICandidates(b)
		if e != nil || len(candidates) == 0 {
			t.Fatal(e)
		}
		chosen := candidates[len(candidates)-1]
		var action struct {
			Card string `json:"card"`
		}
		_ = json.Unmarshal(chosen.Public, &action)
		decision := records.PlatformDecisionID(game, source.Document.Revision)
		view := decodeMap(t, h.request(t, p, "POST", "/api/platform/coach/sessions", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": source.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "kind": "cue"}, 200))
		sid := view["session"].(map[string]any)["sessionId"].(string)
		body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": source.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "sessionId": sid, "kind": "selection", "selectedCards": []string{action.Card}}
		h.request(t, p, "POST", "/api/platform/coach/items", body, 200)
		body["commandId"] = p.id()
		body["selectedCards"] = []string{}
		h.request(t, p, "POST", "/api/platform/coach/items", body, 200)
		// A valid card absent from all legal candidates must be rejected, including
		// another seat's card or an owned card that cannot follow the led suit.
		legal := map[string]bool{}
		for _, c := range candidates {
			var x struct {
				Card string `json:"card"`
			}
			_ = json.Unmarshal(c.Public, &x)
			legal[x.Card] = true
		}
		illegal := ""
		for _, card := range trix.Deck() {
			if !legal[card] {
				illegal = card
				break
			}
		}
		body["commandId"] = p.id()
		body["selectedCards"] = []string{illegal}
		h.request(t, p, "POST", "/api/platform/coach/items", body, 400)
		platformStep(t, h, p, game, lease)
		live := h.snapshot(t, p, game)
		delete(body, "selectedCards")
		body["commandId"] = p.id()
		body["kind"] = "postplay"
		body["action"] = chosen.Public
		body["expectedRevision"] = live.Document.Revision
		h.request(t, p, "POST", "/api/platform/coach/items", body, 200)
		body["commandId"] = p.id()
		body["kind"] = "confirmed"
		h.request(t, p, "POST", "/api/platform/coach/items", body, 400)
		return
	}
	t.Fatal("human play not reached")
}

func TestCoachUITrixDoublesAndPublicReviewHistory(t *testing.T) {
	installations := trix.Installations()
	for i := range installations {
		original := installations[i].Bootstrap
		installations[i].Bootstrap = func(id string) (json.RawMessage, json.RawMessage, error) {
			config, _, e := original(id)
			if e != nil {
				return nil, nil, e
			}
			deck := trix.Deck()
			for n, card := range deck {
				if card == "H7" {
					deck[0], deck[n] = deck[n], deck[0]
					break
				}
			}
			material, e := json.Marshal(trix.Chance{Deck: deck})
			return config, material, e
		}
	}
	registry, e := sessions.NewRegistryWithRegistrations(trix.Handlers(sessions.DefaultHandlers()), installations...)
	if e != nil {
		t.Fatal(e)
	}
	codec, e := records.NewServiceCodecWithRegistry(registry)
	if e != nil {
		t.Fatal(e)
	}
	a, _, _ := serviceStoresWithCodec(t, codec)
	h := serviceHost(t, a, codec)
	p := h.player(t)
	pin := trix.Pin("complex-partners")
	selector := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
	receipt := decodeMap(t, h.request(t, p, "POST", "/api/sessions", map[string]any{"commandId": p.id(), "selector": selector, "expectedActiveGameId": nil, "expectedRevision": nil, "controlLeaseToken": nil}, 200))
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	source := h.snapshot(t, p, game)
	bound, e := codec.Session(source.Document, source.Snapshot)
	if e != nil {
		t.Fatal(e)
	}
	candidates, e := coachUICandidates(bound)
	if e != nil {
		t.Fatal(e)
	}
	chosen := ""
	for _, c := range candidates {
		var action trix.Action
		_ = json.Unmarshal(c.Public, &action)
		if action.Request == "complex" {
			chosen = c.ID
		}
	}
	if chosen == "" {
		t.Fatal("initial complex request missing")
	}
	prepared := h.ready(t, p, game, source.Document.Revision, lease, "human-analysis")
	h.request(t, p, "POST", "/api/session/actions", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": source.Document.Revision, "controlLeaseToken": lease, "candidateId": chosen, "preparedDecisionId": prepared["preparedDecisionId"], "preparedWorkIds": prepared["workIds"]}, 200)
	source = h.snapshot(t, p, game)
	bound, e = codec.Session(source.Document, source.Snapshot)
	if e != nil {
		t.Fatal(e)
	}
	if !coachUIHuman(bound) {
		t.Fatal("human double fixture")
	}
	candidates, e = coachUICandidates(bound)
	if e != nil {
		t.Fatal(e)
	}
	var declaration trix.Action
	_ = json.Unmarshal(candidates[len(candidates)-1].Public, &declaration)
	decision := records.PlatformDecisionID(game, source.Document.Revision)
	start := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": source.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "kind": "cue"}
	view := decodeMap(t, h.request(t, p, "POST", "/api/platform/coach/sessions", start, 200))
	sid := view["session"].(map[string]any)["sessionId"].(string)
	selection := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": source.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "sessionId": sid, "kind": "selection", "selectedCards": declaration.Cards}
	if declaration.Cards == nil {
		selection["selectedCards"] = []string{}
	}
	h.request(t, p, "POST", "/api/platform/coach/items", selection, 200)
	selection["commandId"] = p.id()
	selection["selectedCards"] = []string{"C2"}
	h.request(t, p, "POST", "/api/platform/coach/items", selection, 400)
	_, _, human := platformStep(t, h, p, game, lease)
	if !human {
		t.Fatal("human double not committed")
	}
	live := h.snapshot(t, p, game)
	h.request(t, p, "POST", "/api/platform/coach/items", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "sessionId": sid, "kind": "confirmed", "action": candidates[len(candidates)-1].Public}, 200)
	start["commandId"] = p.id()
	start["expectedRevision"] = live.Document.Revision
	start["decisionId"] = records.PlatformDecisionID(game, live.Document.Revision)
	start["kind"] = "review"
	review := decodeMap(t, h.request(t, p, "POST", "/api/platform/coach/sessions", start, 200))
	items := review["session"].(map[string]any)["items"].([]any)
	if len(items) != 2 {
		t.Fatal("review slots")
	}
	id := items[0].(map[string]any)["itemId"].(string)
	replay := decodeMap(t, h.request(t, p, "GET", "/api/platform/coach/items/"+id+"/replay", nil, 200))
	if len(replay["frames"].([]any)) < 3 {
		t.Fatal("public history missing")
	}
}
