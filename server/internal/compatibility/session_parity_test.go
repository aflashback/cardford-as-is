package compatibility

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"encoding/json"
	"fmt"
	"testing"
)

type registeredOperation struct {
	Kind                                           string
	Actor                                          int
	CandidateID, WindowID, TransitionID, RequestID string
	Choices                                        []gamekernel.SeatChoice
	Material                                       json.RawMessage
}
type registeredCase struct {
	Config struct {
		ID, Mode string
		Dealer   int
	}
	Deal        []string
	Operations  []registeredOperation
	Checkpoints []struct {
		OperationIndex                     int
		Document, Node, AccessUnit, Events string
		Views                              []string
		Prepared                           []struct {
			Seat             int
			Packet, Prepared string
		}
	}
}

func registeredStep(s gamekernel.BoundSession, op registeredOperation) (gamekernel.BoundTransition, error) {
	switch op.Kind {
	case "actor":
		return s.Commit(op.Actor, op.CandidateID)
	case "sealed":
		return s.CommitSealed(op.WindowID, op.Choices)
	case "automatic":
		return s.Advance(op.TransitionID)
	case "chance":
		return s.SupplyChance(op.RequestID, op.Material)
	case "continue-round":
		return s.ContinueRound()
	}
	return gamekernel.BoundTransition{}, fmt.Errorf("unsupported oracle operation %q", op.Kind)
}
func TestM04BRegisteredSessionParity(t *testing.T) {
	corpus := reference(t)
	registry, err := sessions.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	checkpoints, prepared := 0, 0
	for _, saved := range corpus.Sessions {
		ok := t.Run(saved.Config.Mode+"/"+saved.Config.ID, func(t *testing.T) {
			game, variant, rule, policy := "spades", "solo", "spades-solo-training-1.0.0", "spades-tactics-2.1.0"
			if saved.Config.Mode == "spades-partners" {
				variant, rule = "partners", "spades-training-1.0.0"
			}
			if saved.Config.Mode == "hearts" {
				game, rule, policy = "hearts", "hearts-training-1.0.0", "hearts-baseline-1.0.0"
			}
			selector := sessions.Selector{GameID: game, VariantID: variant, ModuleVersion: "2.0.0", RuleProfileID: rule}
			config := encoded(t, map[string]any{"id": saved.Config.ID, "dealer": saved.Config.Dealer})
			material := encoded(t, map[string]any{"kind": "deal", "deck": saved.Deal})
			s, err := registry.CreateRegisteredSession(selector, config, material)
			if err != nil {
				t.Fatal(err)
			}
			if len(saved.Checkpoints) != len(saved.Operations)+1 {
				t.Fatal("missing session checkpoints")
			}
			for index, want := range saved.Checkpoints {
				if want.OperationIndex != index-1 {
					t.Fatal("out-of-order session checkpoint")
				}
				events := []json.RawMessage{}
				if index > 0 {
					before, e := s.SerializePrivate()
					if e != nil {
						t.Fatal(e)
					}
					transition, e := registeredStep(s, saved.Operations[index-1])
					if e != nil {
						t.Fatalf("operation %d: %v", index-1, e)
					}
					unchanged, e := s.SerializePrivate()
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, "immutable predecessor", unchanged, sha(t, before))
					s, events = transition.Next, transition.PrivateEvents
				}
				label := fmt.Sprintf("operation %d", index-1)
				document, e := s.SerializePrivate()
				if e != nil {
					t.Fatal(e)
				}
				requireHash(t, label+" document", document, want.Document)
				node, e := s.Node()
				if e != nil {
					t.Fatal(e)
				}
				requireHash(t, label+" node", encoded(t, node), want.Node)
				unit, e := s.AccessUnit()
				if e != nil {
					t.Fatal(e)
				}
				requireHash(t, label+" access unit", encoded(t, unit), want.AccessUnit)
				requireHash(t, label+" private events", encoded(t, events), want.Events)
				if len(want.Views) != 4 {
					t.Fatal("missing views")
				}
				for seat, w := range want.Views {
					view, e := s.View(seat)
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, label+fmt.Sprintf(" view %d", seat), view, w)
					if e := contracts.Validate("RegisteredSessionView", view); e != nil {
						t.Fatal(e)
					}
				}
				for _, p := range want.Prepared {
					packet, e := s.Packet(p.Seat)
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, label+fmt.Sprintf(" packet %d", p.Seat), packet, p.Packet)
					result, e := s.Prepare(p.Seat, policy)
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, label+fmt.Sprintf(" prepared %d", p.Seat), encoded(t, result), p.Prepared)
					prepared++
				}
				// Reopen all semantic boundaries and bounded replay chunks. Normal trusted
				// moves stay typed; import validation is not repeated on every operation.
				if index%64 == 0 || node.Kind == "round-complete" || node.Kind == "chance" || node.Kind == "session-complete" {
					s, e = registry.DecodeDocument(document)
					if e != nil {
						t.Fatal(e)
					}
					reopened, e := s.SerializePrivate()
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, label+" reopened document", reopened, want.Document)
				}
				checkpoints++
			}
		})
		if !ok {
			return
		}
	}
	if checkpoints != corpus.Counts.SessionCheckpoints || prepared != corpus.Counts.Prepared {
		t.Fatalf("coverage mismatch: checkpoints=%d prepared=%d", checkpoints, prepared)
	}
	t.Logf("%d exact V2 checkpoints and %d preparations including original input digests", checkpoints, prepared)
}

func TestM04BRegisteredImportBoundaryParity(t *testing.T) {
	var corpus struct {
		SchemaVersion string
		Cases         []struct {
			Mode, Label string
			Document    json.RawMessage
			Accepted    bool
		}
	}
	readFixture(t, "qa/implementation/multi-game/m04b/boundary-corpus.json", &corpus)
	if corpus.SchemaVersion != "1.0.0" || len(corpus.Cases) != 78 {
		t.Fatal("incomplete boundary oracle")
	}
	registry, err := sessions.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range corpus.Cases {
		t.Run(c.Mode+"/"+c.Label, func(t *testing.T) {
			s, err := registry.DecodeDocument(c.Document)
			if (err == nil) != c.Accepted {
				t.Fatalf("reference accepted=%v, Go error=%v", c.Accepted, err)
			}
			if err == nil {
				raw, e := s.SerializePrivate()
				if e != nil {
					t.Fatal(e)
				}
				requireHash(t, "lossless supported document", raw, sha(t, c.Document))
			}
		})
	}
}

func TestM04BRegisteredNumericUnicodeParity(t *testing.T) {
	var corpus struct {
		SchemaVersion string
		Cases         []struct {
			Mode, Label, Raw string
			Accepted         bool
			Document         json.RawMessage
		}
	}
	readFixture(t, "qa/implementation/multi-game/m04b/edge-corpus.json", &corpus)
	if corpus.SchemaVersion != "1.0.0" || len(corpus.Cases) != 21 {
		t.Fatal("incomplete edge oracle")
	}
	registry, err := sessions.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range corpus.Cases {
		t.Run(c.Mode+"/"+c.Label, func(t *testing.T) {
			s, err := registry.DecodeDocument(json.RawMessage(c.Raw))
			if (err == nil) != c.Accepted {
				t.Fatalf("reference accepted=%v, Go error=%v", c.Accepted, err)
			}
			if err == nil {
				raw, e := s.SerializePrivate()
				if e != nil {
					t.Fatal(e)
				}
				requireHash(t, "semantic roundtrip", raw, sha(t, c.Document))
			}
		})
	}
}
