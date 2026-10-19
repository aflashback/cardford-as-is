package coachlab

import (
	"encoding/json"
	"strings"
	"testing"
)

func testEnvelope(t *testing.T, variant string) RunEnvelope {
	t.Helper()
	policy, version, game, sub, profile := "spades-tactics-2.1.0", "2.1.0", "spades", "partners", "spades-training-1.0.0"
	if variant == "spades-solo" {
		sub = "solo"
		profile = "spades-solo-training-1.0.0"
	}
	if variant == "hearts-solo" {
		policy, version, game, sub, profile = "hearts-baseline-1.0.0", "1.0.0", "hearts", "solo", "hearts-training-1.0.0"
	}
	h := strings.Repeat("a", 64)
	raw := `{"schemaVersion":"coach-lab-run-1.0.0","runId":"test-lab","base":{"schemaVersion":"multi-game-evaluation-1.0.0","id":"test-lab","purpose":"development","variant":"` + variant + `","ruleProfile":{"id":"` + profile + `","hash":"` + h + `"},"candidate":{"id":"` + policy + `","hash":"` + h + `"},"reference":{"id":"` + policy + `","hash":"` + h + `"},"sourceHashes":{"go.mod":"` + h + `"},"objective":"terminal-winner","horizon":"complete-match","corpus":null,"families":[{"id":"fresh-1","split":"discovery","seed":"private-test-seed","sealed":false}],"rotations":[0],"seatAssignments":{"candidate":[0],"reference":[0]},"environments":["fixed-seat-policies-1.0.0"],"primaryEstimand":"paired-competitor-win","usefulGain":null,"maximumHarm":null,"powerRationale":null,"multiplicityAdjustment":null,"sampleSize":null,"stoppingRule":"fixed families","missingRunHandling":"retain incomplete","maxWallMs":60000,"maxDecisionMs":5000,"maxDecisions":10000,"promotionAuthority":null},"lab":{"sourceIdentity":{"sourceDigest":"` + h + `","binaryDigest":"` + h + `"},"selector":{"gameId":"` + game + `","variantId":"` + sub + `","moduleVersion":"2.0.0","ruleProfileId":"` + profile + `"},"config":{"id":"lab-game","dealer":0},"seatPolicies":[],"caps":{"maxRounds":100,"maxActions":10000,"maxTransitions":20000,"maxWallMs":60000},"judge":{"mode":"fixture","authorizedUsd":0},"familyRoles":[{"id":"fresh-1","role":"development"}]}}`
	var e RunEnvelope
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		t.Fatal(err)
	}
	for seat := 0; seat < 4; seat++ {
		e.Lab.SeatPolicies = append(e.Lab.SeatPolicies, SeatPolicyPin{Seat: seat, ID: policy, Version: version})
	}
	return e
}

func TestDecodeRunStrictAdmission(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	raw, _ := json.Marshal(e)
	if _, err := DecodeRun(raw); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*RunEnvelope){
		func(e *RunEnvelope) { e.Lab.SeatPolicies[0].ID = "learned-model" },
		func(e *RunEnvelope) { e.Lab.Caps.MaxActions = 0 },
		func(e *RunEnvelope) { e.Lab.Judge.AuthorizedUSD = 1 },
		func(e *RunEnvelope) { e.Lab.FamilyRoles = append(e.Lab.FamilyRoles, e.Lab.FamilyRoles[0]) },
		func(e *RunEnvelope) { e.Base.Purpose = "confirmation" },
		func(e *RunEnvelope) { e.Base.SeatAssignments.Reference = []int{1} },
	} {
		bad := testEnvelope(t, "spades-partners")
		mutate(&bad)
		b, _ := json.Marshal(bad)
		if _, err := DecodeRun(b); err == nil {
			t.Fatalf("accepted unsafe manifest %s", b)
		}
	}
	var obj map[string]any
	_ = json.Unmarshal(raw, &obj)
	obj["hiddenOverride"] = "bad"
	b, _ := json.Marshal(obj)
	if _, err := DecodeRun(b); err == nil {
		t.Fatal("accepted unknown field")
	}
	if _, err := DecodeRun(append(raw, []byte(` {}`)...)); err == nil {
		t.Fatal("accepted trailing JSON")
	}
	duplicate := strings.Replace(string(raw), `"runId":"test-lab"`, `"runId":"test-lab","runId":"test-lab"`, 1)
	if _, err := DecodeRun([]byte(duplicate)); err == nil {
		t.Fatal("accepted duplicate JSON key")
	}
	missing := strings.Replace(string(raw), `"authorizedUsd":0,`, "", 1)
	missing = strings.Replace(missing, `,"authorizedUsd":0`, "", 1)
	if _, err := DecodeRun([]byte(missing)); err == nil {
		t.Fatal("accepted missing nested zero-valued field")
	}
}
