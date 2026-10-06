package gamekernel

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func testPin() Pin {
	return Pin{GameID: "hearts", VariantID: "solo", ModuleVersion: "2.0.0", RuleProfileID: "hearts-training-1.0.0", StateSchemaVersion: "2.0.0", ObservationSchemaVersion: "2.0.0", PublicSchemaVersion: "2.0.0", EventSchemaVersion: "2.0.0"}
}

func TestSessionStrictJSONNumberAndShapeSemantics(t *testing.T) {
	type value struct {
		Seat   int    `json:"seat"`
		Counts [4]int `json:"counts"`
	}
	for _, raw := range []string{`{"seat":1,"counts":[0,1,2,3]}`, `{"seat":1e0,"counts":[0.0,1.0,2e0,3]}`} {
		var got value
		if err := DecodeSessionJSON([]byte(raw), &got); err != nil || got.Seat != 1 || got.Counts != [4]int{0, 1, 2, 3} {
			t.Fatalf("equivalent JSON integers: %+v %v", got, err)
		}
	}
	for _, raw := range []string{`{"seat":1,"seat":2,"counts":[0,1,2,3]}`, `{"seat":1,"counts":[0,1,2]}`, `{"seat":1,"counts":[0,1,2,3],"extra":true}`, `{"seat":1.1,"counts":[0,1,2,3]}`, `{"seat":1,"counts":null}`} {
		var got value
		if err := DecodeSessionJSON([]byte(raw), &got); err == nil {
			t.Fatalf("accepted malformed shape %s", raw)
		}
	}
	if ValidIdentifier(string([]byte{0xff})) {
		t.Fatal("typed identifier silently replaced invalid UTF8")
	}
}
func TestSessionProviderCandidateBudget(t *testing.T) {
	for _, test := range []struct {
		count int
		kind  string
	}{{1, "forced"}, {255, "eligible"}, {286, "unsupported-action-space"}} {
		c := make([]PublicCandidate, test.count)
		for i := range c {
			c[i].ID = fmt.Sprintf("choice:%d", i)
		}
		got, err := ProviderEligibility(c)
		if err != nil || got.Kind != test.kind || got.CandidateCount != test.count {
			t.Fatalf("%d candidates: %+v %v", test.count, got, err)
		}
	}
	for _, bad := range [][]PublicCandidate{nil, {{ID: ""}}, {{ID: "same"}, {ID: "same"}}} {
		if _, err := ProviderEligibility(bad); err == nil {
			t.Fatal("accepted invalid candidate identifiers")
		}
	}
}

// This module is a four-seat counter with no card, trick, bid, trump or scoring
// state. The frozen public union still requires a registered transport branch;
// the fixture uses Hearts-shaped presentation only at that output boundary.
func TestSessionNeutralSealedConformance(t *testing.T) {
	type state struct{ Count int }
	type observation struct{ Seat, Count int }
	observed := []int{}
	clones, reductions := 0, 0
	model := SessionModel[*state, observation, int]{
		Pin:   testPin(),
		Clone: func(s *state) *state { clones++; return &state{Count: s.Count} },
		Node: func(s *state) Node {
			if s.Count == 0 {
				return Node{Kind: "sealed", Phase: "pass", WindowID: "window", Actors: []int{0, 1, 2, 3}}
			}
			return Node{Kind: "round-complete", Phase: "hand-end"}
		},
		AccessUnit: func(s *state) *AccessUnit {
			return &AccessUnit{ID: "unit", Kind: "counter", AtAdmissionBoundary: s.Count == 0}
		},
		Document: func(s *state) (json.RawMessage, error) { return json.Marshal(s) },
		Observe: func(s *state, seat int) observation {
			observed = append(observed, seat)
			return observation{seat, s.Count}
		},
		Candidates: func(o observation) []Candidate[int] {
			return []Candidate[int]{{ID: "choose", Action: o.Count + 1, Public: json.RawMessage(`{"kind":"play","card":"C2"}`)}}
		},
		Packet:            func(o observation, c []PublicCandidate) (json.RawMessage, error) { return testPacket(o.Seat, c) },
		View:              func(o observation) (json.RawMessage, error) { return nil, fmt.Errorf("unused projection") },
		EncodeObservation: func(o observation) (json.RawMessage, error) { return json.Marshal(o) },
		Analyze: func(o observation, policy string) (string, json.RawMessage, error) {
			return "", nil, fmt.Errorf("no policy installed")
		},
		Reduce: func(s *state, op Operation[int]) (*state, []json.RawMessage, error) {
			reductions++
			if op.Kind != "sealed" || !reflect.DeepEqual(observed, []int{0, 1, 2, 3}) {
				return nil, nil, fmt.Errorf("all actors must be projected before reduction")
			}
			next := &state{Count: s.Count}
			for _, a := range op.Actions {
				if a.Action != 1 {
					return nil, nil, fmt.Errorf("choice was projected from a mutated state")
				}
				next.Count += a.Action
			}
			return next, []json.RawMessage{}, nil
		},
		ProjectEvent: func(raw json.RawMessage, viewer int) (json.RawMessage, error) { return nil, nil },
	}
	initial := &state{}
	s, err := BindSession(model, initial)
	if err != nil {
		t.Fatal(err)
	}
	initial.Count = 99
	choices := []SeatChoice{{3, "choose"}, {1, "choose"}, {0, "choose"}, {2, "choose"}}
	if _, err = s.Commit(0, "choose"); err == nil {
		t.Fatal("sealed choice committed as an actor")
	}
	if _, err = s.CommitSealed("window", choices[:3]); err == nil {
		t.Fatal("incomplete bundle accepted")
	}
	if reductions != 0 {
		t.Fatal("invalid bundle reached reducer")
	}
	transition, err := s.CommitSealed("window", choices)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := s.SerializePrivate()
	after, _ := transition.Next.SerializePrivate()
	if string(before) != `{"Count":0}` || string(after) != `{"Count":4}` || clones != 1 || reductions != 1 {
		t.Fatalf("ownership/atomic transition: %s -> %s, clones=%d reductions=%d", before, after, clones, reductions)
	}
	if !reflect.DeepEqual(choices, []SeatChoice{{3, "choose"}, {1, "choose"}, {0, "choose"}, {2, "choose"}}) {
		t.Fatal("caller choices mutated")
	}
	node, _ := s.Node()
	node.Actors[0] = 3
	node, _ = s.Node()
	if node.Actors[0] != 0 {
		t.Fatal("node exposes mutable module state")
	}
}

func testPacket(seat int, c []PublicCandidate) (json.RawMessage, error) {
	return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "hearts", "variantId": "solo", "seat": seat, "phase": "pass", "observation": map[string]any{"hand": []string{"C2"}, "handCounts": []int{1, 1, 1, 1}, "scores": []int{0, 0, 0, 0}, "turn": nil, "dealer": 0, "roundNumber": 1, "trick": []any{}, "history": []any{}, "heartsBroken": false, "passDirection": "left", "pass": map[string]any{"outgoing": []string{}, "incoming": []string{}, "to": nil, "from": nil}}, "candidates": c})
}

func TestSessionAnalysisSemanticGuards(t *testing.T) {
	base := `{"publicSchemaVersion":"2.0.0","gameId":"hearts","variantId":"solo","origin":"forced","selectedCandidateId":"play:C2","objective":{"id":"score","version":"1.0.0","metric":"score","direction":"lower"},"horizon":{"id":"round","version":"1.0.0","scope":"round"},"facts":[{"id":"fact","kind":"exact","summary":"Visible fact.","evidence":["visible"],"candidateId":"play:C2"}],"estimates":[],"scenarios":[],"assumptions":[]}`
	if _, err := ParseRegisteredAnalysis([]byte(base), testPin(), "play:C2"); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{strings.Replace(base, `"variantId":"solo"`, `"variantId":"partners"`, 1), strings.Replace(base, `"candidateId":"play:C2"`, `"candidateId":"play:C3"`, 1), strings.Replace(base, `"estimates":[]`, `"estimates":[{"competitorId":"south","metric":"score","event":"round","unit":"points","population":"rounds","value":1,"estimator":{"id":"count","version":"1.0.0"},"uncertainty":{"method":{"id":"range","version":"1.0.0"},"lower":2,"upper":1}}]`, 1)} {
		if _, err := ParseRegisteredAnalysis([]byte(raw), testPin(), "play:C2"); err == nil {
			t.Fatalf("accepted invalid analysis %s", raw)
		}
	}
}
