package trix

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type kingDiscardInput struct {
	Version string            `json:"version"`
	Cases   []kingDiscardCase `json:"cases"`
}
type kingDiscardStudy struct {
	Version       string              `json:"version"`
	Status        string              `json:"status"`
	Configuration kingDiscardConfig   `json:"configuration"`
	Cases         []kingDiscardResult `json:"cases"`
}

func kingDiscardDecodeInput(raw []byte) (kingDiscardInput, error) {
	var out kingDiscardInput
	if len(raw) == 0 || len(raw) > 2<<20 {
		return out, fmt.Errorf("king discard input must be at most 2 MiB")
	}
	keys := json.NewDecoder(bytes.NewReader(raw))
	if err := kingReturnUniqueJSON(keys, 0); err != nil {
		return out, err
	}
	if _, err := keys.Token(); err != io.EOF {
		return out, fmt.Errorf("king discard input trailing JSON")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&out); err != nil {
		return out, err
	}
	if out.Version != kingDiscardVersion || len(out.Cases) < 1 || len(out.Cases) > 2 {
		return out, fmt.Errorf("unsupported king discard input version or case count")
	}
	seen := map[string]bool{}
	variants := map[string]bool{}
	for _, in := range out.Cases {
		if seen[in.CaseID] {
			return out, fmt.Errorf("duplicate king discard case ID")
		}
		seen[in.CaseID] = true
		if variants[in.Observation.VariantID] {
			return out, fmt.Errorf("duplicate king discard variant")
		}
		variants[in.Observation.VariantID] = true
		if _, _, err := kingDiscardValidate(in); err != nil {
			return out, err
		}
	}
	return out, nil
}

func kingDiscardWriteStudy(path string, study kingDiscardStudy) error {
	raw, err := json.MarshalIndent(study, "", "  ")
	if err != nil {
		return err
	}
	if len(raw)+1 > 128<<20 {
		return fmt.Errorf("king discard output exceeds 128 MiB")
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("refusing existing or unavailable king discard output: %w", err)
	}
	_, writeErr := f.Write(append(raw, '\n'))
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}

// The operator freezes sources and submits only bounded actor observations.
// Environment variables cannot tune policies, streams, world count or budgets.
func TestKingDiscardStudy(t *testing.T) {
	inputPath, outputPath := os.Getenv("TRIX_KING_DISCARD_INPUT"), os.Getenv("TRIX_KING_DISCARD_OUTPUT")
	if inputPath == "" && outputPath == "" {
		t.Skip("opt-in actor-only King discard comparison")
	}
	if inputPath == "" || outputPath == "" {
		t.Fatal("both King discard input and output are required")
	}
	if _, err := os.Stat(outputPath); !os.IsNotExist(err) {
		t.Fatal("refusing existing or unavailable output")
	}
	f, err := os.Open(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	raw, readErr := io.ReadAll(io.LimitReader(f, (2<<20)+1))
	closeErr := f.Close()
	if readErr != nil {
		t.Fatal(readErr)
	}
	if closeErr != nil {
		t.Fatal(closeErr)
	}
	input, err := kingDiscardDecodeInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	study := kingDiscardStudy{Version: kingDiscardVersion, Status: "incomplete", Configuration: kingDiscardConfiguration(), Cases: []kingDiscardResult{}}
	defer func() {
		if err := kingDiscardWriteStudy(outputPath, study); err != nil {
			t.Error(err)
		}
	}()
	ctx := context.Background()
	if deadline, ok := t.Deadline(); ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithDeadline(ctx, deadline.Add(-time.Second))
		defer cancel()
	}
	complete := true
	for _, in := range input.Cases {
		out, err := kingDiscardEvaluate(ctx, in, study.Configuration)
		study.Cases = append(study.Cases, out)
		if err != nil {
			t.Fatal(err)
		}
		if !out.SamplingComplete {
			complete = false
		}
	}
	if complete {
		study.Status = "completed"
	}
}

func TestKingDiscardStrictInputAndOutputImmutability(t *testing.T) {
	in := kingDiscardInput{kingDiscardVersion, []kingDiscardCase{kingDiscardTestObservation(t, "basic-partners")}}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := kingDiscardDecodeInput(raw)
	if err != nil || len(decoded.Cases) != 1 {
		t.Fatalf("strict roundtrip: %v", err)
	}
	var fields map[string]any
	if err = json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	cases := fields["cases"].([]any)
	record := cases[0].(map[string]any)
	obs := record["observation"].(map[string]any)
	obs["hands"] = [][]string{{"HK"}, {"HA"}}
	private, _ := json.Marshal(fields)
	if _, err = kingDiscardDecodeInput(private); err == nil {
		t.Fatal("hidden hands accepted")
	}
	delete(obs, "hands")
	fields["configuration"] = kingDiscardConfiguration()
	mutable, _ := json.Marshal(fields)
	if _, err = kingDiscardDecodeInput(mutable); err == nil {
		t.Fatal("mutable envelope config accepted")
	}
	if _, err = kingDiscardDecodeInput(append(raw, raw...)); err == nil {
		t.Fatal("trailing JSON accepted")
	}
	duplicate := bytes.Replace(raw, []byte(`"version":`), []byte(`"version":"ignored","version":`), 1)
	if _, err = kingDiscardDecodeInput(duplicate); err == nil {
		t.Fatal("duplicate JSON key accepted")
	}
	in.Cases = append(in.Cases, in.Cases[0])
	repeated, _ := json.Marshal(in)
	if _, err = kingDiscardDecodeInput(repeated); err == nil {
		t.Fatal("duplicate case ID accepted")
	}
	path := filepath.Join(t.TempDir(), "study.json")
	study := kingDiscardStudy{Version: kingDiscardVersion, Status: "incomplete", Configuration: kingDiscardConfiguration(), Cases: []kingDiscardResult{}}
	if err = kingDiscardWriteStudy(path, study); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err = kingDiscardWriteStudy(path, study); err == nil {
		t.Fatal("overwrote frozen output")
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("existing output changed")
	}
}

func TestKingDiscardStrictNestedAndFixedPosition(t *testing.T) {
	in := kingDiscardInput{kingDiscardVersion, []kingDiscardCase{kingDiscardTestObservation(t, "basic-partners")}}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(map[string]any){
		func(f map[string]any) { f["hands"] = []any{} },
		func(f map[string]any) { f["cases"].([]any)[0].(map[string]any)["witnesses"] = []any{} },
		func(f map[string]any) {
			o := f["cases"].([]any)[0].(map[string]any)["observation"].(map[string]any)
			o["trick"].([]any)[0].(map[string]any)["hiddenHand"] = []any{"HA"}
		},
		func(f map[string]any) {
			o := f["cases"].([]any)[0].(map[string]any)["observation"].(map[string]any)
			o["declarations"].([]any)[0].(map[string]any)["outcome"] = "safe"
		},
		func(f map[string]any) {
			o := f["cases"].([]any)[0].(map[string]any)["observation"].(map[string]any)
			o["totals"].([]any)[0].(map[string]any)["hidden"] = true
		},
	} {
		var fields map[string]any
		if err := json.Unmarshal(raw, &fields); err != nil {
			t.Fatal(err)
		}
		mutate(fields)
		bad, _ := json.Marshal(fields)
		if _, err := kingDiscardDecodeInput(bad); err == nil {
			t.Fatal("nested private field accepted")
		}
	}
	nestedDuplicate := bytes.Replace(raw, []byte(`"seat":0`), []byte(`"seat":1,"seat":0`), 1)
	if _, err := kingDiscardDecodeInput(nestedDuplicate); err == nil {
		t.Fatal("nested duplicate JSON key accepted")
	}
	for _, mutate := range []func(*kingDiscardInput){
		func(i *kingDiscardInput) { i.Version = kingReturnVersion },
		func(i *kingDiscardInput) { i.Cases = nil },
		func(i *kingDiscardInput) { i.Cases = append(i.Cases, i.Cases[0], i.Cases[0]) },
		func(i *kingDiscardInput) { copy := i.Cases[0]; copy.CaseID = "other"; i.Cases = append(i.Cases, copy) },
		func(i *kingDiscardInput) { i.Cases[0].Observation.Hand[0] = "C4" },
		func(i *kingDiscardInput) { i.Cases[0].Observation.Trick[0].Seat = 3 },
		func(i *kingDiscardInput) { i.Cases[0].Observation.Tricks[0].Winner = 2 },
		func(i *kingDiscardInput) { i.Cases[0].Observation.Declarations[0].Ref = "wrong" },
		func(i *kingDiscardInput) { i.Cases[0].Observation.Totals[0].Total++ },
		func(i *kingDiscardInput) { i.Cases[0].Observation.HandCounts[1]++ },
		func(i *kingDiscardInput) { i.Cases[0].Observation.LayoutHistory = nil },
	} {
		var bad kingDiscardInput
		if err := json.Unmarshal(raw, &bad); err != nil {
			t.Fatal(err)
		}
		mutate(&bad)
		encoded, _ := json.Marshal(bad)
		if _, err := kingDiscardDecodeInput(encoded); err == nil {
			t.Fatal("wrong fixed scope accepted")
		}
	}
	in.Cases = append(in.Cases, kingDiscardTestObservation(t, "complex-partners"))
	both, _ := json.Marshal(in)
	if _, err := kingDiscardDecodeInput(both); err != nil {
		t.Fatal("two distinct variants rejected", err)
	}
	if _, err := kingDiscardDecodeInput(make([]byte, (2<<20)+1)); err == nil {
		t.Fatal("oversized input accepted")
	}
}
