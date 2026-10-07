package records

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

// BenchmarkM04FReplay isolates the unchanged full historical replay/checkpoint
// validation from SQL and policy preparation. It uses the same saved legal
// archive before and after an optimization. It is not a full request benchmark.
// Private archive loading and its first validation are outside the timed loop.
func BenchmarkM04FReplay(b *testing.B) {
	path, digest := os.Getenv("M04F_REPLAY_ARCHIVE"), os.Getenv("M04F_REPLAY_SHA256")
	if path == "" || digest == "" {
		b.Skip("explicit private archive and SHA-256 required")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		b.Fatal(err)
	}
	if contracts.SHA256(raw) != digest {
		b.Fatal("private replay archive digest mismatch")
	}
	var fixture terminalFixture
	if err = json.Unmarshal(raw, &fixture); err != nil {
		b.Fatal(err)
	}
	if fixture.Version != "m04e-terminal-fixture-1" || fixture.Mode != "spades-solo" || len(fixture.Commands) != len(fixture.CheckpointDigests) {
		b.Fatal("expected retained Solo terminal archive")
	}
	codec, err := NewServiceCodec()
	if err != nil {
		b.Fatal(err)
	}
	boundaries := map[int]Document{}
	hands := 0
	final, _, events, err := codec.ReplayVisit(fixture.Opening.Metadata, fixture.Anchor, fixture.Commands, func(doc Document, snap gamekernel.Snapshot) error {
		if err := m04fCheckCheckpoint(doc, fixture); err != nil {
			return err
		}
		session, err := codec.Session(doc, snap)
		if err != nil {
			return err
		}
		node, err := session.Node()
		if err != nil {
			return err
		}
		if node.Kind == "round-complete" {
			hands++
			boundaries[hands] = doc
		}
		return nil
	})
	if err != nil {
		b.Fatal(err)
	}
	wantDoc, _ := json.Marshal(fixture.Document)
	gotDoc, _ := json.Marshal(final)
	wantEvents, _ := json.Marshal(fixture.Events)
	gotEvents, _ := json.Marshal(events)
	if !bytes.Equal(wantDoc, gotDoc) || !bytes.Equal(wantEvents, gotEvents) {
		b.Fatal("archive replay differs from saved document/events")
	}
	for _, hand := range []int{1, 3, 5} {
		doc, ok := boundaries[hand]
		if !ok {
			b.Fatalf("archive lacks complete hand %d", hand)
		}
		b.Run(fmt.Sprintf("hands-%02d", hand), func(b *testing.B) {
			commands := fixture.Commands[:doc.Revision]
			expectedEvents, _ := json.Marshal(fixture.Events[:doc.Checkpoint.EventCount])
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				actual, _, events, err := codec.ReplayVisit(fixture.Opening.Metadata, fixture.Anchor, commands, func(doc Document, _ gamekernel.Snapshot) error {
					return m04fCheckCheckpoint(doc, fixture)
				})
				if err != nil {
					b.Fatal(err)
				}
				actualEvents, err := json.Marshal(events)
				if err != nil || actual.Revision != doc.Revision || !equalCheckpoint(actual.Checkpoint, doc.Checkpoint) || !bytes.Equal(actualEvents, expectedEvents) {
					b.Fatal("replayed prefix differs from validated history")
				}
			}
			b.ReportMetric(float64(len(commands)), "commands/op")
		})
	}
}

func m04fCheckCheckpoint(doc Document, fixture terminalFixture) error {
	if doc.Revision < 1 || doc.Revision > int64(len(fixture.CheckpointDigests)) {
		return fmt.Errorf("checkpoint revision outside archive")
	}
	raw, err := json.Marshal(doc.Checkpoint)
	if err != nil {
		return err
	}
	if contracts.SHA256(raw) != fixture.CheckpointDigests[doc.Revision-1] {
		return fmt.Errorf("historical checkpoint mismatch at revision %d", doc.Revision)
	}
	return nil
}
