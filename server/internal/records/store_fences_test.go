package records

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"cardford/server/internal/gamekernel"
	"github.com/jackc/pgx/v5"
)

func storeFinishHand(t *testing.T, s *Store, current *Loaded, a AccessAdmission) *Loaded {
	t.Helper()
	for step := 0; step < 70; step++ {
		raw, err := current.Snapshot.Export()
		if err != nil {
			t.Fatal(err)
		}
		var state struct {
			Phase string `json:"phase"`
			Turn  *int   `json:"turn"`
		}
		if err = json.Unmarshal(raw, &state); err != nil {
			t.Fatal(err)
		}
		var command []byte
		switch state.Phase {
		case "hand-end":
			return current
		case "trick-end":
			command = []byte(`{"type":"collect-trick"}`)
		case "bid":
			command, _ = json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "bid", "seat": *state.Turn, "bid": 13}})
		case "play":
			p, err := current.Snapshot.Project(*state.Turn)
			if err != nil {
				t.Fatal(err)
			}
			command, _ = json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "play", "seat": *state.Turn, "card": strings.TrimPrefix(p.CandidateIDs[0], "play:")}})
		default:
			t.Fatalf("unexpected phase %s", state.Phase)
		}
		if _, err = s.Commit(context.Background(), storeTestRequest(t, current, a, fmt.Sprintf("finish-%d", current.Document.Revision+1), command)); err != nil {
			t.Fatal(err)
		}
		current, err = s.Load(context.Background(), a.OwnerID, current.Document.Metadata.GameID)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("hand did not finish within exact finite step bound")
	return nil
}

func TestM03StoreExpiredAdmittedUnitFinishesButCannotDrawNextHand(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "expiry")
	expires := time.Now().Add(time.Hour)
	grant := Grant{ID: "finishing-grant", OwnerID: a.OwnerID, OfferID: "purchased-terms", OfferVersion: "1", SourceKind: "purchase", SourceID: "saved-purchase", ValidFrom: time.Now().Add(-time.Hour), ValidUntil: &expires, Terms: GrantTerms{Version: RecordVersion, Game: "spades", Variant: "partners", CanPlay: true, Tools: []string{}, BucketID: "stable", Period: "lifetime", Timezone: "UTC", Limit: 0, ExpiryRule: "finish-admitted-unit"}}
	if err := s.PutGrant(context.Background(), grant); err != nil {
		t.Fatal(err)
	}
	access, err := s.ReadAccess(context.Background(), a.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	a.Generation = access.Generation
	a.GrantID = grant.ID
	if err = s.AdmitUnit(context.Background(), "expiry", "spades", "partners", a); err != nil {
		t.Fatal(err)
	}
	// Advance this isolated fixture to natural expiry without a timing race.
	// Production immutability remains enabled; only this test transaction seeds
	// an already-expired saved term after recording its earlier unit admission.
	if err = s.withTx(context.Background(), func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `ALTER TABLE m03_grants DISABLE TRIGGER USER`); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE m03_grants SET valid_until=clock_timestamp() WHERE grant_id=$1`, grant.ID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `ALTER TABLE m03_grants ENABLE TRIGGER USER`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	// A newly authorized controller keeps purchased finish rights. Original
	// generation/control fences still prevent old prepared work publication.
	access, err = s.ChangeAccess(context.Background(), a.OwnerID, a.Generation, AccessChange{ActiveGameID: "expiry", CanRead: true, CanPlay: true, ChangeControl: true})
	if err != nil {
		t.Fatal(err)
	}
	a.Generation = access.Generation
	a.ControlRevision = access.ControlGeneration
	current := storeFinishHand(t, s, before, a)
	command, _ := json.Marshal(map[string]any{"type": "next-hand", "deal": storeTestDeal()})
	request := storeTestRequest(t, current, a, "expired-next-hand", command)
	if _, err = s.Commit(context.Background(), request); !errors.Is(err, ErrAccess) {
		t.Fatalf("expired grant crossed to next actual unit: %v", err)
	}
	spoofed := request
	spoofed.Admission.UnitID = "hand-2"
	if _, err = s.Commit(context.Background(), spoofed); !errors.Is(err, ErrAccess) {
		t.Fatalf("caller supplied future unit: %v", err)
	}
	after, err := s.Load(context.Background(), a.OwnerID, "expiry")
	if err != nil || !bytes.Equal(after.origin, current.origin) {
		t.Fatal("rejected draw changed state", err)
	}
	if err = s.RevokeGrant(context.Background(), a.OwnerID, grant.ID); err != nil {
		t.Fatal(err)
	}
	access, err = s.ReadAccess(context.Background(), a.OwnerID)
	if err != nil {
		t.Fatal(err)
	}
	request.Admission.Generation = access.Generation
	if _, err = s.Commit(context.Background(), request); !errors.Is(err, ErrAccess) {
		t.Fatalf("revoked grant reused old admission: %v", err)
	}
}

func TestM03StoreCPUWorkOwnsNoDatabaseConnection(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "connection")
	registration := s.codec.readers[before.Document.Metadata.Pin]
	original := registration.Open
	checked := false
	registration.Open = func(hot json.RawMessage, events []json.RawMessage) (gamekernel.Snapshot, error) {
		checked = true
		if s.pool.Stat().AcquiredConns() != 0 {
			t.Error("game decoder retained a database connection")
		}
		return original(hot, events)
	}
	s.codec.readers[before.Document.Metadata.Pin] = registration
	if _, err := s.Load(context.Background(), a.OwnerID, "connection"); err != nil {
		t.Fatal(err)
	}
	if !checked {
		t.Fatal("game decoder hook did not run")
	}
	if s.pool.Stat().AcquiredConns() != 0 {
		t.Fatal("pool still acquired between operations")
	}
}

func TestM03StoreReadableCapsRejectBeforePublication(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "caps")
	for _, kind := range []string{"events", "commands", "count"} {
		copy := *before
		switch kind {
		case "events":
			copy.archiveBytes = MaxArchiveBytes
		case "commands":
			copy.commandBytes = MaxArchiveBytes
		case "count":
			copy.commandCount = MaxEventCount
		}
		if _, err := s.Commit(context.Background(), storeTestBid(t, &copy, a, "cap-"+kind)); err == nil {
			t.Fatalf("accepted unreadable %s growth", kind)
		}
	}
	after, err := s.Load(context.Background(), a.OwnerID, "caps")
	if err != nil || after.Document.Revision != 0 {
		t.Fatal("rejected growth partially persisted", err)
	}
}

func TestM03StoreMalformedArchiveAndCheckpointFailClosed(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	before, a := storeTestGame(t, s, "corrupt-history")
	if _, err := s.Commit(context.Background(), storeTestBid(t, before, a, "accepted")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Replay(context.Background(), a.OwnerID, "corrupt-history"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(context.Background(), `ALTER TABLE m03_commands DISABLE TRIGGER USER; UPDATE m03_commands SET checkpoint_digest=repeat('0',64); ALTER TABLE m03_commands ENABLE TRIGGER USER`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Replay(context.Background(), a.OwnerID, "corrupt-history"); !errors.Is(err, ErrStorage) {
		t.Fatalf("corrupt replay checkpoint accepted: %v", err)
	}
	if _, err := s.pool.Exec(context.Background(), `ALTER TABLE m03_events DISABLE TRIGGER USER; UPDATE m03_events SET record=convert_to('{"bad":true}','UTF8') WHERE sequence=1; ALTER TABLE m03_events ENABLE TRIGGER USER`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Load(context.Background(), a.OwnerID, "corrupt-history"); !errors.Is(err, ErrStorage) {
		t.Fatalf("corrupt archive accepted: %v", err)
	}
}

// Legal JSON permits insignificant whitespace. Use it to reach the actual
// command archive byte boundary with fewer than one hand's accepted commands.
// The immutable anchor has its own budget and must not make this history unreadable.
func TestM03StoreCommandCapReservesIndependentAnchorBudget(t *testing.T) {
	s, _ := storeTestOpen(t, storeTestCodec())
	current, a := storeTestGame(t, s, "archive-boundary")
	target := int64(MaxArchiveBytes - 256)
	for current.commandBytes < target-4 {
		raw, err := current.Snapshot.Export()
		if err != nil {
			t.Fatal(err)
		}
		var state struct {
			Phase string `json:"phase"`
			Turn  *int   `json:"turn"`
		}
		if err = json.Unmarshal(raw, &state); err != nil {
			t.Fatal(err)
		}
		var command []byte
		switch state.Phase {
		case "trick-end":
			command = []byte(`{"type":"collect-trick"}`)
		case "bid":
			command, _ = json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "bid", "seat": *state.Turn, "bid": 13}})
		case "play":
			p, err := current.Snapshot.Project(*state.Turn)
			if err != nil {
				t.Fatal(err)
			}
			command, _ = json.Marshal(map[string]any{"type": "action", "action": map[string]any{"kind": "play", "seat": *state.Turn, "card": strings.TrimPrefix(p.CandidateIDs[0], "play:")}})
		default:
			t.Fatalf("unexpected boundary phase %s", state.Phase)
		}
		request := storeTestRequest(t, current, a, fmt.Sprintf("padded-%d", current.Document.Revision+1), command)
		remaining := target - current.commandBytes
		low, high := 0, MaxHotBytes-len(command)
		for low < high {
			middle := (low + high + 1) / 2
			request.Command.Command = append(bytes.Clone(command), bytes.Repeat([]byte(" "), middle)...)
			encoded, _ := json.Marshal(request.Command)
			if int64(len(encoded)) <= remaining {
				low = middle
			} else {
				high = middle - 1
			}
		}
		request.Command.Command = append(bytes.Clone(command), bytes.Repeat([]byte(" "), low)...)
		encoded, _ := json.Marshal(request.Command)
		if int64(len(encoded)) > remaining {
			t.Fatal("boundary fixture cannot fit final command")
		}
		if _, err = s.Commit(context.Background(), request); err != nil {
			t.Fatal(err)
		}
		current, err = s.Load(context.Background(), a.OwnerID, "archive-boundary")
		if err != nil {
			t.Fatal(err)
		}
	}
	if current.commandBytes < MaxArchiveBytes-260 {
		t.Fatalf("fixture missed near-cap range: %d", current.commandBytes)
	}
	if _, err := s.Replay(context.Background(), a.OwnerID, "archive-boundary"); err != nil {
		t.Fatalf("accepted near-cap archive became unreadable: %v", err)
	}
}
