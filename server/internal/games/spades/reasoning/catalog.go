package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"fmt"
	"slices"
)

// Ordered scenario IDs and applicability from the original catalog. Review
// status/title metadata does not participate in an original decision trace.
func scenarioChecks(mode, phase string, matched []string) []d.ScenarioCheck {
	out := []d.ScenarioCheck{}
	for _, prefix := range []string{"S", "P"} {
		n := 14
		if prefix == "P" {
			n = 12
		}
		for i := 1; i <= n; i++ {
			id := fmt.Sprintf("%s%02d", prefix, i)
			applicable := (prefix != "P" || mode == "spades-partners")
			if phase == "bid" {
				applicable = applicable && (id == "S01" || id == "S13" || id == "P04")
			} else {
				applicable = applicable && id != "S13"
			}
			result := "not-matched"
			if !applicable {
				result = "not-applicable"
			} else if slices.Contains(matched, id) {
				result = "matched"
			}
			out = append(out, d.ScenarioCheck{ID: id, Result: result})
		}
	}
	return out
}
