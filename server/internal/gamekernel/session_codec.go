package gamekernel

import (
	"bytes"
	"cardford/server/internal/contracts"
	"encoding/json"
	"fmt"
)

// DecodeSessionJSON is the strict V2 data boundary. Canonicalization preserves
// JavaScript JSON number semantics (1, 1.0 and 1e0 are the same integer) before
// typed decoding, while rejecting duplicate keys, invalid Unicode and excessive
// input size. Comparing the re-encoded value rejects unknown/missing fields,
// wrong casing, null optional values and fixed-array length mismatches.
// The original V1 decoders remain unchanged.
func DecodeSessionJSON(raw json.RawMessage, out any) error {
	original, err := contracts.UTF16Canonical(raw)
	if err != nil {
		return err
	}
	if err = json.Unmarshal(original, out); err != nil {
		return err
	}
	encoded, err := json.Marshal(out)
	if err != nil {
		return err
	}
	roundtrip, err := contracts.UTF16Canonical(encoded)
	if err != nil {
		return err
	}
	if !bytes.Equal(original, roundtrip) {
		return fmt.Errorf("invalid closed session JSON shape")
	}
	return nil
}
