package gamekernel

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

const publicEventFixture = `{"publicSchemaVersion":"2.0.0","gameId":"hearts","variantId":"solo","eventSchemaVersion":"2.0.0","id":"1","type":"card-played","message":"Visible card.","seat":0,"card":"C2","bid":null}`

func eventSession(events []json.RawMessage, project func(json.RawMessage, int) (json.RawMessage, error)) *boundSession[int, int, int] {
	return &boundSession[int, int, int]{
		model: SessionModel[int, int, int]{
			Pin: testPin(),
			Reduce: func(source int, op Operation[int]) (int, []json.RawMessage, error) {
				return source + 1, events, nil
			},
			ProjectEvent: project,
		},
	}
}

func TestSessionEventProjectionValidationPreservesViewers(t *testing.T) {
	for _, distinct := range []bool{false, true} {
		t.Run(map[bool]string{false: "identical", true: "viewer-specific"}[distinct], func(t *testing.T) {
			calls := []int{}
			private := json.RawMessage(`{"private":"preserved"}`)
			session := eventSession([]json.RawMessage{private}, func(raw json.RawMessage, viewer int) (json.RawMessage, error) {
				calls = append(calls, viewer)
				value := publicEventFixture
				if distinct {
					value = strings.Replace(value, `"seat":0`, `"seat":`+string(rune('0'+viewer)), 1)
				}
				return json.RawMessage(value), nil
			})
			next, err := session.apply(Operation[int]{})
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(calls, []int{0, 1, 2, 3}) || session.state != 0 || next.Next.(*boundSession[int, int, int]).state != 1 {
				t.Fatal("projection reuse changed viewer calls or transition ownership")
			}
			private[0] = '['
			if string(next.PrivateEvents[0]) != `{"private":"preserved"}` {
				t.Fatal("accepted private event aliases reducer output")
			}
		})
	}
}

func TestSessionEventProjectionRejectsLaterInvalidView(t *testing.T) {
	for name, bad := range map[string]string{
		"malformed":     `{`,
		"unknown field": strings.TrimSuffix(publicEventFixture, "}") + `,"hidden":true}`,
		"wrong pin":     strings.Replace(publicEventFixture, `"gameId":"hearts"`, `"gameId":"spades"`, 1),
		"empty":         "",
		"duplicate":     strings.TrimSuffix(publicEventFixture, "}") + `,"seat":1}`,
	} {
		t.Run(name, func(t *testing.T) {
			calls := []int{}
			// Deliberately reuse the same backing array. Retaining an unchecked
			// alias to the earlier valid output would incorrectly accept bad here.
			buffer := make([]byte, 0, len(publicEventFixture)+100)
			session := eventSession([]json.RawMessage{json.RawMessage(`{}`)}, func(_ json.RawMessage, viewer int) (json.RawMessage, error) {
				calls = append(calls, viewer)
				value := publicEventFixture
				if viewer == 3 {
					value = bad
				}
				buffer = append(buffer[:0], value...)
				return buffer, nil
			})
			if _, err := session.apply(Operation[int]{}); err == nil {
				t.Fatal("later invalid viewer projection accepted")
			}
			if !reflect.DeepEqual(calls, []int{0, 1, 2, 3}) || session.state != 0 {
				t.Fatal("validation reuse skipped a viewer or changed rejected source")
			}
		})
	}
}

func TestSessionEventProjectionRetainsCallbackErrorAndPrivateValidation(t *testing.T) {
	want := errors.New("viewer projection failed")
	calls := []int{}
	session := eventSession([]json.RawMessage{json.RawMessage(`{}`)}, func(_ json.RawMessage, viewer int) (json.RawMessage, error) {
		calls = append(calls, viewer)
		if viewer == 3 {
			return nil, want
		}
		if viewer == 1 {
			return nil, nil
		}
		return json.RawMessage(publicEventFixture), nil
	})
	if _, err := session.apply(Operation[int]{}); !errors.Is(err, want) || !reflect.DeepEqual(calls, []int{0, 1, 2, 3}) {
		t.Fatal("hidden/identical projections suppressed later callback error", err, calls)
	}
	calls = nil
	session = eventSession([]json.RawMessage{json.RawMessage(`{"duplicate":1,"duplicate":2}`)}, func(_ json.RawMessage, viewer int) (json.RawMessage, error) {
		calls = append(calls, viewer)
		return json.RawMessage(publicEventFixture), nil
	})
	if _, err := session.apply(Operation[int]{}); err == nil || len(calls) != 0 {
		t.Fatal("invalid private event reached public projections")
	}
}
