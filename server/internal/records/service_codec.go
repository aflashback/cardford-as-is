package records

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	heartsreasoning "cardford/server/internal/games/hearts/reasoning"
	"cardford/server/internal/games/spades"
	spadesreasoning "cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
)

const OriginalAnalysisSchema = d.PreparedAnalysisSchema
const OriginalAdviceSchema = d.PreparedAdviceSchema

type OriginalAnalysisEnvelope = d.PreparedAnalysisEnvelope
type OriginalAdviceEnvelope = d.PreparedAdviceEnvelope
type InputBinding struct {
	PacketVersion, InputDigest, WindowID string
	CandidateIDs                         []string
}
type ExecutionResult struct {
	Prepared                     gamekernel.PreparedDecision
	AnalysisSchema, AdviceSchema string
	Analysis, Advice             []byte
}

// ServicePolicy installs an explicit execution tuple; it never fills missing
// pins on an imported session. Budget bounds execution, without pruning facts.
// The original coach has no standalone cue release: original-coach-for-policy
// binds the exact frozen coach shipped with that original PolicyVersion. Catalog
// versions are the original Trace.CatalogVersion constants, not new releases.
func ServicePolicy(selector sessions.Selector) (PolicyPin, error) {
	_, mode, err := servicePin(selector)
	if err != nil {
		return PolicyPin{}, err
	}
	policy, catalog := spadesreasoning.PolicyVersion, spadesreasoning.CatalogVersion
	if mode == "hearts" {
		policy = heartsreasoning.PolicyVersion
		catalog = heartsreasoning.CatalogVersion
	}
	return PolicyPin{ID: policy, Version: policy, BudgetVersion: "original-local-bounded-1.0.0", Components: []ComponentVersion{
		{ID: "original-policy", Version: policy}, {ID: "original-facts", Version: "1.0.0"}, {ID: "original-catalog", Version: catalog}, {ID: "original-coach-for-policy", Version: policy}, {ID: "registered-analysis", Version: "2.0.0"}, {ID: "original-advice-projection", Version: "1.0.0"},
	}}, nil
}
func servicePin(selector sessions.Selector) (ModulePin, string, error) {
	var pin gamekernel.Pin
	mode := ""
	if selector.GameID == "hearts" && selector.VariantID == "solo" {
		pin = hearts.SessionPin()
		mode = "hearts"
	} else if selector.GameID == "spades" {
		var err error
		pin, err = spades.SessionPin(selector.VariantID)
		if err != nil {
			return ModulePin{}, "", err
		}
		mode = "spades-" + selector.VariantID
	} else {
		return ModulePin{}, "", fmt.Errorf("unsupported service selector")
	}
	if selector.ModuleVersion != pin.ModuleVersion || selector.RuleProfileID != pin.RuleProfileID {
		return ModulePin{}, "", fmt.Errorf("unsupported exact service selector")
	}
	return ModulePin(pin), mode, nil
}
func ServiceMetadata(selector sessions.Selector, id, owner string) (SessionMetadata, error) {
	pin, mode, err := servicePin(selector)
	if err != nil {
		return SessionMetadata{}, err
	}
	policy, err := ServicePolicy(selector)
	if err != nil {
		return SessionMetadata{}, err
	}
	m := PracticeMetadata(mode, id, owner, policy)
	m.Pin = pin
	if mode == "hearts" {
		for i, name := range []string{"south", "west", "north", "east"} {
			m.Competition.Competitors[i].ID = name
		}
	} else if mode == "spades-solo" {
		for i := range m.Competition.Competitors {
			m.Competition.Competitors[i].ID = fmt.Sprintf("seat-%d", i)
		}
	}
	return m, ValidateSession(m)
}

// NewServiceCodec adds exact V2 readers and executors. All original V1 readers
// retain their own command/digest history and remain read-only in this service.
func NewServiceCodec() (*DocumentCodec, error) {
	registry, err := sessions.NewRegistry()
	if err != nil {
		return nil, err
	}
	return NewServiceCodecWithRegistry(registry)
}
func NewServiceCodecWithRegistry(registry *sessions.Registry) (*DocumentCodec, error) {
	if registry == nil {
		return nil, fmt.Errorf("missing compiled service registry")
	}
	c := NewDocumentCodec()
	c.serviceRegistry = registry
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		old := OriginalPin(mode)
		selector := sessions.Selector{GameID: old.GameID, VariantID: old.VariantID, ModuleVersion: "2.0.0", RuleProfileID: old.RuleProfileID}
		pin, _, err := servicePin(selector)
		if err != nil {
			return nil, err
		}
		r := storageRegistration{HistoricalReader: HistoricalReader{Pin: pin, Mode: mode}}
		if mode == "hearts" {
			r.start = func(config json.RawMessage, deck []string) (gamekernel.Snapshot, error) {
				material, e := json.Marshal(struct {
					Kind string   `json:"kind"`
					Deck []string `json:"deck"`
				}{"deal", deck})
				if e != nil {
					return nil, e
				}
				s, e := hearts.StartSession(config, material)
				if e != nil {
					return nil, e
				}
				return sessions.Durable(s)
			}
			r.Open = func(hot json.RawMessage, events []json.RawMessage) (gamekernel.Snapshot, error) {
				s, e := hearts.OpenStoredSession(hot, events)
				if e != nil {
					return nil, e
				}
				return sessions.Durable(s)
			}
			r.ValidateHot = hearts.ValidateStoredSession
			r.Window = hearts.StoredSessionWindow
			r.Unit = hearts.StoredSessionUnit
		} else {
			variant := pin.VariantID
			r.start = func(config json.RawMessage, deck []string) (gamekernel.Snapshot, error) {
				material, e := json.Marshal(struct {
					Kind string   `json:"kind"`
					Deck []string `json:"deck"`
				}{"deal", deck})
				if e != nil {
					return nil, e
				}
				s, e := spades.StartSession(variant, config, material)
				if e != nil {
					return nil, e
				}
				return sessions.Durable(s)
			}
			r.Open = func(hot json.RawMessage, events []json.RawMessage) (gamekernel.Snapshot, error) {
				s, e := spades.OpenStoredSession(variant, hot, events)
				if e != nil {
					return nil, e
				}
				return sessions.Durable(s)
			}
			r.ValidateHot = spades.ValidateStoredSession
			r.Window = spades.StoredSessionWindow
			r.Unit = spades.StoredSessionUnit
		}
		c.readers[pin] = r
		policy, err := ServicePolicy(selector)
		if err != nil {
			return nil, err
		}
		if err = c.RegisterPolicy(PolicyRegistration{Module: pin, Policy: policy, PacketVersion: "2.0.0", AnalysisSchema: OriginalAnalysisSchema, AdviceSchema: OriginalAdviceSchema}); err != nil {
			return nil, err
		}
	}
	for _, installed := range registry.Installations() {
		pin := ModulePin(installed.Pin)
		if _, exists := c.readers[pin]; exists {
			continue
		}
		r := storageRegistration{HistoricalReader: HistoricalReader{Pin: pin, Mode: installed.Mode, ValidateHot: installed.ValidateHot, Window: installed.Window, Unit: installed.Unit}}
		competition := Competition{Mode: installed.Descriptor.Variants[0].Competition.Mode, Competitors: []Competitor{}}
		for _, group := range installed.Descriptor.Variants[0].Competition.Competitors {
			competition.Competitors = append(competition.Competitors, Competitor{ID: group.ID, Seats: append([]int{}, group.Seats...)})
		}
		r.expectedCompetition = &competition
		r.startMaterial = func(config, material json.RawMessage) (gamekernel.Snapshot, error) {
			bound, e := installed.Start(config, material)
			if e != nil {
				return nil, e
			}
			return sessions.Durable(bound)
		}
		r.Open = func(hot json.RawMessage, events []json.RawMessage) (gamekernel.Snapshot, error) {
			bound, e := installed.OpenStored(hot, events)
			if e != nil {
				return nil, e
			}
			return sessions.Durable(bound)
		}
		c.readers[pin] = r
		selector := sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID}
		policy, err := c.PolicyForNew(selector)
		if err != nil {
			return nil, err
		}
		if err = c.RegisterPolicy(PolicyRegistration{Module: pin, Policy: policy, PacketVersion: pin.ObservationSchemaVersion, AnalysisSchema: installed.Policy.AnalysisSchema, AdviceSchema: installed.Policy.AdviceSchema}); err != nil {
			return nil, err
		}
	}
	return c, nil
}
func (c *DocumentCodec) Session(doc Document, s gamekernel.Snapshot) (gamekernel.BoundSession, error) {
	b, err := c.bound(doc, s)
	if err != nil {
		return nil, err
	}
	durable, ok := b.inner.(*sessions.DurableSnapshot)
	if !ok {
		return nil, fmt.Errorf("not a V2 durable session")
	}
	bound := durable.Session()
	if ModulePin(bound.Pin()) != doc.Metadata.Pin {
		return nil, fmt.Errorf("durable session pin mismatch")
	}
	return bound, nil
}
func (c *DocumentCodec) PreparationInput(doc Document, s gamekernel.Snapshot, actor int) (InputBinding, error) {
	p, digest, window, err := c.permittedProjection(doc, s, actor)
	if err != nil {
		return InputBinding{}, err
	}
	return InputBinding{PacketVersion: doc.Metadata.Pin.ObservationSchemaVersion, InputDigest: digest, WindowID: window, CandidateIDs: append([]string{}, p.CandidateIDs...)}, nil
}
func (c *DocumentCodec) PrepareDecision(ctx context.Context, doc Document, s gamekernel.Snapshot, actor int, decisionID string) (ExecutionResult, error) {
	var out ExecutionResult
	if err := ctx.Err(); err != nil {
		return out, err
	}
	policy := doc.Metadata.Policy
	var execution PolicyRegistration
	installed := false
	for _, candidate := range c.policies {
		if candidate.Module == doc.Metadata.Pin && reflect.DeepEqual(candidate.Policy, policy) {
			execution, installed = candidate, true
			break
		}
	}
	if !installed {
		return out, fmt.Errorf("uninstalled exact policy/component/budget tuple")
	}
	registration, err := c.registration(doc.Metadata)
	if err != nil {
		return out, err
	}
	if !c.disposition(doc.Metadata, registration).Playable {
		return out, fmt.Errorf("read-only session")
	}
	bound, err := c.Session(doc, s)
	if err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	var full gamekernel.CompletePreparation
	var executor PrepareExecutor
	for _, candidate := range c.prepareExecutors {
		if candidate.module == doc.Metadata.Pin && reflect.DeepEqual(candidate.policy, policy) {
			executor = candidate.execute
			break
		}
	}
	if executor == nil {
		full, err = bound.PrepareComplete(ctx, actor, policy.ID, decisionID)
	} else {
		full, err = executor(ctx, bound, actor, policy.ID, decisionID)
		if err == nil {
			binding, bindingErr := bound.PreparationBinding(actor, policy.ID)
			if bindingErr != nil {
				return out, bindingErr
			}
			prepared := full.Prepared
			if prepared.Actor != actor || prepared.PolicyID != policy.ID || prepared.InputDigest != binding.InputDigest || prepared.ObservationSchemaVersion != doc.Metadata.Pin.ObservationSchemaVersion {
				return out, fmt.Errorf("installed executor changed preparation binding")
			}
			eligible := false
			for _, id := range binding.CandidateIDs {
				eligible = eligible || id == prepared.CandidateID
			}
			if !eligible {
				return out, fmt.Errorf("installed executor selected ineligible candidate")
			}
			if _, err = gamekernel.ParseRegisteredAnalysis(prepared.Analysis, bound.Pin(), prepared.CandidateID); err != nil {
				return out, err
			}
		}
	}
	if err != nil {
		return out, err
	}
	if full.Detail.Schema != execution.AnalysisSchema || full.Advice.Schema != execution.AdviceSchema {
		return out, fmt.Errorf("unsupported full original output schema")
	}
	return ExecutionResult{Prepared: full.Prepared, AnalysisSchema: full.Detail.Schema, AdviceSchema: full.Advice.Schema, Analysis: full.Detail.Bytes, Advice: full.Advice.Bytes}, ctx.Err()
}
