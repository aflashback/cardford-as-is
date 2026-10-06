package service

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"cardford/server/internal/access"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

// Exercise the real V2 boundary through HTTP. The continuation node may retain
// the completed unit, but no new unit may publish after its free offer is disabled.
func TestM04DServiceDisabledOfferCannotAdmitNextUnitAfterRestart(t *testing.T) {
	a, b, codec := serviceStores(t)
	policy := scopedOffers(t)
	policy.Offers = policy.Offers[1:] // One free play-only offer; no coaching grant.
	policy.Precedence = []string{policy.Offers[0].ID}
	first := configuredHost(t, a, codec, policy)
	p := first.player(t)
	opening, _ := first.createGame(t, p, "hearts", "solo", nil)
	game, token := opening["gameId"].(string), opening["controlLeaseToken"].(string)
	var privateAnalysisID string
	completed := false
	for step := 0; step < 90; step++ {
		loaded := first.snapshot(t, p, game)
		bound, err := codec.Session(loaded.Document, loaded.Snapshot)
		if err != nil {
			t.Fatal(err)
		}
		node, err := bound.Node()
		if err != nil {
			t.Fatal(err)
		}
		if node.Kind == "round-complete" {
			completed = true
			break
		}
		body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": loaded.Document.Revision, "controlLeaseToken": token}
		path := "/api/session/advance"
		switch node.Kind {
		case "actor", "sealed":
			actor := 0
			if node.Seat != nil {
				actor = *node.Seat
			}
			purpose := "bot-action"
			if actor == 0 {
				purpose = "human-analysis"
			}
			prepared := first.ready(t, p, game, loaded.Document.Revision, token, purpose)
			if actor == 0 {
				input, err := codec.PreparationInput(loaded.Document, loaded.Snapshot, 0)
				if err != nil {
					t.Fatal(err)
				}
				body["candidateId"] = input.CandidateIDs[0]
				body["preparedDecisionId"] = prepared["preparedDecisionId"]
				body["preparedWorkIds"] = prepared["workIds"]
				path = "/api/session/actions"
				if privateAnalysisID == "" {
					privateAnalysisID = prepared["decisionId"].(string)
					first.request(t, p, "GET", "/api/decisions/"+privateAnalysisID, nil, 403)
				}
			} else {
				body["kind"] = "bot"
				body["preparedDecisionId"] = prepared["preparedDecisionId"]
			}
		case "automatic":
			body["kind"] = "automatic"
			body["transitionId"] = node.TransitionID
		default:
			t.Fatalf("unexpected first-hand lifecycle: %s", node.Kind)
		}
		first.request(t, p, "POST", path, body, 200)
	}
	if !completed || privateAnalysisID == "" {
		t.Fatal("first hand did not complete with retained human analysis")
	}
	before := first.snapshot(t, p, game)
	unit, err := codec.CurrentUnitID(before.Document, before.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	principal, err := a.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithPrincipal(context.Background(), principal)
	originalAccess, err := a.ReadAccessContext(ctx, p.owner, game, unit)
	if err != nil {
		t.Fatal(err)
	}
	if len(originalAccess.Grants) != 1 || len(originalAccess.Unlocks) != 0 || len(originalAccess.Usage) != 0 {
		t.Fatal("play-only hand acquired coaching access or spent allowance")
	}

	// Stop the serving instance, retain PostgreSQL records and the existing token.
	first.server.Close()
	first.app.Close()
	policy.Offers[0].Enabled = false
	policy.Offers[0].Version = "disabled-after-first-hand"
	second := configuredHost(t, b, codec, policy)
	second.request(t, p, "GET", "/api/access/offers", nil, 200) // Refresh cannot resurrect a free grant.
	newAccess := decodeMap(t, second.request(t, p, "POST", "/api/access/resolve", map[string]any{"kind": "play-start", "target": access.Target{GameID: "hearts", VariantID: "solo"}}, 200))
	if newAccess["allowed"] != false || newAccess["reason"] != "disabled" {
		t.Fatalf("disabled offer still admits: %+v", newAccess)
	}

	blocked := false
	for boundary := 0; boundary < 3; boundary++ {
		current := second.snapshot(t, p, game)
		body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": current.Document.Revision, "controlLeaseToken": token}
		status, data := continuationAttempt(t, second, p, body)
		after := second.snapshot(t, p, game)
		afterUnit, err := codec.CurrentUnitID(after.Document, after.Snapshot)
		if err != nil {
			t.Fatal(err)
		}
		if afterUnit != unit {
			t.Fatalf("disabled offer published next unit: %s -> %s", unit, afterUnit)
		}
		if status == 403 {
			if after.Document.Revision != current.Document.Revision || !bytes.Equal(after.Document.Checkpoint.State, current.Document.Checkpoint.State) {
				t.Fatal("rejected next-unit command mutated state")
			}
			if decodeMap(t, data)["code"] != "FORBIDDEN" {
				t.Fatalf("unexpected denial: %s", data)
			}
			second.request(t, p, "POST", "/api/session/next-hand", body, 403)
			blocked = true
			break
		}
		if status != 200 {
			t.Fatalf("boundary returned %d: %s", status, data)
		}
		if after.Document.Revision != current.Document.Revision+1 {
			t.Fatal("accepted continuation revision mismatch")
		}
		second.request(t, p, "POST", "/api/session/next-hand", body, 200) // Accepted intermediate-node retry remains recoverable.
	}
	if !blocked {
		t.Fatal("next-unit admission was never fenced")
	}
	retained := decodeMap(t, second.request(t, p, "GET", "/api/sessions/"+game, nil, 200))
	if retained["session"].(map[string]any)["gameId"] != game {
		t.Fatal("owned saved session disappeared")
	}
	second.request(t, p, "GET", "/api/decisions/"+privateAnalysisID, nil, 403)
	finalAccess, err := b.ReadAccessContext(ctx, p.owner, game, unit)
	if err != nil {
		t.Fatal(err)
	}
	if len(finalAccess.Grants) != 1 || finalAccess.Grants[0].ID != originalAccess.Grants[0].ID || finalAccess.Grants[0].OfferVersion != originalAccess.Grants[0].OfferVersion || len(finalAccess.Unlocks) != 0 || len(finalAccess.Usage) != 0 {
		t.Fatal("restart resurrected/replaced the free grant or delivered coaching")
	}
}

// A successful intermediate continuation or an immediate denial are both valid
// module boundary designs; the assertions above forbid publishing a new unit.
func continuationAttempt(t *testing.T, h *testHost, p *testPlayer, body map[string]any) (int, []byte) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	r, err := http.NewRequest(http.MethodPost, h.server.URL+"/api/session/next-hand", bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("Origin", h.server.URL)
	r.Header.Set("X-Tricks-Client", "1")
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Tricks-Tab", p.tab)
	r.AddCookie(&http.Cookie{Name: transport.LocalCookieName, Value: p.token})
	response, err := h.server.Client().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response.StatusCode, data
}
