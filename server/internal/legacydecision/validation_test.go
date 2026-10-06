package legacydecision

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func bidObservation() Observation {
	o := Observation{
		Mode: "spades-solo", Seat: 0, ModuleVersion: "1.0.0", RuleProfileID: "spades-solo-training-1.0.0", ObservationSchemaVersion: "1.0.0", FeatureVersion: "1.0.0", Phase: "bid",
		Hand: FullDeck()[:13], HandSizes: []int{13, 13, 13, 13}, Bids: []*int{nil, nil, nil, nil}, Tricks: []int{0, 0, 0, 0}, Scores: []int{0, 0, 0, 0}, Bags: []int{0, 0, 0, 0}, Trick: []Play{}, History: []Trick{}, Turn: Ptr(0), Dealer: 3, HandNumber: 1, Events: []Event{}, PassDirection: "hold", Pass: PassMemory{Outgoing: []string{}, Incoming: []string{}}, KnownHoldings: []Play{},
	}
	o.LegalActions = ActionsFor(o)
	o.Memory = GetMemory(o)
	return o
}

func TestObservationBoundaryRejectsMalformedShapesAndKnowledge(t *testing.T) {
	valid, _ := json.Marshal(bidObservation())
	changes := map[string]func(map[string]any){
		"hidden aggregate": func(v map[string]any) { v["hands"] = []any{} },
		"missing actor":    func(v map[string]any) { delete(v, "seat") },
		"null actor":       func(v map[string]any) { v["seat"] = nil },
		"null array":       func(v map[string]any) { v["events"] = nil },
		"null result":      func(v map[string]any) { v["handResult"] = nil },
		"wrong pin":        func(v map[string]any) { v["moduleVersion"] = "2.0.0" },
		"nested hidden":    func(v map[string]any) { v["pass"].(map[string]any)["hands"] = []any{} },
		"nil optional card": func(v map[string]any) {
			v["events"] = []any{map[string]any{"id": 1, "type": "card-played", "message": "a", "card": nil}}
		},
		"empty optional card": func(v map[string]any) {
			v["events"] = []any{map[string]any{"id": 1, "type": "card-played", "message": "a", "card": ""}}
		},
		"cross action field":        func(v map[string]any) { v["legalActions"].([]any)[0].(map[string]any)["card"] = "CA" },
		"duplicate action":          func(v map[string]any) { a := v["legalActions"].([]any); a[1] = a[0] },
		"missing legal alternative": func(v map[string]any) { v["legalActions"] = v["legalActions"].([]any)[1:] },
		"invented void":             func(v map[string]any) { v["memory"].([]any)[0].(map[string]any)["voidSeats"] = []any{1} },
		"duplicate hand card":       func(v map[string]any) { v["hand"].([]any)[1] = "C2" },
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			var v map[string]any
			if err := json.Unmarshal(valid, &v); err != nil {
				t.Fatal(err)
			}
			change(v)
			raw, _ := json.Marshal(v)
			if _, err := ParseObservation(raw); err == nil {
				t.Fatal("accepted malformed observation")
			}
		})
	}
	for name, raw := range map[string][]byte{
		"duplicate key":  []byte(strings.Replace(string(valid), `"seat":0`, `"seat":0,"seat":0`, 1)),
		"trailing value": append(append([]byte{}, valid...), []byte(` {}`)...),
		"bad surrogate":  []byte(strings.Replace(string(valid), `"events":[]`, `"events":[{"id":1,"type":"hand-started","message":"\ud800"}]`, 1)),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseObservation(raw); err == nil {
				t.Fatal("accepted malformed JSON")
			}
		})
	}
}

func TestObservationNumericSpellingsAndDetachedImport(t *testing.T) {
	expected := bidObservation()
	raw, _ := json.Marshal(expected)
	raw = []byte(strings.Replace(string(raw), `"handNumber":1`, `"handNumber":1e0`, 1))
	got, err := ParseObservation(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, expected) {
		t.Fatal("JSON numeric spelling changed observation")
	}
	for i := range raw {
		raw[i] = 'x'
	}
	if got.Hand[0] != "C2" || got.LegalActions[0].Bid != 0 {
		t.Fatal("import retains input bytes")
	}
	if _, err := json.Marshal(got.LegalActions[0]); err != nil {
		t.Fatal(err)
	}
}

func TestKnowledgeNeverInventsOwnershipFromIncompleteHistory(t *testing.T) {
	o := bidObservation()
	o.Hand = []string{"C2"}
	o.HandSizes = []int{1, 1, 1, 1}
	o.Bids = []*int{Ptr(1), Ptr(1), Ptr(1), Ptr(1)}
	o.Phase = "play"
	o.LegalActions = ActionsFor(o)
	if err := ValidateObservation(o); err != nil {
		t.Fatal(err)
	}
	f := BuildFacts(o)
	if f.KnowledgeComplete {
		t.Fatal("incomplete capacities treated as complete")
	}
	for _, p := range f.PossibleOwners {
		if p.Card != "C2" && !reflect.DeepEqual(p.Seats, []int{1, 2, 3}) {
			t.Fatalf("concealed %s ownership improperly narrowed: %v", p.Card, p.Seats)
		}
	}
	if f.CardOutcomes[0].GuaranteedWinner != nil {
		t.Fatal("incomplete history proves future winner")
	}
	*f.OwnBid = 12
	f.Voids["C"] = append(f.Voids["C"], 3)
	f.PossibleOwners[0].Seats[0] = 2
	if *o.Bids[0] != 1 || len(o.Memory[0].VoidSeats) != 0 {
		t.Fatal("facts alias observation")
	}
}
