package records

import (
	"context"
	"fmt"
	"reflect"

	"cardford/server/internal/gamekernel"
	spadesreasoning "cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/sessions"
)

type Illustration struct {
	Frames     []d.Observation
	PolicyNote string
}

// Illustrate binds new review work to the complete saved module/policy tuple.
// It takes only the source actor's permitted observation, never a live snapshot.
// Reading an already accepted trial continues to return its immutable saved bytes.
func (c *DocumentCodec) Illustrate(ctx context.Context, source SessionMetadata, policy PolicyPin, obs d.Observation, candidate string, seed uint32) (Illustration, error) {
	var out Illustration
	r, err := c.registration(source)
	if err != nil {
		return out, err
	}
	if !c.disposition(source, r).Playable || !reflect.DeepEqual(source.Policy, policy) || r.Mode != obs.Mode {
		return out, fmt.Errorf("source continuation policy unavailable")
	}
	selector := sessions.Selector{GameID: source.Pin.GameID, VariantID: source.Pin.VariantID, ModuleVersion: source.Pin.ModuleVersion, RuleProfileID: source.Pin.RuleProfileID}
	baseline, err := ServicePolicy(selector)
	if err != nil {
		return out, err
	}
	replyPolicy := policy.ID
	switch {
	case reflect.DeepEqual(policy, baseline):
		// Preserve the historical adapter, seeded replies and public notes exactly.
	case policy.ID == spadesreasoning.PartnerResourcePolicy && policy.Version == spadesreasoning.PartnerResourcePolicy && obs.Mode == "spades-partners":
		out.PolicyNote = "Replies use the same experimental partner rules as this saved game."
	case isActorRolloutContinuationPolicy(policy):
		replyPolicy = baseline.ID
		out.PolicyNote = "This example uses the simple reply rules from the saved comparison. It does not repeat the full two-deal search at every turn."
	default:
		return out, fmt.Errorf("source continuation adapter unavailable")
	}
	out.Frames, err = sessions.Illustrate(ctx, gamekernel.Pin(source.Pin), obs, candidate, seed, replyPolicy)
	return out, err
}

func isActorRolloutContinuationPolicy(policy PolicyPin) bool {
	expected := PolicyPin{ID: d.ActorRolloutPolicy, Version: d.ActorRolloutPolicy, BudgetVersion: d.ActorRolloutBudgetVersion, Components: []ComponentVersion{}}
	for _, part := range d.ActorRolloutComponents() {
		expected.Components = append(expected.Components, ComponentVersion{ID: part.ID, Version: part.Version})
	}
	return reflect.DeepEqual(policy, expected)
}
