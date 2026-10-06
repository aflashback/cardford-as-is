package records

import (
	"bytes"
	"cardford/server/internal/coaching"
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
)

func serviceSelector(mode string) sessions.Selector {
	p := OriginalPin(mode)
	return sessions.Selector{GameID: p.GameID, VariantID: p.VariantID, ModuleVersion: "2.0.0", RuleProfileID: p.RuleProfileID}
}
func serviceStart(t *testing.T, mode string) (*DocumentCodec, Document, ReplayAnchor, []EventRecord, gamekernel.Snapshot) {
	t.Helper()
	c, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	meta, err := ServiceMetadata(serviceSelector(mode), "service-game", "owner")
	if err != nil {
		t.Fatal(err)
	}
	doc, anchor, events, err := c.Start(meta, []byte(`{"id":"service-game","dealer":0}`), codecDeck())
	if err != nil {
		t.Fatal(err)
	}
	snap, status, err := c.Open(doc, events)
	if err != nil || !status.Playable {
		t.Fatalf("open: %v %+v", err, status)
	}
	return c, doc, anchor, events, snap
}
func serviceDecision(t *testing.T, c *DocumentCodec, doc Document, snap gamekernel.Snapshot, actor int) DecisionRecord {
	t.Helper()
	id := fmt.Sprintf("original-%d-%d", doc.Revision, actor)
	binding, err := c.PreparationInput(doc, snap, actor)
	if err != nil {
		t.Fatal(err)
	}
	result, err := c.PrepareDecision(context.Background(), doc, snap, actor, id)
	if err != nil {
		t.Fatal(err)
	}
	if binding.InputDigest != result.Prepared.InputDigest {
		t.Fatal("admission and execution digest differ")
	}
	session, err := c.Session(doc, snap)
	if err != nil {
		t.Fatal(err)
	}
	frozen, err := session.Prepare(actor, doc.Metadata.Policy.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(frozen, result.Prepared) {
		t.Fatal("full output changed frozen M02 preparation")
	}
	unit, err := c.CurrentUnitID(doc, snap)
	if err != nil {
		t.Fatal(err)
	}
	purpose := "bot-action"
	if actor == 0 {
		purpose = "human-analysis"
	}
	decision := DecisionRecord{RecordVersion: RecordVersion, ID: id, OwnerID: doc.Metadata.OwnerID, GameID: doc.Metadata.GameID, Revision: doc.Revision, Actor: actor, WindowID: binding.WindowID, Purpose: purpose, PacketVersion: binding.PacketVersion, InputDigest: binding.InputDigest, Policy: doc.Metadata.Policy, SelectedCandidateID: result.Prepared.CandidateID, AnalysisSchema: result.AnalysisSchema, Analysis: result.Analysis, AdviceSchema: result.AdviceSchema, Advice: result.Advice, Access: AccessAdmission{OwnerID: doc.Metadata.OwnerID, Generation: 1, ControlRevision: 1, GrantID: "grant", UnitID: unit}, ReceiptID: id + "-receipt", AttemptID: id + "-work", AttemptFence: 1}
	if err = c.ValidateDecision(doc, snap, decision); err != nil {
		t.Fatal(err)
	}
	return decision
}

func TestM04CCompleteOriginalPreparationAndV2Lifecycle(t *testing.T) {
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			c, doc, anchor, events, snap := serviceStart(t, mode)
			commands := []CommandRecord{}
			rounds := 0
			decisions := 0
			for step := 0; step < 220; step++ {
				session, err := c.Session(doc, snap)
				if err != nil {
					t.Fatal(err)
				}
				node, err := session.Node()
				if err != nil {
					t.Fatal(err)
				}
				var op sessions.Operation
				prepared := []DecisionRecord{}
				switch node.Kind {
				case "actor":
					decision := serviceDecision(t, c, doc, snap, *node.Seat)
					prepared = append(prepared, decision)
					op = sessions.ActorOperation{Kind: "actor", Seat: *node.Seat, CandidateID: decision.SelectedCandidateID}
				case "sealed":
					choices := []gamekernel.SeatChoice{}
					for _, seat := range node.Actors {
						decision := serviceDecision(t, c, doc, snap, seat)
						prepared = append(prepared, decision)
						choices = append(choices, gamekernel.SeatChoice{Seat: seat, CandidateID: decision.SelectedCandidateID})
					}
					op = sessions.SealedOperation{Kind: "sealed", WindowID: node.WindowID, Choices: choices}
				case "automatic":
					op = sessions.AutomaticOperation{Kind: "automatic", TransitionID: node.TransitionID}
				case "round-complete":
					rounds++
					if rounds == 2 {
						step = 220
						continue
					}
					op = sessions.ContinueOperation{Kind: "continue-round"}
				case "chance":
					material := codecJSON(t, map[string]any{"kind": "deal", "deck": codecDeck()})
					op = sessions.ChanceOperation{Kind: "chance", RequestID: node.RequestID, Material: material}
				default:
					t.Fatalf("unexpected node %s", node.Kind)
				}
				raw, err := sessions.EncodeOperation(op)
				if err != nil {
					t.Fatal(err)
				}
				for _, decision := range prepared {
					if err = c.ValidateDecisionCommand(decision, raw); err != nil {
						t.Fatal(err)
					}
					decisions++
				}
				staged, err := c.StageTransition(doc, snap, raw)
				if err != nil {
					t.Fatal(err)
				}
				next, delta, err := c.AcceptStaged(doc, snap, raw, staged)
				if err != nil {
					t.Fatal(err)
				}
				mutated := staged.NextDocument()
				mutated.Checkpoint.State[0] = 'X'
				if staged.NextDocument().Checkpoint.State[0] == 'X' {
					t.Fatal("staged document alias")
				}
				command := CommandRecord{RecordVersion: RecordVersion, GameID: doc.Metadata.GameID, Revision: next.Revision, CommandID: fmt.Sprintf("command-%d", next.Revision), Command: raw}
				command.Digest, err = CommandDigest(command.GameID, command.Revision, command.Command)
				if err != nil {
					t.Fatal(err)
				}
				commands = append(commands, command)
				doc, snap = next, staged.NextSnapshot()
				events = append(events, delta...)
				if node.Kind == "chance" || node.Kind == "round-complete" || step%17 == 0 {
					reopened, status, err := c.Open(doc, events)
					if err != nil || !status.Playable {
						t.Fatalf("reopen: %v %+v", err, status)
					}
					old, _ := snap.Export()
					current, _ := reopened.Export()
					if !bytes.Equal(old, current) {
						t.Fatal("compact reopen changed V2 state")
					}
					snap = reopened
				}
			}
			if rounds != 2 || decisions < 100 {
				t.Fatalf("incomplete two-hand execution: %d rounds, %d decisions", rounds, decisions)
			}
			replay, replayed, _, err := c.Replay(doc.Metadata, anchor, commands)
			if err != nil {
				t.Fatal(err)
			}
			before, _ := snap.Export()
			after, _ := replayed.Export()
			if !bytes.Equal(before, after) || !equalCheckpoint(doc.Checkpoint, replay.Checkpoint) {
				t.Fatal("V2 exact operation replay mismatch")
			}
		})
	}
}

func TestM04CStrictBindingsAndHistoricalOriginalBytes(t *testing.T) {
	c, doc, _, events, snap := serviceStart(t, "spades-partners")
	decision := serviceDecision(t, c, doc, snap, 1)
	issuedAnalysis, issuedAdvice := bytes.Clone(decision.Analysis), bytes.Clone(decision.Advice)
	packet, _, _, err := c.PermittedInput(doc, snap, 1)
	if err != nil {
		t.Fatal(err)
	}
	packetOnlyDigest, err := JSONDigest(packet)
	if err != nil {
		t.Fatal(err)
	}
	wrongDigest := decision
	wrongDigest.InputDigest = packetOnlyDigest
	if packetOnlyDigest == decision.InputDigest || c.ValidateDecision(doc, snap, wrongDigest) == nil {
		t.Fatal("V2 preparation admitted an observation-only V1-style digest")
	}
	originalAnalysis, originalAdvice, err := OriginalDecision(decision)
	if err != nil {
		t.Fatal(err)
	}
	if len(originalAnalysis.Original.Reasons) == 0 || len(originalAdvice.Original.ReasonIDs) == 0 {
		t.Fatal("full reasoning lost")
	}
	for _, change := range []func(*DecisionRecord){
		func(v *DecisionRecord) { v.InputDigest = fmt.Sprintf("%064d", 0) }, func(v *DecisionRecord) { v.PacketVersion = "1.0.0" }, func(v *DecisionRecord) { v.Policy.BudgetVersion = "new" }, func(v *DecisionRecord) { v.SelectedCandidateID = "bid:13" }, func(v *DecisionRecord) { v.Actor = 2 },
	} {
		mutated := decision
		change(&mutated)
		if err = c.ValidateDecision(doc, snap, mutated); err == nil {
			t.Fatal("accepted altered original binding")
		}
	}
	altered := originalAnalysis
	altered.Original.Action = d.Action{Kind: "bid", Seat: 1, Bid: 13}
	invalid := decision
	invalid.Analysis = codecJSON(t, altered)
	if _, _, err = OriginalDecision(invalid); err == nil {
		t.Fatal("accepted changed full original action")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = c.PrepareDecision(ctx, doc, snap, 1, "canceled"); err != context.Canceled {
		t.Fatal("canceled preparation executed", err)
	}
	raw, err := sessions.EncodeOperation(sessions.ActorOperation{Kind: "actor", Seat: 1, CandidateID: decision.SelectedCandidateID})
	if err != nil {
		t.Fatal(err)
	}
	staged, err := c.StageTransition(doc, snap, raw)
	if err != nil {
		t.Fatal(err)
	}
	other, _, err := c.Open(doc, events)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = c.AcceptStaged(doc, other, raw, staged); err == nil {
		t.Fatal("staged origin substitution accepted")
	}
	if _, _, err = c.AcceptStaged(doc, snap, []byte(`{"kind":"actor","seat":1,"candidateId":"bid:13"}`), staged); err == nil {
		t.Fatal("staged operation substitution accepted")
	}
	c.policies = nil
	if _, _, err = c.AcceptStaged(doc, snap, raw, staged); err == nil {
		t.Fatal("staged transition bypassed unavailable execution policy")
	}
	reopened, status, err := c.Open(doc, events)
	if err != nil || status.Playable {
		t.Fatal("uninstalled policy became playable", err)
	}
	if err = c.ValidateHistoricalDecisionAt(doc, reopened, decision); err != nil {
		t.Fatal("original historical reader failed", err)
	}
	if _, err = c.PrepareDecision(context.Background(), doc, reopened, 1, "new"); err == nil {
		t.Fatal("historical pin executed")
	}
	if !bytes.Equal(decision.Analysis, issuedAnalysis) || !bytes.Equal(decision.Advice, issuedAdvice) {
		t.Fatal("historical bytes changed")
	}
}

func TestM04CFrozenOriginalReaderRejectsChangedViewsAndActions(t *testing.T) {
	c, doc, _, _, snap := serviceStart(t, "spades-partners")
	decision := serviceDecision(t, c, doc, snap, 1)
	for _, level := range []int{0, 1, 2} {
		for _, field := range []string{"consideredCards", "consideredBids"} {
			bad := decision
			bad.Advice = codecMutate(t, decision.Advice, func(v map[string]any) {
				view := v["levels"].([]any)[level].(map[string]any)
				if field == "consideredCards" {
					view[field] = []any{"C2", "C3"}
				} else {
					view[field] = []any{0, 1}
				}
			})
			if _, _, err := OriginalDecision(bad); err == nil {
				t.Fatalf("accepted changed level %d %s", level+1, field)
			}
		}
	}
	_, cue, err := OriginalDecision(decision)
	if err != nil {
		t.Fatal(err)
	}
	cue.Original.CueVersion = d.Ptr("1.0.0")
	cue.Original.Outcome = "suggestion"
	cue.Original.Explanation = "supported"
	for i := range cue.Levels {
		cue.Levels[i], err = coaching.ProjectAdvice(cue.Original, i+1, decision.ID)
		if err != nil {
			t.Fatal(err)
		}
	}
	withCue := decision
	withCue.Advice = codecJSON(t, cue)
	if _, _, err = OriginalDecision(withCue); err != nil {
		t.Fatal("valid frozen cue view rejected", err)
	}
	for _, field := range []string{"cueVersion", "policyVersion", "evidence", "outcome", "explanation"} {
		bad := withCue
		bad.Advice = codecMutate(t, withCue.Advice, func(v map[string]any) {
			view := v["levels"].([]any)[0].(map[string]any)
			if field == "outcome" {
				view[field] = "several-reasonable"
			} else if field == "explanation" {
				view[field] = "facts-only"
			} else if field == "evidence" {
				view[field] = "sampled-estimate"
			} else {
				view[field] = "changed"
			}
		})
		if _, _, err = OriginalDecision(bad); err == nil {
			t.Fatalf("accepted changed original cue %s", field)
		}
	}
	for _, mutateCandidate := range []bool{false, true} {
		for _, change := range []func(map[string]any){
			func(a map[string]any) { a["kind"] = "bogus" },
			func(a map[string]any) { a["bid"] = 14 },
			func(a map[string]any) { a["card"] = "C2" },
		} {
			bad := decision
			bad.Analysis = codecMutate(t, decision.Analysis, func(v map[string]any) {
				original := v["original"].(map[string]any)
				action := original["action"].(map[string]any)
				if mutateCandidate {
					action = original["candidates"].([]any)[0].(map[string]any)["action"].(map[string]any)
				}
				change(action)
			})
			if _, _, err = OriginalDecision(bad); err == nil {
				t.Fatal("accepted malformed original action", mutateCandidate)
			}
		}
	}
	for _, action := range []d.Action{{Kind: "play", Seat: 0, Card: "not-a-card"}, {Kind: "pass", Seat: 0, Cards: []string{"C2", "C2", "C3"}}, {Kind: "pass", Seat: 0, Cards: []string{"C2", "C3"}}} {
		if validateOriginalAction(action) == nil {
			t.Fatal("invalid original card action accepted")
		}
	}
}
func TestM04CV1NeverImplicitlyRepinned(t *testing.T) {
	c, err := NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	old := codecFixture(t, "hearts")
	doc, _, events, _ := codecStart(t, old, "hearts")
	snap, status, err := c.Open(doc, events)
	if err != nil || status.Playable {
		t.Fatal("V1 service disposition", err)
	}
	if doc.Metadata.Pin.ModuleVersion != "1.0.0" {
		t.Fatal("repinned old metadata")
	}
	if _, err = c.Session(doc, snap); err == nil {
		t.Fatal("V1 silently became a V2 session")
	}
	if _, err = c.PrepareDecision(context.Background(), doc, snap, 0, "new"); err == nil {
		t.Fatal("V1 silently executed V2 policy")
	}
	var hot map[string]json.RawMessage
	if err = json.Unmarshal(doc.Checkpoint.State, &hot); err != nil {
		t.Fatal(err)
	}
}

func TestM04CStrictCompactArchiveAndOperationBoundary(t *testing.T) {
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			c, doc, _, events, _ := serviceStart(t, mode)
			for name, change := range map[string]func(map[string]any){
				"null-archive": func(v map[string]any) { v["events"] = nil },
				"embedded-archive": func(v map[string]any) {
					v["events"] = []any{map[string]any{"id": 1, "type": "hand-started", "message": "unbound"}}
				},
				"old-pin":    func(v map[string]any) { v["moduleVersion"] = "1.0.0" },
				"other-game": func(v map[string]any) { v["id"] = "other-game" },
			} {
				bad := doc
				bad.Checkpoint.State = codecMutate(t, doc.Checkpoint.State, change)
				if err := c.ValidateDocument(bad); err == nil {
					t.Fatalf("accepted compact %s", name)
				}
				if _, _, err := c.Open(bad, events); err == nil {
					t.Fatalf("opened compact %s", name)
				}
			}
		})
	}
	for _, raw := range []string{
		`{"kind":"actor","seat":1,"candidateId":"bid:3","hands":[[]]}`,
		`{"kind":"actor","seat":1,"candidateId":"bid:3","seat":0}`,
		`{"kind":"sealed","windowId":"pass","choices":[{"seat":0,"candidateId":"pass:C2,C3,C4"},{"seat":0,"candidateId":"pass:C5,C6,C7"}]}`,
		`{"type":"next-hand","deal":[]}`,
	} {
		if _, err := sessions.DecodeOperation([]byte(raw)); err == nil {
			t.Fatalf("accepted wrong V2 operation %s", raw)
		}
	}
}
