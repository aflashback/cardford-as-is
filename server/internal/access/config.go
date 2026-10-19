package access

import (
	"bytes"
	"cardford/server/internal/contracts"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

var ErrInvalid = errors.New("invalid access policy or authoritative context")

const MaxInteger int64 = 9007199254740991
const MaxPolicyBytes = 1 << 20
const MaxOffers = 64
const MaxFreeTargets = 64

//go:embed launch.json
var launchConfig []byte

//go:embed local-fixture.json
var fixtureConfig []byte

// LaunchPolicy deliberately issues no access until launch values are selected.
func LaunchPolicy() (Policy, error) { return DecodePolicy(launchConfig) }

// LocalFixturePolicy is explicitly opt-in, never a fallback for invalid configuration.
func LocalFixturePolicy() (Policy, error) { return DecodePolicy(fixtureConfig) }

func DecodePolicy(raw []byte) (Policy, error) {
	var p Policy
	if len(raw) > MaxPolicyBytes {
		return p, fmt.Errorf("%w: policy byte limit", ErrInvalid)
	}
	if err := contracts.Validate("AccessOfferPolicy", raw); err != nil {
		return p, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&p); err != nil {
		return p, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return p, ErrInvalid
	}
	return p, ValidatePolicy(p)
}
func ValidatePolicy(p Policy) error {
	if len(p.Offers) > MaxOffers || !textID(p.ID) || !textID(p.Version) {
		return fmt.Errorf("%w: policy bounds", ErrInvalid)
	}
	raw, err := json.Marshal(p)
	if err != nil || len(raw) > MaxPolicyBytes {
		return ErrInvalid
	}
	if err = contracts.Validate("AccessOfferPolicy", raw); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	seen := map[string]bool{}
	buckets := map[string]string{}
	freeTargets := 0
	for _, o := range p.Offers {
		if !textID(o.ID) || !textID(o.Version) {
			return fmt.Errorf("%w: offer identifier bounds", ErrInvalid)
		}
		if o.Enabled && o.Kind == "free" {
			freeTargets += len(o.Targets)
			if freeTargets > MaxFreeTargets {
				return fmt.Errorf("%w: free target issuance limit", ErrInvalid)
			}
		}
		if seen[o.ID] {
			return fmt.Errorf("%w: duplicate offer", ErrInvalid)
		}
		seen[o.ID] = true
		if (o.Kind == "free" && o.Activation != "automatic") || (o.Kind == "paid" && o.Activation != "verified-purchase") || (o.Kind == "access-trial" && (o.Activation != "once-per-identity" || o.ValiditySeconds == nil)) {
			return fmt.Errorf("%w: activation", ErrInvalid)
		}
		// The durable trial ledger supports at most 366 days, without truncation.
		if o.ValiditySeconds != nil && (*o.ValiditySeconds < 1 || *o.ValiditySeconds > 366*24*60*60) {
			return fmt.Errorf("%w: validity", ErrInvalid)
		}
		for _, target := range o.Targets {
			if !SupportedTarget(target) {
				return fmt.Errorf("%w: target", ErrInvalid)
			}
		}
		for _, tool := range o.Coach.Tools {
			if !SupportedTool(tool) {
				return fmt.Errorf("%w: tool", ErrInvalid)
			}
		}
		a := o.Coach.Allowance
		if a.Kind == "limited" {
			if !textID(a.BucketID) {
				return fmt.Errorf("%w: bucket identifier bounds", ErrInvalid)
			}
			for _, target := range o.Targets {
				if a.Unit != SupportedUnit(target) {
					return fmt.Errorf("%w: unsupported allowance unit", ErrInvalid)
				}
			}
			if a.Timezone != "UTC" || (a.Period != "day" && a.Period != "grant") {
				return fmt.Errorf("%w: unsupported allowance calendar or unit", ErrInvalid)
			}
			calendar := a.Period + ":" + a.Timezone
			if old, ok := buckets[a.BucketID]; ok && old != calendar {
				return fmt.Errorf("%w: changed bucket calendar", ErrInvalid)
			}
			buckets[a.BucketID] = calendar
		}
	}
	if len(p.Precedence) != len(seen) {
		return fmt.Errorf("%w: precedence", ErrInvalid)
	}
	for _, id := range p.Precedence {
		if !seen[id] {
			return fmt.Errorf("%w: precedence", ErrInvalid)
		}
		delete(seen, id)
	}
	return nil
}
func SupportedTarget(t Target) bool {
	return SupportedUnit(t) != ""
}

// SupportedUnit describes the admission unit declared by each installed current
// game adapter. New adapters must declare their own unit here with their offer
// support; neither the resolver nor storage counts tricks or assumes a size.
func SupportedUnit(t Target) string {
	switch t {
	case Target{"hearts", "solo"}, Target{"spades", "solo"}, Target{"spades", "partners"}:
		return "hand"
	case Target{"trix", "basic-solo"}, Target{"trix", "basic-partners"}, Target{"trix", "complex-solo"}, Target{"trix", "complex-partners"}:
		return "trix-request"
	}
	return ""
}

// ValidatePolicyUpdate prevents an offer edit from resetting its stable bucket.
// Persisted grant issuance must likewise compare against earlier grant terms
// when loading a replacement configuration after a process restart.
func ValidatePolicyUpdate(previous, next Policy) error {
	if err := ValidatePolicy(previous); err != nil {
		return err
	}
	if err := ValidatePolicy(next); err != nil {
		return err
	}
	for _, old := range previous.Offers {
		for _, updated := range next.Offers {
			if old.ID != updated.ID {
				continue
			}
			ot, err := offerBucket(old)
			if err != nil {
				return err
			}
			nt, err := offerBucket(updated)
			if err != nil {
				return err
			}
			if ot != nt {
				return fmt.Errorf("%w: offer bucket identity or calendar changed", ErrInvalid)
			}
		}
	}
	return nil
}
func offerBucket(o Offer) (string, error) {
	copyOffer := o
	copyOffer.Enabled = true
	t, err := copyOffer.Terms(o.Targets[0])
	if err != nil {
		return "", err
	}
	return t.BucketID + "\x00" + t.Period + "\x00" + t.Timezone, nil
}

// The service currently exposes original advice. Other tool names require an
// installed delivery path before configuration may authorize them.
func SupportedTool(tool string) bool {
	return tool == "advice" || tool == "notes" || tool == "review-alternative"
}
func textID(s string) bool { return len(s) > 0 && len(s) <= 256 && strings.TrimSpace(s) == s }
func contains(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
func targets(items []Target, value Target) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

// EnabledOffer is for future issuance. Existing verified grants carry their own
// immutable terms; configuration is never substituted into those records.
func (p Policy) EnabledOffer(id string) (Offer, bool) {
	for _, o := range p.Offers {
		if o.ID == id && o.Enabled {
			return o, true
		}
	}
	return Offer{}, false
}
func (o Offer) Terms(target Target) (GrantTerms, error) {
	p := Policy{ID: "validation", Version: "1", Precedence: []string{o.ID}, Offers: []Offer{o}}
	if err := ValidatePolicy(p); err != nil {
		return GrantTerms{}, err
	}
	if !o.Enabled || !targets(o.Targets, target) {
		return GrantTerms{}, ErrInvalid
	}
	t := GrantTerms{Version: "1.0.0", Game: target.GameID, Variant: target.VariantID, CanPlay: o.Play, CanCoach: len(o.Coach.Tools) > 0, Tools: append([]string{}, o.Coach.Tools...), BucketID: unlimitedBucket(o.ID), Period: "lifetime", Timezone: "UTC", Unlimited: true, ExpiryRule: o.Continuation}
	if a := o.Coach.Allowance; a.Kind == "limited" {
		t.BucketID = a.BucketID
		t.Period = a.Period
		if t.Period == "grant" {
			t.Period = "lifetime"
		}
		t.Limit = *a.Limit
		t.Unlimited = false
	}
	return t, nil
}

// Preserve existing short identities; hash only IDs whose prefixed form would
// exceed the durable 256-byte bound. Neither version nor target enters this key.
func unlimitedBucket(offerID string) string {
	if len("offer:"+offerID) <= 256 {
		return "offer:" + offerID
	}
	return fmt.Sprintf("offer-sha256:%x", sha256.Sum256([]byte(offerID)))
}
