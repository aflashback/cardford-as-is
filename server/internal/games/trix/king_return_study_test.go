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

type kingReturnInput struct {
	Version string           `json:"version"`
	Cases   []kingReturnCase `json:"cases"`
}
type kingReturnStudy struct {
	Version       string             `json:"version"`
	Status        string             `json:"status"`
	Configuration kingReturnConfig   `json:"configuration"`
	Cases         []kingReturnResult `json:"cases"`
}

// Reject duplicate keys instead of allowing a later key to overwrite an earlier
// actor-scoped field. Limit nesting before the typed strict decoder runs.
func kingReturnUniqueJSON(d *json.Decoder, depth int) error {
	if depth > 32 {
		return fmt.Errorf("king return input nesting exceeds bound")
	}
	tok, err := d.Token()
	if err != nil {
		return err
	}
	delim, ok := tok.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]bool{}
		for d.More() {
			key, err := d.Token()
			if err != nil {
				return err
			}
			name, ok := key.(string)
			if !ok || seen[name] {
				return fmt.Errorf("duplicate or invalid JSON key")
			}
			seen[name] = true
			if err = kingReturnUniqueJSON(d, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for d.More() {
			if err = kingReturnUniqueJSON(d, depth+1); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("invalid JSON delimiter")
	}
	_, err = d.Token()
	return err
}

func kingReturnDecodeInput(raw []byte) (kingReturnInput, error) {
	var out kingReturnInput
	if len(raw) == 0 || len(raw) > 2<<20 {
		return out, fmt.Errorf("king return input must be at most 2 MiB")
	}
	keys := json.NewDecoder(bytes.NewReader(raw))
	if err := kingReturnUniqueJSON(keys, 0); err != nil {
		return out, err
	}
	if _, err := keys.Token(); err != io.EOF {
		return out, fmt.Errorf("king return input trailing JSON")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&out); err != nil {
		return out, err
	}
	if out.Version != kingReturnVersion || len(out.Cases) < 1 || len(out.Cases) > 4 {
		return out, fmt.Errorf("unsupported king return input version or case count")
	}
	seen := map[string]bool{}
	for _, in := range out.Cases {
		if seen[in.CaseID] {
			return out, fmt.Errorf("duplicate king return case ID")
		}
		seen[in.CaseID] = true
		if _, _, err := kingReturnValidate(in); err != nil {
			return out, err
		}
	}
	return out, nil
}

func kingReturnWriteStudy(path string, study kingReturnStudy) error {
	raw, err := json.MarshalIndent(study, "", "  ")
	if err != nil {
		return err
	}
	if len(raw)+1 > 128<<20 {
		return fmt.Errorf("king return output exceeds 128 MiB")
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("refusing existing or unavailable king return output: %w", err)
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
func TestKingReturnStudy(t *testing.T) {
	inputPath, outputPath := os.Getenv("TRIX_KING_RETURN_INPUT"), os.Getenv("TRIX_KING_RETURN_OUTPUT")
	if inputPath == "" && outputPath == "" {
		t.Skip("opt-in actor-only King return comparison")
	}
	if inputPath == "" || outputPath == "" {
		t.Fatal("both King return input and output are required")
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
	input, err := kingReturnDecodeInput(raw)
	if err != nil {
		t.Fatal(err)
	}
	study := kingReturnStudy{Version: kingReturnVersion, Status: "incomplete", Configuration: kingReturnConfiguration(), Cases: []kingReturnResult{}}
	defer func() {
		if err := kingReturnWriteStudy(outputPath, study); err != nil {
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
		out, err := kingReturnEvaluate(ctx, in, study.Configuration)
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

func TestKingReturnStrictInputAndOutputImmutability(t *testing.T) {
	in := kingReturnInput{kingReturnVersion, []kingReturnCase{kingReturnTestObservation(t, "basic-partners")}}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := kingReturnDecodeInput(raw)
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
	if _, err = kingReturnDecodeInput(private); err == nil {
		t.Fatal("hidden hands accepted")
	}
	delete(obs, "hands")
	fields["configuration"] = kingReturnConfiguration()
	mutable, _ := json.Marshal(fields)
	if _, err = kingReturnDecodeInput(mutable); err == nil {
		t.Fatal("mutable envelope config accepted")
	}
	if _, err = kingReturnDecodeInput(append(raw, raw...)); err == nil {
		t.Fatal("trailing JSON accepted")
	}
	duplicate := bytes.Replace(raw, []byte(`"version":`), []byte(`"version":"ignored","version":`), 1)
	if _, err = kingReturnDecodeInput(duplicate); err == nil {
		t.Fatal("duplicate JSON key accepted")
	}
	in.Cases = append(in.Cases, in.Cases[0])
	repeated, _ := json.Marshal(in)
	if _, err = kingReturnDecodeInput(repeated); err == nil {
		t.Fatal("duplicate case ID accepted")
	}
	path := filepath.Join(t.TempDir(), "study.json")
	study := kingReturnStudy{Version: kingReturnVersion, Status: "incomplete", Configuration: kingReturnConfiguration(), Cases: []kingReturnResult{}}
	if err = kingReturnWriteStudy(path, study); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err = kingReturnWriteStudy(path, study); err == nil {
		t.Fatal("overwrote frozen output")
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("existing output changed")
	}
}
