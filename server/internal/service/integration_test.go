package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"github.com/jackc/pgx/v5"
)

type testHost struct {
	app    *Service
	server *httptest.Server
	store  *records.Store
	codec  *records.DocumentCodec
}
type testPlayer struct {
	token, owner, tab string
	counter           int
}

func serviceStores(t *testing.T) (*records.Store, *records.Store, *records.DocumentCodec) {
	c, err := records.NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	return serviceStoresWithCodec(t, c)
}
func serviceStoresWithCodec(t *testing.T, c *records.DocumentCodec) (*records.Store, *records.Store, *records.DocumentCodec) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("native TEST_DATABASE_URL required")
	}
	if url == os.Getenv("DATABASE_URL") {
		t.Fatal("isolated database required")
	}
	id, err := randomID()
	if err != nil {
		t.Fatal(err)
	}
	schema := "m03_service_" + id[:16]
	var a, b *records.Store
	// Register before setup so a failed migration or second connection also
	// removes this fixture's private schema after closing every opened pool.
	t.Cleanup(func() {
		if b != nil {
			b.Close()
		}
		if a != nil {
			a.Close()
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		admin, e := pgx.Connect(ctx, url)
		if e != nil {
			t.Error(e)
			return
		}
		defer admin.Close(ctx)
		if _, e = admin.Exec(ctx, "DROP SCHEMA IF EXISTS "+pgx.Identifier{schema}.Sanitize()+" CASCADE"); e != nil {
			t.Error(e)
		}
	})
	a, err = records.OpenStore(context.Background(), url, records.StoreOptions{Schema: schema, CreateSchema: true, Codec: c})
	if err != nil {
		t.Fatalf("open first fixture store: %v", err)
	}
	if err = a.ApplyMigrations(context.Background(), filepath.Join("..", "..", "..", "web", "server", "records", "migrations")); err != nil {
		t.Fatalf("migrate fixture store: %v", err)
	}
	b, err = records.OpenStore(context.Background(), url, records.StoreOptions{Schema: schema, Codec: c})
	if err != nil {
		t.Fatalf("open second fixture store: %v", err)
	}
	return a, b, c
}
func serviceHost(t *testing.T, store *records.Store, codec *records.DocumentCodec) *testHost {
	t.Helper()
	app, e := New(store, codec)
	if e != nil {
		t.Fatal(e)
	}
	ts := httptest.NewUnstartedServer(nil)
	h, e := transport.NewLocal(app, transport.LocalOptions{Origin: "http://" + ts.Listener.Addr().String()})
	if e != nil {
		t.Fatal(e)
	}
	ts.Config.Handler = h
	ts.Start()
	t.Cleanup(func() { ts.Close(); app.Close() })
	return &testHost{app, ts, store, codec}
}
func (h *testHost) request(t *testing.T, p *testPlayer, method, path string, body any, want int) []byte {
	t.Helper()
	var raw []byte
	switch v := body.(type) {
	case json.RawMessage:
		raw = v
	case nil:
	default:
		var e error
		raw, e = json.Marshal(v)
		if e != nil {
			t.Fatal(e)
		}
	}
	req, e := http.NewRequest(method, h.server.URL+path, bytes.NewReader(raw))
	if e != nil {
		t.Fatal(e)
	}
	req.Header.Set("Origin", h.server.URL)
	req.Header.Set("X-Tricks-Client", "1")
	req.Header.Set("Content-Type", "application/json")
	if p != nil {
		req.Header.Set("X-Tricks-Tab", p.tab)
		if p.token != "" {
			req.AddCookie(&http.Cookie{Name: transport.LocalCookieName, Value: p.token})
		}
	}
	response, e := h.server.Client().Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	data, e := io.ReadAll(response.Body)
	if e != nil {
		t.Fatal(e)
	}
	if response.StatusCode != want && !(want == 0 && (response.StatusCode == 200 || response.StatusCode == 202)) {
		t.Fatalf("%s %s: status %d want %d: %s", method, path, response.StatusCode, want, data)
	}
	for _, cookie := range response.Cookies() {
		if cookie.Name == transport.LocalCookieName && p != nil {
			p.token = cookie.Value
		}
	}
	return data
}
func (h *testHost) player(t *testing.T) *testPlayer {
	p := &testPlayer{tab: "service-tab-one"}
	raw := h.request(t, p, "POST", "/api/local/session", map[string]any{}, 200)
	var identity struct {
		PlayerID string `json:"playerId"`
	}
	if e := json.Unmarshal(raw, &identity); e != nil {
		t.Fatal(e)
	}
	p.owner = identity.PlayerID
	return p
}
func (p *testPlayer) id() string { p.counter++; return fmt.Sprintf("command-%d", p.counter) }
func decodeMap(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var v map[string]any
	if e := json.Unmarshal(raw, &v); e != nil {
		t.Fatal(e)
	}
	return v
}
func (h *testHost) createGame(t *testing.T, p *testPlayer, game, variant string, prior map[string]any) (map[string]any, map[string]any) {
	profile := "hearts-training-1.0.0"
	if game == "spades" {
		profile = "spades-training-1.0.0"
		if variant == "solo" {
			profile = "spades-solo-training-1.0.0"
		}
	}
	body := map[string]any{"commandId": p.id(), "selector": map[string]any{"gameId": game, "variantId": variant, "moduleVersion": "2.0.0", "ruleProfileId": profile}, "expectedActiveGameId": nil, "expectedRevision": nil, "controlLeaseToken": nil}
	if prior != nil {
		body["expectedActiveGameId"] = prior["gameId"]
		body["expectedRevision"] = prior["revision"]
		body["controlLeaseToken"] = prior["controlLeaseToken"]
	}
	return decodeMap(t, h.request(t, p, "POST", "/api/sessions", body, 200)), body
}
func (h *testHost) snapshot(t *testing.T, p *testPlayer, id string) *records.Loaded {
	t.Helper()
	principal, e := h.store.Authenticate(context.Background(), p.token)
	if e != nil {
		t.Fatal(e)
	}
	l, e := h.store.Load(records.WithPrincipal(context.Background(), principal), p.owner, id)
	if e != nil {
		t.Fatal(e)
	}
	return l
}
func (h *testHost) ready(t *testing.T, p *testPlayer, game string, revision int64, token, purpose string) map[string]any {
	t.Helper()
	body := map[string]any{"gameId": game, "expectedRevision": revision, "controlLeaseToken": token, "purpose": purpose}
	// Preparation is asynchronous, including when the policy needs only one move.
	view := decodeMap(t, h.request(t, p, "POST", "/api/session/prepare", body, 0))
	ids := view["workIds"].([]any)
	deadline := time.Now().Add(10 * time.Second)
	for _, id := range ids {
		for {
			raw := h.request(t, p, "GET", "/api/work/"+id.(string), nil, 0)
			w := decodeMap(t, raw)
			status := w["status"].(string)
			if status == "completed" {
				if id == view["workId"] {
					view["decisionId"] = w["decisionId"]
				}
				break
			}
			if status == "rejected" || status == "canceled" {
				t.Fatalf("preparation %s: %s", id, raw)
			}
			if time.Now().After(deadline) {
				t.Fatal("work did not settle")
			}
			time.Sleep(5 * time.Millisecond)
		}
	}
	return view
}
func TestLocalServiceThreeModesAndReceiptRecovery(t *testing.T) {
	a, b, codec := serviceStores(t)
	first := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	for _, mode := range [][2]string{{"hearts", "solo"}, {"spades", "solo"}, {"spades", "partners"}} {
		t.Run(mode[0]+"-"+mode[1], func(t *testing.T) {
			p := first.player(t)
			receipt, opening := first.createGame(t, p, mode[0], mode[1], nil)
			game := receipt["gameId"].(string)
			token := receipt["controlLeaseToken"].(string)
			// Another service instance returns the original opening, including lease.
			recovered := second.request(t, p, "POST", "/api/sessions", opening, 200)
			encoded, _ := json.Marshal(receipt)
			if !bytes.Equal(recovered, encoded) {
				t.Fatal("opening response changed across instances")
			}
			completed := false
			for step := 0; step < 90; step++ {
				l := first.snapshot(t, p, game)
				bound, e := codec.Session(l.Document, l.Snapshot)
				if e != nil {
					t.Fatal(e)
				}
				node, e := bound.Node()
				if e != nil {
					t.Fatal(e)
				}
				if node.Kind == "round-complete" || node.Kind == "session-complete" {
					completed = true
					receipt["revision"] = l.Document.Revision
					break
				}
				body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": l.Document.Revision, "controlLeaseToken": token}
				path := "/api/session/advance"
				switch node.Kind {
				case "actor", "sealed":
					purpose := "bot-action"
					actor := 0
					if node.Seat != nil {
						actor = *node.Seat
					}
					if actor == 0 {
						purpose = "human-analysis"
					}
					prepared := first.ready(t, p, game, l.Document.Revision, token, purpose)
					if actor == 0 {
						input, e := codec.PreparationInput(l.Document, l.Snapshot, 0)
						if e != nil {
							t.Fatal(e)
						}
						body["candidateId"] = input.CandidateIDs[0]
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
					t.Fatalf("unexpected node %s", node.Kind)
				}
				accepted := first.request(t, p, "POST", path, body, 200)
				if step == 0 {
					again := second.request(t, p, "POST", path, body, 200)
					if !bytes.Equal(accepted, again) {
						t.Fatal("lost-response retry changed result")
					}
					changed := map[string]any{}
					for k, v := range body {
						changed[k] = v
					}
					changed["controlLeaseToken"] = "different-lease"
					second.request(t, p, "POST", path, changed, 409)
				}
			}
			if !completed {
				t.Fatal("full hand did not complete")
			}
			// Continue and actual chance remain two distinct recorded V2 nodes.
			for boundary := 0; boundary < 2; boundary++ {
				current := first.snapshot(t, p, game)
				body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": current.Document.Revision, "controlLeaseToken": token}
				accepted := first.request(t, p, "POST", "/api/session/next-hand", body, 200)
				repeated := second.request(t, p, "POST", "/api/session/next-hand", body, 200)
				if !bytes.Equal(accepted, repeated) {
					t.Fatal("boundary retry changed accepted result")
				}
				receipt["revision"] = current.Document.Revision + 1
			}
			principal, e := a.Authenticate(context.Background(), p.token)
			if e != nil {
				t.Fatal(e)
			}
			ctx := records.WithPrincipal(context.Background(), principal)
			replayed, e := a.Replay(ctx, p.owner, game)
			if e != nil {
				t.Fatal(e)
			}
			current := first.snapshot(t, p, game)
			if !bytes.Equal(replayed.Document.Checkpoint.State, current.Document.Checkpoint.State) {
				t.Fatal("durable replay differs")
			}
			newReceipt, _ := first.createGame(t, p, mode[0], mode[1], receipt)
			if newReceipt["gameId"] == game {
				t.Fatal("replacement reused game identity")
			}
			old := second.request(t, p, "GET", "/api/sessions/"+game, nil, 200)
			if decodeMap(t, old)["session"].(map[string]any)["gameId"] != game {
				t.Fatal("old history unavailable")
			}
			second.request(t, p, "POST", "/api/sessions", opening, 200)
			stranger := second.player(t)
			second.request(t, stranger, "GET", "/api/sessions/"+game, nil, 403)
		})
	}
}

func TestLocalServiceAdviceControlDeletionAndRestart(t *testing.T) {
	a, b, codec := serviceStores(t)
	first := serviceHost(t, a, codec)
	second := serviceHost(t, b, codec)
	p := first.player(t)
	receipt, opening := first.createGame(t, p, "hearts", "solo", nil)
	game := receipt["gameId"].(string)
	lease := receipt["controlLeaseToken"].(string)
	prepared := first.ready(t, p, game, 0, lease, "coach-advice")
	repeated := second.ready(t, p, game, 0, lease, "coach-advice")
	if prepared["workId"] != repeated["workId"] {
		t.Fatal("completed work recomputed across instances")
	}
	id := prepared["decisionId"].(string)
	advice := first.request(t, p, "GET", "/api/decisions/"+id, nil, 200)
	if bytes.Contains(advice, []byte(`"hands"`)) || bytes.Contains(advice, []byte(`"original"`)) {
		t.Fatal("private analysis leaked")
	}
	principal, e := a.Authenticate(context.Background(), p.token)
	if e != nil {
		t.Fatal(e)
	}
	ctx := records.WithPrincipal(context.Background(), principal)
	for _, workID := range prepared["workIds"].([]any) {
		d, e := a.ReadPrepared(ctx, p.owner, workID.(string))
		if e != nil {
			t.Fatal(e)
		}
		if d.Actor != 0 {
			first.request(t, p, "GET", "/api/decisions/"+d.ID, nil, 403)
		}
	}
	otherTab := *p
	otherTab.tab = "service-tab-two"
	control := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": 0, "expectedControlGeneration": receipt["controlGeneration"]}
	newControl := decodeMap(t, second.request(t, &otherTab, "POST", "/api/session/control", control, 200))
	if newControl["controlLeaseToken"] == lease {
		t.Fatal("takeover failed to rotate lease")
	}
	stale := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": 0, "controlLeaseToken": lease, "candidateId": "pass:C2,C3,C4", "preparedDecisionId": prepared["preparedDecisionId"], "preparedWorkIds": prepared["workIds"]}
	first.request(t, p, "POST", "/api/session/actions", stale, 409)
	// Original receipts recover even when their lease has since been displaced.
	recovered := second.request(t, p, "POST", "/api/commands/reconcile", map[string]any{"commandId": opening["commandId"], "operation": "new-session", "request": opening}, 200)
	original, _ := json.Marshal(receipt)
	if !bytes.Equal(original, recovered) {
		t.Fatal("receipt recovery changed opening")
	}
	if got := second.request(t, &otherTab, "GET", "/api/decisions/"+id, nil, 200); !bytes.Equal(advice, got) {
		t.Fatal("saved advice changed after control takeover")
	}
	// A durable queued row is recovered by a newly constructed service runner.
	loaded := first.snapshot(t, &otherTab, game)
	binding, e := codec.PreparationInput(loaded.Document, loaded.Snapshot, 0)
	if e != nil {
		t.Fatal(e)
	}
	access, e := a.ReadAccess(ctx, p.owner)
	if e != nil {
		t.Fatal(e)
	}
	unit, e := codec.CurrentUnitID(loaded.Document, loaded.Snapshot)
	if e != nil {
		t.Fatal(e)
	}
	admission := records.AccessAdmission{OwnerID: p.owner, Generation: access.Generation, ControlRevision: access.ControlGeneration, GrantID: records.LocalGrantID(p.owner, "hearts", "solo"), UnitID: unit}
	controlled := records.WithControl(ctx, otherTab.tab, newControl["controlLeaseToken"].(string))
	queued, e := a.QueueWork(controlled, records.WorkRequest{GameID: game, Revision: 0, Actor: 0, WindowID: binding.WindowID, Purpose: "human-analysis", InputDigest: binding.InputDigest, Policy: loaded.Document.Metadata.Policy, Admission: admission, Lifetime: time.Minute})
	if e != nil {
		t.Fatal(e)
	}
	third := serviceHost(t, b, codec)
	third.request(t, &otherTab, "POST", "/api/work/"+queued.ID+"/retry", map[string]any{"controlLeaseToken": newControl["controlLeaseToken"]}, 0)
	deadline := time.Now().Add(5 * time.Second)
	for {
		w, e := a.ReadWork(ctx, p.owner, queued.ID)
		if e != nil {
			t.Fatal(e)
		}
		if w.Status == "completed" {
			break
		}
		if time.Now().After(deadline) || w.Status == "rejected" || w.Status == "canceled" {
			t.Fatal("restart work did not complete", w.Status)
		}
		time.Sleep(5 * time.Millisecond)
	}
	stranger := first.player(t)
	first.request(t, stranger, "GET", "/api/decisions/"+id, nil, 403)
	stolen := *p
	first.request(t, p, "POST", "/api/account/delete", map[string]any{}, 200)
	second.request(t, &stolen, "GET", "/api/session", nil, 401)
	second.request(t, stranger, "GET", "/api/identity", nil, 200)
}
