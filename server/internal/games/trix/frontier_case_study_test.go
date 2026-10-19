package trix

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type frontierCounterexampleDelta struct {
	CandidateID string  `json:"candidateId"`
	VersusDJ    float64 `json:"versusDJ"`
	VersusPrior float64 `json:"versusPriorHistorySelection"`
}

type frontierCounterexamplePopulation struct {
	Population          layoutStudyPopulation         `json:"population"`
	Roots               []layoutStudyFinish           `json:"roots"`
	Deltas              []frontierCounterexampleDelta `json:"deltas"`
	SelectedVersusDJ    float64                       `json:"selectedVersusDJ"`
	SelectedVersusPrior float64                       `json:"selectedVersusPriorHistorySelection"`
}

type frontierCounterexampleCase struct {
	ID                string                             `json:"id"`
	SourceWorld       string                             `json:"sourceWorld"`
	StateDigest       string                             `json:"stateDigest"`
	ObservationDigest string                             `json:"observationDigest"`
	OriginalSelection string                             `json:"originalReference"`
	PriorSelection    string                             `json:"priorHistorySelection"`
	SelectedCandidate string                             `json:"frontierSelection"`
	Trace             DecisionTrace                      `json:"frontierTrace"`
	Populations       []frontierCounterexamplePopulation `json:"populations"`
}

// Opt-in diagnostic over retained selected counterexamples, never a passing
// strength gate. All native legal alternatives are retained, including harm.
func TestFrontierRetainedCounterexampleDiagnostic(t *testing.T) {
	input, output := os.Getenv("TRIX_FRONTIER_COUNTEREXAMPLE_INPUT"), os.Getenv("TRIX_FRONTIER_COUNTEREXAMPLE_OUTPUT")
	if input == "" && output == "" {
		t.Skip("opt-in retained-case diagnostic: set TRIX_FRONTIER_COUNTEREXAMPLE_INPUT and TRIX_FRONTIER_COUNTEREXAMPLE_OUTPUT")
	}
	if input == "" || output == "" {
		t.Fatal("both counterexample paths are required")
	}
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	inputHash := sha256.Sum256(raw)
	var archive layoutStudyOutput
	if err = json.Unmarshal(raw, &archive); err != nil {
		t.Fatal(err)
	}
	if archive.SchemaVersion != "trix-layout-case-study-1.0.0" || archive.Status != "completed" || len(archive.Nearby) != 8 {
		t.Fatal("expected the completed study with eight retained nearby cases")
	}
	fixture, packet, err := readLayoutStudyFixture("testdata/layout-jacks-jd-s10.json")
	if err != nil {
		t.Fatal(err)
	}
	retainedFixture, namedFixture := archive.Fixture, fixture
	retainedFixture.ActorPacket, namedFixture.ActorPacket = nil, nil
	var retainedPacket layoutStudyPacket
	if err = json.Unmarshal(archive.Fixture.ActorPacket, &retainedPacket); err != nil {
		t.Fatal(err)
	}
	retainedPacketBytes, _ := json.Marshal(retainedPacket)
	namedPacketBytes, _ := json.Marshal(packet)
	if !reflect.DeepEqual(retainedFixture, namedFixture) || !reflect.DeepEqual(retainedPacketBytes, namedPacketBytes) {
		t.Fatal("retained archive no longer binds the immutable actor fixture")
	}
	archivedTrace, err := BuildDecisionTrace(packet.Observation, FrontierPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	if archivedTrace.SelectedCandidateID != "layout:HK" || archive.Selections[PolicyID] != "layout:DJ" {
		t.Fatal("archived candidate or original reference changed")
	}
	populations := append(layoutStudyPopulations(), layoutStudyPopulation{ID: "frontier", Policies: [4]string{FrontierPolicyID, FrontierPolicyID, FrontierPolicyID, FrontierPolicyID}})
	result := struct {
		SchemaVersion string                       `json:"schemaVersion"`
		Status        string                       `json:"status"`
		InputSHA256   string                       `json:"inputSHA256"`
		ArchivedTrace DecisionTrace                `json:"archivedRootFrontierTrace"`
		Cases         []frontierCounterexampleCase `json:"cases"`
		Continuations int                          `json:"continuations"`
		Work          EvaluationWork               `json:"work"`
		Limitations   []string                     `json:"limitations"`
	}{SchemaVersion: "trix-frontier-counterexamples-1.0.0", Status: "incomplete", InputSHA256: hex.EncodeToString(inputHash[:]), ArchivedTrace: archivedTrace, Cases: []frontierCounterexampleCase{}, Limitations: []string{
		"Eight selected nearby synthetic counterexamples, not independent origin families, representative frequencies, a calibrated belief model, or strength evidence.",
		"All legal roots and five continuation populations share each unchanged retained synthetic state. Every future selector receives only its own native observation.",
		"The original archived root chooses HK under frontier; HK is already played in these nearby cases, so each case records its own legal frontier selection.",
		"Deltas are native request-end team margins conditional on each state and continuation population. Adverse and zero outcomes are retained without gating completion on improvement.",
		"Historical module 2.1/public 1.1 remains pinned; later chronology is never inserted into archived actor inputs.",
	}}
	file, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		encoded, encodeErr := json.MarshalIndent(result, "", "  ")
		if encodeErr == nil {
			_, encodeErr = file.Write(append(encoded, '\n'))
		}
		if closeErr := file.Close(); encodeErr == nil {
			encodeErr = closeErr
		}
		if encodeErr != nil {
			t.Error(encodeErr)
		}
	}()
	c := DefaultRequestEvaluationConfig()
	c.MaxSteps = 100000
	meter := &evaluationMeter{ctx: context.Background(), config: c, work: &result.Work}
	seen := map[string]bool{}
	for _, nearby := range archive.Nearby {
		if seen[nearby.ID] || nearby.ID == "" {
			t.Fatal("duplicate or empty retained case identity")
		}
		seen[nearby.ID] = true
		if err = validateState(nearby.State); err != nil {
			t.Fatal(nearby.ID, err)
		}
		if pinForConfig(nearby.State.Config) != nearby.Pin || nearby.Pin != fixture.Pin || nearby.State.LayoutHistory != nil {
			t.Fatal(nearby.ID, "changed historical state/profile")
		}
		o := Observe(nearby.State, nearby.State.Turn)
		stateBytes, _ := json.Marshal(nearby.State)
		stateHash := sha256.Sum256(stateBytes)
		actualObservation, _ := json.Marshal(o)
		retainedObservation, _ := json.Marshal(nearby.Observation)
		if !reflect.DeepEqual(actualObservation, retainedObservation) {
			t.Fatal(nearby.ID, "native actor observation differs from retained bytes")
		}
		prior, priorErr := DecideWithPolicy(o, HistoryPolicyID)
		if priorErr != nil || ActionID(prior) != nearby.OriginalSelection {
			t.Fatal(nearby.ID, "historical selection changed", priorErr)
		}
		trace, traceErr := BuildDecisionTrace(o, FrontierPolicyID)
		if traceErr != nil {
			t.Fatal(nearby.ID, traceErr)
		}
		if err = ValidateDecisionTraceWithPin(o, trace, nearby.Pin); err != nil {
			t.Fatal(nearby.ID, err)
		}
		entry := frontierCounterexampleCase{ID: nearby.ID, SourceWorld: nearby.SourceWorld, StateDigest: hex.EncodeToString(stateHash[:]), ObservationDigest: observationDigest(o), OriginalSelection: "layout:DJ", PriorSelection: ActionID(prior), SelectedCandidate: trace.SelectedCandidateID, Trace: trace, Populations: []frontierCounterexamplePopulation{}}
		for _, population := range populations {
			roots, rootErr := layoutStudyRoots(nearby.State, o.Seat, population, meter)
			if rootErr != nil {
				t.Fatal(nearby.ID, rootErr)
			}
			if population.ID == "baseline" && !reflect.DeepEqual(roots, nearby.Roots) {
				t.Fatal(nearby.ID, "retained baseline root outcomes changed")
			}
			row := frontierCounterexamplePopulation{Population: population, Roots: roots, Deltas: []frontierCounterexampleDelta{}}
			for _, root := range roots {
				versusDJ, okDJ := layoutStudyDifference(roots, root.CandidateID, "layout:DJ")
				versusPrior, okPrior := layoutStudyDifference(roots, root.CandidateID, entry.PriorSelection)
				if !okDJ || !okPrior || len(root.FinishOrder) != 4 || len(root.TeamScores) != 2 {
					t.Fatal(nearby.ID, "incomplete legal-root scores or references")
				}
				row.Deltas = append(row.Deltas, frontierCounterexampleDelta{root.CandidateID, versusDJ, versusPrior})
			}
			row.SelectedVersusDJ, _ = layoutStudyDifference(roots, entry.SelectedCandidate, "layout:DJ")
			row.SelectedVersusPrior, _ = layoutStudyDifference(roots, entry.SelectedCandidate, entry.PriorSelection)
			entry.Populations = append(entry.Populations, row)
			result.Continuations += len(roots)
			t.Logf("%s %s selected=%s prior=%s deltaDJ=%+.0f deltaPrior=%+.0f roots=%d", entry.ID, population.ID, entry.SelectedCandidate, entry.PriorSelection, row.SelectedVersusDJ, row.SelectedVersusPrior, len(roots))
		}
		afterState, _ := json.Marshal(nearby.State)
		if !reflect.DeepEqual(stateBytes, afterState) {
			t.Fatal(nearby.ID, "root comparison mutated the retained state")
		}
		result.Cases = append(result.Cases, entry)
		result.Work.Worlds++
	}
	afterInput, err := os.ReadFile(input)
	if err != nil || sha256.Sum256(afterInput) != inputHash {
		t.Fatal("input archive changed during diagnostic", err)
	}
	result.Status = "completed"
}
