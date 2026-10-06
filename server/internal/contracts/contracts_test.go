package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

const fixtureDir = "testdata/"

// The M02A archive is an immutable independent regression input. New public
// definitions belong only to the active generated testdata directory.
func TestOriginalM02AFixturesRemainCompatible(t *testing.T) {
	raw, err := os.ReadFile("../../../qa/implementation/multi-game/m02a/contracts/validation-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		ID, Name, Raw string
		Boundary      bool
	}
	if err = json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		t.Run(row.ID, func(t *testing.T) {
			if err := Validate(row.Name, []byte(row.Raw)); (err == nil) != row.Boundary {
				t.Fatalf("frozen M02A result changed: %v", err)
			}
		})
	}
}

func fixture(t *testing.T, name string, out any) {
	t.Helper()
	raw, err := os.ReadFile(fixtureDir + name)
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, out); err != nil {
		t.Fatal(err)
	}
}

func TestActualAjvSchemaFixtures(t *testing.T) {
	var fixtures []struct {
		ID, Name, Raw string
		Ajv, Boundary bool
	}
	fixture(t, "validation-fixtures.json", &fixtures)
	for _, test := range fixtures {
		t.Run(test.ID, func(t *testing.T) {
			err := Validate(test.Name, []byte(test.Raw))
			if (err == nil) != test.Boundary {
				t.Fatalf("Go accepted=%t; actual Ajv=%t, strict boundary=%t: %v", err == nil, test.Ajv, test.Boundary, err)
			}
			binding := generatedWire(test.Name)
			if binding == nil {
				t.Fatal("no generated wire binding")
			}
			err = binding.UnmarshalJSON([]byte(test.Raw))
			if (err == nil) != test.Boundary {
				t.Fatalf("generated binding accepted=%t want=%t: %v", err == nil, test.Boundary, err)
			}
			if test.Boundary {
				encoded, err := binding.MarshalJSON()
				if err != nil {
					t.Fatalf("generated binding cannot encode valid input: %v", err)
				}
				original, err := ParseJSON([]byte(test.Raw))
				if err != nil {
					t.Fatal(err)
				}
				roundTrip, err := ParseJSON(encoded)
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(original, roundTrip) {
					t.Fatalf("generated binding lost a JSON value\ninput=%s\noutput=%s", test.Raw, encoded)
				}
			}
		})
	}
}
func TestStrictParsing(t *testing.T) {
	for name, raw := range map[string]string{
		"empty": "", "trailing": `{} {}`, "trailing-comma": `[1,]`, "nonfinite": `1e400`, "NaN": `NaN`, "leading-zero": `01`, "invalid-utf8": string([]byte{'"', 0xff, '"'}),
		"nested-duplicate": `{"x":[{"a":1,"a":2}]}`, "too-deep": strings.Repeat("[", MaxJSONDepth+2) + "0" + strings.Repeat("]", MaxJSONDepth+2), "too-big": `"` + strings.Repeat("a", MaxJSONBytes) + `"`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseJSON([]byte(raw)); err == nil {
				t.Fatal("invalid JSON accepted")
			}
		})
	}
	for _, raw := range []string{`[]`, `{}`, `null`, `["\ud83c\udca1"]`, `"\\ud800"`, `-0`, `1e-400`} {
		if _, err := ParseJSON([]byte(raw)); err != nil {
			t.Errorf("valid JSON %s: %v", raw, err)
		}
	}
}
func TestGeneratedEnvelopeAndOpaqueUnion(t *testing.T) {
	raw := []byte(`{"commandId":"c","gameId":"g","expectedRevision":0,"controlLeaseToken":"l"}`)
	var command CommandEnvelope
	if err := Decode("CommandEnvelope", raw, &command); err != nil {
		t.Fatal(err)
	}
	if command.CommandID != "c" || command.GameID != "g" || command.ExpectedRevision != 0 || command.ControlLeaseToken != "l" {
		t.Fatalf("bad generated envelope %#v", command)
	}
	command.ExpectedRevision = -1
	if _, err := json.Marshal(command); err == nil {
		t.Fatal("typed binding marshaled invalid negative revision")
	}
	before := command
	if err := json.Unmarshal([]byte(`{"commandId":"c","gameId":"g","expectedRevision":0,"controlLeaseToken":"l","private":true}`), &command); err == nil {
		t.Fatal("generated binding ignored unknown field")
	}
	if !reflect.DeepEqual(before, command) {
		t.Fatal("failed unmarshal mutated existing value")
	}
	command.ExpectedRevision = 0
	command.CommandID = string([]byte{0xff})
	if _, err := json.Marshal(command); err == nil {
		t.Fatal("constructed invalid UTF-8 silently replaced")
	}
	original := []byte(` { "kind" : "pass", "cards" : ["C2", "D2", "H2"] } `)
	var action GameAction
	if err := action.UnmarshalJSON(original); err != nil {
		t.Fatal(err)
	}
	clone := action
	copyRaw := action.RawJSON()
	copyRaw[0] = 'x'
	original[0] = 'x'
	want := ` { "kind" : "pass", "cards" : ["C2", "D2", "H2"] } `
	if string(action.RawJSON()) != want {
		t.Fatal("caller can mutate opaque payload")
	}
	if err := action.UnmarshalJSON([]byte(`{"kind":"bid","bid":0}`)); err != nil {
		t.Fatal(err)
	}
	if string(clone.RawJSON()) != want {
		t.Fatal("reassignment mutated prior opaque copy")
	}
	if _, err := clone.MarshalJSON(); err != nil {
		t.Fatal(err)
	}
	var zero GameAction
	if _, err := json.Marshal(zero); err == nil {
		t.Fatal("uninitialized opaque union marshaled")
	}
}
func TestNoExternalResourceLoading(t *testing.T) {
	c := jsonschema.NewCompiler()
	c.UseLoader(noExternalResources{})
	if err := c.AddResource("https://local.invalid/root", map[string]any{"$ref": "https://untrusted.invalid/private"}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Compile("https://local.invalid/root"); err == nil || !strings.Contains(err.Error(), "unregistered schema resource") {
		t.Fatalf("remote reference did not fail closed: %v", err)
	}
	if err := Validate("NotRegistered", []byte(`{}`)); err == nil {
		t.Fatal("unknown contract accepted")
	}
	if _, err := publicRegexp("(?=x)"); err == nil {
		t.Fatal("new regex accepted without review")
	}
}

type semanticsFixture struct {
	Canonical []struct {
		ID, Raw, Legacy, LegacyDigest, Command, CommandDigest, UTF16, UTF16Digest string
		LegacySupported                                                           bool
	}
	Random []struct {
		Seed, Stream uint32
		Next         []uint32
		Limits       []uint64
		Below        []uint32
		Unit         []float64
	}
	HashText []struct {
		Text string
		Hash uint32
	}
	Round []struct {
		Raw           string
		Value, Result float64
		NegativeZero  bool
	}
	SafeInteger []struct {
		Value float64
		Safe  bool
	}
}

func TestCanonicalAndDigestAgainstOriginalTS(t *testing.T) {
	var tests semanticsFixture
	fixture(t, "semantics-fixtures.json", &tests)
	for _, test := range tests.Canonical {
		t.Run(test.ID, func(t *testing.T) {
			for _, mode := range []struct {
				name, want, digest string
				fn                 func([]byte) ([]byte, error)
				supported          bool
			}{
				{"legacy-kernel", test.Legacy, test.LegacyDigest, LegacyKernelCanonical, test.LegacySupported},
				{"legacy-command", test.Command, test.CommandDigest, LegacyCommandCanonical, test.LegacySupported},
				{"utf16", test.UTF16, test.UTF16Digest, UTF16Canonical, true},
			} {
				t.Run(mode.name, func(t *testing.T) {
					got, err := mode.fn([]byte(test.Raw))
					if !mode.supported {
						if err == nil {
							t.Fatal("unsupported legacy key path silently canonicalized")
						}
						return
					}
					if err != nil {
						t.Fatal(err)
					}
					if string(got) != mode.want {
						t.Fatalf("canonical bytes\n got %s\nwant %s", got, mode.want)
					}
					if SHA256(got) != mode.digest {
						t.Fatal("digest mismatch")
					}
				})
			}
		})
	}
	for _, raw := range []string{`{"a-b":1}`, `{"é":1}`, `{"x":"\ud800"}`} {
		if _, err := LegacyKernelCanonical([]byte(raw)); err == nil {
			t.Fatalf("unsupported legacy path accepted: %s", raw)
		}
	}
}
func TestRandomAndNumericAgainstOriginalTS(t *testing.T) {
	var tests semanticsFixture
	fixture(t, "semantics-fixtures.json", &tests)
	for _, test := range tests.Random {
		t.Run(fmt.Sprintf("seed-%d-stream-%d", test.Seed, test.Stream), func(t *testing.T) {
			next, below, unit := NewRandom(test.Seed, test.Stream), NewRandom(test.Seed, test.Stream), NewRandom(test.Seed, test.Stream)
			for i, want := range test.Next {
				if got := next.Next(); got != want {
					t.Fatalf("next[%d] got=%d want=%d", i, got, want)
				}
			}
			for i, limit := range test.Limits {
				got, err := below.Below(limit)
				if err != nil || got != test.Below[i] {
					t.Fatalf("below[%d] got=%d want=%d: %v", limit, got, test.Below[i], err)
				}
			}
			for i, want := range test.Unit {
				if got := unit.Unit(); got != want {
					t.Fatalf("unit[%d] got=%v want=%v", i, got, want)
				}
			}
		})
	}
	for _, test := range tests.HashText {
		if got, err := HashText(test.Text); err != nil || got != test.Hash {
			t.Errorf("HashText(%q)=%d want %d: %v", test.Text, got, test.Hash, err)
		}
	}
	if _, err := HashText(string([]byte{0xff})); err == nil {
		t.Fatal("invalid hash input silently replaced")
	}
	for _, test := range tests.Round {
		input, err := strconv.ParseFloat(test.Raw, 64)
		if err != nil {
			t.Fatal(err)
		}
		got := JSRound(input)
		if got != test.Result || (got == 0 && math.Signbit(got)) != test.NegativeZero {
			t.Errorf("round(%v)=%v negativeZero=%t want=%v negativeZero=%t", test.Value, got, math.Signbit(got), test.Result, test.NegativeZero)
		}
	}
	for _, test := range tests.SafeInteger {
		if got := SafeInteger(test.Value); got != test.Safe {
			t.Errorf("safeInteger(%v)=%t want=%t", test.Value, got, test.Safe)
		}
	}
	for _, n := range []uint64{0, 4294967297} {
		if _, err := NewRandom(1, 0).Below(n); err == nil {
			t.Error("invalid random limit accepted")
		}
	}
}

func TestNullEmptyAndRequiredArrays(t *testing.T) {
	var action GameAction
	raw := []byte(`{"kind":"pass","cards":[]}`)
	if err := json.Unmarshal(raw, &action); err == nil {
		t.Fatal("empty 3-card pass accepted")
	}
	var names = Names()
	names[0] = "tamper"
	if Names()[0] == "tamper" {
		t.Fatal("caller can mutate contract registry")
	}
	before := append([]byte(nil), publicSchema...)
	for i := 0; i < 4; i++ {
		if err := Validate("Card", []byte(`"CA"`)); err != nil {
			t.Fatal(err)
		}
	}
	if !bytes.Equal(before, publicSchema) {
		t.Fatal("validation mutated schema")
	}
}
