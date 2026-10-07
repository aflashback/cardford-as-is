package knowledge

import (
	"encoding/json"
	"math"
	"reflect"
	"testing"
)

func TestMemoryExcludesPartnerSecretsAndFutureReveal(t *testing.T) {
	events := []Event{{1, "own", []int{0}, json.RawMessage(`"own-plan"`)}, {2, "partner", []int{2}, json.RawMessage(`"private-partner-plan"`)}, {3, "reveal", nil, json.RawMessage(`"later-reveal"`)}}
	before, err := Reconstruct(events, 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(before.Events) != 1 || before.Events[0].Kind != "own" {
		t.Fatalf("actor memory leaked: %+v", before)
	}
	after, err := Reconstruct(events, 0, 3)
	if err != nil || len(after.Events) != 2 {
		t.Fatalf("reveal chronology absent: %+v %v", after, err)
	}
	again, _ := Reconstruct(events, 0, 2)
	if !reflect.DeepEqual(before, again) {
		t.Fatal("later reveal backfilled original memory")
	}
	after.Events[0].Value[1] = 'X'
	if events[0].Value[1] == 'X' {
		t.Fatal("memory aliases private source")
	}
}
func TestSoftWeightsNeverRemoveHardFeasibleHoldings(t *testing.T) {
	for _, v := range []float64{0, -1, math.Inf(1), math.NaN()} {
		if ValidateSoftWeight(SoftWeight{"1", v}) == nil {
			t.Fatal("invalid positive support accepted")
		}
	}
	if err := ValidateSoftWeight(SoftWeight{"1", 0.000001}); err != nil {
		t.Fatal(err)
	}
}
