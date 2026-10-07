package sessions

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
)

// Registration is trusted compiled composition, never a request/config payload.
// TestOnly registrations may be injected by tests but never enter Catalog.
type Registration struct {
	Pin         gamekernel.Pin
	Descriptor  Descriptor
	Mode        string
	TestOnly    bool
	Start       func(json.RawMessage, json.RawMessage) (gamekernel.BoundSession, error)
	Open        func(json.RawMessage) (gamekernel.BoundSession, error)
	OpenStored  func(json.RawMessage, []json.RawMessage) (gamekernel.BoundSession, error)
	ValidateHot func(json.RawMessage, string, string) error
	Window      func(json.RawMessage, int64) (string, error)
	Unit        func(json.RawMessage) (string, error)
	Bootstrap   func(string) (json.RawMessage, json.RawMessage, error)
	NextChance  func(gamekernel.Node) (json.RawMessage, error)
	Policy      ExecutionPolicy
}
type ExecutionPolicy struct {
	ID, Version, BudgetVersion, AnalysisSchema, AdviceSchema string
	Components                                               []VersionedComponent
}

func NewRegistryWithRegistrations(installed InstalledHandlers, extras ...Registration) (*Registry, error) {
	r, err := NewRegistryWithHandlers(installed)
	if err != nil {
		return nil, err
	}
	for _, extra := range extras {
		if extra.Start == nil || extra.Open == nil || extra.OpenStored == nil || extra.ValidateHot == nil || extra.Window == nil || extra.Unit == nil || extra.Bootstrap == nil || extra.NextChance == nil || !gamekernel.ValidIdentifier(extra.Mode) || len(extra.Descriptor.Variants) != 1 {
			return nil, fmt.Errorf("incomplete compiled module installation")
		}
		variant := extra.Descriptor.Variants[0]
		for _, value := range []string{extra.Pin.GameID, extra.Pin.VariantID, extra.Pin.ModuleVersion, extra.Pin.RuleProfileID, extra.Pin.StateSchemaVersion, extra.Pin.ObservationSchemaVersion, extra.Pin.PublicSchemaVersion, extra.Pin.EventSchemaVersion, extra.Policy.ID, extra.Policy.Version, extra.Policy.BudgetVersion, extra.Policy.AnalysisSchema, extra.Policy.AdviceSchema} {
			if !gamekernel.ValidIdentifier(value) {
				return nil, fmt.Errorf("invalid compiled installation pin")
			}
		}
		if extra.Policy.ID != variant.DefaultPolicy.ID || extra.Policy.Version != variant.DefaultPolicy.Version || len(extra.Policy.Components) == 0 {
			return nil, fmt.Errorf("invalid installed policy descriptor")
		}
		if err := validateInstalledCompetition(variant.Competition); err != nil {
			return nil, err
		}
		if extra.Pin.GameID != extra.Descriptor.GameID || extra.Pin.ModuleVersion != extra.Descriptor.ModuleVersion || extra.Pin.VariantID != variant.ID || extra.Pin.RuleProfileID != variant.RuleProfileID || !containsAll(installed.Engine, extra.Descriptor.RequiredEngineCapabilities) || !containsAll(installed.UI, extra.Descriptor.RequiredUICapabilities) || !containsAll(installed.Schemas, []string{extra.Descriptor.Schemas.State, extra.Descriptor.Schemas.Observation, extra.Descriptor.Schemas.Public, extra.Descriptor.Schemas.Event}) {
			return nil, fmt.Errorf("module installation identity or handlers mismatch")
		}
		for _, prior := range r.branches {
			if prior.pin == extra.Pin || selectorFor(prior.pin) == selectorFor(extra.Pin) {
				return nil, fmt.Errorf("duplicate compiled module installation")
			}
		}
		copy := copyInstallation(extra)
		r.branches = append(r.branches, registration{pin: copy.Pin, descriptor: copy.Descriptor, start: copy.Start, open: copy.Open, installation: &copy})
	}
	return r, nil
}

func (r *Registry) Installation(selector Selector) (Registration, error) {
	b, err := r.resolve(selector)
	if err != nil {
		return Registration{}, err
	}
	if b.installation != nil {
		return copyInstallation(*b.installation), nil
	}
	return copyInstallation(defaultInstallation(b)), nil
}
func (r *Registry) Installations() []Registration {
	if r == nil {
		return nil
	}
	result := make([]Registration, 0, len(r.branches))
	for _, b := range r.branches {
		if b.installation != nil {
			result = append(result, copyInstallation(*b.installation))
		} else {
			result = append(result, copyInstallation(defaultInstallation(b)))
		}
	}
	return result
}

func copyInstallation(source Registration) Registration {
	raw, _ := json.Marshal(source.Descriptor)
	var descriptor Descriptor
	_ = json.Unmarshal(raw, &descriptor)
	source.Descriptor = descriptor
	source.Policy.Components = append([]VersionedComponent{}, source.Policy.Components...)
	return source
}

func validateInstalledCompetition(c Competition) error {
	groupSize, count := 1, 4
	if c.Mode == "partnership" {
		groupSize, count = 2, 2
	} else if c.Mode != "individual" {
		return fmt.Errorf("invalid installed competition mode")
	}
	if len(c.Competitors) != count {
		return fmt.Errorf("invalid installed competitors")
	}
	seen := [4]bool{}
	ids := map[string]bool{}
	for _, group := range c.Competitors {
		if !gamekernel.ValidIdentifier(group.ID) || ids[group.ID] || len(group.Seats) != groupSize {
			return fmt.Errorf("invalid installed competitor")
		}
		ids[group.ID] = true
		for _, seat := range group.Seats {
			if !gamekernel.ValidSeat(seat) || seen[seat] {
				return fmt.Errorf("invalid installed seat partition")
			}
			seen[seat] = true
		}
	}
	return nil
}
