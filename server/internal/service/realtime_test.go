package service

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"cardford/server/internal/contracts"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"github.com/coder/websocket"
	"github.com/jackc/pgx/v5"
)

func connectRealtime(t *testing.T, h *testHost, p *testPlayer) (*websocket.Conn, string) {
	t.Helper()
	neg := decodeMap(t, h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200))
	header := http.Header{"Origin": []string{h.server.URL}, "Cookie": []string{transport.LocalCookieName + "=" + p.token}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, strings.Replace(h.server.URL, "http:", "ws:", 1)+neg["url"].(string), &websocket.DialOptions{HTTPHeader: header})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.CloseNow() })
	return conn, neg["streamId"].(string)
}

func TestRealtimeCommittedViewsAndLogout(t *testing.T) {
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	created, _ := h.createGame(t, p, "spades", "solo", nil)
	game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
	playbackCommand(t, h, p, game, token, int64(created["controlGeneration"].(float64)), 0, true)
	// This test owns the legacy manual stepping seam to inspect every revision;
	// automatic playback has its own end-to-end coverage.
	h.app.playback.close()
	conn, stream := connectRealtime(t, h, p)
	snapshot := decodeMap(t, h.request(t, p, "GET", "/api/realtime/snapshot?streamId="+stream, nil, 200))
	cursor := int64(snapshot["sequence"].(float64))
	start := int64(snapshot["view"].(map[string]any)["session"].(map[string]any)["revision"].(float64))
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	frames := make(chan json.RawMessage, 64)
	ended := make(chan error, 1)
	go func() {
		for {
			_, raw, err := conn.Read(ctx)
			if err != nil {
				ended <- err
				return
			}
			select {
			case frames <- raw:
			case <-ctx.Done():
				return
			}
		}
	}()
	// The old HTTP mutation seam remains valid during migration. Every accepted
	// revision must reach the socket even if several commits finish before read.
	for i := 0; i < 5; i++ {
		platformStep(t, h, p, game, token)
	}
	want := start + 1
	for want <= start+5 {
		select {
		case err := <-ended:
			t.Fatalf("stream ended before committed views: %v", err)
		case <-ctx.Done():
			t.Fatalf("missing revision %d", want)
		case raw := <-frames:
			if err := contracts.Validate("RealtimeMessage", raw); err != nil {
				t.Fatal(err)
			}
			m := decodeMap(t, raw)
			seq := int64(m["sequence"].(float64))
			if seq <= cursor {
				continue
			}
			if seq != cursor+1 {
				t.Fatalf("cursor gap: %d -> %d", cursor, seq)
			}
			cursor = seq
			if m["type"] != "session.view" {
				continue
			}
			session := m["view"].(map[string]any)["session"].(map[string]any)
			if got := int64(session["revision"].(float64)); got != want {
				t.Fatalf("revision got %d want %d", got, want)
			}
			control := session["control"].(map[string]any)
			if control["owned"] != false || control["leaseToken"] != nil {
				t.Fatal("tab authority leaked into shared view")
			}
			if strings.Contains(string(raw), token) || strings.Contains(string(raw), p.token) {
				t.Fatal("transport credential leaked")
			}
			want++
		}
	}
	h.request(t, p, "POST", "/api/logout", map[string]any{}, 200)
	select {
	case <-ended:
	case <-time.After(time.Second):
		t.Fatal("logout did not close socket promptly")
	}
}

func TestRealtimeBindingsAreSessionScopedAndBounded(t *testing.T) {
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	other := h.player(t)
	created, _ := h.createGame(t, p, "spades", "solo", nil)
	playbackCommand(t, h, p, created["gameId"].(string), created["controlLeaseToken"].(string), int64(created["controlGeneration"].(float64)), 0, true)
	neg := decodeMap(t, h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200))
	id := neg["streamId"].(string)
	if _, err := h.app.OpenRealtime(context.Background(), other.token, id); err == nil {
		t.Fatal("cross-account stream accepted")
	}
	h.request(t, other, "GET", "/api/realtime/snapshot?streamId="+id, nil, 403)
	for i := 1; i < maxRealtimeOwnerConnections; i++ {
		h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200)
	}
	h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 429)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	sub, err := h.app.OpenRealtime(ctx, p.token, id)
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Close()
	if _, err = h.app.OpenRealtime(ctx, p.token, id); err == nil {
		t.Fatal("one-use connection binding reused")
	}
	b := sub.(*realtimeBinding)
	for i := 0; i < 65; i++ {
		b.enqueue(json.RawMessage(`{}`))
	}
	if b.ctx.Err() == nil {
		t.Fatal("slow consumer not closed")
	}
}

func TestRealtimeDisabledSnapshotStillWorks(t *testing.T) {
	t.Setenv("CARDFORD_REALTIME", "off")
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	neg := decodeMap(t, h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200))
	if neg["enabled"] != false || neg["url"] != nil {
		t.Fatal("disabled transport negotiated socket")
	}
	snap := decodeMap(t, h.request(t, p, "GET", "/api/realtime/snapshot", nil, 200))
	if snap["streamId"] != nil || snap["playback"].(map[string]any)["running"] != false {
		t.Fatal("disabled snapshot wrong")
	}
}

func TestAuthRealtimeRequiresAcceptedRunningPlay(t *testing.T) {
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 403)
	created, _ := h.createGame(t, p, "spades", "solo", nil)
	game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
	control := int64(created["controlGeneration"].(float64))
	h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 403)
	state := playbackCommand(t, h, p, game, token, control, 0, true)
	neg := decodeMap(t, h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200))
	id := neg["streamId"].(string)
	playbackCommand(t, h, p, game, token, control, state.Generation, false)
	if sub, err := h.app.OpenRealtime(context.Background(), p.token, id); err == nil {
		sub.Close()
		t.Fatal("binding negotiated before pause opened after pause")
	}
	h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 403)
	// Paused recovery remains a one-shot snapshot.
	h.request(t, p, "GET", "/api/realtime/snapshot", nil, 200)
}

func TestAuthRealtimePauseAndHoldCloseBeforeCommandReturns(t *testing.T) {
	for _, intent := range []string{"pause", "hold"} {
		t.Run(intent, func(t *testing.T) {
			store, _, codec := serviceStores(t)
			h := serviceHost(t, store, codec)
			p := h.player(t)
			created, _ := h.createGame(t, p, "spades", "solo", nil)
			game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
			control := int64(created["controlGeneration"].(float64))
			state := playbackCommand(t, h, p, game, token, control, 0, true)
			neg := decodeMap(t, h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200))
			sub, err := h.app.OpenRealtime(context.Background(), p.token, neg["streamId"].(string))
			if err != nil {
				t.Fatal(err)
			}
			defer sub.Close()
			principal, err := store.Authenticate(context.Background(), p.token)
			if err != nil {
				t.Fatal(err)
			}
			body, _ := json.Marshal(map[string]any{"commandId": p.id(), "gameId": game, "controlLeaseToken": token, "expectedControlGeneration": control, "expectedPlaybackGeneration": state.Generation, "running": false, "intent": intent})
			_, err = h.app.setPlayback(records.WithPrincipal(context.Background(), principal), p.owner, transport.Request{Operation: "playback", Tab: p.tab, Body: body})
			if err != nil {
				t.Fatal(err)
			}
			if sub.(*realtimeBinding).ctx.Err() == nil {
				t.Fatal("pause/hold returned with active game binding")
			}
			h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 403)
		})
	}
}

// Change only this disposable fixture's credential deadline. Tests exercise the
// same durable access column used by provider renewal without introducing a
// provider dependency or manufacturing principals.
func realtimeSessionSQL(t *testing.T, p *testPlayer, update string, args ...any) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	rows, err := conn.Query(ctx, "SELECT schemaname FROM pg_tables WHERE schemaname LIKE 'm03_service_%' AND tablename='m04_sessions'")
	if err != nil {
		t.Fatal(err)
	}
	var schemas []string
	for rows.Next() {
		var schema string
		if err = rows.Scan(&schema); err != nil {
			t.Fatal(err)
		}
		schemas = append(schemas, schema)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		t.Fatal(err)
	}
	for _, schema := range schemas {
		table := pgx.Identifier{schema, "m04_sessions"}.Sanitize()
		var exists bool
		if err = conn.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+table+" WHERE owner_id=$1 AND token_hash=$2)", p.owner, records.SessionID(p.token)).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			continue
		}
		if _, err = conn.Exec(ctx, "SELECT set_config('search_path',$1,false)", pgx.Identifier{schema}.Sanitize()+",public"); err != nil {
			t.Fatal(err)
		}
		params := append([]any{p.owner, records.SessionID(p.token)}, args...)
		if _, err = conn.Exec(ctx, "UPDATE "+table+" SET "+update+" WHERE owner_id=$1 AND token_hash=$2", params...); err != nil {
			t.Fatal(err)
		}
		return
	}
	t.Fatal("disposable realtime session fixture missing")
}

func realtimeRunningBinding(t *testing.T, h *testHost, p *testPlayer) (*realtimeBinding, records.Principal) {
	t.Helper()
	created, _ := h.createGame(t, p, "spades", "solo", nil)
	playbackCommand(t, h, p, created["gameId"].(string), created["controlLeaseToken"].(string), int64(created["controlGeneration"].(float64)), 0, true)
	principal, err := h.store.Authenticate(context.Background(), p.token)
	if err != nil {
		t.Fatal(err)
	}
	neg := decodeMap(t, h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200))
	sub, err := h.app.OpenRealtime(context.Background(), p.token, neg["streamId"].(string))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(sub.Close)
	return sub.(*realtimeBinding), principal
}

func TestAuthRealtimeAccessDeadlineRechecksDurableRenewal(t *testing.T) {
	for _, renewal := range []string{"none", "notification", "lost-notification"} {
		t.Run(renewal, func(t *testing.T) {
			store, _, codec := serviceStores(t)
			h := serviceHost(t, store, codec)
			p := h.player(t)
			created, _ := h.createGame(t, p, "spades", "solo", nil)
			game, token := created["gameId"].(string), created["controlLeaseToken"].(string)
			state := playbackCommand(t, h, p, game, token, int64(created["controlGeneration"].(float64)), 0, true)
			principal, err := store.Authenticate(context.Background(), p.token)
			if err != nil {
				t.Fatal(err)
			}
			oldDeadline := time.Now().Add(1200 * time.Millisecond)
			realtimeSessionSQL(t, p, "expires_at=$3", oldDeadline)
			neg := decodeMap(t, h.request(t, p, "POST", "/api/realtime/negotiate", map[string]any{}, 200))
			sub, err := h.app.OpenRealtime(context.Background(), p.token, neg["streamId"].(string))
			if err != nil {
				t.Fatal(err)
			}
			defer sub.Close()
			b := sub.(*realtimeBinding)
			deadline := oldDeadline
			if renewal != "none" {
				deadline = oldDeadline.Add(1100 * time.Millisecond)
				realtimeSessionSQL(t, p, "expires_at=$3", deadline)
				if renewal == "notification" {
					h.app.NotifySessionChanged(principal)
				}
				timer := time.NewTimer(time.Until(oldDeadline.Add(100 * time.Millisecond)))
				select {
				case <-b.ctx.Done():
					timer.Stop()
					t.Fatal("early renewal closed stable binding")
				case <-timer.C:
				}
				if err = b.Authorize(context.Background()); err != nil {
					t.Fatal("renewed binding lost authority", err)
				}
				play, err := store.ReadPlayback(records.WithPrincipal(context.Background(), principal), p.owner, game, h.app.playback.instanceID)
				if err != nil || !play.Running || play.Generation != state.Generation {
					t.Fatal("renewal changed playback identity", err)
				}
				owned, generation, err := store.ControlStatus(records.WithPrincipal(context.Background(), principal), p.tab)
				if err != nil || !owned || generation != int64(created["controlGeneration"].(float64)) {
					t.Fatal("renewal changed control", err)
				}
			}
			select {
			case <-b.ctx.Done():
				if time.Now().Before(deadline) {
					t.Fatal("closed before access deadline")
				}
			case <-time.After(time.Until(deadline.Add(500 * time.Millisecond))):
				t.Fatal("quiet stream remained authorized after exact access deadline")
			}
		})
	}
}

func TestAuthRealtimeSessionNotificationIsFamilyFenced(t *testing.T) {
	store, _, codec := serviceStores(t)
	h := serviceHost(t, store, codec)
	p := h.player(t)
	b, principal := realtimeRunningBinding(t, h, p)
	other := h.player(t)
	otherBinding, otherPrincipal := realtimeRunningBinding(t, h, other)
	ctx := records.WithPrincipal(context.Background(), principal)
	if err := store.RevokeSession(ctx); err != nil {
		t.Fatal(err)
	}
	// Login may notify with a newly installed family; the owner is a wake hint,
	// while each existing binding must recheck its own durable credential.
	h.app.NotifySessionChanged(records.Principal{OwnerID: p.owner})
	if b.ctx.Err() == nil {
		t.Fatal("committed revocation returned without closing stream")
	}
	if err := otherBinding.Authorize(context.Background()); err != nil {
		t.Fatal("unrelated family canceled", err)
	}
	h.app.NotifySessionChanged(otherPrincipal)
	if otherBinding.ctx.Err() != nil {
		t.Fatal("valid family notification canceled stream")
	}
}
