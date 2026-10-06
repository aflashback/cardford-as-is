package records

import (
	"cardford/server/internal/contracts"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"time"
)

// strictRecord decodes a closed private record from untrusted bytes. It checks
// exact casing, required properties and nullability before typed decoding; the
// shared parser rejects duplicate keys, bad Unicode and excessive depth/bytes.
// It does not use a marshal/unmarshal round trip to validate the typed value.
func strictRecord(raw []byte, out any) error {
	if len(raw) == 0 || len(raw) > MaxRecordBytes {
		return fmt.Errorf("private record byte limit")
	}
	value, err := contracts.ParseJSON(raw)
	if err != nil {
		return err
	}
	t := reflect.TypeOf(out)
	if t == nil || t.Kind() != reflect.Pointer {
		return fmt.Errorf("private record destination must be a pointer")
	}
	if err := recordShape(value, t.Elem()); err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

var rawJSONType = reflect.TypeOf(json.RawMessage{})

func recordShape(value any, t reflect.Type) error {
	if t == rawJSONType {
		if value == nil {
			return fmt.Errorf("null private payload")
		}
		return nil
	}
	if t.Kind() == reflect.Pointer {
		if value == nil {
			return nil
		}
		return recordShape(value, t.Elem())
	}
	if value == nil {
		return fmt.Errorf("unexpected null %s", t)
	}
	switch t.Kind() {
	case reflect.Struct:
		obj, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("expected object %s", t)
		}
		if len(obj) != t.NumField() {
			return fmt.Errorf("unknown or missing %s field", t)
		}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			name := strings.Split(f.Tag.Get("json"), ",")[0]
			v, exists := obj[name]
			if !exists {
				return fmt.Errorf("missing field %s.%s", t, name)
			}
			if err := recordShape(v, f.Type); err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
		}
	case reflect.Slice, reflect.Array:
		if t.Kind() == reflect.Slice && t.Elem().Kind() == reflect.Uint8 {
			if _, ok := value.(string); !ok {
				return fmt.Errorf("expected base64 original bytes")
			}
			return nil
		}
		array, ok := value.([]any)
		if !ok || t.Kind() == reflect.Array && len(array) != t.Len() {
			return fmt.Errorf("invalid collection %s", t)
		}
		for _, v := range array {
			if err := recordShape(v, t.Elem()); err != nil {
				return err
			}
		}
	case reflect.String:
		if _, ok := value.(string); !ok {
			return fmt.Errorf("expected string")
		}
	case reflect.Bool:
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("expected boolean")
		}
	case reflect.Int, reflect.Int64:
		v, ok := value.(float64)
		if !ok || !contracts.SafeInteger(v) {
			return fmt.Errorf("expected safe integer")
		}
	default:
		return fmt.Errorf("unsupported record field %s", t)
	}
	return nil
}
func validText(s string) bool   { return strings.TrimSpace(s) != "" && len(s) <= 256 }
func validCounter(v int64) bool { return v >= 0 && v <= maxRecordInteger }
func validDigest(s string) bool {
	if len(s) != 64 {
		return false
	}
	for _, c := range s {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
func ValidatePolicy(p PolicyPin) error {
	if !validText(p.ID) || !validText(p.Version) || !validText(p.BudgetVersion) || p.Components == nil || len(p.Components) == 0 || len(p.Components) > 32 {
		return fmt.Errorf("invalid policy pin")
	}
	seen := map[string]bool{}
	for _, c := range p.Components {
		if !validText(c.ID) || !validText(c.Version) || seen[c.ID] {
			return fmt.Errorf("invalid or duplicated policy component")
		}
		seen[c.ID] = true
	}
	return nil
}
func ValidateSession(m SessionMetadata) error {
	if m.RecordVersion != RecordVersion || !validText(m.GameID) || !validText(m.OwnerID) {
		return fmt.Errorf("invalid session record identity")
	}
	for _, field := range []string{m.Pin.GameID, m.Pin.VariantID, m.Pin.ModuleVersion, m.Pin.RuleProfileID, m.Pin.StateSchemaVersion, m.Pin.ObservationSchemaVersion, m.Pin.PublicSchemaVersion, m.Pin.EventSchemaVersion} {
		if !validText(field) {
			return fmt.Errorf("incomplete module pin")
		}
	}
	if err := ValidatePolicy(m.Policy); err != nil {
		return err
	}
	groupSize := 1
	switch m.Competition.Mode {
	case "individual":
	case "partnership":
		groupSize = 2
	default:
		return fmt.Errorf("unsupported competition")
	}
	if len(m.Competition.Competitors) != 4/groupSize || len(m.Controllers) != 4 {
		return fmt.Errorf("requires four occupied seats")
	}
	seats, ids := map[int]bool{}, map[string]bool{}
	for _, c := range m.Competition.Competitors {
		if !validText(c.ID) || ids[c.ID] || len(c.Seats) != groupSize {
			return fmt.Errorf("invalid competition partition")
		}
		ids[c.ID] = true
		for _, seat := range c.Seats {
			if seat < 0 || seat > 3 || seats[seat] {
				return fmt.Errorf("invalid competitor seat")
			}
			seats[seat] = true
		}
	}
	seats = map[int]bool{}
	for _, c := range m.Controllers {
		expected := "computer"
		if c.Seat == 0 {
			expected = "human"
		}
		if c.Seat < 0 || c.Seat > 3 || seats[c.Seat] || c.Kind != expected {
			return fmt.Errorf("unsupported practice controllers")
		}
		seats[c.Seat] = true
	}
	return nil
}
func DecodeSession(raw []byte) (SessionMetadata, error) {
	var m SessionMetadata
	err := strictRecord(raw, &m)
	if err == nil {
		err = ValidateSession(m)
	}
	return m, err
}
func DecodeCheckpoint(raw []byte) (Checkpoint, error) {
	var c Checkpoint
	err := strictRecord(raw, &c)
	if err == nil {
		err = validateCheckpoint(c)
	}
	return c, err
}
func DecodeAnchor(raw []byte) (ReplayAnchor, error) {
	var a ReplayAnchor
	err := strictRecord(raw, &a)
	return a, err
}
func DecodeEvent(raw []byte) (EventRecord, error) {
	var e EventRecord
	err := strictRecord(raw, &e)
	if err == nil {
		err = ValidateEvent(e)
	}
	return e, err
}
func DecodeDecision(raw []byte) (DecisionRecord, error) {
	var d DecisionRecord
	err := strictRecord(raw, &d)
	if err == nil {
		err = ValidateDecisionShape(d)
	}
	return d, err
}
func DecodeCommand(raw []byte) (CommandRecord, error) {
	var c CommandRecord
	err := strictRecord(raw, &c)
	if err == nil {
		err = ValidateCommand(c)
	}
	return c, err
}
func validateCheckpoint(c Checkpoint) error {
	if c.CodecVersion != CompactCodecVersion || c.EventCount < 1 || c.EventCount > MaxEventCount || c.EventBytes < 1 || c.EventBytes > MaxArchiveBytes || !validDigest(c.EventDigest) || len(c.State) == 0 || len(c.State) > MaxHotBytes {
		return fmt.Errorf("invalid compact checkpoint")
	}
	return nil
}
func ValidateEvent(e EventRecord) error {
	if e.RecordVersion != RecordVersion || !validText(e.GameID) || e.Sequence < 1 || e.Sequence > MaxEventCount || !validCounter(e.Revision) || len(e.Payload) == 0 || len(e.Payload) > MaxHotBytes {
		return fmt.Errorf("invalid event record")
	}
	_, err := contracts.ParseJSON(e.Payload)
	return err
}
func ValidateCommand(c CommandRecord) error {
	if c.RecordVersion != RecordVersion || !validText(c.GameID) || !validText(c.CommandID) || c.Revision < 1 || !validCounter(c.Revision) || len(c.Command) == 0 || len(c.Command) > MaxHotBytes || !validDigest(c.Digest) {
		return fmt.Errorf("invalid command record")
	}
	digest, err := CommandDigest(c.GameID, c.Revision, c.Command)
	if err != nil {
		return err
	}
	if digest != c.Digest {
		return fmt.Errorf("command intent digest mismatch")
	}
	return nil
}
func CommandDigest(gameID string, revision int64, command []byte) (string, error) {
	if !validText(gameID) || revision < 1 || !validCounter(revision) || len(command) == 0 || len(command) > MaxHotBytes {
		return "", fmt.Errorf("invalid command intent")
	}
	if _, err := contracts.ParseJSON(command); err != nil {
		return "", err
	}
	intent := struct {
		RecordVersion string          `json:"recordVersion"`
		GameID        string          `json:"gameId"`
		Revision      int64           `json:"revision"`
		Command       json.RawMessage `json:"command"`
	}{RecordVersion, gameID, revision, command}
	raw, err := json.Marshal(intent)
	if err != nil {
		return "", err
	}
	return JSONDigest(raw)
}
func ValidateDecisionShape(d DecisionRecord) error {
	if d.RecordVersion != RecordVersion || !validCounter(d.Revision) || d.Actor < 0 || d.Actor > 3 || !validDigest(d.InputDigest) || d.AttemptFence < 1 || !validCounter(d.AttemptFence) {
		return fmt.Errorf("invalid decision identity")
	}
	for _, s := range []string{d.ID, d.OwnerID, d.GameID, d.WindowID, d.Purpose, d.PacketVersion, d.SelectedCandidateID, d.AnalysisSchema, d.AdviceSchema, d.ReceiptID, d.AttemptID, d.Access.OwnerID, d.Access.GrantID, d.Access.UnitID} {
		if !validText(s) {
			return fmt.Errorf("missing decision binding")
		}
	}
	if err := ValidatePolicy(d.Policy); err != nil {
		return err
	}
	if d.Access.Generation < 1 || d.Access.ControlRevision < 1 || !validCounter(d.Access.Generation) || !validCounter(d.Access.ControlRevision) || d.OwnerID != d.Access.OwnerID {
		return fmt.Errorf("invalid decision access admission")
	}
	if len(d.Analysis) == 0 || len(d.Advice) == 0 || len(d.Analysis)+len(d.Advice) > MaxRecordBytes/2 {
		return fmt.Errorf("original decision result byte bounds")
	}
	return nil
}
func ValidateExposure(e ExposureRecord, d DecisionRecord) error {
	if e.RecordVersion != RecordVersion || !validText(e.ID) || e.DecisionID != d.ID || e.OwnerID != d.OwnerID || e.GameID != d.GameID || e.ReceiptID != d.ReceiptID || e.ContentDigest != contracts.SHA256(d.Advice) {
		return fmt.Errorf("exposure binding mismatch")
	}
	t, err := time.Parse(time.RFC3339Nano, e.ExposedAt)
	if err != nil || t.Format(time.RFC3339Nano) != e.ExposedAt {
		return fmt.Errorf("invalid exposure time")
	}
	return nil
}
