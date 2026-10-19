package records

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
)

type PrepareExecutor func(context.Context, gamekernel.BoundSession, int, string, string) (gamekernel.CompletePreparation, error)
type installedPreparation struct {
	module  ModulePin
	policy  PolicyPin
	execute PrepareExecutor
}

func (c *DocumentCodec) ServiceRegistry() *sessions.Registry { return c.serviceRegistry }

func (c *DocumentCodec) PolicyForNew(selector sessions.Selector) (PolicyPin, error) {
	if policy, ok := c.newSessionPolicies[selector]; ok {
		return clonePolicy(policy), nil
	}
	if policy, err := ServicePolicy(selector); err == nil {
		return policy, nil
	}
	if c.serviceRegistry == nil {
		return PolicyPin{}, fmt.Errorf("no service installation")
	}
	r, err := c.serviceRegistry.Installation(selector)
	if err != nil {
		return PolicyPin{}, err
	}
	p := PolicyPin{ID: r.Policy.ID, Version: r.Policy.Version, BudgetVersion: r.Policy.BudgetVersion, Components: []ComponentVersion{}}
	for _, part := range r.Policy.Components {
		p.Components = append(p.Components, ComponentVersion{ID: part.ID, Version: part.Version})
	}
	return p, ValidatePolicy(p)
}
func clonePolicy(p PolicyPin) PolicyPin {
	p.Components = append([]ComponentVersion{}, p.Components...)
	return p
}

// Trusted startup only. This changes new-session selection, never saved pins.
// Installed original policy tuples remain executable for resume/replay.
func (c *DocumentCodec) ConfigureNewSessionPolicy(selector sessions.Selector, policy PolicyPin, executor PrepareExecutor) error {
	if c.serviceRegistry == nil {
		return fmt.Errorf("missing service registry")
	}
	r, err := c.serviceRegistry.Installation(selector)
	if err != nil {
		return err
	}
	pin := ModulePin(r.Pin)
	var original PolicyRegistration
	found := false
	for _, installed := range c.policies {
		if installed.Module == pin {
			original, found = installed, true
			break
		}
	}
	if !found {
		return fmt.Errorf("module has no installed execution schemas")
	}
	for _, installed := range c.policies {
		if installed.Module == pin && reflect.DeepEqual(installed.Policy, policy) {
			if executor != nil {
				return fmt.Errorf("cannot replace an installed policy executor")
			}
			if c.newSessionPolicies == nil {
				c.newSessionPolicies = map[sessions.Selector]PolicyPin{}
			}
			c.newSessionPolicies[selector] = clonePolicy(policy)
			return nil
		}
	}
	original.Policy = policy
	if err = c.RegisterPolicy(original); err != nil {
		return err
	}
	if executor != nil {
		c.prepareExecutors = append(c.prepareExecutors, installedPreparation{pin, clonePolicy(policy), executor})
	}
	if c.newSessionPolicies == nil {
		c.newSessionPolicies = map[sessions.Selector]PolicyPin{}
	}
	c.newSessionPolicies[selector] = clonePolicy(policy)
	return nil
}
func (c *DocumentCodec) MetadataForNew(selector sessions.Selector, id, owner string) (SessionMetadata, error) {
	if c.serviceRegistry == nil {
		return SessionMetadata{}, fmt.Errorf("missing service registry")
	}
	r, err := c.serviceRegistry.Installation(selector)
	if err != nil {
		return SessionMetadata{}, err
	}
	if r.Historical {
		return SessionMetadata{}, fmt.Errorf("historical installation cannot admit a new session")
	}
	policy, err := c.PolicyForNew(selector)
	if err != nil {
		return SessionMetadata{}, err
	}
	m := SessionMetadata{RecordVersion: RecordVersion, GameID: id, OwnerID: owner, Pin: ModulePin(r.Pin), Policy: policy, Competition: Competition{Mode: r.Descriptor.Variants[0].Competition.Mode, Competitors: []Competitor{}}, Controllers: []Controller{}}
	for _, group := range r.Descriptor.Variants[0].Competition.Competitors {
		m.Competition.Competitors = append(m.Competition.Competitors, Competitor{ID: group.ID, Seats: append([]int{}, group.Seats...)})
	}
	for seat := 0; seat < 4; seat++ {
		kind := "computer"
		if seat == 0 {
			kind = "human"
		}
		m.Controllers = append(m.Controllers, Controller{seat, kind})
	}
	return m, ValidateSession(m)
}
func (c *DocumentCodec) StartMaterial(m SessionMetadata, config, material json.RawMessage) (Document, ReplayAnchor, []EventRecord, error) {
	r, err := c.registration(m)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	if r.startMaterial == nil {
		var chance struct {
			Kind string   `json:"kind"`
			Deck []string `json:"deck"`
		}
		if err = gamekernel.DecodeSessionJSON(material, &chance); err != nil || chance.Kind != "deal" {
			return Document{}, ReplayAnchor{}, nil, fmt.Errorf("invalid current-game opening chance")
		}
		return c.Start(m, config, chance.Deck)
	}
	if !c.disposition(m, r).Playable {
		return Document{}, ReplayAnchor{}, nil, fmt.Errorf("read-only installation")
	}
	s, err := r.startMaterial(config, material)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	cp, events, err := checkpoint(s, Checkpoint{}, m.GameID, 0)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	doc := Document{RecordVersion: RecordVersion, Metadata: m, Revision: 0, Checkpoint: cp}
	if err = c.ValidateDocument(doc); err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	digest, err := MetadataDigest(m)
	if err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	anchor := ReplayAnchor{RecordVersion: RecordVersion, GameID: m.GameID, MetadataDigest: digest, Config: bytes.Clone(config), OpeningChance: []string{}, Initial: cp, OpeningMaterial: bytes.Clone(material)}
	anchor.Initial.State = bytes.Clone(cp.State)
	if err = c.ValidateAnchor(m, anchor); err != nil {
		return Document{}, ReplayAnchor{}, nil, err
	}
	return doc, anchor, events, nil
}
func startAnchor(r storageRegistration, a ReplayAnchor) (gamekernel.Snapshot, error) {
	if a.OpeningMaterial != nil {
		if len(a.OpeningMaterial) > MaxHotBytes {
			return nil, fmt.Errorf("opaque opening material exceeds budget")
		}
		if _, err := contracts.ParseJSON(a.OpeningMaterial); err != nil {
			return nil, err
		}
		if len(a.OpeningChance) != 0 || r.startMaterial == nil {
			return nil, fmt.Errorf("mixed or unsupported opaque opening chance")
		}
		return r.startMaterial(a.Config, a.OpeningMaterial)
	}
	if r.start == nil || a.OpeningChance == nil {
		return nil, fmt.Errorf("unsupported original opening chance")
	}
	return r.start(a.Config, a.OpeningChance)
}
