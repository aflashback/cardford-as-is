package service

import (
	"bytes"
	"cardford/server/internal/conformance"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestM06TokenActualServiceOwnershipRecoveryAndNonCardLifecycle(t *testing.T) {
	registry, e := conformance.TokenRegistry()
	if e != nil {
		t.Fatal(e)
	}
	codec, e := records.NewServiceCodecWithRegistry(registry)
	if e != nil {
		t.Fatal(e)
	}
	a, b, _ := serviceStoresWithCodec(t, codec)
	first := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	for _, variant := range []string{"individual", "neighbour-teams"} {
		t.Run(variant, func(t *testing.T) {
			p := first.player(t)
			grant := records.Grant{ID: records.LocalGrantID(p.owner, conformance.TokenGameID, variant), OwnerID: p.owner, OfferID: "token-test-fixture", OfferVersion: "1.0.0", SourceKind: "free", SourceID: "test-only-constructor", ValidFrom: time.Now().Add(-time.Minute), Terms: records.GrantTerms{Version: "1.0.0", Game: conformance.TokenGameID, Variant: variant, CanPlay: true, CanCoach: true, Tools: []string{"advice"}, BucketID: "token-fixture-unlimited", Period: "lifetime", Timezone: "UTC", Unlimited: true, ExpiryRule: "finish-admitted-unit"}}
			if e = a.PutGrant(context.Background(), grant); e != nil {
				t.Fatal(e)
			}
			opening := map[string]any{"commandId": p.id(), "selector": map[string]any{"gameId": conformance.TokenGameID, "variantId": variant, "moduleVersion": "2.0.0", "ruleProfileId": "token-conformance-1.0.0"}, "expectedActiveGameId": nil, "expectedRevision": nil, "controlLeaseToken": nil}
			receipt := decodeMap(t, first.request(t, p, "POST", "/api/sessions", opening, 200))
			id := receipt["gameId"].(string)
			lease := receipt["controlLeaseToken"].(string)
			encoded, _ := json.Marshal(receipt)
			recovered := second.request(t, p, "POST", "/api/sessions", opening, 200)
			if !bytes.Equal(encoded, recovered) {
				t.Fatal("restart retry changed original lease")
			}
			stranger := second.player(t)
			first.request(t, p, "POST", "/api/access/unlocks", map[string]any{"commandId": p.id(), "gameId": id, "expectedRevision": 0, "controlLeaseToken": lease, "toolId": "advice"}, 200)
			coached := first.ready(t, p, id, 0, lease, "coach-advice")
			decisionID := coached["decisionId"].(string)
			originalAdvice := first.request(t, p, "GET", "/api/decisions/"+decisionID, nil, 200)
			if !bytes.Equal(originalAdvice, second.request(t, p, "GET", "/api/decisions/"+decisionID, nil, 200)) {
				t.Fatal("saved numeric advice changed across instances")
			}
			if decodeMap(t, originalAdvice)["advice"].(map[string]any)["source"] != "demo" {
				t.Fatal("numeric fixture advice mislabelled")
			}
			second.request(t, stranger, "GET", "/api/decisions/"+decisionID, nil, 403)
			complete := false
			for step := 0; step < 30; step++ {
				loaded := second.snapshot(t, p, id)
				bound, e := codec.Session(loaded.Document, loaded.Snapshot)
				if e != nil {
					t.Fatal(e)
				}
				node, e := bound.Node()
				if e != nil {
					t.Fatal(e)
				}
				view := decodeMap(t, second.request(t, p, "GET", "/api/platform/session", nil, 200))
				current := view["session"].(map[string]any)
				presentation := current["presentation"].(map[string]any)
				if _, exists := presentation["hand"]; exists {
					t.Fatal("noncard session invented hand")
				}
				if presentation["gameId"] != conformance.TokenGameID {
					t.Fatal("wrong presentation")
				}
				for _, item := range view["catalog"].([]any) {
					if item.(map[string]any)["selector"].(map[string]any)["gameId"] == conformance.TokenGameID {
						t.Fatal("test module entered catalog")
					}
				}
				if node.Kind == "session-complete" {
					complete = true
					break
				}
				body := map[string]any{"commandId": p.id(), "gameId": id, "expectedRevision": loaded.Document.Revision, "controlLeaseToken": lease}
				path := "/api/session/advance"
				if node.Kind == "actor" {
					actor := *node.Seat
					purpose := "bot-action"
					if actor == 0 {
						purpose = "human-analysis"
					}
					prepared := first.ready(t, p, id, loaded.Document.Revision, lease, purpose)
					body["preparedDecisionId"] = prepared["preparedDecisionId"]
					if actor == 0 {
						input, e := codec.PreparationInput(loaded.Document, loaded.Snapshot, 0)
						if e != nil {
							t.Fatal(e)
						}
						body["candidateId"] = input.CandidateIDs[0]
						body["preparedWorkIds"] = prepared["workIds"]
						path = "/api/session/actions"
					} else {
						body["kind"] = "bot"
					}
				} else if node.Kind == "automatic" {
					body["kind"] = "automatic"
					body["transitionId"] = node.TransitionID
				} else {
					t.Fatal("unexpected lifecycle", node.Kind)
				}
				accepted := first.request(t, p, "POST", path, body, 200)
				again := second.request(t, p, "POST", path, body, 200)
				if !bytes.Equal(accepted, again) {
					t.Fatal("accepted retry changed bytes")
				}
				if step == 0 {
					stale := map[string]any{}
					for k, v := range body {
						stale[k] = v
					}
					stale["commandId"] = p.id()
					first.request(t, p, "POST", path, stale, 409)
				}
			}
			if !complete {
				t.Fatal("token lifecycle did not terminate")
			}
			principal, e := a.Authenticate(context.Background(), p.token)
			if e != nil {
				t.Fatal(e)
			}
			ctx := records.WithPrincipal(context.Background(), principal)
			replayed, e := b.Replay(ctx, p.owner, id)
			if e != nil {
				t.Fatal(e)
			}
			loaded := second.snapshot(t, p, id)
			want, _ := loaded.Snapshot.Export()
			actual, _ := replayed.Snapshot.Export()
			if !bytes.Equal(want, actual) {
				t.Fatal("persistent exact numeric replay mismatch")
			}
			if !bytes.Equal(originalAdvice, second.request(t, p, "GET", "/api/decisions/"+decisionID, nil, 200)) {
				t.Fatal("persisted replay regenerated numeric advice")
			}
			original, e := b.ReadDecision(ctx, p.owner, decisionID)
			if e != nil || original.AnalysisSchema != "RegisteredAnalysis" || original.AdviceSchema != "AdviceView" {
				t.Fatal("saved numeric schemas not preserved", e)
			}
			// The ownership boundary is the real repository authentication check.
			other, e := b.Authenticate(context.Background(), stranger.token)
			if e != nil {
				t.Fatal(e)
			}
			if _, e = b.Load(records.WithPrincipal(context.Background(), other), p.owner, id); e == nil {
				t.Fatal("foreign principal loaded numeric private state")
			}
		})
	}
}
