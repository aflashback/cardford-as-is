package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
)

func playbackCommand(t *testing.T, h *testHost, p *testPlayer, game, token string, control, generation int64, running bool) records.PlaybackState {
	t.Helper()
	principal, err := h.store.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	intent := "pause"
	if running {
		intent = "resume"
	}
	raw, _ := json.Marshal(map[string]any{"commandId": p.id(), "gameId": game, "controlLeaseToken": token, "expectedControlGeneration": control, "expectedPlaybackGeneration": generation, "running": running, "intent": intent})
	response, err := h.app.setPlayback(records.WithPrincipal(context.Background(), principal), p.owner, transport.Request{Operation: "playback", Tab: p.tab, Body: raw})
	if err != nil {
		t.Fatal(err)
	}
	var state records.PlaybackState
	if err = json.Unmarshal(response.Body, &state); err != nil {
		t.Fatal(err)
	}
	return state
}

func playbackPosition(t *testing.T, h *testHost, p *testPlayer, game string) (*records.Loaded, gamekernel.Node) {
	t.Helper()
	loaded := h.snapshot(t, p, game)
	bound, err := h.codec.Session(loaded.Document, loaded.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	node, err := bound.Node()
	if err != nil {
		t.Fatal(err)
	}
	return loaded, node
}

func playbackSettled(t *testing.T, h *testHost, p *testPlayer, game string) (*records.Loaded, gamekernel.Node) {
	t.Helper()
	deadline := time.Now().Add(12 * time.Second)
	for {
		loaded, node := playbackPosition(t, h, p, game)
		if node.Kind != "automatic" && (node.Kind != "actor" || node.Seat == nil || *node.Seat == 0) {
			return loaded, node
		}
		if time.Now().After(deadline) {
			t.Fatalf("server playback stalled at revision %d: %+v", loaded.Document.Revision, node)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestRealtimePlaybackOwnsBotTurnsAcrossInstalledModes(t *testing.T) {
	registry, err := sessions.NewRegistryWithRegistrations(trix.Handlers(sessions.DefaultHandlers()), trix.Installations()...)
	if err != nil {
		t.Fatal(err)
	}
	codec, err := records.NewServiceCodecWithRegistry(registry)
	if err != nil {
		t.Fatal(err)
	}
	store, _, _ := serviceStoresWithCodec(t, codec)
	h := serviceHost(t, store, codec)
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners", "trix-basic-solo", "trix-basic-partners", "trix-complex-solo", "trix-complex-partners"} {
		t.Run(mode, func(t *testing.T) {
			p := h.player(t)
			catalog := decodeMap(t, h.request(t, p, "GET", "/api/platform/session", nil, 200))["catalog"].([]any)
			var selector any
			for _, entry := range catalog {
				item := entry.(map[string]any)
				if item["mode"] == mode {
					selector = item["selector"]
				}
			}
			if selector == nil {
				t.Fatal("installed mode missing")
			}
			created := decodeMap(t, h.request(t, p, "POST", "/api/sessions", map[string]any{"commandId": p.id(), "selector": selector, "expectedActiveGameId": nil, "expectedRevision": nil, "controlLeaseToken": nil}, 200))
			game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
			control := int64(created["controlGeneration"].(float64))
			state := playbackCommand(t, h, p, game, token, control, 0, true)
			var humanCommands int64
			for step := 0; step < 8; step++ {
				loaded, node := playbackSettled(t, h, p, game)
				if loaded.Document.Revision > humanCommands {
					// These committed computer transitions required no /advance
					// request, work polling or preparation from the browser.
					state = playbackCommand(t, h, p, game, token, control, state.Generation, false)
					if state.Running {
						t.Fatal("pause not reflected")
					}
					return
				}
				if node.Kind != "sealed" && (node.Kind != "actor" || node.Seat == nil || *node.Seat != 0) {
					t.Fatalf("unexpected boundary before any bot: %+v", node)
				}
				// A running table still waits for its human, including Hearts'
				// sealed passing window. Preparation is actor-scoped as before.
				time.Sleep(20 * time.Millisecond)
				unchanged := h.snapshot(t, p, game)
				if unchanged.Document.Revision != loaded.Document.Revision {
					t.Fatal("server played a human decision")
				}
				_, _, human := platformStep(t, h, p, game, token)
				if !human {
					t.Fatal("test attempted to orchestrate a bot")
				}
				humanCommands++
			}
			t.Fatal("no computer transition observed")
		})
	}
}

func TestRealtimePlaybackPauseFencesQueuedBotAndForeignReplicaRead(t *testing.T) {
	store, secondStore, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	created, _ := h.createGame(t, p, "spades", "partners", nil)
	game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
	control := int64(created["controlGeneration"].(float64))
	for step := 0; step < 5; step++ {
		_, node := playbackPosition(t, h, p, game)
		if node.Kind == "actor" && node.Seat != nil && *node.Seat != 0 {
			break
		}
		platformStep(t, h, p, game, token)
	}
	before, node := playbackPosition(t, h, p, game)
	if node.Kind != "actor" || node.Seat == nil || *node.Seat == 0 {
		t.Fatal("bot fixture unavailable")
	}
	// Occupy both workers so the pause acknowledgement precedes publication.
	release := make(chan struct{})
	started := make(chan struct{}, 2)
	released := false
	defer func() {
		if !released {
			close(release)
		}
	}()
	for _, key := range []string{"pause-blocker-one", "pause-blocker-two"} {
		reservation, err := h.app.jobs.reserve(key)
		if err != nil {
			t.Fatal(err)
		}
		reservation.dispatch(func(ctx context.Context) {
			started <- struct{}{}
			select {
			case <-release:
			case <-ctx.Done():
			}
		})
	}
	<-started
	<-started
	state := playbackCommand(t, h, p, game, token, control, 0, true)
	deadline := time.Now().Add(3 * time.Second)
	for {
		h.app.jobs.mu.Lock()
		queued := len(h.app.jobs.keys) > 2
		h.app.jobs.mu.Unlock()
		if queued {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("bot preparation was not queued")
		}
		time.Sleep(5 * time.Millisecond)
	}
	state = playbackCommand(t, h, p, game, token, control, state.Generation, false)
	close(release)
	released = true
	for {
		h.app.jobs.mu.Lock()
		finished := len(h.app.jobs.keys) == 0
		h.app.jobs.mu.Unlock()
		if finished {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("paused preparation did not settle")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if after := h.snapshot(t, p, game); after.Document.Revision != before.Document.Revision {
		t.Fatal("paused queued bot changed the game")
	}
	// Another live replica observes durable permission without claiming its runner.
	second := serviceHost(t, secondStore, codec)
	principal, err := store.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithPrincipal(context.Background(), principal)
	state = playbackCommand(t, h, p, game, token, control, state.Generation, true)
	restarted, err := secondStore.ReadPlayback(ctx, p.owner, game, second.app.playback.instanceID)
	if err != nil || !restarted.Running || restarted.Generation != state.Generation {
		t.Fatalf("foreign replica must preserve the live durable lease and fence: %+v %v", restarted, err)
	}
	playbackCommand(t, h, p, game, token, control, state.Generation, false)
}

func TestRealtimePlaybackHumanWaitNeedsNoResidentRunner(t *testing.T) {
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	created, _ := h.createGame(t, p, "hearts", "solo", nil)
	game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
	control := int64(created["controlGeneration"].(float64))
	principal, err := store.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	ctx := records.WithControl(records.WithPrincipal(context.Background(), principal), p.tab, token)
	raw, _ := json.Marshal(map[string]any{"commandId": "playback-orphan", "gameId": game, "running": true})
	commandCtx, _, err := h.app.command(ctx, transport.Request{Operation: "playback", Tab: p.tab, Body: raw}, "playback-orphan")
	if err != nil {
		t.Fatal(err)
	}
	// Human wait intentionally has no resident runner. Durable foreground
	// permission survives until pause or lease expiry.
	stored, err := store.SetPlayback(commandCtx, game, control, 0, true, h.app.playback.instanceID)
	if err != nil || !stored.Running {
		t.Fatal("durable running fixture", err)
	}
	view := decodeMap(t, h.request(t, p, "GET", "/api/realtime/snapshot", nil, 200))
	playback := view["playback"].(map[string]any)
	if playback["running"] != true || int64(playback["generation"].(float64)) != stored.Generation {
		t.Fatal("human wait lost durable foreground permission", playback)
	}
	resumed := playbackCommand(t, h, p, game, token, control, stored.Generation, true)
	effective, err := h.app.playback.effectiveState(ctx, p.owner, game)
	if err != nil || !effective.Running || effective.Generation != resumed.Generation {
		t.Fatal("explicit resume did not restore effective playback", effective, err)
	}
	playbackCommand(t, h, p, game, token, control, resumed.Generation, false)
}
