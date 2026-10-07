package records

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"cardford/server/internal/contracts"
	"cardford/server/internal/sessions"
	"github.com/jackc/pgx/v5"
)

func TestM04EStatsIgnoreUnrelatedBotRecordBytes(t *testing.T) {
	codec, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	s, _ := storeTestOpen(t, codec)
	ctx := context.Background()
	identity, err := s.NewLocalIdentity(ctx)
	if err != nil {
		t.Fatal(err)
	}
	owner := identity.Principal.OwnerID
	if _, err = s.ChangeAccess(ctx, owner, 1, AccessChange{CanRead: true, CanPlay: true}); err != nil {
		t.Fatal(err)
	}
	grant := Grant{ID: "grant", OwnerID: owner, OfferID: "fixture", OfferVersion: "1", SourceKind: "free", SourceID: "fixture", ValidFrom: time.Now().Add(-time.Hour), Terms: GrantTerms{Version: RecordVersion, Game: "spades", Variant: "solo", CanPlay: true, Tools: []string{}, BucketID: "fixture", Period: "lifetime", Timezone: "UTC", Limit: 0, ExpiryRule: "pause-at-expiry"}}
	if err = s.PutGrant(ctx, grant); err != nil {
		t.Fatal(err)
	}
	access, err := s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	admission := AccessAdmission{OwnerID: owner, Generation: access.Generation, ControlRevision: access.ControlGeneration, GrantID: "grant", UnitID: "hand-1"}
	meta, err := ServiceMetadata(serviceSelector("spades-solo"), "stats-game", owner)
	if err != nil {
		t.Fatal(err)
	}
	doc, anchor, events, err := codec.Start(meta, []byte(`{"id":"stats-game","dealer":3}`), codecDeck())
	if err != nil {
		t.Fatal(err)
	}
	window, err := codec.WindowID(doc)
	if err != nil {
		t.Fatal(err)
	}
	admission.UnitID, err = codec.UnitID(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Create(ctx, doc, anchor, events, admission, window); err != nil {
		t.Fatal(err)
	}
	snapshot, _, err := codec.Open(doc, events)
	if err != nil {
		t.Fatal(err)
	}
	// Seed real original decisions and accepted links from two valid reducer
	// transitions. Deliberately omit work rows: accepted human originals without
	// those rows remain a supported historical form.
	ids := []string{}
	for actor := 0; actor < 2; actor++ {
		decision := serviceDecision(t, codec, doc, snapshot, actor)
		ids = append(ids, decision.ID)
		rawDecision, _ := json.Marshal(decision)
		op, _ := json.Marshal(sessions.ActorOperation{Kind: "actor", Seat: actor, CandidateID: decision.SelectedCandidateID})
		next, delta, e := codec.Advance(doc, snapshot, op)
		if e != nil {
			t.Fatal(e)
		}
		commandID := fmt.Sprintf("stats-command-%d", actor)
		digest, e := CommandDigest(doc.Metadata.GameID, next.Revision, op)
		if e != nil {
			t.Fatal(e)
		}
		command := CommandRecord{RecordVersion: RecordVersion, GameID: doc.Metadata.GameID, Revision: next.Revision, CommandID: commandID, Digest: digest, Command: op}
		rawCommand, _ := json.Marshal(command)
		checkpoint, _ := json.Marshal(next.Checkpoint)
		if e = s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
			if _, e := tx.Exec(ctx, "INSERT INTO m03_commands(owner_id,command_id,digest,game_id,revision,command,receipt_schema,receipt,checkpoint_digest) VALUES($1,$2,$3,$4,$5,$6,'AcceptedView',$7,$8)", owner, commandID, digest, "stats-game", next.Revision, rawCommand, []byte(`{"accepted":true}`), contracts.SHA256(checkpoint)); e != nil {
				return e
			}
			if _, e := tx.Exec(ctx, "INSERT INTO m03_decisions(id,owner_id,game_id,revision,record) VALUES($1,$2,$3,$4,$5)", decision.ID, owner, "stats-game", decision.Revision, rawDecision); e != nil {
				return e
			}
			_, e := tx.Exec(ctx, "INSERT INTO m03_command_decisions(owner_id,command_id,decision_id) VALUES($1,$2,$3)", owner, commandID, decision.ID)
			return e
		}); e != nil {
			t.Fatal(e)
		}
		events = append(events, delta...)
		doc = next
		snapshot, _, err = codec.Open(doc, events)
		if err != nil {
			t.Fatal(err)
		}
	}
	// Seed through the internal fixture path, then exercise reads through the
	// real authenticated boundary. An uncredentialed internal fixture context
	// intentionally does not enforce local-service access checks.
	ctx = WithPrincipal(ctx, identity.Principal)
	baseline, err := s.PlatformStats(ctx, owner, "stats-game")
	if err != nil || baseline.Decisions != 1 {
		t.Fatalf("accepted human without work not counted: %+v %v", baseline, err)
	}
	// A warmed scalar cache must never preserve access after revocation.
	currentAccess, err := s.ReadAccess(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	revoked, err := s.ChangeAccess(ctx, owner, currentAccess.Generation, AccessChange{CanRead: false, CanPlay: false})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.PlatformStats(ctx, owner, "stats-game"); !errors.Is(err, ErrReadDenied) {
		t.Fatalf("warm statistics cache did not return read denial after revocation: %v", err)
	}
	if _, err = s.ChangeAccess(ctx, owner, revoked.Generation, AccessChange{CanRead: true, CanPlay: true}); err != nil {
		t.Fatal(err)
	}
	poison := func(id string, large bool) {
		t.Helper()
		if err := s.withTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
			if _, e := tx.Exec(ctx, "ALTER TABLE m03_decisions DISABLE TRIGGER USER"); e != nil {
				return e
			}
			if large {
				if _, e := tx.Exec(ctx, "UPDATE m03_decisions SET record=convert_to(repeat('x',$2),'UTF8') WHERE id=$1", id, MaxRecordBytes+1); e != nil {
					return e
				}
			} else {
				if _, e := tx.Exec(ctx, "UPDATE m03_decisions SET record=$2 WHERE id=$1", id, []byte(`{}`)); e != nil {
					return e
				}
			}
			_, e := tx.Exec(ctx, "ALTER TABLE m03_decisions ENABLE TRIGGER USER")
			return e
		}); err != nil {
			t.Fatal(err)
		}
	}
	poison(ids[1], true)
	after, err := s.PlatformStats(ctx, owner, "stats-game")
	if err != nil || after != baseline {
		t.Fatalf("unrelated oversized bot record poisoned human stats: %+v %v", after, err)
	}
	poison(ids[0], false)
	if _, err = s.PlatformStats(ctx, owner, "stats-game"); err == nil {
		t.Fatal("malformed relevant human record was not validated")
	}
}
