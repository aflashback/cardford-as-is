package records

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	"cardford/server/internal/legacydecision"
	"cardford/server/internal/sessions"
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

// PermittedInput returns original validated game-owned actor bytes. Only its
// version and digest are persisted per decision; replay reconstructs the bytes
// from the original private anchor and commands instead of copying all history.
func (c *DocumentCodec) PermittedInput(d Document, s gamekernel.Snapshot, actor int) ([]byte, string, string, error) {
	p, digest, window, err := c.permittedProjection(d, s, actor)
	return p.Observation, digest, window, err
}
func (c *DocumentCodec) permittedProjection(d Document, s gamekernel.Snapshot, actor int) (gamekernel.Projection, string, string, error) {
	stored, err := c.bound(d, s)
	if err != nil {
		return gamekernel.Projection{}, "", "", err
	}
	if _, registered := stored.inner.(*sessions.DurableSnapshot); registered {
		bound, err := c.Session(d, s)
		if err != nil {
			return gamekernel.Projection{}, "", "", err
		}
		input, err := bound.PreparationBinding(actor, d.Metadata.Policy.ID)
		if err != nil {
			return gamekernel.Projection{}, "", "", err
		}
		window, err := c.WindowID(d)
		return gamekernel.Projection{Observation: input.Packet, CandidateIDs: input.CandidateIDs}, input.InputDigest, window, err
	}
	if actor < 0 || actor > 3 {
		return gamekernel.Projection{}, "", "", fmt.Errorf("invalid decision actor")
	}
	p, err := s.Project(actor)
	if err != nil {
		return gamekernel.Projection{}, "", "", err
	}
	if len(p.CandidateIDs) == 0 {
		return gamekernel.Projection{}, "", "", fmt.Errorf("actor has no eligible decision")
	}
	var header struct {
		Phase string `json:"phase"`
		Seat  int    `json:"seat"`
	}
	if err = json.Unmarshal(p.Observation, &header); err != nil {
		return gamekernel.Projection{}, "", "", err
	}
	if !validText(header.Phase) || header.Seat != actor {
		return gamekernel.Projection{}, "", "", fmt.Errorf("invalid trusted actor projection")
	}
	digest, err := JSONDigest(p.Observation)
	if err != nil {
		return gamekernel.Projection{}, "", "", err
	}
	return p, digest, "v1:" + strconv.FormatInt(d.Revision, 10) + ":" + header.Phase, nil
}
func (c *DocumentCodec) ValidateWork(d Document, s gamekernel.Snapshot, actor int, window, purpose string, policy PolicyPin, inputDigest string) error {
	r, err := c.registration(d.Metadata)
	if err != nil {
		return err
	}
	if !c.disposition(d.Metadata, r).Playable {
		return fmt.Errorf("session policy unavailable for new work")
	}
	if !reflect.DeepEqual(policy, d.Metadata.Policy) {
		return fmt.Errorf("decision changed immutable reasoning policy")
	}
	if err := validateDecisionPurpose(actor, purpose); err != nil {
		return err
	}
	_, digest, expectedWindow, err := c.PermittedInput(d, s, actor)
	if err != nil {
		return err
	}
	if !validDigest(inputDigest) || digest != inputDigest || window != expectedWindow {
		return fmt.Errorf("decision input/revision/window binding mismatch")
	}
	return nil
}
func (c *DocumentCodec) ValidateDecision(d Document, s gamekernel.Snapshot, decision DecisionRecord) error {
	if err := c.ValidateHistoricalDecisionAt(d, s, decision); err != nil {
		return err
	}
	matched := false
	for _, p := range c.policies {
		if p.Module == d.Metadata.Pin && reflect.DeepEqual(p.Policy, decision.Policy) && p.PacketVersion == decision.PacketVersion && p.AnalysisSchema == decision.AnalysisSchema && p.AdviceSchema == decision.AdviceSchema {
			matched = true
			break
		}
	}
	if !matched {
		return fmt.Errorf("policy input/output registration mismatch")
	}
	r, _ := c.registration(d.Metadata)
	if !c.disposition(d.Metadata, r).Playable {
		return fmt.Errorf("session pin is read-only")
	}
	return nil
}

// ValidateHistoricalDecisionAt rebinds saved output to its original source
// revision without requiring that the pinned execution policy is installed.
func (c *DocumentCodec) ValidateHistoricalDecisionAt(d Document, s gamekernel.Snapshot, decision DecisionRecord) error {
	if err := ValidateHistoricalDecision(decision); err != nil {
		return err
	}
	if decision.GameID != d.Metadata.GameID || decision.OwnerID != d.Metadata.OwnerID || decision.Revision != d.Revision || decision.PacketVersion != d.Metadata.Pin.ObservationSchemaVersion {
		return fmt.Errorf("decision session/revision/schema mismatch")
	}
	if !reflect.DeepEqual(decision.Policy, d.Metadata.Policy) {
		return fmt.Errorf("historical policy pin mismatch")
	}
	unit, err := c.CurrentUnitID(d, s)
	if err != nil {
		return err
	}
	if decision.Access.UnitID != unit {
		return fmt.Errorf("decision access unit differs from original game unit")
	}
	if err := validateDecisionPurpose(decision.Actor, decision.Purpose); err != nil {
		return err
	}
	p, digest, window, err := c.permittedProjection(d, s, decision.Actor)
	if err != nil {
		return err
	}
	if digest != decision.InputDigest || window != decision.WindowID {
		return fmt.Errorf("historical permitted input/window mismatch")
	}
	eligible := false
	for _, id := range p.CandidateIDs {
		if id == decision.SelectedCandidateID {
			eligible = true
			break
		}
	}
	if !eligible {
		return fmt.Errorf("selected candidate is not eligible for original actor")
	}
	if decision.AdviceSchema == "TrixAdvice" {
		if _, e := gamekernel.ParseRegisteredAnalysis(decision.Analysis, gamekernel.Pin(d.Metadata.Pin), decision.SelectedCandidateID); e != nil {
			return e
		}
		var advice struct {
			Alternatives []string `json:"alternatives"`
		}
		if e := json.Unmarshal(decision.Advice, &advice); e != nil {
			return e
		}
		for _, alternative := range advice.Alternatives {
			found := false
			for _, id := range p.CandidateIDs {
				found = found || id == alternative
			}
			if !found {
				return fmt.Errorf("Trix advice alternative is not an original legal candidate")
			}
		}
	}
	if decision.AnalysisSchema == OriginalAnalysisSchema {
		original, _, e := OriginalDecision(decision)
		if e != nil {
			return e
		}
		if _, e = gamekernel.ParseRegisteredAnalysis(original.Registered, gamekernel.Pin(d.Metadata.Pin), decision.SelectedCandidateID); e != nil {
			return e
		}
		if e = c.validateActorRolloutInput(d, s, decision, original); e != nil {
			return e
		}
		if len(original.Original.Candidates) != len(p.CandidateIDs) {
			return fmt.Errorf("original full analysis candidate count mismatch")
		}
		ids := map[string]bool{}
		for _, id := range p.CandidateIDs {
			ids[id] = true
		}
		for _, candidate := range original.Original.Candidates {
			if !ids[legacydecision.ActionID(candidate.Action)] {
				return fmt.Errorf("original full analysis has ineligible candidate")
			}
		}
	}
	var analysis struct {
		GameID    string `json:"gameId"`
		VariantID string `json:"variantId"`
	}
	analysisBytes := decision.Analysis
	if decision.AnalysisSchema == OriginalAnalysisSchema {
		original, _, e := OriginalDecision(decision)
		if e != nil {
			return e
		}
		analysisBytes = original.Registered
	}
	if err = json.Unmarshal(analysisBytes, &analysis); err != nil {
		return err
	}
	if analysis.GameID != d.Metadata.Pin.GameID || analysis.VariantID != d.Metadata.Pin.VariantID {
		return fmt.Errorf("analysis game/variant mismatch")
	}
	return nil
}

// ValidateHistoricalDecision validates original saved output through trusted
// schema readers without requiring that its former execution policy remains
// installed. It is not a new-work authorization or proof of candidate quality.
func ValidateHistoricalDecision(d DecisionRecord) error {
	if err := ValidateDecisionShape(d); err != nil {
		return err
	}
	if err := validateDecisionPurpose(d.Actor, d.Purpose); err != nil {
		return err
	}
	if d.AnalysisSchema == OriginalAnalysisSchema || d.AdviceSchema == OriginalAdviceSchema {
		_, _, err := OriginalDecision(d)
		return err
	}
	if d.AnalysisSchema != "RegisteredAnalysis" || (d.AdviceSchema != "AdviceView" && d.AdviceSchema != "TrixAdvice") {
		return fmt.Errorf("unsupported historical decision reader")
	}
	if err := contracts.Validate("RegisteredAnalysis", d.Analysis); err != nil {
		return err
	}
	if err := contracts.Validate(d.AdviceSchema, d.Advice); err != nil {
		return err
	}
	var analysis struct {
		Selected string `json:"selectedCandidateId"`
	}
	if err := json.Unmarshal(d.Analysis, &analysis); err != nil {
		return err
	}
	if analysis.Selected != d.SelectedCandidateID {
		return fmt.Errorf("original analysis selection mismatch")
	}
	if d.AdviceSchema == "TrixAdvice" {
		return validateTrixSavedAdvice(d)
	}
	var advice struct {
		DecisionID    string   `json:"decisionId"`
		Card          *string  `json:"card"`
		Bid           *int     `json:"bid"`
		Pass          []string `json:"pass"`
		PolicyVersion string   `json:"policyVersion"`
	}
	if err := json.Unmarshal(d.Advice, &advice); err != nil {
		return err
	}
	if advice.DecisionID != "" && advice.DecisionID != d.ID {
		return fmt.Errorf("advice decision identity mismatch")
	}
	if advice.PolicyVersion != "" && advice.PolicyVersion != d.Policy.Version {
		return fmt.Errorf("advice original policy mismatch")
	}
	if advice.Card != nil && "play:"+*advice.Card != d.SelectedCandidateID {
		return fmt.Errorf("advice play selection mismatch")
	}
	if advice.Bid != nil && "bid:"+strconv.Itoa(*advice.Bid) != d.SelectedCandidateID {
		return fmt.Errorf("advice bid selection mismatch")
	}
	if advice.Pass != nil && "pass:"+strings.Join(advice.Pass, ",") != d.SelectedCandidateID {
		return fmt.Errorf("advice pass selection mismatch")
	}
	return nil
}
func (c *DocumentCodec) ValidateHistoricalDecision(d DecisionRecord) error {
	return ValidateHistoricalDecision(d)
}
func validateDecisionPurpose(actor int, purpose string) error {
	switch purpose {
	case "bot-action":
		if actor == 0 {
			return fmt.Errorf("human actor cannot use bot purpose")
		}
	case "human-analysis", "coach-advice", "review-alternative":
		if actor != 0 {
			return fmt.Errorf("human purpose requires human actor")
		}
	default:
		return fmt.Errorf("unsupported decision purpose")
	}
	return nil
}
func (c *DocumentCodec) ValidateDecisionCommand(d DecisionRecord, raw json.RawMessage) error {
	if err := ValidateHistoricalDecision(d); err != nil {
		return err
	}
	if err := validateDecisionPurpose(d.Actor, d.Purpose); err != nil {
		return err
	}
	if d.PacketVersion == "2.0.0" || d.AdviceSchema == "TrixAdvice" {
		return validateV2DecisionCommand(d, raw)
	}
	if _, err := contracts.ParseJSON(raw); err != nil {
		return err
	}
	var a struct {
		GameID string `json:"gameId"`
	}
	if err := json.Unmarshal(d.Analysis, &a); err != nil {
		return err
	}
	selected := ""
	if d.Purpose == "bot-action" {
		selected = d.SelectedCandidateID
	}
	switch a.GameID {
	case "spades":
		return spades.ValidateSelectedCommand(raw, d.Actor, selected)
	case "hearts":
		return hearts.ValidateSelectedCommand(raw, d.Actor, selected)
	default:
		return fmt.Errorf("no trusted decision/command reader")
	}
}

// LegacyRead preserves an original supported V1 private state byte-for-byte.
// It intentionally supplies no new replay anchor, journal or write operation;
// importing a whole legacy platform document requires its original TS reader.
type LegacyRead struct {
	Original    []byte
	Snapshot    gamekernel.Snapshot
	Disposition ReadDisposition
}

func (c *DocumentCodec) ReadLegacyState(pin ModulePin, raw []byte) (LegacyRead, error) {
	if len(raw) == 0 || len(raw) > MaxRecordBytes {
		return LegacyRead{}, fmt.Errorf("legacy state byte limit")
	}
	if _, err := contracts.ParseJSON(raw); err != nil {
		return LegacyRead{}, err
	}
	r, ok := c.readers[pin]
	if !ok || r.readOnly {
		return LegacyRead{}, fmt.Errorf("unsupported original V1 state reader")
	}
	var s gamekernel.Snapshot
	var err error
	if pin.GameID == "spades" {
		s, err = spades.Open(raw)
	} else if pin.GameID == "hearts" {
		s, err = hearts.Open(raw)
	} else {
		return LegacyRead{}, fmt.Errorf("unsupported original V1 state reader")
	}
	if err != nil {
		return LegacyRead{}, err
	}
	// Check all identity fields through its compact adapter as well as decoder.
	p := s.(storedSnapshot)
	hot, _, err := p.Persist(p.EventCount())
	if err != nil {
		return LegacyRead{}, err
	}
	var identity struct {
		ID string `json:"id"`
	}
	if err = json.Unmarshal(hot, &identity); err != nil {
		return LegacyRead{}, err
	}
	if err = r.ValidateHot(hot, identity.ID, r.Mode); err != nil {
		return LegacyRead{}, err
	}
	return LegacyRead{Original: append([]byte{}, raw...), Snapshot: &legacySnapshot{inner: s}, Disposition: ReadDisposition{Reason: "legacy-original-reader-only"}}, nil
}

type legacySnapshot struct{ inner gamekernel.Snapshot }

func (s *legacySnapshot) Apply(json.RawMessage) (gamekernel.Snapshot, error) {
	return nil, fmt.Errorf("legacy original is read-only")
}
func (s *legacySnapshot) Export() (json.RawMessage, error) { return s.inner.Export() }
func (s *legacySnapshot) Project(actor int) (gamekernel.Projection, error) {
	return s.inner.Project(actor)
}
