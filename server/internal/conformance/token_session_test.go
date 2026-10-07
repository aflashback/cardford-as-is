package conformance

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestTokenInstalledPersistencePreparationAndReplay(t *testing.T) {
	registry, e := TokenRegistry()
	if e != nil {
		t.Fatal(e)
	}
	codec, e := records.NewServiceCodecWithRegistry(registry)
	if e != nil {
		t.Fatal(e)
	}
	for _, variant := range []string{"individual", "neighbour-teams"} {
		t.Run(variant, func(t *testing.T) {
			pin, _ := TokenPin(variant)
			selector := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
			meta, e := codec.MetadataForNew(selector, "token-installed-"+variant, "owner")
			if e != nil {
				t.Fatal(e)
			}
			installation, e := registry.Installation(selector)
			if e != nil {
				t.Fatal(e)
			}
			config, material, e := installation.Bootstrap(meta.GameID)
			if e != nil {
				t.Fatal(e)
			}
			doc, anchor, events, e := codec.StartMaterial(meta, config, material)
			if e != nil {
				t.Fatal(e)
			}
			if len(anchor.OpeningChance) != 0 || len(anchor.OpeningMaterial) == 0 {
				t.Fatal("numeric anchor coerced to cards")
			}
			changed := doc
			changed.Metadata.Competition = records.Competition{Mode: "partnership", Competitors: []records.Competitor{{ID: "NS", Seats: []int{0, 2}}, {ID: "EW", Seats: []int{1, 3}}}}
			if _, _, e = codec.Open(changed, events); e == nil {
				t.Fatal("game-owned competition repinned into opposite-seat teams")
			}
			encoded, _ := json.Marshal(anchor)
			decoded, e := records.DecodeAnchor(encoded)
			if e != nil {
				t.Fatal(e)
			}
			roundtrip, _ := json.Marshal(decoded)
			if !bytes.Equal(encoded, roundtrip) {
				t.Fatal("opaque anchor roundtrip changed")
			}
			commands := []records.CommandRecord{}
			for step := 0; step < 30; step++ {
				snap, status, e := codec.Open(doc, events)
				if e != nil || !status.Playable {
					t.Fatal("reopen", e)
				}
				bound, e := codec.Session(doc, snap)
				if e != nil {
					t.Fatal(e)
				}
				presentation, e := bound.Presentation(0)
				if e != nil || bytes.Contains(presentation, []byte("\"hand\"")) {
					t.Fatal("presentation invented cards", e)
				}
				node, e := bound.Node()
				if e != nil {
					t.Fatal(e)
				}
				if node.Kind == "session-complete" {
					break
				}
				var operation sessions.Operation
				if node.Kind == "actor" {
					actor := *node.Seat
					prepared, e := codec.PrepareDecision(context.Background(), doc, snap, actor, fmt.Sprintf("decision-%d", step))
					if e != nil {
						t.Fatal(e)
					}
					if prepared.Prepared.PolicyID != TokenPolicy {
						t.Fatal("wrong pin")
					}
					operation = sessions.ActorOperation{Kind: "actor", Seat: actor, CandidateID: prepared.Prepared.CandidateID}
				} else {
					operation = sessions.AutomaticOperation{Kind: "automatic", TransitionID: node.TransitionID}
				}
				raw, e := sessions.EncodeOperation(operation)
				if e != nil {
					t.Fatal(e)
				}
				staged, e := codec.StageTransition(doc, snap, raw)
				if e != nil {
					t.Fatal(e)
				}
				next, delta, e := codec.AcceptStaged(doc, snap, raw, staged)
				if e != nil {
					t.Fatal(e)
				}
				command := records.CommandRecord{RecordVersion: records.RecordVersion, GameID: meta.GameID, Revision: next.Revision, CommandID: fmt.Sprintf("command-%d", step), Command: raw}
				command.Digest, e = records.CommandDigest(command.GameID, command.Revision, command.Command)
				if e != nil {
					t.Fatal(e)
				}
				commands = append(commands, command)
				doc = next
				events = append(events, delta...)
			}
			final, _, e := codec.Open(doc, events)
			if e != nil {
				t.Fatal(e)
			}
			_, replayed, _, e := codec.Replay(meta, anchor, commands)
			if e != nil {
				t.Fatal(e)
			}
			a, _ := final.Export()
			b, _ := replayed.Export()
			if !bytes.Equal(a, b) {
				t.Fatal("numeric replay differs")
			}
			retired := records.NewDocumentCodec()
			if e = retired.RegisterHistoricalReader(records.HistoricalReader{Pin: records.ModulePin(pin), Mode: installation.Mode, ValidateHot: installation.ValidateHot, Window: installation.Window, Unit: installation.Unit,
				Open: func(raw json.RawMessage, archive []json.RawMessage) (gamekernel.Snapshot, error) {
					bound, e := installation.OpenStored(raw, archive)
					if e != nil {
						return nil, e
					}
					return sessions.Durable(bound)
				},
				ReplayStartMaterial: func(config, material json.RawMessage) (gamekernel.Snapshot, error) {
					bound, e := installation.Start(config, material)
					if e != nil {
						return nil, e
					}
					return sessions.Durable(bound)
				},
			}); e != nil {
				t.Fatal(e)
			}
			readOnly, status, e := retired.Open(doc, events)
			if e != nil || status.Playable || status.Reason != "historical-reader-only" {
				t.Fatal("retired numeric reader enabled play", e)
			}
			_, historical, _, e := retired.Replay(meta, anchor, commands)
			if e != nil {
				t.Fatal(e)
			}
			historicalBytes, _ := historical.Export()
			if !bytes.Equal(a, historicalBytes) {
				t.Fatal("retired opaque reader changed historical replay")
			}
			if _, e = retired.PrepareDecision(context.Background(), doc, readOnly, 0, "new-work"); e == nil {
				t.Fatal("retired reader executed new policy work")
			}
			corrupt := append([]records.EventRecord{}, events...)
			corrupt[2].Payload = json.RawMessage(`{"bad":true}`)
			if _, _, e = codec.Open(doc, corrupt); e == nil {
				t.Fatal("changed immutable event accepted")
			}
			mixed := anchor
			mixed.OpeningChance = []string{"SA"}
			if e = codec.ValidateAnchor(meta, mixed); e == nil {
				t.Fatal("mixed card/numeric chance accepted")
			}
		})
	}
	handlers := sessions.DefaultHandlers()
	handlers.UI = append(handlers.UI, "token-table-test")
	for _, item := range registry.Catalog(handlers.Engine, handlers.UI) {
		if item.GameID == TokenGameID {
			t.Fatal("test installation became public")
		}
	}
}
