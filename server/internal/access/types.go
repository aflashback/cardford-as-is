// Package access resolves verified server records without clocks, storage, or billing calls.
// None of its inputs establish authority when supplied by a client.
package access

import "time"

type Target struct {
	GameID    string `json:"gameId"`
	VariantID string `json:"variantId"`
}
type Component struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}
type Allowance struct {
	Kind     string `json:"kind"`
	Limit    *int64 `json:"limit,omitempty"`
	Unit     string `json:"unit,omitempty"`
	Period   string `json:"period,omitempty"`
	Timezone string `json:"timezone,omitempty"`
	BucketID string `json:"bucketId,omitempty"`
}
type Coach struct {
	Tools     []string  `json:"tools"`
	Allowance Allowance `json:"allowance"`
}
type Offer struct {
	ID              string   `json:"id"`
	Version         string   `json:"version"`
	Enabled         bool     `json:"enabled"`
	Kind            string   `json:"kind"`
	Targets         []Target `json:"targets"`
	Play            bool     `json:"play"`
	Coach           Coach    `json:"coach"`
	Continuation    string   `json:"continuation"`
	Activation      string   `json:"activation"`
	ValiditySeconds *int64   `json:"validitySeconds"`
}
type Policy struct {
	ID               string   `json:"id"`
	Version          string   `json:"version"`
	AccessGeneration int64    `json:"accessGeneration"`
	Precedence       []string `json:"precedence"`
	Offers           []Offer  `json:"offers"`
}

// GrantTerms mirrors the immutable M03 record, without coupling the resolver to storage.
type GrantTerms struct {
	Version    string   `json:"version"`
	Game       string   `json:"game"`
	Variant    string   `json:"variant"`
	CanPlay    bool     `json:"canPlay"`
	CanCoach   bool     `json:"canCoach"`
	Tools      []string `json:"tools"`
	BucketID   string   `json:"bucketId"`
	Period     string   `json:"period"`
	Timezone   string   `json:"timezone"`
	Limit      int64    `json:"limit"`
	Unlimited  bool     `json:"unlimited"`
	ExpiryRule string   `json:"expiryRule"`
}
type Grant struct {
	ID, OwnerID, OfferID, OfferVersion, SourceKind, SourceID string
	Terms                                                    GrantTerms
	ValidFrom                                                time.Time
	ValidUntil                                               *time.Time
	Revoked                                                  bool
}
type Admission struct {
	GrantID, SessionID, UnitID string
	AdmittedAt                 time.Time
	ExpiresAt                  *time.Time
	Revoked                    bool
}
type Unlock struct {
	GrantID, SessionID, UnitID                 string
	Tools                                      []string
	BucketID, PeriodKey, OfferID, OfferVersion string
	Revoked                                    bool
}
type BucketUsage struct {
	OwnerID, BucketID, PeriodKey string
	Used, Reserved               int64
}
type SavedResult struct {
	ID, OwnerID, SessionID string
	GrantID                string // original delivering grant, when the result had a grant
	Target                 Target
	Delivered              bool
	Scope                  string // current-game or retained
	RetainedUntil          *time.Time
}
type Operation struct {
	Kind                                string // play, coach, read-saved
	Intent                              string // start or continue, only for play
	SessionID, UnitID, UnitKind, ToolID string
	AtAdmissionBoundary                 bool
	SavedResult                         *SavedResult
}
type Input struct {
	OwnerID         string
	Generation      int64
	Revoked         bool // authoritative identity/security fence, not commercial expiry
	ActiveSessionID string
	Target          Target
	Operation       Operation
	Grants          []Grant
	Admissions      []Admission
	Unlocks         []Unlock
	Usage           []BucketUsage
	Now             time.Time
}
type Applied struct {
	Offer   Component `json:"offer"`
	GrantID string    `json:"grantId"`
}
type Decision struct {
	AccessGeneration int64     `json:"accessGeneration"`
	Applied          []Applied `json:"applied"`
	Remaining        *int64    `json:"remaining"`
	Continuation     string    `json:"continuation"`
	Allowed          bool      `json:"allowed"`
	Reason           string    `json:"reason"`
	// Internal charge metadata always names the selected original terms.
	BucketID  string `json:"-"`
	PeriodKey string `json:"-"`
}
