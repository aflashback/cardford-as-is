package contracts

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"math/bits"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

func SHA256(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }
func SafeInteger(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && math.Trunc(value) == value && math.Abs(value) <= 9007199254740991
}

// JSRound follows Math.round: ties toward +infinity and negative zero preserved.
func JSRound(value float64) float64 {
	if value == 0 || math.IsInf(value, 0) || math.IsNaN(value) {
		return value
	}
	floor := math.Floor(value)
	result := floor
	if value-floor >= 0.5 {
		result++
	}
	if result == 0 && value < 0 {
		return math.Copysign(0, -1)
	}
	return result
}

// UTF16Canonical corresponds to gate/runner.ts canonicalJson for strict JSON.
// It is not a replacement for the differently ordered legacy kernel digests.
func UTF16Canonical(raw []byte) ([]byte, error)         { return canonicalBytes(raw, "utf16") }
func LegacyKernelCanonical(raw []byte) ([]byte, error)  { return canonicalBytes(raw, "kernel") }
func LegacyCommandCanonical(raw []byte) ([]byte, error) { return canonicalBytes(raw, "command") }

func canonicalBytes(raw []byte, mode string) ([]byte, error) {
	value, err := ParseJSON(raw)
	if err != nil {
		return nil, err
	}
	var out strings.Builder
	if err = appendCanonical(&out, value, mode); err != nil {
		return nil, err
	}
	return []byte(out.String()), nil
}
func appendCanonical(out *strings.Builder, value any, mode string) error {
	switch value := value.(type) {
	case nil:
		out.WriteString("null")
	case bool:
		out.WriteString(strconv.FormatBool(value))
	case string:
		appendJSONString(out, value)
	case float64:
		out.WriteString(jsNumber(value))
	case []any:
		out.WriteByte('[')
		for i, item := range value {
			if i != 0 {
				out.WriteByte(',')
			}
			if err := appendCanonical(out, item, mode); err != nil {
				return err
			}
		}
		out.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(value))
		for key := range value {
			if mode != "utf16" {
				for _, char := range key {
					if !(char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9') {
						return fmt.Errorf("unsupported legacy canonical key %q", key)
					}
				}
			}
			keys = append(keys, key)
		}
		sort.Slice(keys, func(i, j int) bool {
			if mode == "utf16" {
				return utf16Less(keys[i], keys[j])
			}
			if mode == "command" {
				a, aOK := arrayIndex(keys[i])
				b, bOK := arrayIndex(keys[j])
				if aOK != bOK {
					return aOK
				}
				if aOK {
					return a < b
				}
			}
			return legacyASCIILess(keys[i], keys[j])
		})
		out.WriteByte('{')
		for i, key := range keys {
			if i != 0 {
				out.WriteByte(',')
			}
			appendJSONString(out, key)
			out.WriteByte(':')
			if err := appendCanonical(out, value[key], mode); err != nil {
				return err
			}
		}
		out.WriteByte('}')
	default:
		return fmt.Errorf("unsupported JSON value %T", value)
	}
	return nil
}
func arrayIndex(key string) (uint64, bool) {
	n, err := strconv.ParseUint(key, 10, 32)
	return n, err == nil && n < 4294967295 && strconv.FormatUint(n, 10) == key
}
func utf16Less(a, b string) bool {
	left, right := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(left) && i < len(right); i++ {
		if left[i] != right[i] {
			return left[i] < right[i]
		}
	}
	return len(left) < len(right)
}
func legacyASCIILess(a, b string) bool {
	lowerA, lowerB := strings.ToLower(a), strings.ToLower(b)
	if lowerA != lowerB {
		return lowerA < lowerB
	}
	// en-US ICU tertiary order is lowercase before uppercase at the first case difference.
	for i := 0; i < len(a) && i < len(b); i++ {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return len(a) < len(b)
}
func appendJSONString(out *strings.Builder, value string) {
	const hex = "0123456789abcdef"
	out.WriteByte('"')
	for _, r := range value {
		switch r {
		case '"':
			out.WriteString(`\"`)
		case '\\':
			out.WriteString(`\\`)
		case '\b':
			out.WriteString(`\b`)
		case '\f':
			out.WriteString(`\f`)
		case '\n':
			out.WriteString(`\n`)
		case '\r':
			out.WriteString(`\r`)
		case '\t':
			out.WriteString(`\t`)
		default:
			if r < 0x20 {
				out.WriteString(`\u00`)
				out.WriteByte(hex[r>>4])
				out.WriteByte(hex[r&15])
			} else {
				out.WriteRune(r)
			}
		}
	}
	out.WriteByte('"')
}
func jsNumber(value float64) string {
	if value == 0 {
		return "0"
	}
	format := byte('f')
	absolute := math.Abs(value)
	if absolute < 1e-6 || absolute >= 1e21 {
		format = 'e'
	}
	text := strconv.FormatFloat(value, format, -1, 64)
	// JSON.stringify omits exponent leading zeros. Positive exponents keep '+'.
	text = strings.ReplaceAll(text, "e-0", "e-")
	text = strings.ReplaceAll(text, "e+0", "e+")
	return text
}

const RandomVersion = "xoshiro128ss-splitmix-1.0.0"

type Random struct{ a, b, c, d uint32 }

func NewRandom(seed, stream uint32) *Random {
	mix := seed ^ ((stream + 1) * 0x9e3779b9)
	splitmix := func() uint32 {
		mix += 0x9e3779b9
		z := mix
		z = (z ^ (z >> 16)) * 0x85ebca6b
		z = (z ^ (z >> 13)) * 0xc2b2ae35
		return z ^ (z >> 16)
	}
	random := &Random{splitmix(), splitmix(), splitmix(), splitmix()}
	if random.a|random.b|random.c|random.d == 0 {
		random.a = 1
	}
	for i := 0; i < 8; i++ {
		random.Next()
	}
	return random
}
func (r *Random) Next() uint32 {
	result := bits.RotateLeft32(r.b*5, 7) * 9
	t := r.b << 9
	r.c ^= r.a
	r.d ^= r.b
	r.b ^= r.c
	r.a ^= r.d
	r.c ^= t
	r.d = bits.RotateLeft32(r.d, 11)
	return result
}
func (r *Random) Below(limit uint64) (uint32, error) {
	if limit < 1 || limit > 1<<32 {
		return 0, fmt.Errorf("random limit must be from 1 to 2^32")
	}
	if limit == 1 {
		return 0, nil
	}
	ceiling := uint64(1<<32) - (uint64(1<<32) % limit)
	for {
		value := uint64(r.Next())
		if value < ceiling {
			return uint32(value % limit), nil
		}
	}
}
func (r *Random) Unit() float64 { return float64(r.Next()) / 4294967296 }

// HashText uses UTF-16 code units, not UTF-8 bytes or Unicode scalar values.
func HashText(text string) (uint32, error) {
	if !utf8.ValidString(text) {
		return 0, fmt.Errorf("invalid UTF-8 hash input")
	}
	hash := uint32(0x811c9dc5)
	for _, unit := range utf16.Encode([]rune(text)) {
		hash ^= uint32(unit)
		hash *= 0x01000193
	}
	return hash, nil
}
