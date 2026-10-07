package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"os"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

// Frozen token-parser implementation from b822d0d; never regenerate from the optimized parser.
func frozenParseJSON(raw []byte) (any, error) {
	if len(raw) > MaxJSONBytes {
		return nil, fmt.Errorf("JSON exceeds %d bytes", MaxJSONBytes)
	}
	if !utf8.Valid(raw) {
		return nil, fmt.Errorf("invalid UTF-8 JSON")
	}
	if err := pairedSurrogates(raw); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	value, err := frozenReadValue(decoder, 0)
	if err != nil {
		return nil, err
	}
	if _, err = decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("trailing or malformed JSON")
	}
	return value, nil
}

func frozenReadValue(decoder *json.Decoder, depth int) (any, error) {
	if depth > MaxJSONDepth {
		return nil, fmt.Errorf("JSON nesting exceeds %d", MaxJSONDepth)
	}
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	delim, compound := token.(json.Delim)
	if !compound {
		return token, nil
	}
	switch delim {
	case '{':
		result := make(map[string]any)
		for decoder.More() {
			token, err := decoder.Token()
			if err != nil {
				return nil, err
			}
			key, ok := token.(string)
			if !ok {
				return nil, fmt.Errorf("nonstring object key")
			}
			if _, exists := result[key]; exists {
				return nil, fmt.Errorf("duplicate object property %q", key)
			}
			value, err := frozenReadValue(decoder, depth+1)
			if err != nil {
				return nil, err
			}
			result[key] = value
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim('}') {
			return nil, fmt.Errorf("unterminated object")
		}
		return result, nil
	case '[':
		result := make([]any, 0)
		for decoder.More() {
			value, err := frozenReadValue(decoder, depth+1)
			if err != nil {
				return nil, err
			}
			result = append(result, value)
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim(']') {
			return nil, fmt.Errorf("unterminated array")
		}
		return result, nil
	default:
		return nil, fmt.Errorf("unexpected JSON delimiter")
	}
}

func parserSeeds() [][]byte {
	values := []string{
		``, `null`, `true`, `false`, `0`, `-0`, `1.0`, `1e0`, `1e-400`, `1e400`, `9007199254740993`, `1.7976931348623157e308`, `-1.7976931348623159e308`, `NaN`, `01`, `1.`, `1e`,
		`[]`, `{}`, `{"a":1,"a":2}`, `{"a":1,"\u0061":2}`, `{"\ud83d\ude00":1,"😀":2}`, `{"a":{"a":1},"b":{"a":2}}`,
		`{"nested":[{"a":1,"a":2}]}`, `{"slash\\quote\"key":1}`, `{"\u0000":1,"\u0000":2}`, `{"a/b":1,"a\/b":2}`,
		`"\ud800"`, `"\udc00"`, `"\ud83d\ude00"`, `"\\ud800"`, `"\u0000"`, `"\q"`, `"unterminated`, `"line` + "\n" + `break"`,
		`{} {}`, `[1,]`, `{"a":1,}`, `{"a":}`, `{"a" 1}`, `]`, `}`, `[[`, `["a:b,{[}]"]`, string([]byte{'"', 0xff, '"'}),
	}
	for _, n := range []int{127, 128, 129, 130} {
		values = append(values, strings.Repeat("[", n)+"0"+strings.Repeat("]", n), strings.Repeat("[", n)+strings.Repeat("]", n), strings.Repeat(`{"a":`, n)+"0"+strings.Repeat("}", n))
	}
	result := make([][]byte, len(values))
	for i, value := range values {
		result[i] = []byte(value)
	}
	return result
}

type parserFixture struct {
	ID, Raw string
}

func parserFixtures(tb testing.TB) []parserFixture {
	tb.Helper()
	raw, err := os.ReadFile("testdata/validation-fixtures.json")
	if err != nil {
		tb.Fatal(err)
	}
	var fixtures []parserFixture
	if err = json.Unmarshal(raw, &fixtures); err != nil {
		tb.Fatal(err)
	}
	return fixtures
}

func parsedJSONEqual(left, right any) bool {
	switch a := left.(type) {
	case float64:
		b, ok := right.(float64)
		return ok && math.Float64bits(a) == math.Float64bits(b)
	case []any:
		b, ok := right.([]any)
		if !ok || len(a) != len(b) {
			return false
		}
		for i := range a {
			if !parsedJSONEqual(a[i], b[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		b, ok := right.(map[string]any)
		if !ok || len(a) != len(b) {
			return false
		}
		for key, value := range a {
			other, exists := b[key]
			if !exists || !parsedJSONEqual(value, other) {
				return false
			}
		}
		return true
	default:
		return reflect.DeepEqual(left, right)
	}
}

func checkParserParity(t *testing.T, raw []byte) {
	t.Helper()
	want, oldErr := frozenParseJSON(raw)
	got, err := ParseJSON(raw)
	if (err == nil) != (oldErr == nil) || err == nil && !parsedJSONEqual(got, want) {
		t.Fatalf("parser parity changed: new=%#v (%v), old=%#v (%v), raw=%q", got, err, want, oldErr, raw)
	}
}

func TestStrictParserDifferentialCorpus(t *testing.T) {
	seeds := parserSeeds()
	for _, fixture := range parserFixtures(t) {
		seeds = append(seeds, []byte(fixture.Raw))
	}
	for _, raw := range seeds {
		checkParserParity(t, raw)
	}
	// Deterministic malformed-input mutations complement the Go fuzz target.
	rng := rand.New(rand.NewSource(20261007))
	mutations := []byte("{}[],:\"\\01239eE-+ \n\txyz")
	for i := 0; i < 3000; i++ {
		raw := bytes.Clone(seeds[rng.Intn(len(seeds))])
		if len(raw) == 0 {
			continue
		}
		index := rng.Intn(len(raw))
		switch i % 3 {
		case 0:
			raw[index] = mutations[rng.Intn(len(mutations))]
		case 1:
			raw = append(raw[:index], raw[index+1:]...)
		case 2:
			raw = append(append(raw[:index:index], mutations[rng.Intn(len(mutations))]), raw[index:]...)
		}
		checkParserParity(t, raw)
	}
}

func FuzzStrictParserParity(f *testing.F) {
	for _, raw := range parserSeeds() {
		f.Add(raw)
	}
	f.Fuzz(func(t *testing.T, raw []byte) { checkParserParity(t, raw) })
}

var parsedJSONSink any

func BenchmarkParseSavedJSON(b *testing.B) {
	for _, fixture := range parserFixtures(b) {
		if fixture.ID != "command-valid" && fixture.ID != "witness-PlatformSessionView" && fixture.ID != "witness-PlatformAccountView" {
			continue
		}
		b.Run(fixture.ID, func(b *testing.B) {
			raw := []byte(fixture.Raw)
			b.ReportAllocs()
			b.SetBytes(int64(len(raw)))
			for b.Loop() {
				value, err := ParseJSON(raw)
				if err != nil {
					b.Fatal(err)
				}
				parsedJSONSink = value
			}
		})
	}
}
