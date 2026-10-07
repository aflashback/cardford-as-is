// Package localpolicies installs explicit local experiments alongside frozen
// readers. Session selection never changes the policy on an existing record.
package localpolicies

import (
	"cardford/server/internal/games/spades/reasoning"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
)

const PartnerResources = "partner-resources"

// InstallPartner always retains this exact experimental reader/executor, so
// restarting in original mode can still resume its previously created games.
func InstallPartner(codec *records.DocumentCodec, selectForNew bool) error {
	original := records.OriginalPin("spades-partners")
	selector := sessions.Selector{GameID: original.GameID, VariantID: original.VariantID, ModuleVersion: "2.0.0", RuleProfileID: original.RuleProfileID}
	baseline, err := records.ServicePolicy(selector)
	if err != nil {
		return err
	}
	trial := baseline
	trial.Components = append([]records.ComponentVersion{}, baseline.Components...)
	trial.ID, trial.Version = reasoning.PartnerResourcePolicy, reasoning.PartnerResourcePolicy
	trial.BudgetVersion = "partner-resource-local-bounded-1.0.0"
	for i := range trial.Components {
		switch trial.Components[i].ID {
		case "original-policy", "original-coach-for-policy":
			trial.Components[i].Version = reasoning.PartnerResourcePolicy
		case "original-catalog":
			trial.Components[i].Version = reasoning.PartnerResourceCatalog
		}
	}
	trial.Components = append(trial.Components, records.ComponentVersion{ID: "partner-resource-cues", Version: "2.0.0"})
	if err = codec.ConfigureNewSessionPolicy(selector, trial, nil); err != nil {
		return err
	}
	if !selectForNew {
		return codec.ConfigureNewSessionPolicy(selector, baseline, nil)
	}
	return nil
}
