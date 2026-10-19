package service

import (
	"bytes"
	"cardford/server/internal/games/trix"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"encoding/json"
	"reflect"
	"testing"
)

// South owns all Jacks and their immediate neighbours. The three other seats
// must pass in the opening circuit; their twos span both partnerships.
func trixAnnouncementDeck() []string {
	south := []string{"CJ", "DJ", "HJ", "SJ", "C10", "D10", "H10", "S10", "CQ", "DQ", "HQ", "SQ", "H7"}
	reserved := map[string]bool{}
	for _, card := range south {
		reserved[card] = true
	}
	rest := []string{}
	for _, card := range trix.Deck() {
		if !reserved[card] {
			rest = append(rest, card)
		}
	}
	return append(south, rest...)
}

func TestTrixAnnouncementNativeHTTPRestartAndFences(t *testing.T) {
	installed := trix.Installations()
	for i := range installed {
		original := installed[i].Bootstrap
		installed[i].Bootstrap = func(id string) (json.RawMessage, json.RawMessage, error) {
			config, _, err := original(id)
			material, _ := json.Marshal(trix.Chance{Deck: trixAnnouncementDeck()})
			return config, material, err
		}
	}
	registry, err := sessions.NewRegistryWithRegistrations(trix.Handlers(sessions.DefaultHandlers()), installed...)
	if err != nil {
		t.Fatal(err)
	}
	codec, err := records.NewServiceCodecWithRegistry(registry)
	if err != nil {
		t.Fatal(err)
	}
	a, b, _ := serviceStoresWithCodec(t, codec)
	first, second := serviceHost(t, a, codec), serviceHost(t, b, codec)
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) {
			p := first.player(t)
			catalog := decodeMap(t, first.request(t, p, "GET", "/api/platform/session", nil, 200))["catalog"].([]any)
			if len(catalog) != 7 {
				t.Fatal("historical installation changed catalog size")
			}
			var selector any
			for _, entry := range catalog {
				item := entry.(map[string]any)
				if item["mode"] == "trix-"+variant {
					if selector != nil {
						t.Fatal("duplicate active mode")
					}
					selector = item["selector"]
				}
			}
			if selector == nil || selector.(map[string]any)["moduleVersion"] != "2.2.0" || selector.(map[string]any)["ruleProfileId"] != "trix-"+variant+"-1.1.0" {
				t.Fatal("new Partners pin missing")
			}
			create := map[string]any{"commandId": p.id(), "selector": map[string]any{"gameId": "trix", "variantId": variant, "moduleVersion": "2.0.0", "ruleProfileId": "trix-" + variant + "-1.0.0"}, "expectedActiveGameId": nil, "expectedRevision": nil, "controlLeaseToken": nil}
			first.request(t, p, "POST", "/api/sessions", create, 422)
			create["commandId"], create["selector"] = p.id(), selector
			receipt := first.request(t, p, "POST", "/api/sessions", create, 200)
			if !bytes.Equal(receipt, second.request(t, p, "POST", "/api/sessions", create, 200)) {
				t.Fatal("create receipt changed after restart")
			}
			created := decodeMap(t, receipt)
			game, lease := created["gameId"].(string), created["controlLeaseToken"].(string)
			read := func(h *testHost) map[string]any {
				view := decodeMap(t, h.request(t, p, "GET", "/api/platform/session", nil, 200))["session"].(map[string]any)
				obs := view["presentation"].(map[string]any)["observation"].(map[string]any)
				history, ok := obs["layoutHistory"].(map[string]any)
				if !ok || history["version"] != "1.0.0" || history["status"] != "available" {
					t.Fatal("current public chronology missing after service projection/restart")
				}
				if !reflect.DeepEqual(obs, view["view"].(map[string]any)["table"]) {
					t.Fatal("presentation/table differ")
				}
				if actor := view["actor"]; actor != nil && !reflect.DeepEqual(obs, actor.(map[string]any)["observation"]) {
					t.Fatal("actor projection differs")
				}
				return obs
			}
			if _, ok := read(first)["twoAnnouncements"]; ok {
				t.Fatal("announcement before layout request")
			}
			initial := first.snapshot(t, p, game)
			chooseReady := first.ready(t, p, game, initial.Document.Revision, lease, "human-analysis")
			chooseInput, err := codec.PreparationInput(initial.Document, initial.Snapshot, 0)
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, id := range chooseInput.CandidateIDs {
				found = found || id == "choose:trix"
			}
			if !found {
				t.Fatal("server did not supply the Trix choice")
			}
			first.request(t, p, "POST", "/api/session/actions", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": initial.Document.Revision, "controlLeaseToken": lease, "candidateId": "choose:trix", "preparedDecisionId": chooseReady["preparedDecisionId"], "preparedWorkIds": chooseReady["workIds"]}, 200)
			for turn := 0; turn <= 4; turn++ {
				obs := read(first)
				if obs["phase"] != "layout" {
					t.Fatal("fixture failed to enter layout")
				}
				if !reflect.DeepEqual(obs, read(second)) {
					t.Fatal("restart changed announcement")
				}
				announcement := obs["twoAnnouncements"].(map[string]any)
				if len(announcement) != 2 {
					t.Fatal("unexpected announcement fields")
				}
				if turn < 4 {
					if announcement["status"] != "hidden" || announcement["cards"] != nil {
						t.Fatal("suited twos disclosed early")
					}
					counts := announcement["counts"].([]any)
					sum := float64(0)
					for _, count := range counts {
						sum += count.(float64)
					}
					if len(counts) != 4 || sum != 4 {
						t.Fatal("invalid public two counts")
					}
				} else {
					if announcement["status"] != "revealed" || announcement["counts"] != nil {
						t.Fatal("fourth opening turn did not reveal")
					}
					cards := announcement["cards"].([]any)
					seen := map[string]bool{}
					for _, item := range cards {
						seen[item.(map[string]any)["card"].(string)] = true
					}
					if len(cards) != 4 || len(seen) != 4 {
						t.Fatal("reveal lost or duplicated a two")
					}
					if len(obs["passes"].([]any)) != 3 {
						t.Fatal("opening passes were not counted")
					}
					break
				}
				if turn != 0 {
					platformStep(t, first, p, game, lease)
					continue
				}
				before := first.snapshot(t, p, game)
				prepared := first.ready(t, p, game, before.Document.Revision, lease, "human-analysis")
				input, err := codec.PreparationInput(before.Document, before.Snapshot, 0)
				if err != nil {
					t.Fatal(err)
				}
				action := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": before.Document.Revision, "controlLeaseToken": lease, "candidateId": input.CandidateIDs[len(input.CandidateIDs)-1], "preparedDecisionId": prepared["preparedDecisionId"], "preparedWorkIds": prepared["workIds"]}
				accepted := first.request(t, p, "POST", "/api/session/actions", action, 200)
				if !bytes.Equal(accepted, second.request(t, p, "POST", "/api/session/actions", action, 200)) {
					t.Fatal("lost action response changed receipt")
				}
				action["commandId"] = p.id()
				first.request(t, p, "POST", "/api/session/actions", action, 409)
			}
		})
	}
}
