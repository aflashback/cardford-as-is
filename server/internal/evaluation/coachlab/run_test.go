package coachlab

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestCompleteNativeMatchesAndPendingAudits(t *testing.T) {
	for _, variant := range []string{"spades-partners", "spades-solo", "hearts-solo"} {
		t.Run(variant, func(t *testing.T) {
			e := testEnvelope(t, variant)
			e.Lab.Caps.MaxWallMS = 240000
			e.Base.MaxWallMS = 240000
			out := filepath.Join(t.TempDir(), "run")
			j, err := OpenJournal(out, e, false)
			if err != nil {
				t.Fatal(err)
			}
			receipt, err := Run(context.Background(), e, j)
			if err != nil {
				t.Fatal(err)
			}
			if err = j.Close(); err != nil {
				t.Fatal(err)
			}
			if receipt.Status != "complete" || len(receipt.Episodes) != 2 {
				t.Fatalf("incomplete: %+v", receipt)
			}
			for _, ep := range receipt.Episodes {
				if ep.Status != "complete" || ep.Outcome == nil || ep.Outcome.Winner == nil || ep.Decisions != ep.CommittedActions || ep.PendingAudits != ep.Decisions {
					t.Fatalf("lost occurrence/terminal: %+v", ep)
				}
			}
			if _, err = OpenJournal(out, e, false); err == nil {
				t.Fatal("overwrote existing run")
			}
		})
	}
}

func TestResumeAfterPreparationKeepsOriginalBytes(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	a, err := NewAdapter(e.Lab.Selector)
	if err != nil {
		t.Fatal(err)
	}
	expected, err := NewEpisodeState(e, EpisodeSpecs(e)[0], a)
	if err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "run")
	j, err := OpenJournal(out, e, false)
	if err != nil {
		t.Fatal(err)
	}
	if err = j.Append("episode-start", expected.StartRecord()); err != nil {
		t.Fatal(err)
	}
	n, _ := expected.Session.Node()
	rec, err := PrepareRecord(context.Background(), expected, *n.Seat)
	if err != nil {
		t.Fatal(err)
	}
	if err = j.Append("prepared", rec); err != nil {
		t.Fatal(err)
	}
	original, _ := json.Marshal(rec)
	if err = j.Close(); err != nil {
		t.Fatal(err)
	}
	j, err = OpenJournal(out, e, true)
	if err != nil {
		t.Fatal(err)
	}
	receipt, err := Run(context.Background(), e, j)
	if err != nil {
		t.Fatal(err)
	}
	_ = j.Close()
	if receipt.Status != "complete" {
		t.Fatal(receipt.Status)
	}
	var first PreparedRecord
	for _, entry := range j.Entries() {
		if entry.Kind == "prepared" {
			if err = json.Unmarshal(entry.Payload, &first); err != nil {
				t.Fatal(err)
			}
			break
		}
	}
	after, _ := json.Marshal(first)
	if !reflect.DeepEqual(original, after) {
		t.Fatal("resume replaced original preparation")
	}
	fresh, err := OpenJournal(filepath.Join(t.TempDir(), "fresh"), e, false)
	if err != nil {
		t.Fatal(err)
	}
	full, err := Run(context.Background(), e, fresh)
	if err != nil {
		t.Fatal(err)
	}
	_ = fresh.Close()
	for i := range receipt.Episodes {
		if !reflect.DeepEqual(receipt.Episodes[i].Outcome, full.Episodes[i].Outcome) || receipt.Episodes[i].CommittedActions != full.Episodes[i].CommittedActions {
			t.Fatal("resume trajectory changed")
		}
	}
	bad := e
	bad.Lab.SourceIdentity.BinaryDigest = Digest([]byte("changed"))
	if _, err = OpenJournal(out, bad, true); err == nil {
		t.Fatal("resume accepted changed binary")
	}
}

func TestJournalRejectsTamperAndConcurrentOwnership(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	out := filepath.Join(t.TempDir(), "run")
	j, err := OpenJournal(out, e, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = OpenJournal(out, e, true); err == nil {
		t.Fatal("stole active journal lock")
	}
	_ = j.Close()
	p := filepath.Join(out, "private", "journal.jsonl")
	raw, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	for i, c := range raw {
		if c == 'a' {
			raw[i] = 'b'
			break
		}
	}
	if err = os.WriteFile(p, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = OpenJournal(out, e, true); err == nil {
		t.Fatal("accepted modified journal")
	}
}

func TestRunCapsRetainBothIncompleteArms(t *testing.T) {
	e := testEnvelope(t, "hearts-solo")
	e.Lab.Caps.MaxActions = 4
	j, err := OpenJournal(filepath.Join(t.TempDir(), "run"), e, false)
	if err != nil {
		t.Fatal(err)
	}
	r, err := Run(context.Background(), e, j)
	if err != nil {
		t.Fatal(err)
	}
	_ = j.Close()
	if r.Status != "censored" || len(r.Episodes) != 2 {
		t.Fatalf("lost arms: %+v", r)
	}
	for _, ep := range r.Episodes {
		if ep.Outcome != nil || ep.Status != "incomplete" || ep.CommittedActions != 4 {
			t.Fatalf("invented winner or broke sealed cap: %+v", ep)
		}
	}
}
func TestGlobalDecisionCapRetainsUnstartedPairedArm(t *testing.T) {
	e := testEnvelope(t, "hearts-solo")
	e.Lab.Caps.MaxActions = 4
	e.Base.MaxDecisions = 4
	j, err := OpenJournal(filepath.Join(t.TempDir(), "run"), e, false)
	if err != nil {
		t.Fatal(err)
	}
	r, err := Run(context.Background(), e, j)
	if err != nil {
		t.Fatal(err)
	}
	_ = j.Close()
	if r.Decisions != 4 || r.Committed != 4 || len(r.Episodes) != 2 || r.Episodes[1].Decisions != 0 || r.Status != "censored" {
		t.Fatalf("exceeded global cap/dropped arm %+v", r)
	}
}
func TestCanceledInvocationCheckpointsEveryArm(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	j, err := OpenJournal(filepath.Join(t.TempDir(), "run"), e, false)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r, err := Run(ctx, e, j)
	if err != nil {
		t.Fatal(err)
	}
	_ = j.Close()
	if r.Status != "checkpointed" || len(r.Episodes) != 2 || r.Decisions != 0 {
		t.Fatalf("cancellation lost denominator or permanently failed %+v", r)
	}
}
func TestReplayResumeAfterCommitAndRoundChance(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	e.Lab.Caps.MaxActions = 60
	full, err := OpenJournal(filepath.Join(t.TempDir(), "full"), e, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = full.Close() })
	want, err := Run(context.Background(), e, full)
	if err != nil {
		t.Fatal(err)
	}
	entries := full.Entries()
	_ = full.Close()
	for _, kind := range []string{"actor", "round-complete", "chance"} {
		t.Run(kind, func(t *testing.T) {
			end := -1
			for i, entry := range entries {
				if entry.Kind == "transition" {
					var c AppliedCommand
					_ = json.Unmarshal(entry.Payload, &c)
					if c.Kind == kind {
						end = i
						break
					}
				}
			}
			if end < 0 {
				t.Fatalf("fixture never reached %s", kind)
			}
			out := filepath.Join(t.TempDir(), "partial")
			j, err := OpenJournal(out, e, false)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = j.Close() })
			for _, entry := range entries[1 : end+1] {
				if err = j.Append(entry.Kind, entry.Payload); err != nil {
					t.Fatal(err)
				}
			}
			_ = j.Close()
			j, err = OpenJournal(out, e, true)
			if err != nil {
				t.Fatal(err)
			}
			got, err := Run(context.Background(), e, j)
			if err != nil {
				t.Fatal(err)
			}
			_ = j.Close()
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("resume after %s changed receipt/trajectory", kind)
			}
		})
	}
}

func TestReplayBudgetAppliesBeforeFirstRecord(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	j, err := OpenJournal(filepath.Join(t.TempDir(), "run"), e, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = j.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	visited := false
	if _, err = ReplayVisitContext(ctx, e, j.Entries(), func(DecisionRecord) error { visited = true; return nil }); err != context.Canceled {
		t.Fatalf("replay ignored total budget: %v", err)
	}
	if visited {
		t.Fatal("canceled replay visited actor evidence")
	}
}

func TestExportPointerBindsOriginalCorpusBytes(t *testing.T) {
	e := testEnvelope(t, "hearts-solo")
	e.Lab.Caps.MaxActions = 4
	out := filepath.Join(t.TempDir(), "run")
	j, err := OpenJournal(out, e, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = j.Close() })
	r, err := Run(context.Background(), e, j)
	if err != nil {
		t.Fatal(err)
	}
	if err = ExportCorpus(j, r); err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		Snapshot        string `json:"snapshot"`
		DecisionsDigest string `json:"decisionsDigest"`
		ReceiptDigest   string `json:"receiptDigest"`
	}
	raw, err := os.ReadFile(filepath.Join(out, "latest-export.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &pointer); err != nil {
		t.Fatal(err)
	}
	decisions, err := os.ReadFile(filepath.Join(out, pointer.Snapshot, "decisions.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	receipt, err := os.ReadFile(filepath.Join(out, pointer.Snapshot, "receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	if pointer.DecisionsDigest != Digest(decisions) || pointer.ReceiptDigest != Digest(receipt) {
		t.Fatal("snapshot corpus bytes are not bound")
	}
}
