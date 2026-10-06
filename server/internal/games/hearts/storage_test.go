package hearts

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestCompactPlayedAndNextHandStorage(t *testing.T) {
	s := advanceFirstLegal(t, passedSnapshot(t))
	for boundary := 0; boundary < 3; boundary++ {
		hot, events, err := s.Persist(0)
		if err != nil {
			t.Fatal(err)
		}
		if err := ValidateStoredShape(hot, "continuation", "hearts"); err != nil {
			t.Fatal(err)
		}
		var compact map[string]json.RawMessage
		if err := json.Unmarshal(hot, &compact); err != nil {
			t.Fatal(err)
		}
		compact["events"] = json.RawMessage("null")
		nullEvents, _ := json.Marshal(compact)
		if ValidateStoredShape(nullEvents, "continuation", "hearts") == nil {
			t.Fatal("null compact event placeholder accepted")
		}
		if _, err := OpenStored(nullEvents, events); err == nil {
			t.Fatal("null compact event placeholder normalized at import")
		}
		unit, err := StoredUnitID(hot)
		if err != nil || unit != s.UnitID() {
			t.Fatal("unit mismatch", unit, err)
		}
		openned, err := OpenStored(hot, events)
		if err != nil {
			t.Fatal(err)
		}
		before, _ := s.Export()
		after, _ := openned.Export()
		if !bytes.Equal(before, after) {
			t.Fatal("compact storage changed original state")
		}
		if _, err := OpenStored(hot, events[:len(events)-1]); err == nil {
			t.Fatal("truncated archive accepted")
		}
		badEvents := append([]json.RawMessage{}, events...)
		badEvents[0] = json.RawMessage(`{"id":1,"type":"hand-started","message":"bad","seat":null}`)
		if _, err := OpenStored(hot, badEvents); err == nil {
			t.Fatal("null optional archive field accepted")
		}
		_, suffix, err := s.Persist(s.EventCount())
		if err != nil || len(suffix) != 0 {
			t.Fatal("persist duplicated old events")
		}
		if boundary == 0 {
			for s.state.Phase != "hand-end" && s.state.Phase != "match-end" {
				s = advanceFirstLegal(t, s)
			}
		}
		if boundary == 1 {
			if s.state.Phase != "hand-end" {
				t.Fatal("first hand unexpectedly terminal")
			}
			cmd, _ := json.Marshal(map[string]any{"type": "next-hand", "deal": testDeck()})
			next, err := s.Apply(cmd)
			if err != nil {
				t.Fatal(err)
			}
			s = next.(*snapshot)
			if s.UnitID() != "hand-2" || s.state.Dealer != 1 || s.state.PassDirection != "right" || s.state.Turn != nil {
				t.Fatal("later hand metadata mismatch")
			}
		}
	}
}

func TestSelectedPlayBindsActorAndCandidate(t *testing.T) {
	cmd := playCommand(2, "C2")
	if err := ValidateSelectedCommand(cmd, 2, "play:C2"); err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		actor     int
		candidate string
	}{{1, "play:C2"}, {2, "play:C3"}, {4, "play:C2"}} {
		if ValidateSelectedCommand(cmd, tt.actor, tt.candidate) == nil {
			t.Fatal("mismatched decision accepted")
		}
	}
	for _, raw := range []string{
		`{"type":"action","action":{"kind":"play","seat":2,"card":"C2","cards":[]}}`,
		`{"type":"action","action":{"kind":"play","seat":2,"card":null}}`,
		`{"type":"action","action":{"kind":"play","Seat":2,"card":"C2"}}`,
		`{"type":"action","action":{"kind":"play","seat":2,"card":"C2"},"deal":["SA"]}`,
	} {
		if ValidateSelectedCommand(json.RawMessage(raw), 2, "play:C2") == nil {
			t.Fatal("invalid selected command accepted")
		}
	}
}
