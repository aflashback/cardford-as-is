package service

import (
	"bytes"
	"cardford/server/internal/contracts"
	"encoding/json"
	"regexp"
	"testing"
)

// Exercise HTTP request/response validation and generic receipt recovery with
// identities issued by the real Go service, rather than store-only fixtures.
func TestM04EPlatformFamilyNativeIdentityJourney(t *testing.T) {
	a, b, codec := serviceStores(t)
	first := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	payer, member, stranger := first.player(t), first.player(t), first.player(t)
	nativeID := regexp.MustCompile(`^[a-f0-9]{48}$`)
	for _, p := range []*testPlayer{payer, member, stranger} {
		if !nativeID.MatchString(p.owner) {
			t.Fatal("expected real Go identity")
		}
	}
	preview := decodeMap(t, first.request(t, payer, "POST", "/api/subscription/preview", map[string]any{"action": "select-plan", "plan": "family"}, 200))
	first.request(t, payer, "POST", "/api/subscription/change", map[string]any{"commandId": payer.id(), "previewId": preview["previewId"]}, 200)
	created := decodeMap(t, first.request(t, payer, "POST", "/api/family", map[string]any{"commandId": payer.id(), "action": "create"}, 200))
	if created["role"] != "payer" || !nativeID.MatchString(created["familyId"].(string)) {
		t.Fatal("family creation identity mismatch")
	}
	invite := map[string]any{"commandId": payer.id(), "action": "invite", "inviteeId": member.owner, "seatClass": "limited"}
	raw, _ := json.Marshal(invite)
	if contracts.Validate("FamilyCommand", raw) == nil {
		t.Fatal("original UUID contract unexpectedly changed")
	}
	if err := contracts.Validate("PlatformFamilyCommand", raw); err != nil {
		t.Fatal(err)
	}
	issued := first.request(t, payer, "POST", "/api/family", invite, 200)
	view := decodeMap(t, issued)
	invitations := view["invitations"].([]any)
	if len(invitations) != 1 {
		t.Fatal("invitation missing")
	}
	invitation := invitations[0].(map[string]any)
	if invitation["inviteeId"] != member.owner || !nativeID.MatchString(invitation["invitationId"].(string)) || !nativeID.MatchString(invitation["token"].(string)) {
		t.Fatal("native invitation fields rejected or replaced")
	}
	if repeated := second.request(t, payer, "POST", "/api/family", invite, 200); !bytes.Equal(repeated, issued) {
		t.Fatal("invitation retry changed token or receipt")
	}
	recovered := decodeMap(t, second.request(t, payer, "POST", "/api/platform/commands/reconcile", map[string]any{"commandId": invite["commandId"], "operation": "platform-family-command", "request": invite}, 200))
	if recovered["status"] != "accepted" || recovered["receipt"].(map[string]any)["invitations"].([]any)[0].(map[string]any)["token"] != invitation["token"] {
		t.Fatal("native invitation reconciliation failed")
	}
	first.request(t, payer, "POST", "/api/family", map[string]any{"commandId": payer.id(), "action": "invite", "inviteeId": "00000000-0000-0000-0000-000000000000", "seatClass": "limited"}, 400)
	accept := map[string]any{"commandId": stranger.id(), "action": "accept", "token": invitation["token"], "acknowledgeIndividualCoverage": true}
	first.request(t, stranger, "POST", "/api/family", accept, 403)
	accept["commandId"] = member.id()
	joined := decodeMap(t, second.request(t, member, "POST", "/api/family", accept, 200))
	if joined["role"] != "member" || len(joined["invitations"].([]any)) != 0 || len(joined["members"].([]any)) != 1 || joined["members"].([]any)[0].(map[string]any)["playerId"] != member.owner {
		t.Fatal("member view was not private")
	}
	left := decodeMap(t, first.request(t, member, "POST", "/api/family", map[string]any{"commandId": member.id(), "action": "leave"}, 200))
	if left["role"] != "none" {
		t.Fatal("member did not leave")
	}
	payerView := decodeMap(t, second.request(t, payer, "GET", "/api/family", nil, 200))
	held := false
	for _, row := range payerView["members"].([]any) {
		m := row.(map[string]any)
		held = held || m["playerId"] == member.owner && m["status"] == "held"
	}
	if !held {
		t.Fatal("leaving released the reserved seat early")
	}
}
