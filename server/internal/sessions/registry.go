// Package sessions composes the original game-owned V2 modules. It is not a
// production service or the M03 V1 document store; activation is a later gate.
package sessions

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	"encoding/json"
	"fmt"
	"reflect"
)

type Selector struct {
	GameID        string `json:"gameId"`
	VariantID     string `json:"variantId"`
	ModuleVersion string `json:"moduleVersion"`
	RuleProfileID string `json:"ruleProfileId"`
}
type InstalledHandlers struct {
	Engine  []string
	UI      []string
	Schemas []string
}
type VersionedComponent struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}
type Competitor struct {
	ID    string `json:"id"`
	Seats []int  `json:"seats"`
}
type Competition struct {
	Mode        string       `json:"mode"`
	Competitors []Competitor `json:"competitors"`
}
type Variant struct {
	ID            string             `json:"id"`
	RuleProfileID string             `json:"ruleProfileId"`
	Competition   Competition        `json:"competition"`
	TableTypes    []string           `json:"tableTypes"`
	DefaultPolicy VersionedComponent `json:"defaultPolicy"`
}
type Schemas struct {
	State       string `json:"state"`
	Observation string `json:"observation"`
	Public      string `json:"public"`
	Event       string `json:"event"`
}
type Descriptor struct {
	GameID                     string    `json:"gameId"`
	ModuleVersion              string    `json:"moduleVersion"`
	Variants                   []Variant `json:"variants"`
	Schemas                    Schemas   `json:"schemas"`
	RequiredEngineCapabilities []string  `json:"requiredEngineCapabilities"`
	RequiredUICapabilities     []string  `json:"requiredUICapabilities"`
	SupportedHorizonIDs        []string  `json:"supportedHorizonIds"`
}
type registration struct {
	pin          gamekernel.Pin
	descriptor   Descriptor
	start        func(json.RawMessage, json.RawMessage) (gamekernel.BoundSession, error)
	open         func(json.RawMessage) (gamekernel.BoundSession, error)
	installation *Registration
}
type Registry struct {
	branches  []registration
	installed InstalledHandlers
}

func DefaultHandlers() InstalledHandlers {
	return InstalledHandlers{Engine: []string{"actor", "sealed", "automatic", "chance", "round-boundary"}, UI: []string{"hearts-table", "spades-table"}, Schemas: []string{"hearts-state-v2", "hearts-observation-v2", "hearts-public-v2", "hearts-event-v2", "spades-state-2.0.0", "spades-observation-2.0.0", "spades-public-2.0.0", "spades-event-2.0.0"}}
}

// Handlers returns the actual compiled handler inventory used for this registry.
func (r *Registry) Handlers() InstalledHandlers {
	return InstalledHandlers{Engine: append([]string{}, r.installed.Engine...), UI: append([]string{}, r.installed.UI...), Schemas: append([]string{}, r.installed.Schemas...)}
}
func NewRegistry() (*Registry, error) { return NewRegistryWithHandlers(DefaultHandlers()) }
func NewRegistryWithHandlers(installed InstalledHandlers) (*Registry, error) {
	r := &Registry{installed: InstalledHandlers{Engine: append([]string{}, installed.Engine...), UI: append([]string{}, installed.UI...), Schemas: append([]string{}, installed.Schemas...)}}
	competition := Competition{Mode: "individual", Competitors: []Competitor{{"south", []int{0}}, {"west", []int{1}}, {"north", []int{2}}, {"east", []int{3}}}}
	h := registration{pin: hearts.SessionPin(), start: hearts.StartSession, open: hearts.OpenSession, descriptor: Descriptor{GameID: "hearts", ModuleVersion: "2.0.0", Variants: []Variant{{ID: "solo", RuleProfileID: "hearts-training-1.0.0", Competition: competition, TableTypes: []string{"practice"}, DefaultPolicy: VersionedComponent{"hearts-baseline-1.0.0", "1.0.0"}}}, Schemas: Schemas{"hearts-state-v2", "hearts-observation-v2", "hearts-public-v2", "hearts-event-v2"}, RequiredEngineCapabilities: []string{"actor", "sealed", "automatic", "chance", "round-boundary"}, RequiredUICapabilities: []string{"hearts-table"}, SupportedHorizonIDs: []string{"hand", "match"}}}
	r.branches = append(r.branches, h)
	for _, variant := range []string{"solo", "partners"} {
		pin, err := spades.SessionPin(variant)
		if err != nil {
			return nil, err
		}
		comp := Competition{Mode: "individual", Competitors: []Competitor{}}
		for seat := 0; seat < 4; seat++ {
			comp.Competitors = append(comp.Competitors, Competitor{fmt.Sprintf("seat-%d", seat), []int{seat}})
		}
		if variant == "partners" {
			comp = Competition{Mode: "partnership", Competitors: []Competitor{{"NS", []int{0, 2}}, {"EW", []int{1, 3}}}}
		}
		r.branches = append(r.branches, registration{pin: pin, start: func(c, m json.RawMessage) (gamekernel.BoundSession, error) { return spades.StartSession(variant, c, m) }, open: func(raw json.RawMessage) (gamekernel.BoundSession, error) { return spades.OpenSession(variant, raw) }, descriptor: Descriptor{GameID: "spades", ModuleVersion: "2.0.0", Variants: []Variant{{ID: variant, RuleProfileID: pin.RuleProfileID, Competition: comp, TableTypes: []string{"practice"}, DefaultPolicy: VersionedComponent{"spades-tactics-2.1.0", "2.1.0"}}}, Schemas: Schemas{"spades-state-2.0.0", "spades-observation-2.0.0", "spades-public-2.0.0", "spades-event-2.0.0"}, RequiredEngineCapabilities: []string{"actor", "automatic", "chance", "round-boundary"}, RequiredUICapabilities: []string{"spades-table"}, SupportedHorizonIDs: []string{"current-hand"}}})
	}
	selectors := map[Selector]bool{}
	pins := map[gamekernel.Pin]bool{}
	for _, b := range r.branches {
		selector := selectorFor(b.pin)
		if selectors[selector] || pins[b.pin] {
			return nil, fmt.Errorf("duplicate installed pin/selector")
		}
		selectors[selector] = true
		pins[b.pin] = true
		if !containsAll(installed.Engine, b.descriptor.RequiredEngineCapabilities) || !containsAll(installed.Schemas, []string{b.descriptor.Schemas.State, b.descriptor.Schemas.Observation, b.descriptor.Schemas.Public, b.descriptor.Schemas.Event}) {
			return nil, fmt.Errorf("registration requires uninstalled schema or engine handler")
		}
	}
	return r, nil
}
func selectorFor(pin gamekernel.Pin) Selector {
	return Selector{pin.GameID, pin.VariantID, pin.ModuleVersion, pin.RuleProfileID}
}
func containsAll(available, required []string) bool {
	for _, value := range required {
		found := false
		for _, candidate := range available {
			if candidate == value {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
func (r *Registry) resolve(selector Selector) (registration, error) {
	if r == nil {
		return registration{}, fmt.Errorf("missing session registry")
	}
	for _, s := range []string{selector.GameID, selector.VariantID, selector.ModuleVersion, selector.RuleProfileID} {
		if !gamekernel.ValidIdentifier(s) {
			return registration{}, fmt.Errorf("invalid registration selector")
		}
	}
	for _, b := range r.branches {
		if selectorFor(b.pin) == selector && containsAll(r.installed.UI, b.descriptor.RequiredUICapabilities) {
			return b, nil
		}
	}
	return registration{}, fmt.Errorf("uninstalled or unavailable game selector")
}
func (r *Registry) CreateRegisteredSession(selector Selector, config, material json.RawMessage) (gamekernel.BoundSession, error) {
	b, err := r.resolve(selector)
	if err != nil {
		return nil, err
	}
	if b.installation != nil && b.installation.Historical {
		return nil, fmt.Errorf("historical installation cannot create a new session")
	}
	bound, err := b.start(config, material)
	if err != nil {
		return nil, err
	}
	payload, err := bound.SerializePrivate()
	if err != nil {
		return nil, err
	}
	doc := document{DocumentVersion: "2.0.0", Pin: b.pin, Competition: b.descriptor.Variants[0].Competition, Controllers: []controller{{0, "human"}, {1, "computer"}, {2, "computer"}, {3, "computer"}}, Payload: payload, Journal: journal{Version: "2.0.0", Entries: []journalEntry{}}, Audits: audits{Version: "2.0.0", Entries: []analysisAudit{}}}
	return &documentSession{BoundSession: bound, document: doc}, nil
}
func (r *Registry) DecodeDocument(raw json.RawMessage) (gamekernel.BoundSession, error) {
	doc, err := parseDocument(raw)
	if err != nil {
		return nil, err
	}
	b, err := r.resolve(selectorFor(doc.Pin))
	if err != nil {
		return nil, err
	}
	if b.pin != doc.Pin || !reflect.DeepEqual(doc.Competition, b.descriptor.Variants[0].Competition) {
		return nil, fmt.Errorf("unsupported document pin or competition")
	}
	bound, err := b.open(doc.Payload)
	if err != nil {
		return nil, err
	}
	return &documentSession{BoundSession: bound, document: doc}, nil
}
func (r *Registry) Catalog(engineHandlers, uiHandlers []string) []Descriptor {
	result := []Descriptor{}
	if r == nil {
		return result
	}
	for _, b := range r.branches {
		d := b.descriptor
		if b.installation != nil && (b.installation.TestOnly || b.installation.Historical) {
			continue
		}
		if containsAll(r.installed.Engine, d.RequiredEngineCapabilities) && containsAll(engineHandlers, d.RequiredEngineCapabilities) && containsAll(r.installed.UI, d.RequiredUICapabilities) && containsAll(uiHandlers, d.RequiredUICapabilities) {
			raw, _ := json.Marshal(d)
			var copy Descriptor
			_ = json.Unmarshal(raw, &copy)
			result = append(result, copy)
		}
	}
	return result
}

type PolicySupport struct {
	Executable bool   `json:"executable"`
	Reason     string `json:"reason"`
}

// Optional/historical algorithms require their original executable policy pin.
// Storage eligibility is deliberately independent of this runtime declaration.
func (r *Registry) PolicySupport(selector Selector, policyID string) (PolicySupport, error) {
	b, err := r.resolve(selector)
	if err != nil {
		return PolicySupport{}, err
	}
	if !gamekernel.ValidIdentifier(policyID) {
		return PolicySupport{}, fmt.Errorf("invalid policy identifier")
	}
	if policyID == b.descriptor.Variants[0].DefaultPolicy.ID {
		return PolicySupport{Executable: true, Reason: "installed-original-policy"}, nil
	}
	return PolicySupport{Executable: false, Reason: "unsupported-policy-pin"}, nil
}

func strictDecode(raw json.RawMessage, out any) error {
	return gamekernel.DecodeSessionJSON(raw, out)
}
