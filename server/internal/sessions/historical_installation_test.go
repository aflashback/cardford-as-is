package sessions

import (
	"encoding/json"
	"testing"
)

func TestHistoricalInstallationLoadsButCannotBeAdmitted(t *testing.T) {
	registry := testRegistry(t)
	prior, err := registry.Installation(testSelector("spades-partners"))
	if err != nil {
		t.Fatal(err)
	}
	prior.Pin.ModuleVersion, prior.Descriptor.ModuleVersion = "2.9.0", "2.9.0"
	prior.Policy = ExecutionPolicy{ID: prior.Descriptor.Variants[0].DefaultPolicy.ID, Version: prior.Descriptor.Variants[0].DefaultPolicy.Version, BudgetVersion: "fixture-budget", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView", Components: []VersionedComponent{{ID: "fixture-component", Version: "1.0.0"}}}
	prior.Historical = true
	registry, err = NewRegistryWithRegistrations(DefaultHandlers(), prior)
	if err != nil {
		t.Fatal(err)
	}
	selector := selectorFor(prior.Pin)
	loaded, err := registry.Installation(selector)
	if err != nil || loaded.Pin != prior.Pin {
		t.Fatalf("historical exact selector unavailable: %v", err)
	}
	if got := len(registry.Catalog(DefaultHandlers().Engine, DefaultHandlers().UI)); got != 3 {
		t.Fatalf("historical entry entered catalog: %d", got)
	}
	if _, err = registry.CreateRegisteredSession(selector, json.RawMessage(`{"id":"historic-create","dealer":0}`), testMaterial(t)); err == nil {
		t.Fatal("historical selector admitted a new game")
	}
}

func TestActiveInstallationRejectsDuplicateMode(t *testing.T) {
	r := testRegistry(t)
	duplicate, err := r.Installation(testSelector("spades-partners"))
	if err != nil {
		t.Fatal(err)
	}
	duplicate.Pin.ModuleVersion, duplicate.Descriptor.ModuleVersion = "2.9.0", "2.9.0"
	duplicate.Policy = ExecutionPolicy{ID: duplicate.Descriptor.Variants[0].DefaultPolicy.ID, Version: duplicate.Descriptor.Variants[0].DefaultPolicy.Version, BudgetVersion: "fixture-budget", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView", Components: []VersionedComponent{{ID: "fixture-component", Version: "1.0.0"}}}
	if _, err = NewRegistryWithRegistrations(DefaultHandlers(), duplicate); err == nil {
		t.Fatal("two active installations accepted the same mode")
	}
}
