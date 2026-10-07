package coaching

import (
	"cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestPartnerCueFollowsActualSelectedActionAndGuards(t *testing.T) {
	raw, e := os.ReadFile("../reasoning/testdata/partner-resources.json")
	if e != nil {
		t.Fatal(e)
	}
	var fixtures struct {
		Rows []struct {
			ID          string
			Observation d.Observation
		} `json:"rows"`
	}
	if e = json.Unmarshal(raw, &fixtures); e != nil {
		t.Fatal(e)
	}
	matched := 0
	for _, row := range fixtures.Rows {
		a, e := reasoning.AnalyzePartnerResourcesContext(context.Background(), row.Observation)
		if e != nil {
			t.Fatal(e)
		}
		advice, e := RenderPartnerResources(row.Observation, a)
		if e != nil {
			t.Fatal(e)
		}
		if advice.PolicyVersion != reasoning.PartnerResourcePolicy || advice.Card != a.Action.Card {
			t.Fatal("bot/coach selected-action mismatch")
		}
		if advice.Focus == "Let partner use a spade" || advice.Focus == "Partner’s trick is secure" {
			matched++
			if advice.Evidence != "heuristic" {
				t.Fatal("preference promoted to exact truth")
			}
			for _, candidate := range a.Candidates {
				if candidate.Action.Kind == "play" && candidate.Action.Card != a.Action.Card {
					changed := a
					changed.Action = candidate.Action
					next, e := RenderPartnerResources(row.Observation, changed)
					if e != nil {
						t.Fatal(e)
					}
					if next.Card != candidate.Action.Card {
						t.Fatal("changed selection returned old advice")
					}
					assessment := reasoning.AssessPartnerResources(row.Observation, d.BuildFacts(row.Observation))
					allowed := false
					if assessment.Offer != nil {
						for _, id := range assessment.Offer.ActionIDs {
							allowed = allowed || id == d.ActionID(candidate.Action)
						}
					}
					if assessment.Conserve != nil {
						for _, id := range assessment.Conserve.ActionIDs {
							allowed = allowed || id == d.ActionID(candidate.Action)
						}
					}
					for _, reasonID := range next.ReasonIDs {
						if !allowed && strings.HasPrefix(reasonID, "CASE-01.") {
							t.Fatal("old conditional reason attached to changed card")
						}
					}
					break
				}
			}
		}
	}
	if matched == 0 {
		t.Fatal("no actual conditional cue exercised")
	}
}
