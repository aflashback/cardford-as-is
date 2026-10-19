// Package coachlab is an offline deterministic collector. It never changes
// production defaults, calls a provider, or treats collection as strength proof.
package coachlab

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
)

type HashPin struct {
	ID   string `json:"id"`
	Hash string `json:"hash"`
}
type Family struct {
	ID     string `json:"id"`
	Split  string `json:"split"`
	Seed   string `json:"seed"`
	Sealed bool   `json:"sealed"`
}
type FamilyRole struct {
	ID   string `json:"id"`
	Role string `json:"role"`
}
type SeatAssignments struct {
	Candidate []int `json:"candidate"`
	Reference []int `json:"reference"`
}
type Corpus struct {
	Version  string   `json:"version"`
	Hash     string   `json:"hash"`
	LabelIDs []string `json:"labelIds"`
}
type EvaluationManifest struct {
	SchemaVersion          string            `json:"schemaVersion"`
	ID                     string            `json:"id"`
	Purpose                string            `json:"purpose"`
	Variant                string            `json:"variant"`
	RuleProfile            HashPin           `json:"ruleProfile"`
	Candidate              HashPin           `json:"candidate"`
	Reference              HashPin           `json:"reference"`
	SourceHashes           map[string]string `json:"sourceHashes"`
	Objective              string            `json:"objective"`
	Horizon                string            `json:"horizon"`
	Corpus                 *Corpus           `json:"corpus"`
	Families               []Family          `json:"families"`
	Rotations              []int             `json:"rotations"`
	SeatAssignments        SeatAssignments   `json:"seatAssignments"`
	Environments           []string          `json:"environments"`
	PrimaryEstimand        string            `json:"primaryEstimand"`
	UsefulGain             *float64          `json:"usefulGain"`
	MaximumHarm            *float64          `json:"maximumHarm"`
	PowerRationale         *string           `json:"powerRationale"`
	MultiplicityAdjustment *string           `json:"multiplicityAdjustment"`
	SampleSize             *int              `json:"sampleSize"`
	StoppingRule           string            `json:"stoppingRule"`
	MissingRunHandling     string            `json:"missingRunHandling"`
	MaxWallMS              int               `json:"maxWallMs"`
	MaxDecisionMS          int               `json:"maxDecisionMs"`
	MaxDecisions           int               `json:"maxDecisions"`
	PromotionAuthority     *string           `json:"promotionAuthority"`
}
type SourceIdentity struct {
	SourceDigest string `json:"sourceDigest"`
	BinaryDigest string `json:"binaryDigest"`
}
type SeatPolicyPin struct {
	Seat    int    `json:"seat"`
	ID      string `json:"id"`
	Version string `json:"version"`
}
type Caps struct {
	MaxRounds      int `json:"maxRounds"`
	MaxActions     int `json:"maxActions"`
	MaxTransitions int `json:"maxTransitions"`
	MaxWallMS      int `json:"maxWallMs"`
}
type JudgeAuthorization struct {
	Mode          string  `json:"mode"`
	AuthorizedUSD float64 `json:"authorizedUsd"`
}
type LabSettings struct {
	SourceIdentity SourceIdentity     `json:"sourceIdentity"`
	Selector       sessions.Selector  `json:"selector"`
	Config         json.RawMessage    `json:"config"`
	SeatPolicies   []SeatPolicyPin    `json:"seatPolicies"`
	Caps           Caps               `json:"caps"`
	Judge          JudgeAuthorization `json:"judge"`
	FamilyRoles    []FamilyRole       `json:"familyRoles"`
}
type RunEnvelope struct {
	SchemaVersion string             `json:"schemaVersion"`
	RunID         string             `json:"runId"`
	Base          EvaluationManifest `json:"base"`
	Lab           LabSettings        `json:"lab"`
	raw           []byte
}

func (e RunEnvelope) ManifestBytes() []byte {
	if e.raw != nil {
		return append([]byte{}, e.raw...)
	}
	raw, _ := json.Marshal(e)
	return raw
}
func (e RunEnvelope) ManifestHash() string { return Digest(e.ManifestBytes()) }

func strict(data []byte, out any) error {
	if _, err := contracts.ParseJSON(data); err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	var rest any
	if err := dec.Decode(&rest); err != io.EOF {
		return fmt.Errorf("trailing JSON")
	}
	return nil
}
func Digest(data []byte) string { h := sha256.Sum256(data); return hex.EncodeToString(h[:]) }
func validHash(s string) bool {
	if len(s) != 64 {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'f' || c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}
func SourceDigest(hashes map[string]string) string {
	keys := make([]string, 0, len(hashes))
	for k := range hashes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([][2]string, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, [2]string{k, hashes[k]})
	}
	raw, _ := json.Marshal(pairs)
	return Digest(raw)
}
func DecodeRun(data []byte) (RunEnvelope, error) {
	var e RunEnvelope
	if len(data) > 4<<20 {
		return e, fmt.Errorf("manifest exceeds bound")
	}
	if err := strict(data, &e); err != nil {
		return e, err
	}
	if err := gamekernel.DecodeSessionJSON(data, &e); err != nil {
		return e, fmt.Errorf("closed required run shape: %w", err)
	}
	// Require nullable study decisions too; absence must never supply a default.
	var top map[string]json.RawMessage
	_ = json.Unmarshal(data, &top)
	var base map[string]json.RawMessage
	_ = json.Unmarshal(top["base"], &base)
	for _, key := range strings.Fields("schemaVersion id purpose variant ruleProfile candidate reference sourceHashes objective horizon corpus families rotations seatAssignments environments primaryEstimand usefulGain maximumHarm powerRationale multiplicityAdjustment sampleSize stoppingRule missingRunHandling maxWallMs maxDecisionMs maxDecisions promotionAuthority") {
		if _, ok := base[key]; !ok {
			return e, fmt.Errorf("missing study decision %s", key)
		}
	}
	if err := e.Validate(); err != nil {
		return e, err
	}
	e.raw = append([]byte{}, data...)
	return e, nil
}
func (e RunEnvelope) Validate() error {
	b, l := e.Base, e.Lab
	if !contains([]string{"coach-lab-run-1.0.0", "coach-lab-run-2.0.0"}, e.SchemaVersion) || !contains([]string{"multi-game-evaluation-1.0.0", "multi-game-evaluation-2.0.0"}, b.SchemaVersion) || !gamekernel.ValidIdentifier(e.RunID) || e.RunID != b.ID {
		return fmt.Errorf("invalid run identity/version")
	}
	if (b.SchemaVersion == "multi-game-evaluation-2.0.0") != (l.Selector.GameID == "trix") || (e.SchemaVersion == "coach-lab-run-2.0.0") != (b.SchemaVersion == "multi-game-evaluation-2.0.0") {
		return fmt.Errorf("game requires its exact manifest branch")
	}
	// Confirmation requires a custodian reservation and independent-label proof.
	// This first collector cannot verify those gates, so refuses it explicitly.
	if b.Purpose != "development" {
		return fmt.Errorf("confirmation admission not installed")
	}
	if b.Horizon != "complete-match" || b.Objective == "" || b.PrimaryEstimand == "" || b.StoppingRule == "" || b.MissingRunHandling == "" {
		return fmt.Errorf("undeclared complete-match study decisions")
	}
	for _, p := range []HashPin{b.RuleProfile, b.Candidate, b.Reference} {
		if !gamekernel.ValidIdentifier(p.ID) || !validHash(p.Hash) {
			return fmt.Errorf("invalid exact study pin")
		}
	}
	if !validHash(l.SourceIdentity.SourceDigest) || !validHash(l.SourceIdentity.BinaryDigest) || len(b.SourceHashes) == 0 {
		return fmt.Errorf("missing source identity")
	}
	for name, h := range b.SourceHashes {
		if name == "" || strings.ContainsAny(name, "\\:") || path.IsAbs(name) || path.Clean(name) != name || name == ".." || strings.HasPrefix(name, "../") || !validHash(h) {
			return fmt.Errorf("invalid source path/hash")
		}
	}
	if b.Variant != l.Selector.GameID+"-"+l.Selector.VariantID || b.RuleProfile.ID != l.Selector.RuleProfileID {
		return fmt.Errorf("variant/profile mismatch")
	}
	if _, err := NewAdapter(l.Selector); err != nil {
		return err
	}
	if len(l.SeatPolicies) != 4 {
		return fmt.Errorf("exactly four seat policies required")
	}
	seen := map[int]bool{}
	for _, pin := range l.SeatPolicies {
		if seen[pin.Seat] {
			return fmt.Errorf("repeated seat")
		}
		seen[pin.Seat] = true
		if err := ValidatePolicy(l.Selector, pin); err != nil {
			return err
		}
	}
	if len(b.Families) == 0 || len(b.Families) > 1024 || len(l.FamilyRoles) != len(b.Families) {
		return fmt.Errorf("invalid family population")
	}
	families := map[string]bool{}
	for _, f := range b.Families {
		if !gamekernel.ValidIdentifier(f.ID) || f.Seed == "" || len(f.Seed) > 256 || f.Split != "discovery" || f.Sealed || families[f.ID] {
			return fmt.Errorf("invalid/reused family")
		}
		families[f.ID] = true
	}
	roles := map[string]bool{}
	for _, f := range l.FamilyRoles {
		if !families[f.ID] || roles[f.ID] || !contains([]string{"development", "judge-calibration-fit", "judge-calibration-audit", "validation"}, f.Role) {
			return fmt.Errorf("invalid family role")
		}
		roles[f.ID] = true
	}
	for _, seats := range [][]int{b.Rotations, b.SeatAssignments.Candidate, b.SeatAssignments.Reference} {
		s := map[int]bool{}
		if len(seats) == 0 {
			return fmt.Errorf("missing seat assignments")
		}
		for _, n := range seats {
			if !gamekernel.ValidSeat(n) || s[n] {
				return fmt.Errorf("invalid seats/rotations")
			}
			s[n] = true
		}
	}
	if len(b.SeatAssignments.Candidate) != len(b.SeatAssignments.Reference) {
		return fmt.Errorf("paired arms must replace identical seats")
	}
	for i, seat := range b.SeatAssignments.Candidate {
		if seat != b.SeatAssignments.Reference[i] {
			return fmt.Errorf("paired arms must replace identical seats")
		}
	}
	if len(b.Environments) != 1 || b.Environments[0] != "fixed-seat-policies-1.0.0" {
		return fmt.Errorf("unsupported environment")
	}
	c := l.Caps
	if c.MaxRounds <= 0 || c.MaxRounds > 100 || c.MaxActions <= 0 || c.MaxActions > 10000 || c.MaxTransitions <= 0 || c.MaxTransitions > 30000 || c.MaxWallMS <= 0 || c.MaxWallMS > 20*60*1000 || b.MaxWallMS < c.MaxWallMS || b.MaxWallMS > 20*60*1000 || b.MaxDecisionMS <= 0 || b.MaxDecisionMS > 90000 || b.MaxDecisions < c.MaxActions {
		return fmt.Errorf("invalid bounded caps")
	}
	if l.Judge.Mode != "fixture" || l.Judge.AuthorizedUSD != 0 {
		return fmt.Errorf("native collector has no paid/provider transport")
	}
	if l.Selector.GameID == "trix" {
		var config struct {
			ID      string `json:"id"`
			Variant string `json:"variant"`
		}
		if err := gamekernel.DecodeSessionJSON(l.Config, &config); err != nil {
			return err
		}
		if !gamekernel.ValidIdentifier(config.ID) || config.Variant != l.Selector.VariantID {
			return fmt.Errorf("invalid Trix config")
		}
	} else {
		var config struct {
			ID     string `json:"id"`
			Dealer int    `json:"dealer"`
		}
		if err := gamekernel.DecodeSessionJSON(l.Config, &config); err != nil {
			return err
		}
		if !gamekernel.ValidIdentifier(config.ID) || !gamekernel.ValidSeat(config.Dealer) {
			return fmt.Errorf("invalid module config")
		}
	}
	for _, id := range []string{b.Candidate.ID, b.Reference.ID} {
		v, ok := policyVersion(id)
		if !ok {
			return fmt.Errorf("unsupported comparison policy")
		}
		if err := ValidatePolicy(l.Selector, SeatPolicyPin{0, id, v}); err != nil {
			return err
		}
	}
	return nil
}
func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}
