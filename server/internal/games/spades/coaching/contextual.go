package coaching

import (
	"cardford/server/internal/contracts"
	d "cardford/server/internal/legacydecision"
	"slices"
	"strings"
)

// Contextual uses only reasons attached to the actual selected candidate and a
// contributing named policy effect. Generic legality facts cannot supply purpose.
func Contextual(o d.Observation, a d.Analysis) (string, contracts.CoachReason, bool) {
	r := contracts.CoachReason{Support: []contracts.CoachSupport{}, Alternatives: []string{}, Limitations: slices.Clone(a.Limitations)}
	if r.Limitations == nil {
		r.Limitations = []string{}
	}
	if a.PolicyVersion != "spades-tactics-2.1.0" && a.PolicyVersion != "spades-partner-resource-5.0.0" {
		return "", r, false
	}
	ids := []string{}
	for _, c := range a.Candidates {
		if c.Disposition == "selected" {
			ids = c.ReasonIDs
		}
	}
	purposes := map[string]string{
		"P04.keep-both-live":         "leave the opposing player with this trick to preserve both live Nils",
		"P02.live-nil-cover":         "take the trick off your Nil partner",
		"P02.cover-action":           "take the trick off your Nil partner",
		"P02.covering-lead":          "give your Nil partner room to play below you",
		"P02.cover-before-partner":   "offer cover before your Nil partner plays",
		"P04.cover-tradeoff":         "cover partner while accepting the recorded risk to your own Nil",
		"S05.shed-risk":              "shed a risky card while staying below the current winner",
		"S07.failed-nil":             "limit additional bags after your Nil has failed",
		"S08.economical-winner":      "take the current lead toward the remaining contract",
		"S08.preserve-control":       "save stronger control for a later contract trick",
		"S09.limit-bags":             "limit excess tricks after the contract is covered",
		"S10.develop-suit":           "develop a suit for the remaining contract",
		"S10.cash-control":           "use a winning card toward the contract",
		"P01.conserve-under-partner": "save your resources while leaving partner ahead for now",
		"P06.offer-ruff":             "offer partner a chance to win with a spade",
		"P11.route-to-ruff":          "keep a possible later route to partner's spade",
		"S12.leave-nil-winning":      "leave the opposing Nil ahead in this trick",
		"CASE-01.offer-safe-ruff":    "give partner a chance to use a spade while saving your entry",
		"CASE-01.partner-secure":     "save your winner because partner's trick is already secure",
	}
	purpose := ""
	primaryID := ""
	best := -1.0
	if a.Trace != nil {
		for _, c := range a.Trace.Candidates {
			if c.ActionID != d.ActionID(a.Action) {
				continue
			}
			for _, e := range c.Effects {
				p, ok := purposes[e.ID]
				if ok && slices.Contains(ids, e.ID) && e.Delta > best {
					best = e.Delta
					purpose = p
					primaryID = e.ID
				}
			}
		}
	}
	statements := []string{}
	primarySupported := false
	for _, reason := range a.Reasons {
		if !slices.Contains(ids, reason.ID) || (len(reason.ActionIDs) > 0 && !slices.Contains(reason.ActionIDs, d.ActionID(a.Action))) {
			continue
		}
		// These generic reminders cannot explain the selected tactic. The full
		// original analysis remains archived; useful turn/score/tradeoff facts stay.
		if slices.Contains([]string{"S01.legal-set", "S03.ownership", "P12.mode-objective", "P08.public-hints"}, reason.ID) {
			continue
		}
		kind := "conditional"
		if reason.Kind == "fact" {
			kind = "exact"
		}
		r.Support = append(r.Support, contracts.CoachSupport{ID: reason.ID, Kind: kind, Text: reason.Text})
		if reason.ID == primaryID {
			primarySupported = true
			statements = append([]string{reason.Text}, statements...)
		} else {
			statements = append(statements, reason.Text)
		}
	}
	if purpose == "" || !primarySupported || len(statements) == 0 {
		return "", r, false
	}
	r.Summary = strings.Join(statements, " ")
	r.Limitations = append(r.Limitations, "This is the recorded deterministic policy's reasoning; it is not proof of the best whole-game action.")
	return purpose, r, true
}
