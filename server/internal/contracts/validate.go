// Package contracts owns generated public wire values and their strict JSON boundary.
// The active TypeScript schema root and registered public fragments are the only
// editable schema sources. No private state schema is part of this package.
package contracts

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// Resource limits apply before compilation/validation or generated decoding.
const MaxJSONBytes = 16 << 20
const MaxJSONDepth = 128

//go:embed schema.generated.json
var publicSchema []byte

var compiled map[string]*jsonschema.Schema
var compileErr error
var compileOnce sync.Once

type noExternalResources struct{}

func (noExternalResources) Load(url string) (any, error) {
	return nil, fmt.Errorf("unregistered schema resource: %s", url)
}

// Registered patterns use the common ECMAScript/RE2 subset; Go spells \uNNNN
// codepoint escapes as \x{NNNN}. Reject new patterns until parity is reviewed.
var unicodeEscape = regexp.MustCompile(`\\u([0-9a-fA-F]{4})`)

func publicRegexp(pattern string) (jsonschema.Regexp, error) {
	if !supportedPatterns[pattern] {
		return nil, fmt.Errorf("unreviewed public pattern: %s", pattern)
	}
	return regexp.Compile(unicodeEscape.ReplaceAllString(pattern, `\x{$1}`))
}

func initialize() {
	var schema any
	if compileErr = json.Unmarshal(publicSchema, &schema); compileErr != nil {
		return
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	compiler.UseLoader(noExternalResources{})
	compiler.UseRegexpEngine(publicRegexp)
	id := schema.(map[string]any)["$id"].(string)
	if compileErr = compiler.AddResource(id, schema); compileErr != nil {
		return
	}
	compiled = make(map[string]*jsonschema.Schema, len(contractNames))
	for _, name := range contractNames {
		compiled[name], compileErr = compiler.Compile(id + "#/$defs/" + name)
		if compileErr != nil {
			return
		}
	}
}

// Names returns a copy of the generated registry of public contracts.
func Names() []string { return append([]string(nil), contractNames...) }

// Validate checks exactly one JSON value with the named active public schema.
// It never strips properties, coerces types, supplies defaults, or fetches URLs.
// Binary64 numbers deliberately match JSON.parse + the actual Ajv validators.
func Validate(name string, raw []byte) error {
	compileOnce.Do(initialize)
	if compileErr != nil {
		return fmt.Errorf("compile public contracts: %w", compileErr)
	}
	schema, found := compiled[name]
	if !found {
		return fmt.Errorf("unknown public contract %q", name)
	}
	value, err := ParseJSON(raw)
	if err != nil {
		return err
	}
	if err = schema.Validate(value); err != nil {
		return fmt.Errorf("invalid %s: %w", name, err)
	}
	return nil
}

// Decode validates before decoding into a caller's generated wire binding.
// Generated bindings also validate when json.Unmarshal is called directly.
func Decode(name string, raw []byte, out any) error {
	if err := Validate(name, raw); err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

// ParseJSON returns data-only JSON after rejecting duplicates, invalid UTF-8,
// unpaired UTF-16 escapes, nonfinite numbers and trailing values. Call Validate
// at public boundaries; ParseJSON alone does not establish any DTO shape.
func ParseJSON(raw []byte) (any, error) {
	if len(raw) > MaxJSONBytes {
		return nil, fmt.Errorf("JSON exceeds %d bytes", MaxJSONBytes)
	}
	if !utf8.Valid(raw) {
		return nil, fmt.Errorf("invalid UTF-8 JSON")
	}
	if err := pairedSurrogates(raw); err != nil {
		return nil, err
	}
	end, err := checkJSONValue(raw, 0, 0)
	if err != nil {
		return nil, err
	}
	if skipJSONSpace(raw, end) != len(raw) {
		return nil, fmt.Errorf("trailing or malformed JSON")
	}
	// The structural pass preserves duplicate/depth rejection before allocating
	// the parsed document. Unmarshal supplies all literal/string syntax checks
	// and the same binary64 numeric values as the original token decoder.
	var value any
	if err = json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func skipJSONSpace(raw []byte, i int) int {
	for i < len(raw) && (raw[i] == ' ' || raw[i] == '\t' || raw[i] == '\r' || raw[i] == '\n') {
		i++
	}
	return i
}

// checkJSONString finds the closing quote without interpreting value strings.
// Escaped object keys are decoded separately to detect equivalent spellings.
func checkJSONString(raw []byte, start int) (end int, escaped bool, err error) {
	for i := start + 1; i < len(raw); i++ {
		switch raw[i] {
		case '"':
			return i + 1, escaped, nil
		case '\\':
			escaped = true
			i++
		}
	}
	return 0, false, fmt.Errorf("unterminated JSON string")
}

// checkJSONValue checks nesting and duplicate normalized object keys without
// Decoder.Token's per-token allocations. It never accepts JSON on its own;
// ParseJSON always follows it with the standard library's complete decoder.
func checkJSONValue(raw []byte, start, depth int) (int, error) {
	if depth > MaxJSONDepth {
		return 0, fmt.Errorf("JSON nesting exceeds %d", MaxJSONDepth)
	}
	i := skipJSONSpace(raw, start)
	if i == len(raw) {
		return 0, fmt.Errorf("missing JSON value")
	}
	switch raw[i] {
	case '{':
		i = skipJSONSpace(raw, i+1)
		if i < len(raw) && raw[i] == '}' {
			return i + 1, nil
		}
		keys := make(map[string]struct{})
		for {
			if i >= len(raw) || raw[i] != '"' {
				return 0, fmt.Errorf("expected JSON object key")
			}
			end, escaped, err := checkJSONString(raw, i)
			if err != nil {
				return 0, err
			}
			key := string(raw[i+1 : end-1])
			if escaped {
				if err = json.Unmarshal(raw[i:end], &key); err != nil {
					return 0, err
				}
			}
			if _, exists := keys[key]; exists {
				return 0, fmt.Errorf("duplicate object property %q", key)
			}
			keys[key] = struct{}{}
			i = skipJSONSpace(raw, end)
			if i >= len(raw) || raw[i] != ':' {
				return 0, fmt.Errorf("missing JSON object separator")
			}
			i, err = checkJSONValue(raw, i+1, depth+1)
			if err != nil {
				return 0, err
			}
			i = skipJSONSpace(raw, i)
			if i < len(raw) && raw[i] == '}' {
				return i + 1, nil
			}
			if i >= len(raw) || raw[i] != ',' {
				return 0, fmt.Errorf("unterminated JSON object")
			}
			i = skipJSONSpace(raw, i+1)
		}
	case '[':
		i = skipJSONSpace(raw, i+1)
		if i < len(raw) && raw[i] == ']' {
			return i + 1, nil
		}
		for {
			var err error
			i, err = checkJSONValue(raw, i, depth+1)
			if err != nil {
				return 0, err
			}
			i = skipJSONSpace(raw, i)
			if i < len(raw) && raw[i] == ']' {
				return i + 1, nil
			}
			if i >= len(raw) || raw[i] != ',' {
				return 0, fmt.Errorf("unterminated JSON array")
			}
			i = skipJSONSpace(raw, i+1)
		}
	case '"':
		end, _, err := checkJSONString(raw, i)
		return end, err
	default:
		start = i
		for i < len(raw) && !strings.ContainsRune(",]} \t\r\n", rune(raw[i])) {
			i++
		}
		if i == start {
			return 0, fmt.Errorf("missing JSON literal")
		}
		return i, nil
	}
}

func pairedSurrogates(raw []byte) error {
	inString := false
	for i := 0; i < len(raw); i++ {
		if raw[i] == '"' {
			inString = !inString
			continue
		}
		if !inString || raw[i] != '\\' {
			continue
		}
		i++
		if i >= len(raw) {
			break
		}
		if raw[i] != 'u' || i+4 >= len(raw) {
			continue
		}
		code, err := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		if err != nil {
			continue
		} // The JSON decoder supplies the syntax error.
		i += 4
		if code >= 0xdc00 && code <= 0xdfff {
			return fmt.Errorf("unpaired low surrogate")
		}
		if code >= 0xd800 && code <= 0xdbff {
			if i+6 >= len(raw) || string(raw[i+1:i+3]) != `\u` {
				return fmt.Errorf("unpaired high surrogate")
			}
			low, err := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
			if err != nil || low < 0xdc00 || low > 0xdfff {
				return fmt.Errorf("unpaired high surrogate")
			}
			i += 6
		}
	}
	return nil
}

// SchemaSHA256 identifies the exact generated bundled schema, not a new source.
func SchemaSHA256() string { return SHA256(publicSchema) }

// encoding/json replaces invalid Go string bytes with U+FFFD. Reject before
// encoding instead so a constructed typed DTO cannot silently change its value.
func validStrings(value any) error { return checkStrings(reflect.ValueOf(value)) }
func checkStrings(value reflect.Value) error {
	switch value.Kind() {
	case reflect.String:
		if !utf8.ValidString(value.String()) {
			return fmt.Errorf("invalid UTF-8 wire string")
		}
	case reflect.Pointer, reflect.Interface:
		if !value.IsNil() {
			return checkStrings(value.Elem())
		}
	case reflect.Array, reflect.Slice:
		for i := 0; i < value.Len(); i++ {
			if err := checkStrings(value.Index(i)); err != nil {
				return err
			}
		}
	case reflect.Struct:
		for i := 0; i < value.NumField(); i++ {
			if value.Type().Field(i).IsExported() {
				if err := checkStrings(value.Field(i)); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
