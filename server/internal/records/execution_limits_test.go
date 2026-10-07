package records

import (
	"testing"
	"time"
)

func TestExactPolicyOperationalLimitsKeepOriginalLeaseBound(t *testing.T) {
	c := NewDocumentCodec()
	module := OriginalPin("spades-solo")
	original := PolicyPin{ID: "original-fixture", Version: "1", BudgetVersion: "bounded-1", Components: []ComponentVersion{{ID: "fixture", Version: "1"}}}
	experimental := original
	experimental.ID = "experimental-fixture"
	for _, p := range []PolicyPin{original, experimental} {
		if e := c.RegisterPolicy(PolicyRegistration{Module: module, Policy: p, PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}); e != nil {
			t.Fatal(e)
		}
	}
	got, e := c.WorkLimits(module, original)
	if e != nil {
		t.Fatal(e)
	}
	if got != (ExecutionLimits{20 * time.Second, 25 * time.Second}) {
		t.Fatalf("original operational defaults changed: %+v", got)
	}
	if e = c.validateWorkLease(module, original, 30*time.Second); e != nil {
		t.Fatal(e)
	}
	if e = c.validateWorkLease(module, original, 31*time.Second); e == nil {
		t.Fatal("original30second maximum relaxed")
	}
	limits := ExecutionLimits{90 * time.Second, 95 * time.Second}
	if e = c.ConfigureExecutionLimits(module, experimental, limits); e != nil {
		t.Fatal(e)
	}
	if got, e = c.WorkLimits(module, experimental); e != nil || got != limits {
		t.Fatalf("extended exact policy unavailable: %+v %v", got, e)
	}
	if e = c.validateWorkLease(module, experimental, 95*time.Second); e != nil {
		t.Fatal(e)
	}
	changed := experimental
	changed.BudgetVersion = "modified"
	if e = c.validateWorkLease(module, changed, 95*time.Second); e == nil {
		t.Fatal("modified budget inherited extended lease")
	}
	if e = c.ConfigureExecutionLimits(module, changed, limits); e == nil {
		t.Fatal("uninstalled policy registered extended limits")
	}
	if e = c.validateWorkLease(module, original, 31*time.Second); e == nil {
		t.Fatal("other policy extended original lease")
	}
	if e = c.ConfigureExecutionLimits(module, experimental, limits); e != nil {
		t.Fatal("repeat identical configuration failed", e)
	}
	if e = c.ConfigureExecutionLimits(module, experimental, ExecutionLimits{80 * time.Second, 85 * time.Second}); e == nil {
		t.Fatal("installed exact limits replaced")
	}
}
func TestOperationalLimitsRejectUnboundedAndUnknownPolicies(t *testing.T) {
	c := NewDocumentCodec()
	module := OriginalPin("spades-solo")
	p := PolicyPin{ID: "fixture", Version: "1", BudgetVersion: "bounded-1", Components: []ComponentVersion{{ID: "fixture", Version: "1"}}}
	if e := c.RegisterPolicy(PolicyRegistration{Module: module, Policy: p, PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}); e != nil {
		t.Fatal(e)
	}
	for _, v := range []ExecutionLimits{{91 * time.Second, 95 * time.Second}, {90 * time.Second, 96 * time.Second}, {30 * time.Second, 20 * time.Second}, {0, time.Second}} {
		if e := c.ConfigureExecutionLimits(module, p, v); e == nil {
			t.Fatalf("invalid execution bound accepted: %+v", v)
		}
	}
	if e := c.validateWorkLease(module, p, MaxRegisteredWorkLease+time.Second); e == nil {
		t.Fatal("absolute registered lease cap escaped")
	}
	p.ID = "unknown"
	if _, e := c.WorkLimits(module, p); e == nil {
		t.Fatal("unknown policy silently got operational defaults")
	}
}

func TestPolicyOnlyOperationalAdmissionRequiresConsistentExactRegistrations(t *testing.T) {
	c := NewDocumentCodec()
	p := PolicyPin{ID: "fixture", Version: "1", BudgetVersion: "bounded-1", Components: []ComponentVersion{{ID: "fixture", Version: "1"}}}
	for _, mode := range []string{"hearts", "spades-solo"} {
		if err := c.RegisterPolicy(PolicyRegistration{Module: OriginalPin(mode), Policy: p, PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}); err != nil {
			t.Fatal(err)
		}
	}
	limits := ExecutionLimits{90 * time.Second, 95 * time.Second}
	if err := c.ConfigureExecutionLimits(OriginalPin("hearts"), p, limits); err != nil {
		t.Fatal(err)
	}
	if _, err := c.WorkLimitsForPolicy(p); err == nil {
		t.Fatal("ambiguous module limits admitted before game load")
	}
	if err := c.ConfigureExecutionLimits(OriginalPin("spades-solo"), p, limits); err != nil {
		t.Fatal(err)
	}
	if got, err := c.WorkLimitsForPolicy(p); err != nil || got != limits {
		t.Fatalf("consistent installed policy not admitted: %+v %v", got, err)
	}
	p.BudgetVersion = "changed"
	if _, err := c.WorkLimitsForPolicy(p); err == nil {
		t.Fatal("changed policy inherited admission limits")
	}
}
