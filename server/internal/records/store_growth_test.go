package records

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

func TestM03StoreReplayChanceCheckpointsAndHandGrowth(t *testing.T) {
	if testing.Short() {
		t.Skip("full native PostgreSQL history growth")
	}
	s, other := storeTestOpen(t, storeTestCodec())
	current, a := storeTestGame(t, s, "growth")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	type growth struct {
		Hands                                                            int   `json:"hands"`
		Revision                                                         int64 `json:"revision"`
		HotBytes                                                         int   `json:"hotBytes"`
		Events                                                           int   `json:"events"`
		EventBytes, CommandBytes, StoredTotal, ReadBytes, LastWriteBytes int64
		ElapsedMS                                                        int64
	}
	measurements := []growth{}
	started := time.Now()
	completed := 0
	for completed < 25 {
		raw, err := current.Snapshot.Export()
		if err != nil {
			t.Fatal(err)
		}
		var state struct {
			Phase      string `json:"phase"`
			Turn       *int   `json:"turn"`
			HandNumber int    `json:"handNumber"`
		}
		if err = json.Unmarshal(raw, &state); err != nil {
			t.Fatal(err)
		}
		a.UnitID = fmt.Sprintf("hand-%d", state.HandNumber)
		var command []byte
		switch state.Phase {
		case "hand-end":
			completed++
			if completed == 1 || completed == 10 || completed == 25 {
				m := growth{Hands: completed, Revision: current.Document.Revision, HotBytes: len(current.origin), Events: len(current.Events), ReadBytes: int64(current.ReadBytes), ElapsedMS: time.Since(started).Milliseconds()}
				if err = s.pool.QueryRow(ctx, `SELECT COALESCE(sum(octet_length(record)),0)::bigint FROM m03_events WHERE game_id=$1`, a.OwnerID[len("owner-"):]).Scan(&m.EventBytes); err != nil {
					t.Fatal(err)
				}
				if err = s.pool.QueryRow(ctx, `SELECT COALESCE(sum(octet_length(command)+octet_length(receipt)+length(checkpoint_digest)),0)::bigint FROM m03_commands WHERE game_id=$1`, "growth").Scan(&m.CommandBytes); err != nil {
					t.Fatal(err)
				}
				var anchorBytes int64
				if err = s.pool.QueryRow(ctx, `SELECT octet_length(record)::bigint FROM m03_anchors WHERE game_id='growth'`).Scan(&anchorBytes); err != nil {
					t.Fatal(err)
				}
				var lastHistory int64
				if err = s.pool.QueryRow(ctx, `SELECT (SELECT COALESCE(sum(octet_length(record)),0) FROM m03_events WHERE game_id='growth' AND revision=$1)+(SELECT octet_length(command)+octet_length(receipt)+length(checkpoint_digest) FROM m03_commands WHERE game_id='growth' AND revision=$1)`, current.Document.Revision).Scan(&lastHistory); err != nil {
					t.Fatal(err)
				}
				m.StoredTotal = int64(m.HotBytes) + m.EventBytes + m.CommandBytes + anchorBytes
				m.LastWriteBytes = int64(m.HotBytes) + lastHistory
				measurements = append(measurements, m)
				encoded, _ := json.Marshal(m)
				t.Logf("M03_GROWTH %s", encoded)
			}
			if completed == 25 {
				break
			}
			deck := storeTestDeal()
			offset := completed % len(deck)
			deck = append(append([]string{}, deck[offset:]...), deck[:offset]...)
			command, _ = json.Marshal(map[string]any{"type": "next-hand", "deal": deck})
		case "trick-end":
			command = []byte(`{"type":"collect-trick"}`)
		case "bid":
			command, _ = json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "bid", "seat": *state.Turn, "bid": 13}})
		case "play":
			projection, err := current.Snapshot.Project(*state.Turn)
			if err != nil {
				t.Fatal(err)
			}
			if len(projection.CandidateIDs) == 0 || !strings.HasPrefix(projection.CandidateIDs[0], "play:") {
				t.Fatal("no deterministic legal play")
			}
			command, _ = json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "play", "seat": *state.Turn, "card": strings.TrimPrefix(projection.CandidateIDs[0], "play:")}})
		default:
			t.Fatalf("unexpected growth phase %s", state.Phase)
		}
		if completed == 25 {
			break
		}
		request := storeTestRequest(t, current, a, fmt.Sprintf("growth-%d", current.Document.Revision+1), command)
		if _, err = s.Commit(ctx, request); err != nil {
			t.Fatalf("revision %d: %v", current.Document.Revision, err)
		}
		current, err = other.Load(ctx, a.OwnerID, "growth")
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(measurements) != 3 {
		t.Fatalf("incomplete measurements %v", measurements)
	}
	if measurements[2].HotBytes > measurements[0].HotBytes+1024 || measurements[2].LastWriteBytes > measurements[0].LastWriteBytes+1536 {
		t.Fatal("hot snapshot/write bytes grew with whole history")
	}
	if measurements[2].StoredTotal > measurements[0].StoredTotal*27 || measurements[2].StoredTotal < measurements[0].StoredTotal*15 {
		t.Fatal("unexpected append-only total growth")
	}
	replayed, err := other.Replay(ctx, a.OwnerID, "growth")
	if err != nil {
		t.Fatal(err)
	}
	if !equalCheckpoint(replayed.Document.Checkpoint, current.Document.Checkpoint) {
		t.Fatal("actual chance replay checkpoint mismatch")
	}
	archive, err := s.loadHistory(ctx, a.OwnerID, "growth")
	if err != nil {
		t.Fatal(err)
	}
	chanceCommands := 0
	for _, record := range archive.commands {
		var command struct {
			Type string   `json:"type"`
			Deal []string `json:"deal"`
		}
		if err = json.Unmarshal(record.Command, &command); err != nil {
			t.Fatal(err)
		}
		if command.Type == "next-hand" {
			chanceCommands++
			if len(command.Deal) != 52 {
				t.Fatal("actual later chance missing")
			}
		}
	}
	if chanceCommands != 24 {
		t.Fatalf("later actual draws=%d", chanceCommands)
	}
	// A supported historical reader can replay the same exact archive without
	// allowing execution under an unavailable original policy.
	readonly, err := OpenStore(ctx, os.Getenv("TEST_DATABASE_URL"), StoreOptions{Schema: s.schema, Codec: NewDocumentCodec()})
	if err != nil {
		t.Fatal(err)
	}
	defer readonly.Close()
	historical, err := readonly.Replay(ctx, a.OwnerID, "growth")
	if err != nil {
		t.Fatal(err)
	}
	if historical.Disposition.Playable {
		t.Fatal("historical replay repinned execution")
	}
}
