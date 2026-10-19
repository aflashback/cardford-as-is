package coachlab

import (
	"context"
	"encoding/json"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"os"
	"path/filepath"
	"testing"
)

func TestEvaluationArchiveBatchesRetainPendingAndReuseImmutableResults(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	e.Lab.Caps.MaxActions = 8
	j, err := OpenJournal(filepath.Join(t.TempDir(), "run"), e, false)
	if err != nil {
		t.Fatal(err)
	}
	defer j.Close()
	r, err := Run(context.Background(), e, j)
	if err != nil {
		t.Fatal(err)
	}
	if r.Status != "censored" {
		t.Fatal("fixture must preserve explicit incomplete full-match status")
	}
	config := DefaultEvaluationBatchConfig()
	config.MaxDecisionMS = 30000
	one, err := EvaluateArchive(context.Background(), e, j, config, 1)
	if err != nil {
		t.Fatal(err)
	}
	if one.TotalDecisions != 16 || one.AttemptedNew != 1 || one.Pending == 0 || one.Unsupported != 8 || one.Stored != 1 {
		t.Fatalf("lost denominator/bound: %+v", one)
	}
	two, err := EvaluateArchive(context.Background(), e, j, config, 1)
	if err != nil {
		t.Fatal(err)
	}
	if two.TotalDecisions != 16 || two.ExistingVerified != 1 || two.Stored != 2 || two.Pending != one.Pending-1 {
		t.Fatalf("resume repeated/dropped decisions: %+v", two)
	}
	raw, _ := json.Marshal(config)
	if _, err = DecodeEvaluationBatch(raw); err != nil {
		t.Fatal(err)
	}
	var generic map[string]any
	json.Unmarshal(raw, &generic)
	generic["seed"] = "private-deal"
	raw, _ = json.Marshal(generic)
	if _, err = DecodeEvaluationBatch(raw); err == nil {
		t.Fatal("private/unknown config input accepted")
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = EvaluateArchive(cancelled, e, j, config, 1); err == nil {
		t.Fatal("cancelled initial replay ignored the batch execution context")
	}
}

func TestInferenceProjectionPassesStrictSchemaAfterNormalization(t *testing.T) {
	o := lateEvidenceObservation(t)
	c := DefaultBeliefConfig()
	c.Sampling.Count = 8
	c.Sampling.Budget.MaxWorlds = 8
	record, err := BuildBeliefs(context.Background(), o, c)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile("../../../../contracts/evaluation-lab/inference.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var source any
	if err = json.Unmarshal(raw, &source); err != nil {
		t.Fatal(err)
	}
	compiler := jsonschema.NewCompiler()
	const uri = "https://cardford.local/evaluation-lab/inference.json"
	if err = compiler.AddResource(uri, source); err != nil {
		t.Fatal(err)
	}
	schema, err := compiler.Compile(uri)
	if err != nil {
		t.Fatal(err)
	}
	raw, err = json.Marshal(record.Inference("normalization-fixture"))
	if err != nil {
		t.Fatal(err)
	}
	var projection any
	if err = json.Unmarshal(raw, &projection); err != nil {
		t.Fatal(err)
	}
	if err = schema.Validate(projection); err != nil {
		t.Fatal(err)
	}
}
