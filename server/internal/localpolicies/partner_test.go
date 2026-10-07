package localpolicies

import (
	"cardford/server/internal/games/spades/reasoning"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
	"context"
	"testing"
)

func TestPartnerInstallationRetainsExactPolicyAcrossRestart(t *testing.T) {
	selector := sessions.Selector{GameID: "spades", VariantID: "partners", ModuleVersion: "2.0.0", RuleProfileID: records.OriginalPin("spades-partners").RuleProfileID}
	codec, err := records.NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	baseline, err := codec.MetadataForNew(selector, "old-game", "owner")
	if err != nil {
		t.Fatal(err)
	}
	if err = InstallPartner(codec, true); err != nil {
		t.Fatal(err)
	}
	trial, err := codec.MetadataForNew(selector, "new-game", "owner")
	if err != nil || trial.Policy.ID != reasoning.PartnerResourcePolicy {
		t.Fatal(trial.Policy, err)
	}
	if baseline.Policy.ID == trial.Policy.ID {
		t.Fatal("old metadata changed")
	}
	installation, err := codec.ServiceRegistry().Installation(selector)
	if err != nil {
		t.Fatal(err)
	}
	config, material, err := installation.Bootstrap("new-game")
	if err != nil {
		t.Fatal(err)
	}
	doc, _, events, err := codec.StartMaterial(trial, config, material)
	if err != nil {
		t.Fatal(err)
	}
	restarted, err := records.NewServiceCodec()
	if err != nil {
		t.Fatal(err)
	}
	if err = InstallPartner(restarted, false); err != nil {
		t.Fatal(err)
	}
	current, err := restarted.PolicyForNew(selector)
	if err != nil || current.ID != baseline.Policy.ID {
		t.Fatal("new games did not return to original", err)
	}
	snapshot, status, err := restarted.Open(doc, events)
	if err != nil || !status.Playable {
		t.Fatal("experimental saved game lost executor", status, err)
	}
	session, err := restarted.Session(doc, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	node, err := session.Node()
	if err != nil || node.Seat == nil {
		t.Fatal(node, err)
	}
	result, err := restarted.PrepareDecision(context.Background(), doc, snapshot, *node.Seat, "saved-trial-decision")
	if err != nil || result.Prepared.CandidateID == "" {
		t.Fatal("saved exact policy failed preparation", err)
	}
	binding, err := restarted.PreparationInput(doc, snapshot, *node.Seat)
	if err != nil {
		t.Fatal(err)
	}
	unit, err := restarted.CurrentUnitID(doc, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	purpose := "bot-action"
	if *node.Seat == 0 {
		purpose = "human-analysis"
	}
	decision := records.DecisionRecord{RecordVersion: records.RecordVersion, ID: "saved-trial-decision", OwnerID: "owner", GameID: "new-game", Revision: doc.Revision, Actor: *node.Seat, WindowID: binding.WindowID, Purpose: purpose, PacketVersion: binding.PacketVersion, InputDigest: binding.InputDigest, Policy: doc.Metadata.Policy, SelectedCandidateID: result.Prepared.CandidateID, AnalysisSchema: result.AnalysisSchema, Analysis: result.Analysis, AdviceSchema: result.AdviceSchema, Advice: result.Advice, Access: records.AccessAdmission{OwnerID: "owner", Generation: 1, ControlRevision: 1, GrantID: "grant", UnitID: unit}, ReceiptID: "receipt", AttemptID: "attempt", AttemptFence: 1}
	if err = restarted.ValidateDecision(doc, snapshot, decision); err != nil {
		t.Fatal("strict stored analysis/advice rejected trial", err)
	}
}
