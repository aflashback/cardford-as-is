package reasoning

import (
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"testing"
)

func TestPartnerResourcesReachableGuardsAndActorIsolation(t *testing.T) {
	raw, err := os.ReadFile("testdata/partner-resources.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Rows []struct {
			ID            string           `json:"id"`
			Offset        int              `json:"offset"`
			Observation   d.Observation    `json:"observation"`
			ChangedHidden d.Observation    `json:"changedHidden"`
			Expected      PartnerResources `json:"expected"`
		} `json:"rows"`
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Rows) != 40 {
		t.Fatal("reachable rotated corpus incomplete")
	}
	differences := 0
	for _, row := range fixture.Rows {
		t.Run(row.ID+string(rune('0'+row.Offset)), func(t *testing.T) {
			before, _ := json.Marshal(row.Observation)
			got := AssessPartnerResources(row.Observation, d.BuildFacts(row.Observation))
			if !reflect.DeepEqual(got, row.Expected) {
				t.Fatalf("guard mismatch: got %+v want %+v", got, row.Expected)
			}
			a, e := AnalyzePartnerResourcesContext(context.Background(), row.Observation)
			if e != nil {
				t.Fatal(e)
			}
			b, e := AnalyzePartnerResourcesContext(context.Background(), row.ChangedHidden)
			if e != nil {
				t.Fatal(e)
			}
			if !reflect.DeepEqual(a, b) {
				t.Fatal("concealed ownership changed actor reasoning")
			}
			old, e := Analyze(row.Observation)
			if e != nil {
				t.Fatal(e)
			}
			if d.ActionID(a.Action) != d.ActionID(old.Action) {
				differences++
			}
			if a.PolicyVersion != PartnerResourcePolicy || a.Trace.SelectedActionID != d.ActionID(a.Action) {
				t.Fatal("policy/trace mismatch")
			}
			for _, r := range a.Reasons {
				if len(r.ActionIDs) > 0 && slices.Contains(a.Candidates[0].ReasonIDs, r.ID) && !slices.Contains(r.ActionIDs, d.ActionID(a.Action)) {
					t.Fatal("selected reason belongs to another move")
				}
			}
			after, _ := json.Marshal(row.Observation)
			if string(before) != string(after) {
				t.Fatal("mutated actor input")
			}
		})
	}
	t.Logf("targeted action differences from frozen2.1=%d; not independent strength evidence", differences)
}
