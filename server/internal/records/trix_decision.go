package records

import (
	"encoding/json"
	"fmt"
)

// This reader remains available after a Trix policy stops accepting new games.
// It validates immutable output identity; original legal membership is rebound
// separately by ValidateHistoricalDecisionAt using the saved actor packet.
func validateTrixSavedAdvice(d DecisionRecord) error {
	var a struct {
		GameID    string `json:"gameId"`
		VariantID string `json:"variantId"`
		Selected  string `json:"selectedCandidateId"`
	}
	var v struct {
		GameID        string   `json:"gameId"`
		VariantID     string   `json:"variantId"`
		DecisionID    string   `json:"decisionId"`
		PolicyVersion string   `json:"policyVersion"`
		Recommended   string   `json:"recommendedCandidateId"`
		Alternatives  []string `json:"alternatives"`
	}
	if err := json.Unmarshal(d.Analysis, &a); err != nil {
		return err
	}
	if err := json.Unmarshal(d.Advice, &v); err != nil {
		return err
	}
	if a.GameID != "trix" || v.GameID != a.GameID || v.VariantID != a.VariantID || v.DecisionID != d.ID || v.PolicyVersion != d.Policy.Version || v.Recommended != d.SelectedCandidateID {
		return fmt.Errorf("Trix advice original selection or identity mismatch")
	}
	return nil
}
