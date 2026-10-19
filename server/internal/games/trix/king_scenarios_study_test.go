package trix

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"
)

type kingScenarioInitialDecision struct {
	PolicyID            string         `json:"policyId"`
	SelectedCandidateID string         `json:"selectedCandidateId"`
	Trace               *DecisionTrace `json:"trace,omitempty"`
}
type kingScenarioInitialRecord struct {
	Seat        int                           `json:"seat"`
	Observation Observation                   `json:"observation"`
	Features    kingScenarioFeatures          `json:"features"`
	Decisions   []kingScenarioInitialDecision `json:"decisions"`
}
type kingScenarioStudyCase struct {
	ID                  string                        `json:"id"`
	PatternID           string                        `json:"patternId"`
	Witnesses           []kingScenarioWitnessIdentity `json:"witnesses"`
	InitialActorRecords []kingScenarioInitialRecord   `json:"initialActorRecords"`
	Runs                []kingScenarioRun             `json:"runs"`
}
type kingScenarioWitnessIdentity struct {
	ID                 string `json:"id"`
	ExpectedKingCaptor int    `json:"expectedKingCaptor"`
	PrefixPlayCount    int    `json:"prefixPlayCount"`
}
type kingScenarioStudy struct {
	SchemaVersion string                  `json:"schemaVersion"`
	Status        string                  `json:"status"`
	FixtureDigest string                  `json:"fixtureDigest"`
	Work          kingScenarioWork        `json:"work"`
	Cases         []kingScenarioStudyCase `json:"cases"`
	Limitations   []string                `json:"limitations"`
}

func kingScenarioWriteStudy(path string, study kingScenarioStudy) error {
	raw, err := json.MarshalIndent(study, "", "  ")
	if err != nil {
		return err
	}
	if len(raw)+1 > 256<<20 {
		return fmt.Errorf("king scenario output exceeds 256 MiB")
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("refusing existing or unavailable output: %w", err)
	}
	_, writeErr := f.Write(append(raw, '\n'))
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}

// Opt-in authored-case diagnostics. No allocation search or runtime admission.
func TestKingScenarioStudy(t *testing.T) {
	output := os.Getenv("TRIX_KING_SCENARIO_OUTPUT")
	if output == "" {
		t.Skip("opt-in authored King scenario study")
	}
	if _, err := os.Stat(output); !os.IsNotExist(err) {
		t.Fatal("refusing existing or unavailable study output")
	}
	corpus, digest := kingScenarioFixtures(t)
	study := kingScenarioStudy{SchemaVersion: "trix-king-scenario-study-1.0.0", Status: "incomplete", FixtureDigest: digest, Cases: []kingScenarioStudyCase{}, Limitations: []string{
		"Authored development distributions and legal witness prefixes are selected examples, not prevalence, calibrated probabilities, exhaustive hidden-world coverage or policy strength proof.",
		"Each policy receives only its current own-seat observation. Pattern identities, private outside hands, witness paths and expected captors never enter policy selection.",
		"Target king/complex requests and controlled declarations are imposed experiments; request suggestions and policy-selected actions remain separately recorded.",
		"Witness-authored-not-proof: the fixed independent prefix proves legal possibility and literal HK arithmetic; its remaining full-deal play follows the unchanged baseline policy.",
		"Solo uses own request points; Partners uses combined team request points. Complex full-request outcomes include trick, diamond and queen costs separately from the HK capture component.",
		"Focal actor records are separate scoped observations for seat zero and, only in Partners, seat two. Nonfocal card suggestions and hand-derived cues/facts are omitted; the owner request suggestion remains a labelled diagnostic. Legal counts/digests are private diagnostic instrumentation.",
		"No runtime policy, default, saved historical profile, model or provider changes are authorized by this evidence.",
	}}
	defer func() {
		if err := kingScenarioWriteStudy(output, study); err != nil {
			t.Error(err)
		}
	}()
	ctx := context.Background()
	if deadline, ok := t.Deadline(); ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithDeadline(ctx, deadline.Add(-time.Second))
		defer cancel()
	}
	profiles := []string{PolicyID, OwnershipComparisonPolicyID}
	variants := []string{"basic-solo", "complex-solo", "basic-partners", "complex-partners"}
	arms := []string{"natural-all-declarations", "controlled-HK-double", "controlled-decline"}
	for _, f := range corpus.Fixtures {
		entry := kingScenarioStudyCase{ID: f.ID, PatternID: f.PatternID, Witnesses: []kingScenarioWitnessIdentity{}, InitialActorRecords: []kingScenarioInitialRecord{}, Runs: []kingScenarioRun{}}
		for _, w := range f.Witnesses {
			entry.Witnesses = append(entry.Witnesses, kingScenarioWitnessIdentity{ID: w.ID, ExpectedKingCaptor: w.ExpectedKingCaptor, PrefixPlayCount: len(w.Plays)})
		}
		study.Cases = append(study.Cases, entry)
		index := len(study.Cases) - 1
		for _, variant := range variants {
			s, err := kingScenarioNew(f, variant)
			if err != nil {
				t.Fatal(err)
			}
			seats := []int{0}
			if partners(variant) {
				seats = append(seats, 2)
			}
			for _, seat := range seats {
				o := Observe(s, seat)
				record := kingScenarioInitialRecord{Seat: seat, Observation: o, Features: kingScenarioActorFeatures(o), Decisions: []kingScenarioInitialDecision{}}
				if len(Legal(o)) > 0 {
					for _, policy := range profiles {
						a, trace, err := kingScenarioDecision(o, policy)
						if err != nil {
							t.Fatal(err)
						}
						record.Decisions = append(record.Decisions, kingScenarioInitialDecision{PolicyID: policy, SelectedCandidateID: ActionID(a), Trace: trace})
					}
				}
				study.Cases[index].InitialActorRecords = append(study.Cases[index].InitialActorRecords, record)
			}
			for _, policy := range profiles {
				for _, arm := range arms {
					run, err := kingScenarioRunDeal(ctx, f, variant, policy, arm, nil, &study.Work)
					study.Cases[index].Runs = append(study.Cases[index].Runs, run)
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			for _, w := range f.Witnesses {
				run, err := kingScenarioRunDeal(ctx, f, variant, PolicyID, "controlled-HK-double", &w, &study.Work)
				study.Cases[index].Runs = append(study.Cases[index].Runs, run)
				if err != nil {
					t.Fatal(err)
				}
			}
		}
		t.Logf("%s: %d complete runs, cumulative steps=%d", f.ID, len(study.Cases[index].Runs), study.Work.Steps)
	}
	study.Status = "completed"
}

func TestKingScenarioStudyOutputImmutability(t *testing.T) {
	path := t.TempDir() + "/study.json"
	study := kingScenarioStudy{SchemaVersion: "test", Status: "incomplete"}
	if err := kingScenarioWriteStudy(path, study); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := kingScenarioWriteStudy(path, kingScenarioStudy{Status: "completed"}); err == nil {
		t.Fatal("overwrote prior study")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("immutable output changed")
	}
}
