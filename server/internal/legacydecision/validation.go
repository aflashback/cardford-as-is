package legacydecision

import (
	"cardford/server/internal/contracts"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"slices"
	"sort"
	"strings"
	"unicode/utf16"
)

const safeInteger = 9007199254740991

// ParseObservation rejects unknown properties and malformed/null shapes before
// decoding. Duplicate properties and invalid encodings are rejected by ParseJSON.
func ParseObservation(raw json.RawMessage) (Observation, error) {
	var o Observation
	v, err := contracts.ParseJSON(raw)
	if err != nil {
		return o, err
	}
	if err = shape(v, reflect.TypeOf(o), ""); err != nil {
		return o, err
	}
	decodeShape(v, reflect.ValueOf(&o).Elem())
	return o, ValidateObservation(o)
}

// Decode the already checked JSON tree once. In particular, JSON's integer
// spellings 1, 1.0 and 1e0 have the same value, as in the original JS boundary.
func decodeShape(v any, target reflect.Value) {
	if target.Kind() == reflect.Pointer {
		if v != nil {
			target.Set(reflect.New(target.Type().Elem()))
			decodeShape(v, target.Elem())
		}
		return
	}
	if target.Type() == reflect.TypeOf(Action{}) {
		m := v.(map[string]any)
		a := Action{Kind: m["kind"].(string), Seat: int(m["seat"].(float64))}
		switch a.Kind {
		case "play":
			a.Card = m["card"].(string)
		case "bid":
			a.Bid = int(m["bid"].(float64))
		case "pass":
			a.Cards = []string{}
			for _, card := range m["cards"].([]any) {
				a.Cards = append(a.Cards, card.(string))
			}
		}
		target.Set(reflect.ValueOf(a))
		return
	}
	switch target.Kind() {
	case reflect.Struct:
		m := v.(map[string]any)
		for i := 0; i < target.NumField(); i++ {
			name := strings.Split(target.Type().Field(i).Tag.Get("json"), ",")[0]
			if value, exists := m[name]; exists {
				decodeShape(value, target.Field(i))
			}
		}
	case reflect.Slice:
		a := v.([]any)
		target.Set(reflect.MakeSlice(target.Type(), len(a), len(a)))
		for i, value := range a {
			decodeShape(value, target.Index(i))
		}
	case reflect.String:
		target.SetString(v.(string))
	case reflect.Int:
		target.SetInt(int64(v.(float64)))
	case reflect.Bool:
		target.SetBool(v.(bool))
	}
}
func shape(v any, t reflect.Type, key string) error {
	fail := func() error { return fmt.Errorf("invalid observation shape at %s", key) }
	if t.Kind() == reflect.Pointer {
		if v == nil {
			if key == "turn" || key == "to" || key == "from" || key == "bids[]" {
				return nil
			}
			return fail()
		}
		return shape(v, t.Elem(), key)
	}
	if t == reflect.TypeOf(Action{}) {
		m, ok := v.(map[string]any)
		if !ok {
			return fail()
		}
		k, _ := m["kind"].(string)
		field := ""
		switch k {
		case "play":
			field = "card"
		case "pass":
			field = "cards"
		case "bid":
			field = "bid"
		default:
			return fail()
		}
		if len(m) != 3 {
			return fail()
		}
		if _, ok = m[field]; !ok {
			return fail()
		}
		if err := shape(m["seat"], reflect.TypeOf(0), "seat"); err != nil {
			return err
		}
		switch field {
		case "card":
			return shape(m[field], reflect.TypeOf(""), field)
		case "cards":
			return shape(m[field], reflect.TypeOf([]string{}), field)
		case "bid":
			return shape(m[field], reflect.TypeOf(0), field)
		}
	}
	switch t.Kind() {
	case reflect.Struct:
		m, ok := v.(map[string]any)
		if !ok {
			return fail()
		}
		known := map[string]bool{}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			tag := strings.Split(f.Tag.Get("json"), ",")
			name := tag[0]
			known[name] = true
			x, exists := m[name]
			optional := len(tag) > 1 && tag[1] == "omitempty"
			if !exists {
				if optional {
					continue
				}
				return fail()
			}
			if err := shape(x, f.Type, name); err != nil {
				return err
			}
		}
		for k := range m {
			if !known[k] {
				return fmt.Errorf("unexpected observation field %q", k)
			}
		}
	case reflect.Slice:
		a, ok := v.([]any)
		if !ok {
			return fail()
		}
		for _, x := range a {
			if err := shape(x, t.Elem(), key+"[]"); err != nil {
				return err
			}
		}
	case reflect.String:
		text, ok := v.(string)
		if !ok || key == "card" && !ValidCard(text) {
			return fail()
		}
	case reflect.Int:
		n, ok := v.(float64)
		if !ok || math.Trunc(n) != n || math.Abs(n) > safeInteger {
			return fail()
		}
	case reflect.Bool:
		if _, ok := v.(bool); !ok {
			return fail()
		}
	default:
		return fail()
	}
	return nil
}

// ValidateObservation validates constructed trusted DTOs without serializing.
func ValidateObservation(o Observation) error {
	return ValidateObservationContext(context.Background(), o)
}

// ValidateObservationContext checks cancellation while reading the retained
// original archive. It preserves every V1 field and validation rule.
func ValidateObservationContext(ctx context.Context, o Observation) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	bad := func(s string) error { return fmt.Errorf("invalid observation: %s", s) }
	seat := func(s int) bool { return s >= 0 && s < 4 }
	integer := func(n, min, max int) bool { return n >= min && n <= max }
	pseat := func(s *int) bool { return s == nil || seat(*s) }
	cards := func(cs []string, max int) bool {
		if cs == nil || len(cs) > max {
			return false
		}
		seen := map[string]bool{}
		for _, c := range cs {
			if !ValidCard(c) || seen[c] {
				return false
			}
			seen[c] = true
		}
		return true
	}
	plays := func(ps []Play) bool {
		if ps == nil || len(ps) > 4 {
			return false
		}
		seats := map[int]bool{}
		cs := map[string]bool{}
		for _, p := range ps {
			if !seat(p.Seat) || !ValidCard(p.Card) || seats[p.Seat] || cs[p.Card] {
				return false
			}
			seats[p.Seat] = true
			cs[p.Card] = true
		}
		return true
	}
	profiles := map[string]string{"hearts": "hearts-training-1.0.0", "spades-solo": "spades-solo-training-1.0.0", "spades-partners": "spades-training-1.0.0"}
	if !seat(o.Seat) || !seat(o.Dealer) || !pseat(o.Turn) || profiles[o.Mode] == "" || profiles[o.Mode] != o.RuleProfileID || o.ModuleVersion != "1.0.0" || o.ObservationSchemaVersion != "1.0.0" || o.FeatureVersion != "1.0.0" {
		return bad("identity or version")
	}
	if !slices.Contains([]string{"pass", "bid", "play", "trick-end", "hand-end", "match-end"}, o.Phase) || !slices.Contains([]string{"left", "right", "across", "hold"}, o.PassDirection) || !integer(o.HandNumber, 1, safeInteger) {
		return bad("phase or hand")
	}
	if !cards(o.Hand, 13) || len(o.HandSizes) != 4 || len(o.Bids) != 4 || len(o.Tricks) != 4 || len(o.Scores) != 4 || len(o.Bags) != 4 {
		return bad("hand arrays")
	}
	for _, s := range Seats() {
		if !integer(o.HandSizes[s], 0, 13) || !integer(o.Tricks[s], 0, 13) || !integer(o.Bags[s], 0, 9) || !integer(o.Scores[s], -safeInteger, safeInteger) || o.Bids[s] != nil && !integer(*o.Bids[s], 0, 13) {
			return bad("seat values")
		}
	}
	if len(o.Hand) != o.HandSizes[o.Seat] {
		return bad("own hand size mismatch")
	}
	if !plays(o.Trick) || o.History == nil || len(o.History) > 13 {
		return bad("trick history")
	}
	for _, t := range o.History {
		if !plays(t.Plays) || !seat(t.Winner) {
			return bad("history trick")
		}
	}
	if !cards(o.Pass.Outgoing, 3) || !cards(o.Pass.Incoming, 3) || !pseat(o.Pass.To) || !pseat(o.Pass.From) {
		return bad("pass memory")
	}
	if o.Events == nil || len(o.Events) > 100000 {
		return bad("events")
	}
	for i, e := range o.Events {
		if i%256 == 0 {
			if err := ctx.Err(); err != nil {
				return err
			}
		}
		if !integer(e.ID, 1, safeInteger) || !slices.Contains([]string{"hand-started", "bid-placed", "card-played", "cards-passed", "trick-resolved", "trick-collected", "moon-shot", "hand-scored"}, e.Type) || len(utf16.Encode([]rune(e.Message))) > 2000 || !pseat(e.Seat) || e.Card != "" && !ValidCard(e.Card) || e.Bid != nil && !integer(*e.Bid, 0, 13) {
			return bad("event")
		}
	}
	if len(o.Memory) != 4 {
		return bad("memory")
	}
	suits := map[string]bool{}
	for _, m := range o.Memory {
		if !slices.Contains(Suits(), m.Suit) || suits[m.Suit] || !integer(m.Played, 0, 13) || !integer(m.Remaining, 0, 13) || m.Played+m.Remaining != 13 || m.VoidSeats == nil || len(m.VoidSeats) > 4 {
			return bad("suit memory")
		}
		suits[m.Suit] = true
		seen := map[int]bool{}
		for _, s := range m.VoidSeats {
			if !seat(s) || seen[s] {
				return bad("void seat")
			}
			seen[s] = true
		}
	}
	if o.KnownHoldings == nil || len(o.KnownHoldings) > 3 {
		return bad("known holdings")
	}
	for _, p := range o.KnownHoldings {
		if !seat(p.Seat) || !ValidCard(p.Card) {
			return bad("known holding")
		}
	}
	if o.LegalActions == nil || len(o.LegalActions) > 286 {
		return bad("legal actions")
	}
	for _, a := range o.LegalActions {
		if a.Seat != o.Seat {
			return bad("wrong action actor")
		}
		switch a.Kind {
		case "play":
			if !ValidCard(a.Card) || a.Bid != 0 || a.Cards != nil {
				return bad("play action")
			}
		case "bid":
			if !integer(a.Bid, 0, 13) || a.Card != "" || a.Cards != nil {
				return bad("bid action")
			}
		case "pass":
			if !cards(a.Cards, 3) || len(a.Cards) != 3 || a.Card != "" || a.Bid != 0 {
				return bad("pass action")
			}
		default:
			return bad("action kind")
		}
	}
	if o.HandResult != nil {
		h := o.HandResult
		if len(h.Points) != 4 || len(h.Bags) != 4 || !pseat(h.Winner) {
			return bad("hand result")
		}
		for i := range h.Points {
			if !integer(h.Points[i], -safeInteger, safeInteger) || !integer(h.Bags[i], 0, 9) {
				return bad("hand result values")
			}
		}
	}
	ids := func(as []Action) []string {
		v := []string{}
		for _, a := range as {
			v = append(v, ActionID(a))
		}
		sort.Strings(v)
		return v
	}
	if !slices.Equal(ids(ActionsFor(o)), ids(o.LegalActions)) {
		return bad("legal reference set mismatch")
	}
	if !reflect.DeepEqual(GetMemory(o), o.Memory) {
		return bad("public memory mismatch")
	}
	if o.Phase == "pass" && o.Turn != nil {
		return bad("sealed pass turn")
	}
	return nil
}
