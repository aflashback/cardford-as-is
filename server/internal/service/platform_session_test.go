package service

import (
	"context"
	"testing"

	"cardford/server/internal/records"
)

func TestM04EPlatformCatalogPresentationAndRecovery(t *testing.T) {
	a, b, codec := serviceStores(t)
	first := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	for _, mode := range [][2]string{{"hearts", "solo"}, {"spades", "solo"}, {"spades", "partners"}} {
		t.Run(mode[0]+mode[1], func(t *testing.T) {
			p := first.player(t)
			empty := decodeMap(t, first.request(t, p, "GET", "/api/platform/session", nil, 200))
			if empty["session"] != nil || empty["activeGameId"] != nil || len(empty["catalog"].([]any)) != 3 {
				t.Fatal("invalid empty catalog")
			}
			receipt, opening := first.createGame(t, p, mode[0], mode[1], nil)
			envelope := decodeMap(t, first.request(t, p, "GET", "/api/platform/session", nil, 200))
			view := envelope["session"].(map[string]any)
			if view["gameId"] != receipt["gameId"] || view["revision"] != float64(0) || view["presentation"].(map[string]any)["id"] != receipt["gameId"] {
				t.Fatal("presentation identity mismatch")
			}
			if view["control"].(map[string]any)["leaseToken"] != nil {
				t.Fatal("GET exposed control token")
			}
			node := view["node"].(map[string]any)
			if node["kind"] == "sealed" && view["actor"] == nil {
				t.Fatal("opening human packet missing")
			}
			if node["kind"] == "actor" && node["actor"] != float64(0) && view["actor"] != nil {
				t.Fatal("opponent packet exposed")
			}
			recovered := decodeMap(t, second.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": opening["commandId"], "operation": "new-session", "request": opening}, 200))
			if recovered["status"] != "accepted" || recovered["receipt"].(map[string]any)["controlLeaseToken"] != receipt["controlLeaseToken"] {
				t.Fatal("original lease recovery changed")
			}
			prefs := map[string]any{"commandId": p.id(), "expectedPreferencesRevision": 0, "preferences": map[string]any{"coachMode": "nudges", "gameSpeed": 1.4}}
			unknown := decodeMap(t, first.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": prefs["commandId"], "operation": "platform-preferences", "request": prefs}, 200))
			if unknown["status"] != "unknown" {
				t.Fatal("unaccepted command invented receipt")
			}
			first.request(t, p, "POST", "/api/preferences", prefs, 200)
			recovered = decodeMap(t, second.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": prefs["commandId"], "operation": "platform-preferences", "request": prefs}, 200))
			if recovered["receipt"].(map[string]any)["revision"] != float64(1) {
				t.Fatal("preferences not recovered")
			}
			prefs["preferences"] = map[string]any{"coachMode": "asked", "gameSpeed": 1}
			first.request(t, p, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": prefs["commandId"], "operation": "platform-preferences", "request": prefs}, 409)
			principal, err := a.Authenticate(context.Background(), p.token)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = first.app.platformAccount(records.WithPrincipal(context.Background(), principal), p.owner); err != nil {
				t.Fatalf("direct account projection: %v", err)
			}
			first.request(t, p, "GET", "/api/account", nil, 200)
			first.request(t, p, "GET", "/api/account/export", nil, 200)
		})
	}
}
