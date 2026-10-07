package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"testing"
	"time"

	"cardford/server/internal/records"
	"github.com/jackc/pgx/v5"
)

// Opt-in complete-request diagnostic. It uses normal private shuffles, actual
// prepared bot decisions, explicit human choices and delivered coaching. A
// terminal match is recorded as terminal; it is never extended by changing rules.
func TestM04FPreparedRequestProfile(t *testing.T) {
	if os.Getenv("M04F_REQUEST_PROFILE") != "1" {
		t.Skip("opt-in prepared request profile")
	}
	maxHands := 1
	if value := os.Getenv("M04F_PROFILE_HANDS"); value != "" {
		var err error
		maxHands, err = strconv.Atoi(value)
		if err != nil || maxHands < 1 || maxHands > 20 {
			t.Fatal("M04F_PROFILE_HANDS must be 1..20")
		}
	}
	variant := os.Getenv("M04F_PROFILE_VARIANT")
	if variant == "" {
		variant = "partners"
	}
	if variant != "solo" && variant != "partners" {
		t.Fatal("unsupported profile variant")
	}
	a, _, codec := serviceStores(t)
	h := serviceHost(t, a, codec)
	p := h.player(t)
	receipt, _ := h.createGame(t, p, "spades", variant, nil)
	game, lease := receipt["gameId"].(string), receipt["controlLeaseToken"].(string)
	metrics := map[string][]float64{}
	measure := func(name string, fn func()) {
		start := time.Now()
		fn()
		metrics[name] = append(metrics[name], float64(time.Since(start).Microseconds())/1000)
	}
	started := time.Now()
	completed, commands, helps := 0, 0, 0
	terminal := false
	t.Cleanup(func() {
		type metric struct {
			Count                    int
			MedianMS, P95MS, TotalMS float64
		}
		summary := map[string]metric{}
		for name, samples := range metrics {
			sort.Float64s(samples)
			total := 0.0
			for _, value := range samples {
				total += value
			}
			summary[name] = metric{len(samples), samples[len(samples)/2], samples[(95*len(samples)+99)/100-1], total}
		}
		data, _ := json.Marshal(map[string]any{"variant": variant, "hands": completed, "commands": commands, "deliveredHelp": helps, "terminal": terminal, "elapsedMS": time.Since(started).Milliseconds(), "failed": t.Failed(), "metrics": summary})
		t.Logf("M04F_REQUEST_PROFILE %s", data)
		if path := os.Getenv("M04F_PROFILE_ARCHIVE"); path != "" {
			retainRequestProfile(t, path, game, p.owner, json.RawMessage(data))
		}
	})
	for step := 0; step < maxHands*75+5; step++ {
		if time.Since(started) > 25*time.Minute {
			t.Fatal("bounded profile stopped; remaining hands unverified")
		}
		var loaded *records.Loaded
		measure("load", func() { loaded = h.snapshot(t, p, game) })
		bound, err := codec.Session(loaded.Document, loaded.Snapshot)
		if err != nil {
			t.Fatal(err)
		}
		node, err := bound.Node()
		if err != nil {
			t.Fatal(err)
		}
		if node.Kind == "round-complete" || node.Kind == "session-complete" {
			completed++
			terminal = node.Kind == "session-complete"
			t.Logf("completed hand=%d revision=%d elapsed=%s terminal=%v", completed, loaded.Document.Revision, time.Since(started).Round(time.Millisecond), terminal)
			if terminal || completed == maxHands {
				return
			}
			measure("next-hand", func() {
				h.request(t, p, "POST", "/api/session/next-hand", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": loaded.Document.Revision, "controlLeaseToken": lease}, 200)
			})
			continue
		}
		body := map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": loaded.Document.Revision, "controlLeaseToken": lease}
		path := "/api/session/advance"
		switch node.Kind {
		case "actor":
			actor := *node.Seat
			purpose := "bot-action"
			if actor == 0 {
				purpose = "human-analysis"
			}
			var prepared map[string]any
			measure("prepare-"+purpose, func() { prepared = h.ready(t, p, game, loaded.Document.Revision, lease, purpose) })
			body["preparedDecisionId"] = prepared["preparedDecisionId"]
			if actor == 0 {
				input, err := codec.PreparationInput(loaded.Document, loaded.Snapshot, 0)
				if err != nil {
					t.Fatal(err)
				}
				// This is a simulated person's legal choice, not an injected engine move.
				body["candidateId"] = input.CandidateIDs[len(input.CandidateIDs)-1]
				body["preparedWorkIds"] = prepared["workIds"]
				path = "/api/session/actions"
				if helps == completed {
					measure("delivered-help", func() {
						view := h.request(t, p, "POST", "/api/platform/advice", map[string]any{"commandId": p.id(), "gameId": game, "expectedRevision": loaded.Document.Revision, "controlLeaseToken": lease, "decisionId": records.PlatformDecisionID(game, loaded.Document.Revision), "requestedLevel": 3, "unlock": true}, 200)
						if decodeMap(t, view)["advice"] == nil {
							t.Fatal("no delivered advice")
						}
					})
					helps++
				}
			} else {
				body["kind"] = "bot"
			}
		case "automatic":
			body["kind"], body["transitionId"] = "automatic", node.TransitionID
		case "chance":
			path = "/api/session/next-hand"
		default:
			t.Fatal(fmt.Sprintf("unexpected profile node %s", node.Kind))
		}
		measure("commit-"+node.Kind, func() { h.request(t, p, "POST", path, body, 200) })
		commands++
		measure("table-response", func() { h.request(t, p, "GET", "/api/platform/session", nil, 200) })
	}
	t.Fatal("profile command bound reached without completed requested history")
}

// Preserve this test's private, replayable rows before serviceStores cleanup.
// The generated game identity is used in every read; no session cookie, account
// credential or database URL is written. Output is restricted to ignored .local.
func retainRequestProfile(t *testing.T, path, game, owner string, metrics json.RawMessage) {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".local"))
	if err != nil {
		t.Error(err)
		return
	}
	target, err := filepath.Abs(path)
	if err != nil {
		t.Error(err)
		return
	}
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == ".." || filepath.IsAbs(rel) || len(rel) >= 3 && rel[:3] == ".."+string(os.PathSeparator) {
		t.Error("profile archive must be inside ignored .local")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Error(err)
		return
	}
	defer conn.Close(ctx)
	rows, err := conn.Query(ctx, "SELECT schemaname FROM pg_tables WHERE schemaname LIKE 'm03_service_%' AND tablename='m03_games'")
	if err != nil {
		t.Error(err)
		return
	}
	var schemas []string
	for rows.Next() {
		var schema string
		if err := rows.Scan(&schema); err != nil {
			rows.Close()
			t.Error(err)
			return
		}
		schemas = append(schemas, schema)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Error(err)
		return
	}
	for _, schema := range schemas {
		var found bool
		if err := conn.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+pgx.Identifier{schema, "m03_games"}.Sanitize()+" WHERE game_id=$1 AND owner_id=$2)", game, owner).Scan(&found); err != nil {
			t.Error(err)
			return
		}
		if !found {
			continue
		}
		archive := map[string]json.RawMessage{"metrics": metrics}
		for _, table := range []string{"m03_games", "m03_anchors", "m03_events", "m03_commands", "m03_decisions", "m04_help_deliveries"} {
			var raw []byte
			if err := conn.QueryRow(ctx, "SELECT COALESCE(json_agg(t),'[]') FROM (SELECT * FROM "+pgx.Identifier{schema, table}.Sanitize()+" WHERE game_id=$1) t", game).Scan(&raw); err != nil {
				t.Error(err)
				return
			}
			archive[table] = raw
		}
		raw, err := json.Marshal(archive)
		if err != nil {
			t.Error(err)
			return
		}
		if err := os.WriteFile(target, raw, 0600); err != nil {
			t.Error(err)
		}
		return
	}
	t.Error("owned profile game not found before cleanup")
}
