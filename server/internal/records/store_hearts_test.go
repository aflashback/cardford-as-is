package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"
)

func storeHeartsCorpus(t *testing.T, s *Store, f heartsRecordCorpus) (*Loaded, AccessAdmission) {
	t.Helper()
	ctx := context.Background()
	owner := "hearts-store-owner"
	if err := s.CreateAccess(ctx, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ChangeAccess(ctx, owner, 1, AccessChange{CanRead: true, CanPlay: true}); err != nil {
		t.Fatal(err)
	}
	grant := Grant{ID: "hearts-grant", OwnerID: owner, OfferID: "hearts-fixture", OfferVersion: "1", SourceKind: "free", SourceID: "fixture", ValidFrom: time.Now().Add(-time.Hour), Terms: GrantTerms{Version: RecordVersion, Game: "hearts", Variant: "solo", CanPlay: true, Tools: []string{}, BucketID: "hearts-stable", Period: "lifetime", Timezone: "UTC", Limit: 100, ExpiryRule: "pause-at-expiry"}}
	if err := s.PutGrant(ctx, grant); err != nil {
		t.Fatal(err)
	}
	access, err := s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	a := AccessAdmission{OwnerID: owner, Generation: access.Generation, ControlRevision: access.ControlGeneration, GrantID: grant.ID, UnitID: "hand-1"}
	d, anchor, events, _ := heartsRecordsStart(t, s.codec, f, owner)
	window, err := s.codec.WindowID(d)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Create(ctx, d, anchor, events, a, window); err != nil {
		t.Fatal(err)
	}
	access, err = s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	a.Generation = access.Generation
	loaded, err := s.Load(ctx, owner, d.Metadata.GameID)
	if err != nil {
		t.Fatal(err)
	}
	return loaded, a
}

// The non-database corpus test checks all four hands. This deliberately shorter
// integration test proves the separate atomic publication/receipt/history seam
// across collection and a new actual draw, including original human analysis.
func TestM04StoreHeartsReceiptsAdviceAndNextHandReopen(t *testing.T) {
	f := heartsRecordsCorpus(t)
	c := codecFixture(t, "hearts")
	s, other := storeTestOpen(t, c)
	current, admission := storeHeartsCorpus(t, s, f)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	gameID := current.Document.Metadata.GameID
	assertRejected := func(request AcceptedTransition) {
		t.Helper()
		before := codecJSON(t, current.Document)
		archive := codecJSON(t, current.Events)
		count := current.commandCount
		if _, err := s.Commit(ctx, request); err == nil {
			t.Fatal("invalid Hearts command accepted")
		}
		unchanged, err := other.Load(ctx, admission.OwnerID, gameID)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(before, codecJSON(t, unchanged.Document)) || !bytes.Equal(archive, codecJSON(t, unchanged.Events)) || unchanged.commandCount != count {
			t.Fatal("rejected Hearts command changed state, events or receipts")
		}
		if _, err = other.Reconcile(ctx, admission.OwnerID, request.Command.CommandID, request.Command.Digest); !errors.Is(err, ErrConflict) {
			t.Fatalf("rejected command acquired receipt: %v", err)
		}
	}
	assertRejected(storeTestRequest(t, current, admission, "early-collect", []byte(`{"type":"collect-trick"}`)))
	assertRejected(storeTestRequest(t, current, admission, "early-next-hand", codecJSON(t, map[string]any{"type": "next-hand", "deal": f.Deal})))
	var original DecisionRecord
	var savedRequests []AcceptedTransition
	var nextDraw []byte
	lastIndex := -1
	for i, raw := range f.Commands {
		unit, err := c.CurrentUnitID(current.Document, current.Snapshot)
		if err != nil {
			t.Fatal(err)
		}
		admission.UnitID = unit
		request := storeTestRequest(t, current, admission, fmt.Sprintf("hearts-store-%d", i), raw)
		var command struct {
			Type   string
			Action struct {
				Kind string
				Seat int
				Card string
			}
		}
		if err = json.Unmarshal(raw, &command); err != nil {
			t.Fatal(err)
		}
		if command.Type == "next-hand" {
			wrongUnit := request
			wrongUnit.Admission.UnitID = "hand-99"
			assertRejected(wrongUnit)
			nextDraw = bytes.Clone(raw)
		}
		if command.Action.Kind == "play" && command.Action.Seat == 0 && original.ID == "" {
			original = heartsRecordDecision(t, c, current.Document, current.Snapshot, 0, "play:"+command.Action.Card)
			original.Access = admission
			request.Decisions = []DecisionRecord{original}
		}
		result, err := s.Commit(ctx, request)
		if err != nil {
			t.Fatalf("command %d: %v", i, err)
		}
		if result.Reconciled || result.Revision != int64(i+1) || !bytes.Equal(result.Receipt, request.Receipt) {
			t.Fatal("new command lost its original receipt")
		}
		if command.Type == "next-hand" || command.Type == "collect-trick" && len(savedRequests) == 0 {
			savedRequests = append(savedRequests, request)
		}
		current, err = other.Load(ctx, admission.OwnerID, gameID)
		if err != nil {
			t.Fatalf("reopen command %d: %v", i, err)
		}
		heartsRecordAssertCheckpoint(t, current.Snapshot, f.Checkpoints[i+1])
		lastIndex = i
		var hot struct {
			HandNumber int
			Events     []json.RawMessage
		}
		if err = json.Unmarshal(current.Document.Checkpoint.State, &hot); err != nil {
			t.Fatal(err)
		}
		if len(hot.Events) != 0 {
			t.Fatal("saved hot state duplicates events")
		}
		if hot.HandNumber == 2 && command.Action.Kind == "play" {
			break
		}
	}
	if original.ID == "" || len(savedRequests) != 2 || len(nextDraw) == 0 {
		t.Fatal("fixture did not reach human decision, collection and next draw")
	}
	unit, err := c.UnitID(current.Document)
	if err != nil || unit != "hand-2" {
		t.Fatalf("saved next unit=%q error=%v", unit, err)
	}
	var firstAdmitted, nextAdmitted int
	if err = s.pool.QueryRow(ctx, `SELECT count(*) FILTER (WHERE unit_id='hand-1'),count(*) FILTER (WHERE unit_id='hand-2') FROM m03_unit_admissions WHERE owner_id=$1 AND game_id=$2`, admission.OwnerID, gameID).Scan(&firstAdmitted, &nextAdmitted); err != nil || firstAdmitted != 1 || nextAdmitted != 1 {
		t.Fatalf("authoritative unit admissions=%d/%d error=%v", firstAdmitted, nextAdmitted, err)
	}

	restarted, err := OpenStore(ctx, os.Getenv("TEST_DATABASE_URL"), StoreOptions{Schema: s.schema, Codec: codecFixture(t, "hearts")})
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	reopened, err := restarted.Load(ctx, admission.OwnerID, gameID)
	if err != nil {
		t.Fatal(err)
	}
	heartsRecordAssertCheckpoint(t, reopened.Snapshot, f.Checkpoints[lastIndex+1])
	for _, request := range savedRequests {
		result, err := restarted.Commit(ctx, request)
		if err != nil || !result.Reconciled || result.Revision != request.Command.Revision || !bytes.Equal(result.Receipt, request.Receipt) {
			t.Fatalf("old collection/chance receipt changed after restart: %v", err)
		}
	}
	historical, err := restarted.ReadDecision(ctx, admission.OwnerID, original.ID)
	if err != nil || !bytes.Equal(historical.Analysis, original.Analysis) || !bytes.Equal(historical.Advice, original.Advice) {
		t.Fatalf("original human analysis/advice changed across next hand: %v", err)
	}
	if historical.Access.UnitID != "hand-1" {
		t.Fatal("historical decision rebound to later access unit")
	}
	replayed, err := restarted.Replay(ctx, admission.OwnerID, gameID)
	if err != nil {
		t.Fatal(err)
	}
	if !equalCheckpoint(replayed.Document.Checkpoint, current.Document.Checkpoint) {
		t.Fatal("persisted actual-chance replay differs from saved checkpoint")
	}
	heartsRecordAssertCheckpoint(t, replayed.Snapshot, f.Checkpoints[lastIndex+1])
	archive, err := restarted.loadHistory(ctx, admission.OwnerID, gameID)
	if err != nil {
		t.Fatal(err)
	}
	draws := 0
	for _, record := range archive.commands {
		var command struct{ Type string }
		if err = json.Unmarshal(record.Command, &command); err != nil {
			t.Fatal(err)
		}
		if command.Type == "next-hand" {
			draws++
			if !bytes.Equal(record.Command, nextDraw) {
				t.Fatal("persisted next draw changed")
			}
		}
	}
	if draws != 1 || len(archive.commands) != lastIndex+1 {
		t.Fatal("receipt replay duplicated accepted history")
	}
}
