package rollout

import (
	"context"
	"testing"
)

func TestOfflineWorkChargesBeforeExhaustion(t *testing.T) {
	w, err := NewWork(context.Background(), RunBudget{MaxSetupOperations: 2, MaxSamplerOperations: 3})
	if err != nil {
		t.Fatal(err)
	}
	if err = w.Setup(2); err != nil {
		t.Fatal(err)
	}
	if err = w.Setup(1); err == nil {
		t.Fatal("accepted setup past cap")
	}
	if err = w.Sampler(4); err == nil {
		t.Fatal("accepted sampling past cap")
	}
	got := w.Result()
	if got.SetupOperations != 2 || got.SamplerOperations != 0 {
		t.Fatalf("charged unperformed work: %+v", got)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w, err = NewWork(ctx, RunBudget{MaxSetupOperations: 2})
	if err != nil {
		t.Fatal(err)
	}
	if w.Setup(1) == nil || w.Result().SetupOperations != 0 {
		t.Fatal("cancelled work executed")
	}
	if _, err = NewWork(nil, RunBudget{}); err == nil {
		t.Fatal("nil context accepted")
	}
}
