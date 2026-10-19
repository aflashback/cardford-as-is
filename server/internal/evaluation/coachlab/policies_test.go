package coachlab

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestPerSeatPreparationFreezesOriginalAction(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	e.Lab.SeatPolicies[0] = SeatPolicyPin{Seat: 0, ID: "spades-partner-resource-5.0.0", Version: "5.0.0"}
	a, err := NewAdapter(e.Lab.Selector)
	if err != nil {
		t.Fatal(err)
	}
	b, err := a.Start(e.Lab.Config, DealMaterial("seed", 0))
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		n, _ := b.Node()
		seat := *n.Seat
		pin := e.Lab.SeatPolicies[seat]
		p, err := Prepare(context.Background(), b, pin, "opaque-decision")
		if err != nil {
			t.Fatal(err)
		}
		again, err := Prepare(context.Background(), b, pin, "opaque-decision")
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(p, again) {
			t.Fatal("same actor input did not reproduce")
		}
		if p.Prepared.PolicyID != pin.ID {
			t.Fatal("wrong seat policy")
		}
		var saved struct {
			Original struct {
				Action json.RawMessage `json:"action"`
			} `json:"original"`
		}
		if err = json.Unmarshal(p.Detail.Bytes, &saved); err != nil {
			t.Fatal(err)
		}
		if len(saved.Original.Action) == 0 || len(p.Advice.Bytes) == 0 {
			t.Fatal("original analysis/advice absent")
		}
		tr, err := b.Commit(seat, p.Prepared.CandidateID)
		if err != nil {
			t.Fatal(err)
		}
		b = tr.Next
	}
}
