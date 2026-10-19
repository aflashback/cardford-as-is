package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestCLIRequiresPinnedManifestAndRefusesUnknownFlags(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := execute([]string{"--manifest", "missing.json", "--out", "unused"}, &stdout, &stderr); code == 0 || !strings.Contains(stderr.String(), "manifest") {
		t.Fatal("missing manifest did not fail", stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if execute([]string{"--run-provider"}, &stdout, &stderr) == 0 {
		t.Fatal("accepted provider flag")
	}
}
func TestCLIEvaluationIsAnExplicitArchiveOperation(t *testing.T) {
	var out, err bytes.Buffer
	execute([]string{"--manifest", "missing.json", "--out", "unused", "--evaluate-config", "missing-evaluation.json", "--max-decisions", "1"}, &out, &err)
	if strings.Contains(err.String(), "flag provided but not defined") || !strings.Contains(err.String(), "manifest") {
		t.Fatal("evaluation flags not admitted", err.String())
	}
}
