package legacydecision

import "cardford/server/internal/strategy/rollout"

// These pins describe the optional local current-card-game rollout profile.
// Original profiles never acquire this metadata or these changed budgets.
const ActorRolloutPolicy = "actor-rollout-2.0.0"
const ActorRolloutBudgetVersion = "actor-rollout-round-two-worlds-2.0.0"
const ActorRolloutCatalog = "actor-rollout-catalog-2.0.0"
const ActorRolloutCueVersion = "actor-rollout-cues-2.0.0"

type ActorRolloutRecord struct {
	Version       string               `json:"version"`
	BindingDigest string               `json:"bindingDigest"`
	BudgetVersion string               `json:"budgetVersion"`
	Budget        rollout.RunBudget    `json:"budget"`
	Horizon       rollout.Horizon      `json:"horizon"`
	Result        rollout.PairedResult `json:"result"`
}

func ActorRolloutBudget() rollout.RunBudget {
	return rollout.RunBudget{MaxWorlds: 2, MaxSteps: 50000, MaxCandidates: 286, MaxMemoryBytes: 128 << 20, MaxSamplerOperations: 1000000, MaxSetupOperations: 1000000}
}
func ActorRolloutHorizon() rollout.Horizon {
	return rollout.Horizon{ID: "card-round", Version: "2.0.0", Scope: "current-round"}
}
func ActorRolloutSeeds() rollout.Seeds { return rollout.Seeds{World: 313, Actor: 719, Chance: 997} }
func ActorRolloutComponents() []rollout.Component {
	return []rollout.Component{
		{ID: "original-policy", Version: ActorRolloutPolicy}, {ID: "original-facts", Version: "1.0.0"}, {ID: "original-catalog", Version: ActorRolloutCatalog}, {ID: "original-coach-for-policy", Version: ActorRolloutPolicy}, {ID: "registered-analysis", Version: "2.0.0"}, {ID: "original-advice-projection", Version: "1.0.0"}, {ID: "actor-rollout-engine", Version: "2.0.0"}, {ID: "actor-rollout-sampler", Version: "2.0.0"}, {ID: "actor-rollout-continuation", Version: "retained-actor-policies-2.0.0"},
	}
}
func ActorRolloutProvenance(mode, inputDigest string) rollout.RunProvenance {
	pin := func(id string) rollout.Component { return rollout.Component{ID: id, Version: "2.0.0"} }
	cutoff := pin("card-score-cutoff")
	return rollout.RunProvenance{Sampler: pin("bounded-uniform-constraint-counting"), Prior: pin("uniform-feasible-deal"), Constraints: pin("public-rule-and-exchange-constraints"), Belief: pin("positive-uniform-support"), Continuation: pin("actor-observation-retained-policies"), Objective: pin(mode + "-score"), Horizon: pin("card-round"), Comparator: pin(mode + "-actor-score-comparator"), CutoffEvaluator: &cutoff, PermittedInputDigest: inputDigest, Seeds: ActorRolloutSeeds()}
}

// Public analysis uses the installed modules' competitor IDs. Private rollout
// arithmetic keeps its explicitly versioned seat/team IDs.
func ActorRolloutPublicEstimates(mode string, source []rollout.Estimate) []rollout.Estimate {
	out := append([]rollout.Estimate{}, source...)
	ids := map[string]string{"seat:0": "seat-0", "seat:1": "seat-1", "seat:2": "seat-2", "seat:3": "seat-3"}
	if mode == "hearts" {
		ids = map[string]string{"seat:0": "south", "seat:1": "west", "seat:2": "north", "seat:3": "east"}
	}
	if mode == "spades-partners" {
		ids = map[string]string{"team:0": "NS", "team:1": "EW"}
	}
	for i := range out {
		out[i].CompetitorID = ids[out[i].CompetitorID]
	}
	return out
}
