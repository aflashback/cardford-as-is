package records

import (
	"bytes"
	"context"
	"os"
	"testing"
	"time"

	"cardford/server/internal/games/spades"
)

func historicalSpadesCodec(t *testing.T, pin ModulePin) *DocumentCodec {
	t.Helper()
	// Model a retired executable module: only its exact trusted historical
	// implementation is installed, without an execution policy registration.
	c := &DocumentCodec{readers: map[ModulePin]storageRegistration{}}
	r := HistoricalReader{Pin: pin, Mode: "spades-partners", Open: spades.OpenStored, ValidateHot: spades.ValidateStoredShape, ReplayStart: spades.Start, Window: spades.StoredWindow, Unit: spades.StoredUnitID}
	if err := c.RegisterHistoricalReader(r); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestRecordHistoricalReaderReplaysWithoutEnablingPlay(t *testing.T) {
	writable := codecFixture(t, "spades-partners")
	doc, anchor, events, snapshot := codecStart(t, writable, "spades-partners")
	command := []byte(`{"type":"action","action":{"kind":"bid","seat":1,"bid":3}}`)
	want, _, err := writable.Advance(doc, snapshot, command)
	if err != nil {
		t.Fatal(err)
	}
	digest, err := CommandDigest(doc.Metadata.GameID, 1, command)
	if err != nil {
		t.Fatal(err)
	}
	c := historicalSpadesCodec(t, doc.Metadata.Pin)
	replayed, restored, _, err := c.Replay(doc.Metadata, anchor, []CommandRecord{{RecordVersion: RecordVersion, GameID: doc.Metadata.GameID, Revision: 1, CommandID: "original-bid", Digest: digest, Command: command}})
	if err != nil || !equalCheckpoint(want.Checkpoint, replayed.Checkpoint) {
		t.Fatalf("historical replay lost original checkpoint: %v", err)
	}
	if _, _, err = c.Advance(replayed, restored, []byte(`{"type":"action","action":{"kind":"bid","seat":2,"bid":3}}`)); err == nil {
		t.Fatal("historical replay enabled a new command")
	}
	if _, _, _, err = c.Start(doc.Metadata, anchor.Config, anchor.OpeningChance); err == nil {
		t.Fatal("historical replay constructor enabled new play")
	}
	if err = c.RegisterPolicy(PolicyRegistration{Module: doc.Metadata.Pin, Policy: doc.Metadata.Policy, PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}); err == nil {
		t.Fatal("historical reader acquired execution policy")
	}
	_, disposition, err := c.Open(doc, events)
	if err != nil || disposition.Playable || disposition.Reason != "historical-reader-only" {
		t.Fatalf("historical disposition changed: %+v %v", disposition, err)
	}
	missingReplay := &DocumentCodec{readers: map[ModulePin]storageRegistration{}}
	if err = missingReplay.RegisterHistoricalReader(HistoricalReader{Pin: doc.Metadata.Pin, Mode: "spades-partners", Open: spades.OpenStored, ValidateHot: spades.ValidateStoredShape}); err == nil {
		t.Fatal("historical reader cannot verify original anchor")
	}
}

func TestM03HistoricalReaderPreservesOriginalPreparedAdvice(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	ctx := context.Background()
	before, admission := storeTestGame(t, s, "retired-module")
	decision := storeTestDecision(t, s, before, admission)
	work, err := s.QueueWork(ctx, WorkRequest{GameID: decision.GameID, Revision: decision.Revision, Actor: decision.Actor, WindowID: decision.WindowID, Purpose: decision.Purpose, InputDigest: decision.InputDigest, Policy: decision.Policy, Admission: admission, Lifetime: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	lease, err := s.ClaimWork(ctx, admission.OwnerID, work.ID, MaxWorkLease)
	if err != nil {
		t.Fatal(err)
	}
	decision.AttemptID, decision.AttemptFence = lease.WorkID, lease.Fence
	if _, err = s.PublishWork(ctx, admission.OwnerID, lease, decision); err != nil {
		t.Fatal(err)
	}
	request := storeTestBid(t, before, admission, "original-command")
	request.Decisions = []DecisionRecord{decision}
	if _, err = s.Commit(ctx, request); err != nil {
		t.Fatal(err)
	}
	historical, err := OpenStore(ctx, os.Getenv("TEST_DATABASE_URL"), StoreOptions{Schema: s.schema, Codec: historicalSpadesCodec(t, before.Document.Metadata.Pin)})
	if err != nil {
		t.Fatal(err)
	}
	defer historical.Close()
	replayed, err := historical.Replay(ctx, admission.OwnerID, decision.GameID)
	if err != nil || replayed.Disposition.Playable || replayed.Document.Revision != 1 {
		t.Fatalf("retired module replay failed or enabled play: %v", err)
	}
	original, err := historical.ReadPrepared(ctx, admission.OwnerID, work.ID)
	if err != nil || !SamePreparedBytes(original, decision) {
		t.Fatalf("retired module lost issued original advice: %v", err)
	}
	if _, err = historical.Commit(ctx, storeTestRequest(t, replayed, admission, "new-command", []byte(`{"type":"action","action":{"kind":"bid","seat":2,"bid":3}}`))); err == nil {
		t.Fatal("retired module accepted new play")
	}
	recovered, err := historical.Reconcile(ctx, admission.OwnerID, request.Command.CommandID, request.Command.Digest)
	if err != nil || !bytes.Equal(recovered.Receipt, request.Receipt) {
		t.Fatalf("historical original receipt unavailable: %v", err)
	}
}
