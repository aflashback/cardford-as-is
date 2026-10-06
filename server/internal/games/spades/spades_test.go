package spades

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
)

type savedCase struct {
	Config   Config            `json:"config"`
	Deal     []string          `json:"deal"`
	Commands []json.RawMessage `json:"commands"`
	Rounds   []struct {
		Hand   int    `json:"hand"`
		Points [4]int `json:"points"`
		Bags   [4]int `json:"bags"`
		Scores [4]int `json:"scores"`
		SHA    string `json:"stateSha256"`
	} `json:"rounds"`
	FinalSHA string `json:"finalSha256"`
}

func corpus(t *testing.T) []savedCase {
	t.Helper()
	raw, err := os.ReadFile("../../../../web/server/tests/fixtures/legacy-module-document.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Cases []savedCase `json:"cases"`
	}
	if err = json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	return doc.Cases
}
func asJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func hashState(t *testing.T, raw []byte) string {
	t.Helper()
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var v any
	if err := d.Decode(&v); err != nil {
		t.Fatal(err)
	}
	// These immutable fixtures use ASCII field names: Go's sorted map keys match
	// the frozen capturedCanonical UTF-16 key order, preserving the original hash.
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	if err := e.Encode(v); err != nil {
		t.Fatal(err)
	}
	return fmt.Sprintf("%x", sha256.Sum256(bytes.TrimSuffix(b.Bytes(), []byte("\n"))))
}
func createSaved(t *testing.T, c savedCase) json.RawMessage {
	t.Helper()
	raw, err := Create(asJSON(t, c.Config), c.Deal)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func start(t *testing.T, mode string) json.RawMessage {
	t.Helper()
	deck := []string{}
	for _, s := range "CDHS" {
		for _, r := range ranks {
			deck = append(deck, string(s)+r)
		}
	}
	raw, err := Create(asJSON(t, Config{ID: "test-spades", Mode: mode, Dealer: 3}), deck)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func command(t *testing.T, state json.RawMessage, action Action) json.RawMessage {
	t.Helper()
	raw, err := Apply(state, asJSON(t, savedCommand{Type: "action", Action: &action}))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func mutate(t *testing.T, raw json.RawMessage, change func(map[string]any)) json.RawMessage {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	change(m)
	return asJSON(t, m)
}

func TestFrozenCorpus(t *testing.T) {
	count := 0
	for _, c := range corpus(t) {
		if !strings.HasPrefix(c.Config.Mode, "spades-") {
			continue
		}
		count++
		t.Run(c.Config.Mode, func(t *testing.T) {
			if len(c.Rounds) != 3 {
				t.Fatalf("expected untouched three-hand Spades corpus, got %d", len(c.Rounds))
			}
			state := createSaved(t, c)
			round, collections, actions, nextDeals := 0, 0, 0, 0
			for index, cmd := range c.Commands {
				before := append([]byte{}, state...)
				next, err := Apply(state, cmd)
				if err != nil {
					t.Fatalf("command %d: %s: %v", index, cmd, err)
				}
				if !bytes.Equal(state, before) {
					t.Fatal("source state mutated")
				}
				state = next
				s, err := DecodeState(state)
				if err != nil {
					t.Fatalf("decode checkpoint %d: %v", index, err)
				}
				var kind struct {
					Type string `json:"type"`
				}
				if err = json.Unmarshal(cmd, &kind); err != nil {
					t.Fatal(err)
				}
				switch kind.Type {
				case "action":
					actions++
				case "collect-trick":
					collections++
				case "next-hand":
					nextDeals++
				}
				for seat := 0; seat < 4; seat++ {
					obs, err := Observe(state, seat)
					if err != nil {
						t.Fatalf("observe %d seat %d: %v", index, seat, err)
					}
					var o Observation
					if err = json.Unmarshal(obs, &o); err != nil {
						t.Fatal(err)
					}
					if len(o.Hand) != len(s.Hands[seat]) || len(o.LegalActions) > 14 {
						t.Fatal("invalid observer projection")
					}
					if _, err = SafeView(state, seat); err != nil {
						t.Fatal(err)
					}
				}
				if s.Phase == "hand-end" || s.Phase == "match-end" {
					if round >= len(c.Rounds) {
						t.Fatal("extra round")
					}
					want := c.Rounds[round]
					if hashState(t, state) != want.SHA {
						t.Fatalf("round %d immutable oracle hash mismatch\nwant %s\ngot  %s", round+1, want.SHA, hashState(t, state))
					}
					if s.HandResult.Points != want.Points || s.Bags != want.Bags || s.Scores != want.Scores {
						t.Fatalf("round %d score mismatch", round+1)
					}
					round++
				}
			}
			if hashState(t, state) != c.FinalSHA || round != 3 || collections != 39 || actions != 168 || nextDeals != 2 {
				t.Fatalf("frozen replay counts/hash mismatch: rounds=%d collections=%d actions=%d deals=%d", round, collections, actions, nextDeals)
			}
			t.Logf("3 original hands; %d accepted actions, %d independent collection revisions, %d recorded redeals; all round/final hashes exact", actions, collections, nextDeals)
		})
	}
	if count != 2 {
		t.Fatalf("expected both Spades modes, got %d", count)
	}
}

func TestNilBagsAndContractCredit(t *testing.T) {
	cases := []struct {
		name             string
		bids, tricks     []int
		old, delta, bags int
	}{
		{"successful solo nil", []int{0}, []int{0}, 0, 100, 0},
		{"failed nil does not earn points", []int{0}, []int{3}, 0, -100, 3},
		{"failed nil cannot rescue partner contract", []int{0, 4}, []int{3, 3}, 0, -140, 3},
		{"failed nil triggers bag penalty", []int{0, 4}, []int{3, 4}, 8, -160, 1},
		{"double nil success", []int{0, 0}, []int{0, 0}, 0, 200, 0},
		{"double nil failed bags", []int{0, 0}, []int{4, 9}, 9, -400, 2},
		{"made contract overtricks", []int{3, 3}, []int{4, 4}, 9, -38, 1},
		{"failed contract retains old bags", []int{4, 4}, []int{3, 4}, 8, -80, 8},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			delta, bags, err := ScoreCompetitor(c.bids, c.tricks, c.old)
			if err != nil || delta != c.delta || bags != c.bags {
				t.Fatalf("got (%d,%d,%v), want (%d,%d)", delta, bags, err, c.delta, c.bags)
			}
		})
	}
}

func TestHiddenPermutationDoesNotChangeActorInputs(t *testing.T) {
	for _, mode := range []string{"spades-solo", "spades-partners"} {
		for actor := 0; actor < 4; actor++ {
			state := start(t, mode)
			s, err := DecodeState(state)
			if err != nil {
				t.Fatal(err)
			}
			others := []int{}
			for seat := 0; seat < 4; seat++ {
				if seat != actor {
					others = append(others, seat)
				}
			}
			s.Hands[others[0]][0], s.Hands[others[1]][0] = s.Hands[others[1]][0], s.Hands[others[0]][0]
			alternate, err := EncodeState(s)
			if err != nil {
				t.Fatal(err)
			}
			for name, project := range map[string]func(json.RawMessage, int) (json.RawMessage, error){"observation": Observe, "view": SafeView, "legal": Legal} {
				first, err := project(state, actor)
				if err != nil {
					t.Fatal(err)
				}
				second, err := project(alternate, actor)
				if err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(first, second) {
					t.Fatalf("%s leaked hidden permutation for %s seat %d", name, mode, actor)
				}
			}
			obs, err := Observe(state, actor)
			if err != nil {
				t.Fatal(err)
			}
			for _, canary := range []string{"\"hands\"", "\"passes\"", "test-spades"} {
				if bytes.Contains(obs, []byte(canary)) {
					t.Fatalf("observation contains %s", canary)
				}
			}
		}
	}
}

func TestStrictPrivateStateRejections(t *testing.T) {
	state := start(t, "spades-partners")
	cases := map[string]json.RawMessage{
		"missing required boolean":     mutate(t, state, func(m map[string]any) { delete(m, "spadesBroken") }),
		"unknown field":                mutate(t, state, func(m map[string]any) { m["hiddenCanary"] = true }),
		"wrong case":                   mutate(t, state, func(m map[string]any) { m["Dealer"] = m["dealer"]; delete(m, "dealer") }),
		"null scalar":                  mutate(t, state, func(m map[string]any) { m["dealer"] = nil }),
		"null array":                   mutate(t, state, func(m map[string]any) { m["history"] = nil }),
		"null optional":                mutate(t, state, func(m map[string]any) { m["handResult"] = nil }),
		"short tuple":                  mutate(t, state, func(m map[string]any) { m["scores"] = []int{0, 0, 0} }),
		"long tuple":                   mutate(t, state, func(m map[string]any) { m["scores"] = []int{0, 0, 0, 0, 0} }),
		"duplicate card":               mutate(t, state, func(m map[string]any) { h := m["hands"].([]any); h[0].([]any)[0] = h[1].([]any)[0] }),
		"missing nullable bid":         mutate(t, state, func(m map[string]any) { m["bids"] = []any{nil, nil, nil} }),
		"wrong pin":                    mutate(t, state, func(m map[string]any) { m["moduleVersion"] = "2.0.0" }),
		"wrong broken flag":            mutate(t, state, func(m map[string]any) { m["spadesBroken"] = true }),
		"fractional score":             mutate(t, state, func(m map[string]any) { m["scores"] = []float64{0.5, 0, 0.5, 0} }),
		"unsafe integer":               mutate(t, state, func(m map[string]any) { m["handNumber"] = 9007199254740992 }),
		"nonempty Spades pass":         mutate(t, state, func(m map[string]any) { m["passes"].([]any)[0].(map[string]any)["incoming"] = []string{"C2"} }),
		"event injected private field": mutate(t, state, func(m map[string]any) { m["events"].([]any)[0].(map[string]any)["hands"] = []string{"SA"} }),
		"event missing message":        mutate(t, state, func(m map[string]any) { delete(m["events"].([]any)[0].(map[string]any), "message") }),
		"event extraneous seat":        mutate(t, state, func(m map[string]any) { m["events"].([]any)[0].(map[string]any)["seat"] = 0 }),
		"duplicate key":                append(append([]byte{}, state[:len(state)-1]...), []byte(",\"dealer\":3}")...),
		"trailing value":               append(append([]byte{}, state...), []byte(" {}")...),
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			before := append([]byte{}, raw...)
			if err := Validate(raw); err == nil {
				t.Fatal("accepted corrupt state")
			}
			if !bytes.Equal(raw, before) {
				t.Fatal("rejected input mutated")
			}
		})
	}
}

func TestStrictCommandsAndCollectionBoundary(t *testing.T) {
	state := start(t, "spades-solo")
	for _, cmd := range []string{`{}`, `{"type":"action"}`, `{"type":"action","action":{"kind":"bid","bid":1}}`, `{"type":"action","action":{"kind":"bid","seat":0}}`, `{"type":"action","action":{"kind":"bid","seat":0,"bid":null}}`, `{"type":"action","action":{"kind":"bid","seat":0,"bid":14}}`, `{"type":"action","action":{"kind":"bid","seat":0,"bid":0,"card":"C2"}}`, `{"type":"action","action":{"kind":"bid","seat":1,"bid":0}}`, `{"type":"collect-trick"}`, `{"type":"next-hand","deal":[]}`, `{"type":"collect-trick","action":null}`, `{"type":"action","action":{"kind":"bid","seat":0,"bid":0},"deal":[]}`} {
		if _, err := Apply(state, []byte(cmd)); err == nil {
			t.Fatalf("accepted invalid command %s", cmd)
		}
	}
	for seat := 0; seat < 4; seat++ {
		state = command(t, state, Action{Kind: "bid", Seat: seat, Bid: ptr(3)})
	}
	for n := 0; n < 4; n++ {
		s, err := DecodeState(state)
		if err != nil {
			t.Fatal(err)
		}
		actions := actionsFor(s.Phase, s.Turn, s.Hands[*s.Turn], s.Trick, s.SpadesBroken, *s.Turn)
		state = command(t, state, actions[0])
	}
	s, err := DecodeState(state)
	if err != nil {
		t.Fatal(err)
	}
	if s.Phase != "trick-end" || len(s.Trick) != 4 || len(s.History) != 1 {
		t.Fatal("fourth play did not preserve collection boundary")
	}
	for seat := 0; seat < 4; seat++ {
		ids, err := CandidateIDs(state, seat)
		if err != nil || len(ids) != 0 {
			t.Fatal("actions offered before collection")
		}
	}
	next, err := Apply(state, []byte(`{"type":"collect-trick"}`))
	if err != nil {
		t.Fatal(err)
	}
	after, err := DecodeState(next)
	if err != nil {
		t.Fatal(err)
	}
	if after.Phase != "play" || len(after.Trick) != 0 || len(after.History) != 1 || !reflect.DeepEqual(after.Turn, s.Turn) || len(after.Events) != len(s.Events)+1 {
		t.Fatal("collection altered resolved game result")
	}
	if _, err = Apply(next, []byte(`{"type":"collect-trick"}`)); err == nil {
		t.Fatal("duplicate collection accepted")
	}
}

func TestFollowSuitAndUnbrokenSpades(t *testing.T) {
	turn := 0
	ids := func(actions []Action) []string {
		result := []string{}
		for _, a := range actions {
			result = append(result, actionID(a))
		}
		return result
	}
	if got := ids(actionsFor("play", &turn, []string{"SA", "C10", "C2", "H3"}, []Play{}, false, 0)); !reflect.DeepEqual(got, []string{"play:C2", "play:C10", "play:H3"}) {
		t.Fatalf("unbroken lead order: %v", got)
	}
	if got := ids(actionsFor("play", &turn, []string{"SA", "C10", "C2", "H3"}, []Play{{Seat: 3, Card: "C3"}}, true, 0)); !reflect.DeepEqual(got, []string{"play:C2", "play:C10"}) {
		t.Fatalf("follow-suit choices: %v", got)
	}
	if got := ids(actionsFor("play", &turn, []string{"SA", "S2"}, []Play{}, false, 0)); !reflect.DeepEqual(got, []string{"play:S2", "play:SA"}) {
		t.Fatalf("all-Spades exception: %v", got)
	}
}

func TestSavedHistoryCannotRenounceDespiteCardConservation(t *testing.T) {
	state := start(t, "spades-solo")
	for seat := 0; seat < 4; seat++ {
		state = command(t, state, Action{Kind: "bid", Seat: seat, Bid: ptr(3)})
	}
	for n := 0; n < 4; n++ {
		s, err := DecodeState(state)
		if err != nil {
			t.Fatal(err)
		}
		choices := actionsFor(s.Phase, s.Turn, s.Hands[*s.Turn], s.Trick, s.SpadesBroken, *s.Turn)
		state = command(t, state, choices[0])
	}
	s, err := DecodeState(state)
	if err != nil {
		t.Fatal(err)
	}
	// Seat 1 still held clubs: swap its played C3 for its own H5 while
	// retaining all 52 unique cards, turn order and the original trick winner.
	for i, card := range s.Hands[1] {
		if card == "H5" {
			s.Hands[1][i] = "C3"
		}
	}
	s.Trick[1].Card = "H5"
	s.History[0].Plays[1].Card = "H5"
	s.HeartsBroken = true
	if err := Validate(asJSON(t, s)); err == nil || !strings.Contains(err.Error(), "illegal play") {
		t.Fatalf("saved renounce should fail legal history reconstruction, got %v", err)
	}
}

func TestSavedResultCannotChangeScoreOrInventWinner(t *testing.T) {
	for _, c := range corpus(t) {
		if c.Config.Mode != "spades-partners" {
			continue
		}
		state := createSaved(t, c)
		for _, cmd := range c.Commands {
			var err error
			state, err = Apply(state, cmd)
			if err != nil {
				t.Fatal(err)
			}
			s, err := DecodeState(state)
			if err != nil {
				t.Fatal(err)
			}
			if s.Phase != "hand-end" {
				continue
			}
			s.HandResult.Points[0]++
			if err = Validate(asJSON(t, s)); err == nil {
				t.Fatal("accepted changed scored points")
			}
			s.HandResult.Points[0]--
			s.HandResult.Winner = ptr(0)
			if err = Validate(asJSON(t, s)); err == nil {
				t.Fatal("accepted invented match winner")
			}
			return
		}
	}
	t.Fatal("missing frozen scored Partners hand")
}
