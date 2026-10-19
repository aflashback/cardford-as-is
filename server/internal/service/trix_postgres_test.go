package service

import (
	"bytes"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"testing"
)

func TestTrixNativeHTTPPostgresLifecycleAndOriginalReview(t *testing.T) {
	registry, err := sessions.NewRegistryWithRegistrations(trix.Handlers(sessions.DefaultHandlers()), trix.Installations()...)
	if err != nil {
		t.Fatal(err)
	}
	codec, err := records.NewServiceCodecWithRegistry(registry)
	if err != nil {
		t.Fatal(err)
	}
	a, b, _ := serviceStoresWithCodec(t, codec)
	first := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	for _, variant := range trix.Variants {
		p := first.player(t)
		catalog := decodeMap(t, first.request(t, p, "GET", "/api/platform/session", nil, 200))["catalog"].([]any)
		if len(catalog) != 7 {
			t.Fatalf("catalog has %d entries", len(catalog))
		}
		var selector any
		for _, entry := range catalog {
			item := entry.(map[string]any)
			if item["mode"] == "trix-"+variant {
				if selector != nil {
					t.Fatal("duplicate catalog mode")
				}
				selector = item["selector"]
			}
		}
		if selector == nil {
			t.Fatal("Trix variant missing from catalog")
		}
		body := map[string]any{"commandId": p.id(), "selector": selector, "expectedActiveGameId": nil, "expectedRevision": nil, "controlLeaseToken": nil}
		receipt := first.request(t, p, "POST", "/api/sessions", body, 200)
		again := second.request(t, p, "POST", "/api/sessions", body, 200)
		if !bytes.Equal(receipt, again) {
			t.Fatal("lost create response changed receipt")
		}
		created := decodeMap(t, receipt)
		game, lease := created["gameId"].(string), created["controlLeaseToken"].(string)
		first.request(t, p, "GET", "/api/platform/session", nil, 200)
		emptyHistory := decodeMap(t, first.request(t, p, "GET", "/api/platform/rounds", nil, 200))
		if len(emptyHistory["rounds"].([]any)) != 0 {
			t.Fatal("unfinished request exposed in history")
		}
		first.request(t, p, "GET", "/api/platform/rounds/"+game+":trix-request:1", nil, 403)
		if variant != "basic-solo" {
			continue
		}
		var source *records.Loaded
		for step := 0; step < 120; step++ {
			before, _, human := platformStep(t, first, p, game, lease)
			if source == nil && human {
				source = before
			}
			bound, e := codec.Session(before.Document, before.Snapshot)
			if e != nil {
				t.Fatal(e)
			}
			node, e := bound.Node()
			if e != nil {
				t.Fatal(e)
			}
			if node.Kind == "round-complete" {
				break
			}
			if step == 119 {
				t.Fatal("request did not finish")
			}
		}
		if source == nil {
			t.Fatal("no recorded human decision")
		}
		live := first.snapshot(t, p, game)
		index := decodeMap(t, first.request(t, p, "GET", "/api/platform/rounds", nil, 200))
		if index["gameId"] != game || len(index["rounds"].([]any)) != 1 {
			t.Fatal("completed request history missing")
		}
		roundID := game + ":trix-request:1"
		history := first.request(t, p, "GET", "/api/platform/rounds/"+roundID, nil, 200)
		if !bytes.Equal(history, second.request(t, p, "GET", "/api/platform/rounds/"+roundID, nil, 200)) {
			t.Fatal("saved scores changed after service reload")
		}
		if bytes.Contains(history, []byte(`"hand"`)) || bytes.Contains(history, []byte(`"candidates"`)) {
			t.Fatal("score history leaked a hand or candidates")
		}
		other := second.player(t)
		second.request(t, other, "GET", "/api/platform/rounds/"+roundID, nil, 403)
		decision := records.PlatformDecisionID(game, source.Document.Revision)
		for _, level := range []int{1, 3} {
			advice := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease, "decisionId": decision, "requestedLevel": level, "unlock": level == 1}
			original := first.request(t, p, "POST", "/api/platform/advice", advice, 200)
			recovered := second.request(t, p, "POST", "/api/platform/advice", advice, 200)
			if !bytes.Equal(original, recovered) {
				t.Fatal("original advice changed after service recovery")
			}
			exposed := decodeMap(t, original)["advice"].(map[string]any)
			if level == 1 {
				if _, ok := exposed["recommendedCandidateId"]; ok {
					t.Fatal("notice exposed recommendation")
				}
			} else if exposed["recommendedCandidateId"] == nil {
				t.Fatal("suggestion lost candidate")
			}
		}
		first.request(t, p, "GET", "/api/platform/reviews/"+decision, nil, 200)
		first.request(t, p, "GET", "/api/platform/reviews/"+decision+"/advice", nil, 200)
		next := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": live.Document.Revision, "controlLeaseToken": lease}
		first.request(t, p, "POST", "/api/session/next-hand", next, 200)
		pending := first.snapshot(t, p, game)
		next["commandId"] = p.id()
		next["expectedRevision"] = pending.Document.Revision
		first.request(t, p, "POST", "/api/session/next-hand", next, 200)
		view := decodeMap(t, second.request(t, p, "GET", "/api/platform/session", nil, 200))["session"].(map[string]any)
		if view["presentation"].(map[string]any)["observation"].(map[string]any)["dealNumber"] != float64(2) {
			t.Fatal("next request lost on reload")
		}
		projections := []map[string]any{view["presentation"].(map[string]any)["observation"].(map[string]any), view["view"].(map[string]any)["table"].(map[string]any)}
		if view["actor"] != nil {
			projections = append(projections, view["actor"].(map[string]any)["observation"].(map[string]any))
		}
		for _, projection := range projections {
			if len(projection["ledger"].([]any)) != 0 || len(projection["withheldBonuses"].([]any)) != 0 {
				t.Fatal("score history was eagerly sent to the live browser")
			}
		}
		if !bytes.Equal(history, second.request(t, p, "GET", "/api/platform/rounds/"+roundID, nil, 200)) {
			t.Fatal("advancing changed completed request history")
		}
		next["commandId"] = p.id()
		first.request(t, p, "POST", "/api/session/next-hand", next, 409)
	}
}
