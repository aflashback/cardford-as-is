package service

import "testing"

func TestRealtimePlaybackRecoversOriginalReceiptAfterLaterStateAndControl(t *testing.T) {
	a, b, codec := serviceStores(t)
	first, second := serviceHost(t, a, codec), serviceHost(t, b, codec)
	p := first.player(t)
	created, _ := first.createGame(t, p, "spades", "partners", nil)
	game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
	control := created["controlGeneration"]
	original := map[string]any{"commandId": p.id(), "gameId": game, "controlLeaseToken": token, "expectedControlGeneration": control, "expectedPlaybackGeneration": 0, "running": false}
	recovery := map[string]any{"commandId": original["commandId"], "operation": "playback", "request": original}
	unknown := decodeMap(t, second.request(t, p, "POST", "/api/platform/commands/reconcile", recovery, 200))
	if unknown["status"] != "unknown" {
		t.Fatal("unaccepted playback invented a receipt")
	}
	accepted := decodeMap(t, first.request(t, p, "POST", "/api/session/playback", original, 200))
	if accepted["running"] != false || accepted["generation"] != float64(1) {
		t.Fatal("unexpected original playback result", accepted)
	}
	later := map[string]any{"commandId": p.id(), "gameId": game, "controlLeaseToken": token, "expectedControlGeneration": control, "expectedPlaybackGeneration": 1, "running": false}
	second.request(t, p, "POST", "/api/session/playback", later, 200)
	second.request(t, p, "POST", "/api/session/control", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": 0, "expectedControlGeneration": control}, 200)
	recovered := decodeMap(t, second.request(t, p, "POST", "/api/platform/commands/reconcile", recovery, 200))
	receipt := recovered["receipt"].(map[string]any)
	if recovered["status"] != "accepted" || receipt["running"] != false || receipt["generation"] != float64(1) {
		t.Fatal("recovery returned current state instead of original receipt", recovered)
	}
	repeated := decodeMap(t, first.request(t, p, "POST", "/api/session/playback", original, 200))
	if repeated["generation"] != float64(1) {
		t.Fatal("replayed playback command ran again", repeated)
	}
	original["running"] = true
	second.request(t, p, "POST", "/api/platform/commands/reconcile", recovery, 409)
}
