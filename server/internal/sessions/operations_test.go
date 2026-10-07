package sessions

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

type operationFixture struct {
	name string
	raw  json.RawMessage
	want Operation
}

func operationFixtures() []operationFixture {
	material := json.RawMessage(`{"kind":"deal","deck":["C2","C3","C4","C5","C6","C7","C8","C9","C10","CJ","CQ","CK","CA","D2","D3","D4","D5","D6","D7","D8","D9","D10","DJ","DQ","DK","DA","H2","H3","H4","H5","H6","H7","H8","H9","H10","HJ","HQ","HK","HA","S2","S3","S4","S5","S6","S7","S8","S9","S10","SJ","SQ","SK","SA"]}`)
	// The strict V2 decoder canonicalizes embedded material by sorted keys.
	canonicalMaterial := json.RawMessage(`{"deck":` + strings.TrimSuffix(strings.TrimPrefix(string(material), `{"kind":"deal","deck":`), "}") + `,"kind":"deal"}`)
	return []operationFixture{
		{"actor", json.RawMessage(`{"kind":"actor","seat":1,"candidateId":"bid:3"}`), ActorOperation{Kind: "actor", Seat: 1, CandidateID: "bid:3"}},
		{"sealed", json.RawMessage(`{"kind":"sealed","windowId":"pass:1","choices":[{"seat":0,"candidateId":"pass:C2,C3,C4"},{"seat":1,"candidateId":"pass:D2,D3,D4"},{"seat":2,"candidateId":"pass:H2,H3,H4"},{"seat":3,"candidateId":"pass:S2,S3,S4"}]}`), SealedOperation{Kind: "sealed", WindowID: "pass:1", Choices: []gamekernel.SeatChoice{{Seat: 0, CandidateID: "pass:C2,C3,C4"}, {Seat: 1, CandidateID: "pass:D2,D3,D4"}, {Seat: 2, CandidateID: "pass:H2,H3,H4"}, {Seat: 3, CandidateID: "pass:S2,S3,S4"}}}},
		{"automatic", json.RawMessage(`{"kind":"automatic","transitionId":"collect:1:1"}`), AutomaticOperation{Kind: "automatic", TransitionID: "collect:1:1"}},
		{"chance", json.RawMessage(`{"kind":"chance","requestId":"deal:2","material":` + string(material) + `}`), ChanceOperation{Kind: "chance", RequestID: "deal:2", Material: canonicalMaterial}},
		{"continue-round", json.RawMessage(`{"kind":"continue-round"}`), ContinueOperation{Kind: "continue-round"}},
	}
}

func TestOperationDecodeValuesAndIsolation(t *testing.T) {
	fixtures := append(operationFixtures(),
		operationFixture{"equivalent-number", json.RawMessage(`{"kind":"actor","seat":1e0,"candidateId":"bid:3"}`), ActorOperation{Kind: "actor", Seat: 1, CandidateID: "bid:3"}},
		operationFixture{"opaque-null-material", json.RawMessage(`{"kind":"chance","requestId":"draw","material":null}`), ChanceOperation{Kind: "chance", RequestID: "draw", Material: json.RawMessage(`null`)}},
		operationFixture{"opaque-number-material", json.RawMessage(`{"kind":"chance","requestId":"draw","material":1e0}`), ChanceOperation{Kind: "chance", RequestID: "draw", Material: json.RawMessage(`1`)}},
	)
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			raw := bytes.Clone(fixture.raw)
			got, err := DecodeOperation(raw)
			if err != nil || !reflect.DeepEqual(got, fixture.want) {
				t.Fatalf("decoded value changed: got %#v, want %#v, error %v", got, fixture.want, err)
			}
			if err = validateOperation(raw); err != nil {
				t.Fatal("historical journal rejected supported operation", err)
			}
			encoded, err := EncodeOperation(got)
			if err != nil {
				t.Fatal(err)
			}
			again, err := DecodeOperation(encoded)
			if err != nil || !reflect.DeepEqual(again, got) {
				t.Fatal("typed operation round trip changed", err)
			}
			raw[0] = '['
			encoded[0] = '['
			if !reflect.DeepEqual(got, fixture.want) {
				t.Fatal("decoded value retained mutable input/output bytes")
			}
		})
	}
}

func TestOperationDecodeRejectsInvalidShapeAndSemantics(t *testing.T) {
	invalid := []string{
		``, `{`, `null`, `[]`, `{}`, `{"kind":"future"}`, `{"kind":"continue-round"} {}`,
		`{"kind":"actor","seat":0,"candidateId":"a","candidateId":"b"}`,
		`{"kind":"actor","seat":0,"candidateId":"a","hidden":true}`,
		`{"kind":"actor","Seat":0,"candidateId":"a"}`,
		`{"kind":"actor","candidateId":"a"}`,
		`{"kind":"actor","seat":null,"candidateId":"a"}`,
		`{"kind":"actor","seat":0.5,"candidateId":"a"}`,
		`{"kind":"actor","seat":4,"candidateId":"a"}`,
		`{"kind":"actor","seat":-1,"candidateId":"a"}`,
		`{"kind":"actor","seat":0,"candidateId":""}`,
		`{"kind":"actor","seat":0,"candidateId":"\ud800"}`,
		`{"kind":"sealed","windowId":"w","choices":[]}`,
		`{"kind":"sealed","windowId":"","choices":[{"seat":0,"candidateId":"a"}]}`,
		`{"kind":"sealed","windowId":"w","choices":[{"seat":0,"candidateId":"a"},{"seat":0,"candidateId":"b"}]}`,
		`{"kind":"sealed","windowId":"w","choices":[{"seat":4,"candidateId":"a"}]}`,
		`{"kind":"sealed","windowId":"w","choices":[{"seat":0,"candidateId":""}]}`,
		`{"kind":"sealed","windowId":"w","choices":[{"seat":0,"candidateId":"a","hidden":true}]}`,
		`{"kind":"automatic","transitionId":""}`,
		`{"kind":"chance","requestId":"","material":{}}`,
		`{"kind":"chance","requestId":"draw"}`,
		`{"kind":"chance","requestId":"draw","material":{"key":1,"key":2}}`,
		`{"kind":"continue-round","extra":0}`,
		`{"kind":"actor","seat":0,"candidateId":"` + strings.Repeat("x", 257) + `"}`,
		`{"kind":"actor","seat":0,"candidateId":"` + string([]byte{0xff}) + `"}`,
		`{"kind":"chance","requestId":"draw","material":` + strings.Repeat("[", 130) + `0` + strings.Repeat("]", 130) + `}`,
	}
	for i, raw := range invalid {
		if _, err := DecodeOperation([]byte(raw)); err == nil {
			t.Fatalf("service accepted invalid operation %d", i)
		}
		if err := validateOperation([]byte(raw)); err == nil {
			t.Fatalf("journal accepted invalid operation %d", i)
		}
	}
}

func TestOperationDecodePreservesServiceAndJournalByteBounds(t *testing.T) {
	raw := []byte(`{"kind":"actor","seat":0,"candidateId":"a"}`)
	atLimit := append(bytes.Clone(raw), bytes.Repeat([]byte(" "), (256<<10)-len(raw))...)
	if _, err := DecodeOperation(atLimit); err != nil {
		t.Fatal("service rejected its exact operation byte limit", err)
	}
	aboveLimit := append(bytes.Clone(atLimit), ' ')
	if _, err := DecodeOperation(aboveLimit); err == nil {
		t.Fatal("service accepted an oversized operation")
	}
	if err := validateOperation(aboveLimit); err != nil {
		t.Fatal("journal inherited the narrower service byte limit", err)
	}
}

var decodedOperationSink Operation

func BenchmarkDecodeOperation(b *testing.B) {
	for _, fixture := range operationFixtures() {
		b.Run(fixture.name, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(fixture.raw)))
			for b.Loop() {
				value, err := DecodeOperation(fixture.raw)
				if err != nil {
					b.Fatal(err)
				}
				decodedOperationSink = value
			}
		})
	}
}
