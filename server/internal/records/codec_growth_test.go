package records

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/spades"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"
)

func growthDeal(offset int) []string {
	deck := codecDeck()
	offset %= len(deck)
	return append(append([]string{}, deck[offset:]...), deck[:offset]...)
}
func growthHand(t *testing.T, dealer int) []json.RawMessage {
	t.Helper()
	s, err := spades.Start(codecJSON(t, spades.Config{ID: "growth", Mode: "spades-partners", Dealer: dealer}), growthDeal(dealer))
	if err != nil {
		t.Fatal(err)
	}
	commands := []json.RawMessage{}
	for {
		raw, err := s.Export()
		if err != nil {
			t.Fatal(err)
		}
		var state spades.State
		if err = json.Unmarshal(raw, &state); err != nil {
			t.Fatal(err)
		}
		if state.Phase == "hand-end" {
			return commands
		}
		var command json.RawMessage
		if state.Phase == "trick-end" {
			command = []byte(`{"type":"collect-trick"}`)
		} else {
			p, err := s.Project(*state.Turn)
			if err != nil {
				t.Fatal(err)
			}
			var o spades.Observation
			if err = json.Unmarshal(p.Observation, &o); err != nil {
				t.Fatal(err)
			}
			if len(o.LegalActions) == 0 {
				t.Fatal("no legal fixture action")
			}
			action := o.LegalActions[0]
			if state.Phase == "bid" {
				action = o.LegalActions[len(o.LegalActions)-1]
			}
			command = codecJSON(t, map[string]any{"type": "action", "action": action})
		}
		s, err = s.Apply(command)
		if err != nil {
			t.Fatal(err)
		}
		commands = append(commands, command)
	}
}

// The 100-hand case deliberately bids 13 at every seat: this keeps the valid
// original match below its winning threshold while exercising long histories.
// It is a storage/replay fixture, not an installed strategic policy or evidence
// of playing quality. Set M03_GROWTH_EVIDENCE to save the observed numeric table.
func TestRecordLongHistoryGrowth(t *testing.T) {
	if testing.Short() {
		t.Skip("100-hand storage growth requires the full test run")
	}
	c := codecFixture(t, "spades-partners")
	m := PracticeMetadata("spades-partners", "growth", "owner", codecPolicy())
	config := codecJSON(t, spades.Config{ID: "growth", Mode: "spades-partners", Dealer: 0})
	_, anchor, _, err := c.Start(m, config, growthDeal(0))
	if err != nil {
		t.Fatal(err)
	}
	var templates [4][]json.RawMessage
	for i := 0; i < 4; i++ {
		templates[i] = growthHand(t, i)
	}
	commands := []CommandRecord{}
	checkpoints := map[int64]int{}
	commandBytes := 0
	appendCommand := func(command json.RawMessage) {
		revision := int64(len(commands) + 1)
		digest, err := CommandDigest(m.GameID, revision, command)
		if err != nil {
			t.Fatal(err)
		}
		commands = append(commands, CommandRecord{RecordVersion: RecordVersion, GameID: m.GameID, Revision: revision, CommandID: fmt.Sprintf("growth-%d", revision), Digest: digest, Command: command})
		commandBytes += len(codecJSON(t, commands[len(commands)-1]))
	}
	for hand := 0; hand < 100; hand++ {
		if hand > 0 {
			appendCommand(codecJSON(t, map[string]any{"type": "next-hand", "deal": growthDeal(hand)}))
		}
		for _, command := range templates[hand%4] {
			appendCommand(command)
		}
		if hand == 0 || hand == 9 || hand == 99 {
			checkpoints[int64(len(commands))] = hand + 1
		}
	}
	type metric struct {
		Hands                 int     `json:"hands"`
		Revision              int64   `json:"revision"`
		HotBytes              int     `json:"hotBytes"`
		FullStateBytes        int     `json:"fullStateBytes"`
		EventCount            int64   `json:"eventCount"`
		ArchivePayloadBytes   int64   `json:"archivePayloadBytes"`
		CheckpointWritesBytes int64   `json:"checkpointWritesBytes"`
		EventWritesBytes      int64   `json:"eventWritesBytes"`
		CommandWritesBytes    int64   `json:"commandWritesBytes"`
		CompactRestoreMS      float64 `json:"compactRestoreMs"`
		ProjectionEqual       bool    `json:"projectionEqual"`
	}
	observed := []metric{}
	checkpointWrites := int64(0)
	eventWrites := int64(0)
	commandWrites := int64(0)
	saved := map[int64]Document{}
	savedSnapshots := map[int64]gamekernel.Snapshot{}
	previousEvents := int64(0)
	started := time.Now()
	final, _, events, err := c.ReplayVisit(m, anchor, commands, func(d Document, s gamekernel.Snapshot) error {
		checkpointWrites += int64(len(codecJSON(t, d.Checkpoint)))
		eventWrites += d.Checkpoint.EventBytes - previousEvents
		previousEvents = d.Checkpoint.EventBytes
		commandWrites += int64(len(codecJSON(t, commands[d.Revision-1])))
		if hands, ok := checkpoints[d.Revision]; ok {
			full, err := s.Export()
			if err != nil {
				return err
			}
			saved[d.Revision] = d
			savedSnapshots[d.Revision] = s
			observed = append(observed, metric{Hands: hands, Revision: d.Revision, HotBytes: len(d.Checkpoint.State), FullStateBytes: len(full), EventCount: d.Checkpoint.EventCount, ArchivePayloadBytes: d.Checkpoint.EventBytes, CheckpointWritesBytes: checkpointWrites, EventWritesBytes: eventWrites, CommandWritesBytes: commandWrites})
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if commandWrites != int64(commandBytes) || final.Revision != int64(len(commands)) {
		t.Fatal("lost commands or actual chance")
	}
	for i := range observed {
		measurement := &observed[i]
		d := saved[measurement.Revision]
		startedRestore := time.Now()
		restored, status, err := c.Open(d, events[:d.Checkpoint.EventCount])
		measurement.CompactRestoreMS = float64(time.Since(startedRestore).Nanoseconds()) / 1e6
		if err != nil || !status.Playable {
			t.Fatalf("restore failed: %v %+v", err, status)
		}
		for actor := 0; actor < 4; actor++ {
			want, err := savedSnapshots[d.Revision].Project(actor)
			if err != nil {
				t.Fatal(err)
			}
			got, err := restored.Project(actor)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(want, got) {
				t.Fatalf("hand %d actor %d lost exact original observation/history", measurement.Hands, actor)
			}
		}
		measurement.ProjectionEqual = true
	}
	if len(observed) != 3 || observed[2].HotBytes > observed[0].HotBytes+128 || observed[2].ArchivePayloadBytes > observed[0].ArchivePayloadBytes*110 || observed[2].CheckpointWritesBytes > observed[0].CheckpointWritesBytes*110 {
		t.Fatal("storage grows faster than declared compact/linear bounds")
	}
	for _, e := range events {
		if bytes.Contains(e.Payload, []byte(`"hands"`)) {
			t.Fatal("event unexpectedly embeds entire state")
		}
	}
	report := struct {
		Version      string   `json:"version"`
		Mode         string   `json:"mode"`
		Policy       string   `json:"fixturePolicy"`
		ElapsedMS    float64  `json:"elapsedMs"`
		Measurements []metric `json:"measurements"`
	}{"m03-storage-growth-1", "spades-partners", "all-bid-13-first-legal; storage fixture only", float64(time.Since(started).Nanoseconds()) / 1e6, observed}
	raw, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	t.Log(string(raw))
	if path := os.Getenv("M03_GROWTH_EVIDENCE"); path != "" {
		if err = os.WriteFile(path, append(raw, '\n'), 0600); err != nil {
			t.Fatal(err)
		}
	}
}
