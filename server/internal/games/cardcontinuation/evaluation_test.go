package cardcontinuation

import (
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/strategy/rollout"
	"context"
	"reflect"
	"testing"
)

func TestOfflineSamplingObservationDeterminism(t *testing.T) {
	o, _ := latePlay(t, "spades-partners")
	c := SamplingConfig{Count: 3, Stream: "belief", Budget: DefaultConfig().Budget}
	c.Budget.MaxWorlds = 3
	a, err := SampleAllocations(context.Background(), o, c)
	if err != nil {
		t.Fatal(err)
	}
	b, err := SampleAllocations(context.Background(), o, c)
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatalf("sample changed: %v", err)
	}
	if a.Status != "completed" || len(a.Allocations) != 3 || a.Work.SamplerOperations == 0 {
		t.Fatalf("uncharged/incomplete draws: %+v", a)
	}
	c.Budget.MaxSamplerOperations = 1
	a, err = SampleAllocations(context.Background(), o, c)
	if err == nil || a.Status != "incomplete" || len(a.Allocations) != 0 {
		t.Fatalf("partial draws published: %+v %v", a, err)
	}
}

func TestOfflinePairedCoverageAndDefaultPreservation(t *testing.T) {
	o, _ := latePlay(t, "spades-partners")
	base := DefaultConfig()
	base.Budget.MaxWorlds = 2
	before, err := Evaluate(context.Background(), o, base)
	if err != nil {
		t.Fatal(err)
	}
	c := DefaultOfflineConfig()
	c.Budget.MaxWorlds = 2
	got, err := EvaluateOffline(context.Background(), o, c)
	if err != nil {
		t.Fatal(err)
	}
	if got.Paired.Coverage.Completed != 2 || len(got.Values) != 2 || len(got.Values[0]) != len(o.LegalActions) {
		t.Fatalf("missing complete common worlds: %+v", got)
	}
	after, err := Evaluate(context.Background(), o, base)
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatal("installed default changed")
	}
	c.Budget.MaxSteps = 1
	got, err = EvaluateOffline(context.Background(), o, c)
	if err != nil || got.Paired.ExecutionStatus == "completed" || got.Paired.SelectedID != nil || len(got.Values) != 0 {
		t.Fatalf("partial search recommended action: %+v %v", got, err)
	}
}

func TestOfflineTerminalHorizonDoesNotRenameCutoff(t *testing.T) {
	o, _ := latePlay(t, "spades-partners")
	c := DefaultOfflineConfig()
	c.Budget.MaxWorlds = 1
	c.Budget.MaxSteps = 1
	c.Horizon = rollout.Horizon{ID: "terminal-match", Version: "1.0.0", Scope: "terminal-match"}
	got, err := EvaluateOffline(context.Background(), o, c)
	if err != nil || got.Paired.Coverage.Completed != 0 || got.Metric != "match-win" {
		t.Fatalf("cutoff became terminal value: %+v %v", got, err)
	}
	c.Policies[1] = "unknown-runtime-model"
	if _, err = EvaluateOffline(context.Background(), o, c); err == nil {
		t.Fatal("uninstalled continuation accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c = DefaultOfflineConfig()
	got, err = EvaluateOffline(ctx, o, c)
	if err != nil || got.Paired.SelectedID != nil || got.Paired.ExecutionStatus != "cancelled" {
		t.Fatalf("cancelled action escaped: %+v %v", got, err)
	}
}

func TestOfflineHeartsRequiresActualInstalledPolicyPin(t *testing.T) {
	o, _ := latePlay(t, "hearts")
	c := DefaultOfflineConfig()
	c.Budget.MaxWorlds = 1
	for i := range c.Policies {
		c.Policies[i] = "hearts-baseline-1.0.0"
	}
	got, err := EvaluateOffline(context.Background(), o, c)
	if err != nil || got.Paired.Coverage.Completed != 1 {
		t.Fatalf("actual Hearts pin rejected: %+v %v", got, err)
	}
}

func TestOfflineTerminalUsesNativeWinner(t *testing.T) {
	o, _ := latePlay(t, "spades-partners")
	c := DefaultOfflineConfig()
	c.Budget.MaxWorlds = 1
	c.RootIDs = []string{d.ActionID(o.LegalActions[0])}
	c.Horizon = rollout.Horizon{ID: "terminal-match", Version: "1.0.0", Scope: "terminal-match"}
	got, err := EvaluateOffline(context.Background(), o, c)
	if err != nil || got.Paired.ExecutionStatus != "completed" || got.Paired.Coverage.Completed != 1 {
		t.Fatalf("terminal continuation failed: %+v %v", got, err)
	}
	if len(got.Values) != 1 || (got.Values[0][0] != 0 && got.Values[0][0] != 1) {
		t.Fatalf("score mislabeled win: %+v", got.Values)
	}
	sum := 0.0
	for _, estimate := range got.Paired.Results[0].Estimates {
		if estimate.Metric != "match-win" {
			t.Fatal("nonterminal score in primary endpoint")
		}
		sum += estimate.Value
	}
	if sum != 1 {
		t.Fatalf("native terminal did not produce exactly one winner: %g", sum)
	}
}
