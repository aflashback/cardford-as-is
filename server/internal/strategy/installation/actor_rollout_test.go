package installation

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

func selector(mode string) sessions.Selector {
	p := records.OriginalPin(mode)
	return sessions.Selector{GameID: p.GameID, VariantID: p.VariantID, ModuleVersion: "2.0.0", RuleProfileID: p.RuleProfileID}
}
func start(t *testing.T, c *records.DocumentCodec, mode string) (records.Document, []records.EventRecord, gamekernel.Snapshot) {
	t.Helper()
	m, e := c.MetadataForNew(selector(mode), "rollout-test", "owner")
	if e != nil {
		t.Fatal(e)
	}
	doc, _, events, e := c.Start(m, []byte(`{"id":"rollout-test","dealer":0}`), d.FullDeck())
	if e != nil {
		t.Fatal(e)
	}
	s, status, e := c.Open(doc, events)
	if e != nil || !status.Playable {
		t.Fatalf("open: %v %+v", e, status)
	}
	return doc, events, s
}
func prepare(t *testing.T, c *records.DocumentCodec, doc records.Document, s gamekernel.Snapshot, actor int) records.DecisionRecord {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	binding, e := c.PreparationInput(doc, s, actor)
	if e != nil {
		t.Fatal(e)
	}
	result, e := c.PrepareDecision(ctx, doc, s, actor, "rollout-decision")
	if e != nil {
		t.Fatal(e)
	}
	unit, e := c.CurrentUnitID(doc, s)
	if e != nil {
		t.Fatal(e)
	}
	purpose := "bot-action"
	if actor == 0 {
		purpose = "human-analysis"
	}
	record := records.DecisionRecord{RecordVersion: records.RecordVersion, ID: "rollout-decision", OwnerID: "owner", GameID: doc.Metadata.GameID, Revision: doc.Revision, Actor: actor, WindowID: binding.WindowID, Purpose: purpose, PacketVersion: binding.PacketVersion, InputDigest: binding.InputDigest, Policy: doc.Metadata.Policy, SelectedCandidateID: result.Prepared.CandidateID, AnalysisSchema: result.AnalysisSchema, Analysis: result.Analysis, AdviceSchema: result.AdviceSchema, Advice: result.Advice, Access: records.AccessAdmission{OwnerID: "owner", Generation: 1, ControlRevision: 1, GrantID: "grant", UnitID: unit}, ReceiptID: "receipt", AttemptID: "attempt", AttemptFence: 1}
	if e = c.ValidateDecision(doc, s, record); e != nil {
		t.Fatal(e)
	}
	return record
}

func TestActorRolloutInstallationIsOptionalAndRepeatable(t *testing.T) {
	c, e := records.NewServiceCodec()
	if e != nil {
		t.Fatal(e)
	}
	for _, enabled := range []bool{false, true, true, false} {
		if e = InstallActorRollout(c, enabled); e != nil {
			t.Fatal(e)
		}
		for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
			p, e := c.PolicyForNew(selector(mode))
			if e != nil {
				t.Fatal(e)
			}
			original, _ := records.ServicePolicy(selector(mode))
			if enabled && p.ID != "actor-rollout-2.0.0" {
				t.Fatal("experimental selection missing")
			}
			if !enabled && !reflect.DeepEqual(p, original) {
				t.Fatal("original new-session pin changed")
			}
		}
	}
}
func TestActorRolloutCompletePreparationAndOriginalAdvice(t *testing.T) {
	for _, mode := range []string{"spades-solo", "spades-partners", "hearts"} {
		t.Run(mode, func(t *testing.T) {
			c, e := records.NewServiceCodec()
			if e != nil {
				t.Fatal(e)
			}
			if e = InstallActorRollout(c, true); e != nil {
				t.Fatal(e)
			}
			doc, events, s := start(t, c, mode)
			before, _ := s.Export()
			record := prepare(t, c, doc, s, 1)
			a, advice, e := records.OriginalDecision(record)
			if e != nil {
				t.Fatal(e)
			}
			if a.Original.PolicyVersion != "actor-rollout-2.0.0" || advice.Original.PolicyVersion != a.Original.PolicyVersion || d.ActionID(a.Original.Action) != record.SelectedCandidateID {
				t.Fatal("coach and bot do not share original selection")
			}
			var detail map[string]json.RawMessage
			if e = json.Unmarshal(record.Analysis, &detail); e != nil {
				t.Fatal(e)
			}
			if len(detail["rollout"]) == 0 {
				t.Fatal("full rollout provenance/work metadata missing")
			}
			after, _ := s.Export()
			if !bytes.Equal(before, after) {
				t.Fatal("preparation advanced live game")
			}
			fresh, e := records.NewServiceCodec()
			if e != nil {
				t.Fatal(e)
			}
			if e = InstallActorRollout(fresh, false); e != nil {
				t.Fatal(e)
			}
			reopened, status, e := fresh.Open(doc, events)
			if e != nil || !status.Playable {
				t.Fatalf("pinned restart failed: %v %+v", e, status)
			}
			if e = fresh.ValidateDecision(doc, reopened, record); e != nil {
				t.Fatal(e)
			}
		})
	}
}
func TestActorRolloutCancelledWorkProducesNoDecision(t *testing.T) {
	c, e := records.NewServiceCodec()
	if e != nil {
		t.Fatal(e)
	}
	if e = InstallActorRollout(c, true); e != nil {
		t.Fatal(e)
	}
	doc, _, s := start(t, c, "spades-partners")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result, e := c.PrepareDecision(ctx, doc, s, 1, "cancelled-decision")
	if e == nil || len(result.Analysis) != 0 || result.Prepared.CandidateID != "" {
		t.Fatal("canceled computation produced persistable analysis")
	}
}

func TestActorRolloutMetadataTamperingRejected(t *testing.T) {
	c, e := records.NewServiceCodec()
	if e != nil {
		t.Fatal(e)
	}
	if e = InstallActorRollout(c, true); e != nil {
		t.Fatal(e)
	}
	doc, _, s := start(t, c, "spades-partners")
	record := prepare(t, c, doc, s, 1)
	for _, name := range []string{"missing", "budget", "coverage", "selection", "provenance", "candidate-pair", "estimate", "public-estimate", "input-digest", "concealed-world"} {
		t.Run(name, func(t *testing.T) {
			altered := record
			var a d.PreparedAnalysisEnvelope
			if e = json.Unmarshal(record.Analysis, &a); e != nil {
				t.Fatal(e)
			}
			switch name {
			case "missing":
				a.Rollout = nil
			case "budget":
				a.Rollout.Budget.MaxWorlds++
			case "coverage":
				a.Rollout.Result.Coverage.Completed--
			case "selection":
				a.Rollout.Result.SelectedID = d.Ptr("bid:999")
			case "provenance":
				a.Rollout.Result.Provenance.Continuation.Version = "unknown"
			case "candidate-pair":
				a.Rollout.Result.Coverage.Candidates[0].Completed--
			case "estimate":
				a.Rollout.Result.Results[0].Estimates[0].Unit = "probability"
			case "public-estimate":
				var registered map[string]any
				json.Unmarshal(a.Registered, &registered)
				registered["estimates"].([]any)[0].(map[string]any)["value"] = 99999.0
				a.Registered, _ = json.Marshal(registered)
			case "input-digest":
				a.Rollout.Result.Provenance.PermittedInputDigest = string(bytes.Repeat([]byte("0"), 64))
			}
			altered.Analysis, _ = json.Marshal(a)
			if name == "concealed-world" {
				var raw map[string]any
				json.Unmarshal(altered.Analysis, &raw)
				raw["rollout"].(map[string]any)["result"].(map[string]any)["concealedWorld"] = map[string]any{"hands": "forbidden"}
				altered.Analysis, _ = json.Marshal(raw)
			}
			if e = c.ValidateDecision(doc, s, altered); e == nil {
				t.Fatal("invalid saved rollout metadata accepted")
			}
		})
	}
}
func TestActorRolloutRestartExecutesSavedPolicyWithOriginalDefaults(t *testing.T) {
	c, e := records.NewServiceCodec()
	if e != nil {
		t.Fatal(e)
	}
	if e = InstallActorRollout(c, true); e != nil {
		t.Fatal(e)
	}
	doc, events, s := start(t, c, "spades-solo")
	before := prepare(t, c, doc, s, 1)
	fresh, e := records.NewServiceCodec()
	if e != nil {
		t.Fatal(e)
	}
	if e = InstallActorRollout(fresh, false); e != nil {
		t.Fatal(e)
	}
	reopened, _, e := fresh.Open(doc, events)
	if e != nil {
		t.Fatal(e)
	}
	after := prepare(t, fresh, doc, reopened, 1)
	if !bytes.Equal(before.Analysis, after.Analysis) || !bytes.Equal(before.Advice, after.Advice) {
		t.Fatal("saved policy changed after restart with original new-session selection")
	}
}
