package service

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"cardford/server/internal/access"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

func configuredHost(t *testing.T, store *records.Store, codec *records.DocumentCodec, p access.Policy) *testHost {
	t.Helper()
	app, err := NewConfigured(store, codec, p)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewUnstartedServer(nil)
	h, err := transport.NewLocal(app, transport.LocalOptions{Origin: "http://" + ts.Listener.Addr().String()})
	if err != nil {
		t.Fatal(err)
	}
	ts.Config.Handler = h
	ts.Start()
	t.Cleanup(func() { ts.Close(); app.Close() })
	return &testHost{app, ts, store, codec}
}
func scopedOffers(t *testing.T) access.Policy {
	t.Helper()
	p, err := access.LocalFixturePolicy()
	if err != nil {
		t.Fatal(err)
	}
	free := p.Offers[0]
	free.ID = "hearts-play"
	free.Targets = []access.Target{{GameID: "hearts", VariantID: "solo"}}
	free.Coach.Tools = []string{}
	trial := free
	trial.ID = "hearts-coach-trial"
	trial.Kind = "access-trial"
	trial.Activation = "once-per-identity"
	trial.Play = false
	limit, seconds := int64(1), int64(3600)
	trial.ValiditySeconds = &seconds
	trial.Coach = access.Coach{Tools: []string{"advice"}, Allowance: access.Allowance{Kind: "limited", Limit: &limit, Unit: "hand", Period: "grant", Timezone: "UTC", BucketID: "trial-stable"}}
	p.Offers = []access.Offer{trial, free}
	p.Precedence = []string{trial.ID, free.ID}
	return p
}
func TestM04DServiceConfiguredTrialUnlockSeparateGrantAndRestart(t *testing.T) {
	a, b, codec := serviceStores(t)
	policy := scopedOffers(t)
	h := configuredHost(t, a, codec, policy)
	other := configuredHost(t, b, codec, policy)
	p := h.player(t)
	offers := decodeMap(t, h.request(t, p, "GET", "/api/access/offers", nil, 200))
	if len(offers["offers"].([]any)) != 2 {
		t.Fatal("wrong offer catalog")
	}
	wrong := map[string]any{"kind": "play-start", "target": map[string]any{"gameId": "spades", "variantId": "solo"}}
	if v := decodeMap(t, h.request(t, p, "POST", "/api/access/resolve", wrong, 200)); v["allowed"] != false {
		t.Fatal("wrong target allowed")
	}
	forged := map[string]any{"commandId": p.id(), "selector": map[string]any{"gameId": "spades", "variantId": "solo", "moduleVersion": "2.0.0", "ruleProfileId": "spades-solo-training-1.0.0"}, "expectedActiveGameId": nil, "expectedRevision": nil, "controlLeaseToken": nil}
	h.request(t, p, "POST", "/api/sessions", forged, 403)
	receipt, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	adviceRequest := map[string]any{"gameId": game, "expectedRevision": 0, "controlLeaseToken": lease, "purpose": "coach-advice"}
	h.request(t, p, "POST", "/api/session/prepare", adviceRequest, 403)
	ctxPrincipal, err := a.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithPrincipal(context.Background(), ctxPrincipal)
	current, err := a.ReadAccess(ctx, p.owner)
	if err != nil {
		t.Fatal(err)
	}
	trialRequest := map[string]any{"commandId": p.id(), "offerId": "hearts-coach-trial", "offerVersion": "1.0.0", "expectedAccessGeneration": current.Generation}
	trial := h.request(t, p, "POST", "/api/access/trials", trialRequest, 200)
	if !bytes.Equal(trial, other.request(t, p, "POST", "/api/access/trials", trialRequest, 200)) {
		t.Fatal("trial receipt changed")
	}
	h.request(t, p, "POST", "/api/session/prepare", adviceRequest, 403) // entitlement alone does not spend the unit
	unlockRequest := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": 0, "controlLeaseToken": lease, "toolId": "advice"}
	unlocked := h.request(t, p, "POST", "/api/access/unlocks", unlockRequest, 200)
	if v := decodeMap(t, unlocked); v["remaining"] != float64(0) {
		t.Fatal("one unit not spent")
	}
	if !bytes.Equal(unlocked, other.request(t, p, "POST", "/api/access/unlocks", unlockRequest, 200)) {
		t.Fatal("unlock changed across service instances")
	}
	reconcile := map[string]any{"commandId": unlockRequest["commandId"], "operation": "unlock-coaching", "request": unlockRequest}
	if !bytes.Equal(unlocked, other.request(t, p, "POST", "/api/commands/reconcile", reconcile, 200)) {
		t.Fatal("unlock reconciliation changed")
	}
	altered := map[string]any{}
	for k, v := range unlockRequest {
		altered[k] = v
	}
	altered["toolId"] = "other"
	h.request(t, p, "POST", "/api/access/unlocks", altered, 409)
	decision := h.ready(t, p, game, 0, lease, "coach-advice")
	saved := h.request(t, p, "GET", "/api/decisions/"+decision["decisionId"].(string), nil, 200)
	if !bytes.Equal(saved, other.request(t, p, "GET", "/api/decisions/"+decision["decisionId"].(string), nil, 200)) {
		t.Fatal("original advice changed")
	}
	l := h.snapshot(t, p, game)
	input, err := codec.PreparationInput(l.Document, l.Snapshot, 0)
	if err != nil {
		t.Fatal(err)
	}
	action := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": 0, "controlLeaseToken": lease, "candidateId": input.CandidateIDs[0], "preparedDecisionId": decision["preparedDecisionId"], "preparedWorkIds": decision["workIds"]}
	moved := decodeMap(t, h.request(t, p, "POST", "/api/session/actions", action, 200))
	receipt["revision"] = moved["revision"]
	next, _ := h.createGame(t, p, "hearts", "solo", receipt)
	deniedUnlock := map[string]any{"commandId": p.id(), "gameId": next["gameId"], "expectedRevision": 0, "controlLeaseToken": next["controlLeaseToken"], "toolId": "advice"}
	deniedBody := decodeMap(t, h.request(t, p, "POST", "/api/access/unlocks", deniedUnlock, 403))
	if deniedBody["code"] != "QUOTA_EXHAUSTED" {
		t.Fatal("exhaustion not explicit")
	}
	h.request(t, p, "GET", "/api/decisions/"+decision["decisionId"].(string), nil, 200)
	read := map[string]any{"kind": "read-saved", "decisionId": decision["decisionId"]}
	if d := decodeMap(t, h.request(t, p, "POST", "/api/access/resolve", read, 200)); d["reason"] != "owned-result" {
		t.Fatal("saved ownership decision")
	}
	foreign := other.player(t)
	other.request(t, foreign, "GET", "/api/decisions/"+decision["decisionId"].(string), nil, 403)
	// Old accepted receipts survive replacement and changed control.
	if !bytes.Equal(unlocked, other.request(t, p, "POST", "/api/access/unlocks", unlockRequest, 200)) {
		t.Fatal("original receipt lost after replacement")
	}
	h.request(t, p, "POST", "/api/account/delete", map[string]any{}, 200)
}

func TestM04DServiceLaunchEmptyAndModeFence(t *testing.T) {
	a, b, codec := serviceStores(t)
	empty, err := access.LaunchPolicy()
	if err != nil {
		t.Fatal(err)
	}
	h := configuredHost(t, a, codec, empty)
	fixture := serviceHost(t, b, codec)
	p := h.player(t)
	check := map[string]any{"kind": "play-start", "target": map[string]any{"gameId": "hearts", "variantId": "solo"}}
	d := decodeMap(t, h.request(t, p, "POST", "/api/access/resolve", check, 200))
	if d["allowed"] != false || d["reason"] != "no-grant" {
		t.Fatal("empty launch config granted access")
	}
	fixture.request(t, p, "GET", "/api/session", nil, 403)
	fixture.request(t, p, "POST", "/api/logout", map[string]any{}, 200)
}

func TestM04DServiceCoachRemainsIndependentAfterPlayExpires(t *testing.T) {
	a, _, codec := serviceStores(t)
	policy := scopedOffers(t)
	coach := policy.Offers[0]
	coach.Kind = "free"
	coach.Activation = "automatic"
	coach.ValiditySeconds = nil
	play := policy.Offers[1]
	seconds := int64(5)
	play.ValiditySeconds = &seconds
	play.Continuation = "pause-at-expiry"
	policy.Offers = []access.Offer{coach, play}
	h := configuredHost(t, a, codec, policy)
	p := h.player(t)
	receipt, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	principal, err := a.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	c, err := a.ReadAccessContext(records.WithPrincipal(context.Background(), principal), p.owner, game, "hand-1")
	if err != nil {
		t.Fatal(err)
	}
	var expiry time.Time
	for _, g := range c.Grants {
		if g.OfferID == play.ID {
			expiry = *g.ValidUntil
		}
	}
	if expiry.IsZero() {
		t.Fatal("missing play expiry")
	}
	if delay := time.Until(expiry) + 20*time.Millisecond; delay > 0 {
		time.Sleep(delay)
	}
	playCheck := map[string]any{"kind": "play-continue", "gameId": game}
	if d := decodeMap(t, h.request(t, p, "POST", "/api/access/resolve", playCheck, 200)); d["allowed"] != false {
		t.Fatal("expired play allowed")
	}
	coachCheck := map[string]any{"kind": "coach", "gameId": game, "toolId": "advice"}
	if d := decodeMap(t, h.request(t, p, "POST", "/api/access/resolve", coachCheck, 200)); d["allowed"] != true {
		t.Fatal("independent coach hidden")
	}
	un := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": 0, "controlLeaseToken": lease, "toolId": "advice"}
	h.request(t, p, "POST", "/api/access/unlocks", un, 200)
	prepared := h.ready(t, p, game, 0, lease, "coach-advice")
	if len(prepared["workIds"].([]any)) != 1 {
		t.Fatal("unplayable sealed unit unnecessarily prepared bots")
	}
	h.request(t, p, "GET", "/api/decisions/"+prepared["decisionId"].(string), nil, 200)
	h.request(t, p, "POST", "/api/session/prepare", map[string]any{"gameId": game, "expectedRevision": 0, "controlLeaseToken": lease, "purpose": "human-analysis"}, 403)
}

// A zero-store Service proves the authored path cannot invoke game/account work.
func TestM04DDemoPublicAndIndependentOfAccounts(t *testing.T) {
	h := &Service{}
	req := transport.Request{Operation: "demo-frame", Body: json.RawMessage(`{"kind":"open","contentVersion":"spades-example-1.0.0"}`)}
	out, err := h.Call(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if v := decodeMap(t, out.Body); v["label"] != "demo" || v["nodeId"] != "opening" {
		t.Fatal("wrong public content")
	}
	req.Body = json.RawMessage(`{"kind":"open","contentVersion":"spades-example-1.0.0","position":{}}`)
	if _, err = h.Call(context.Background(), req); err == nil {
		t.Fatal("arbitrary position accepted")
	}
}

func TestM04DDemoHTTPNeedsNoIdentityAndNeverSetsCookie(t *testing.T) {
	h, err := transport.NewLocal(&Service{}, transport.LocalOptions{Origin: "http://127.0.0.1:4190"})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"kind":"open","contentVersion":"spades-example-1.0.0"}`, 200},
		{`{"kind":"open","contentVersion":"unknown"}`, 400},
		{`{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"opening","choiceId":"play-king"}`, 200},
		{`{"kind":"replay","contentVersion":"spades-example-1.0.0","ownerId":"forged"}`, 400},
	} {
		r := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4190/api/demo/frame", strings.NewReader(tc.body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Tricks-Client", "1")
		r.AddCookie(&http.Cookie{Name: transport.LocalCookieName, Value: "expired"})
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status || w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Set-Cookie") != "" {
			t.Fatalf("demo transport: %d %s", w.Code, w.Body.String())
		}
	}
}
