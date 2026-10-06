package spades

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"strings"
)

// The private codec uses exact field names, required fields, non-null
// collections, fixed tuple lengths, and a separate semantic validator. Merely
// using DisallowUnknownFields would accept missing fields, null scalars, case
// aliases, duplicate keys, and short fixed-size arrays.
func strictDecode(raw []byte, dst any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	if err := scanJSON(d, 0); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON data")
	}
	if err := checkShape(raw, reflect.TypeOf(dst).Elem(), false); err != nil {
		return err
	}
	d = json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	return d.Decode(dst)
}
func scanJSON(d *json.Decoder, depth int) error {
	if depth > 32 {
		return fmt.Errorf("JSON nesting limit exceeded")
	}
	t, err := d.Token()
	if err != nil {
		return err
	}
	delim, ok := t.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]bool{}
		for d.More() {
			key, err := d.Token()
			if err != nil {
				return err
			}
			name, ok := key.(string)
			if !ok || seen[name] {
				return fmt.Errorf("duplicate or invalid JSON key")
			}
			seen[name] = true
			if err = scanJSON(d, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for d.More() {
			if err = scanJSON(d, depth+1); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unexpected JSON delimiter")
	}
	_, err = d.Token()
	return err
}
func checkShape(raw []byte, t reflect.Type, optional bool) error {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		if t.Kind() == reflect.Pointer && !optional {
			return nil
		}
		return fmt.Errorf("unexpected null for %s", t)
	}
	if t.Kind() == reflect.Pointer {
		return checkShape(raw, t.Elem(), false)
	}
	switch t.Kind() {
	case reflect.Struct:
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(raw, &obj); err != nil {
			return err
		}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			tags := strings.Split(f.Tag.Get("json"), ",")
			name := tags[0]
			if name == "-" {
				continue
			}
			opt := len(tags) > 1 && tags[1] == "omitempty"
			value, ok := obj[name]
			if !ok {
				if opt {
					continue
				}
				return fmt.Errorf("missing %s", name)
			}
			if err := checkShape(value, f.Type, opt); err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			delete(obj, name)
		}
		if len(obj) > 0 {
			return fmt.Errorf("unknown JSON fields")
		}
	case reflect.Array, reflect.Slice:
		var values []json.RawMessage
		if err := json.Unmarshal(raw, &values); err != nil {
			return err
		}
		if t.Kind() == reflect.Array && len(values) != t.Len() {
			return fmt.Errorf("tuple length must be %d", t.Len())
		}
		for _, v := range values {
			if err := checkShape(v, t.Elem(), false); err != nil {
				return err
			}
		}
	}
	return nil
}
