package coachlab

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestBlindExportRejectsInjectedSecretsAndOmitsAnswer(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	a, _ := NewAdapter(e.Lab.Selector)
	s, err := NewEpisodeState(e, EpisodeSpecs(e)[0], a)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := s.Session.Node()
	p, err := PrepareRecord(context.Background(), s, *n.Seat)
	if err != nil {
		t.Fatal(err)
	}
	packet, err := ExportBlindPacket(p.Decision)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(packet)
	for _, secret := range []string{e.Base.Families[0].Seed, p.Decision.FamilyID, p.Decision.EpisodeID, p.Decision.PolicyPin.ID, p.Decision.InputDigest, "selectedCandidateId", "originalAdvice", "originalAnalysis"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("blind packet contains %s", secret)
		}
	}
	var actor map[string]any
	_ = json.Unmarshal(p.Decision.ActorPacket, &actor)
	actor["hiddenHands"] = []any{"secret"}
	p.Decision.ActorPacket, _ = json.Marshal(actor)
	if _, err = ExportBlindPacket(p.Decision); err == nil {
		t.Fatal("blind export accepted secret field")
	}
}
func TestAuditRejectsLegalActionDifferentFromOriginal(t *testing.T) {
	e := testEnvelope(t, "hearts-solo")
	a, _ := NewAdapter(e.Lab.Selector)
	s, _ := NewEpisodeState(e, EpisodeSpecs(e)[0], a)
	p, err := PrepareRecord(context.Background(), s, 0)
	if err != nil {
		t.Fatal(err)
	}
	p.Decision.SelectedCandidateID = "pass:C2,C3,C4"
	if AuditDecision(p.Decision, p.Decision.ActorObservation).Status != "failed" {
		t.Fatal("accepted substitute action")
	}
}

func TestAuditRetainsPassedCodeChecksAndPendingSemantics(t *testing.T) {
	e := testEnvelope(t, "hearts-solo")
	a, _ := NewAdapter(e.Lab.Selector)
	s, err := NewEpisodeState(e, EpisodeSpecs(e)[0], a)
	if err != nil {
		t.Fatal(err)
	}
	p, err := PrepareRecord(context.Background(), s, 0)
	if err != nil {
		t.Fatal(err)
	}
	if p.Decision.Audit.Status != "partially-checkable" {
		t.Fatal("code-audited original reported as wholly pending", p.Decision.Audit)
	}
	passed, pending := 0, 0
	for _, check := range p.Decision.Audit.Checks {
		if check.Status == "passed" {
			passed++
		}
		if check.Status == "pending" {
			pending++
		}
	}
	if passed == 0 || pending == 0 {
		t.Fatal("audit conflated code checks and strategy review")
	}
}
