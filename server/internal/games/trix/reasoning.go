package trix

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strings"
)

const ReasoningPolicyID = "trix-reasoning-1.0.0"
const DecisionTraceSchemaVersion = "trix-decision-trace-1.0.0"
const ReasoningCueVersion = "trix-contextual-cues-1.0.0"

// DecisionCandidate records a heuristic comparison, never a probability or an
// optimality label. Support is derived only from the frozen actor observation.
type DecisionCandidate struct {
	CandidateID string                   `json:"candidateId"`
	Action      Action                   `json:"action"`
	Value       float64                  `json:"value"`
	Purpose     string                   `json:"purpose"`
	Reason      string                   `json:"reason"`
	Support     []contracts.CoachSupport `json:"support"`
}

// DecisionTrace is private, versioned preparation evidence. The coach consumes
// this saved object, so later cards cannot rewrite the original explanation.
type DecisionTrace struct {
	SchemaVersion               string                       `json:"schemaVersion"`
	PolicyID                    string                       `json:"policyId"`
	PolicyVersion               string                       `json:"policyVersion"`
	ObservationDigest           string                       `json:"observationDigest"`
	PublicSchemaVersion         string                       `json:"publicSchemaVersion"`
	RuleProfileID               string                       `json:"ruleProfileId"`
	VariantID                   string                       `json:"variantId"`
	Phase                       string                       `json:"phase"`
	Actor                       int                          `json:"actor"`
	SelectedCandidateID         string                       `json:"selectedCandidateId"`
	Action                      Action                       `json:"action"`
	LegalCount                  int                          `json:"legalCount"`
	Status                      string                       `json:"status"`
	FactCatalog                 []contracts.CoachSupport     `json:"factCatalog"`
	Support                     []contracts.CoachSupport     `json:"support"`
	Candidates                  []DecisionCandidate          `json:"candidates"`
	Cue                         string                       `json:"cue"`
	Summary                     string                       `json:"summary"`
	Alternatives                []string                     `json:"alternatives"`
	Limitations                 []string                     `json:"limitations"`
	HistoryEvidence             *HistoryEvidence             `json:"historyEvidence,omitempty"`
	FrontierEvidence            *FrontierEvidence            `json:"frontierEvidence,omitempty"`
	OwnershipEvidence           *OwnershipEvidence           `json:"ownershipEvidence,omitempty"`
	OwnershipComparisonEvidence *OwnershipComparisonEvidence `json:"ownershipComparisonEvidence,omitempty"`
}

func SupportsPolicy(policy string) bool { return policy == PolicyID || isTracePolicy(policy) }

func DecideWithPolicy(o Observation, policy string) (Action, error) {
	if policy == PolicyID {
		return Decide(o)
	}
	if !isTracePolicy(policy) {
		return Action{}, fmt.Errorf("unsupported Trix policy %q", policy)
	}
	trace, err := BuildDecisionTrace(o, policy)
	return trace.Action, err
}

func observationDigest(o Observation) string {
	raw, _ := json.Marshal(o)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func tracePin(o Observation) gamekernel.Pin {
	version := o.publicSchemaVersion
	if version == "" {
		version = "1.0.0"
		if o.LayoutHistory != nil {
			version = "1.2.0"
		}
	}
	p, _ := PinForPublicSchema(o.VariantID, version)
	return p
}

// BuildDecisionTrace evaluates the complete legal set and selects once, using
// its native order for exact score ties. It has no private-state input.
func BuildDecisionTrace(o Observation, policy string) (DecisionTrace, error) {
	t := DecisionTrace{}
	if !isTracePolicy(policy) || !validVariant(o.VariantID) {
		return t, fmt.Errorf("unsupported Trix trace policy or variant")
	}
	if err := ValidateLayoutHistoryObservation(o); err != nil {
		return t, err
	}
	legal := Legal(o)
	if len(legal) == 0 {
		return t, fmt.Errorf("no Trix actor choices")
	}
	p := tracePin(o)
	if p.GameID != "trix" {
		return t, fmt.Errorf("unsupported Trix observation profile")
	}
	t = DecisionTrace{SchemaVersion: traceSchemaFor(policy), PolicyID: policy, PolicyVersion: "1.0.0", ObservationDigest: observationDigest(o), PublicSchemaVersion: p.PublicSchemaVersion, RuleProfileID: p.RuleProfileID, VariantID: o.VariantID, Phase: o.Phase, Actor: o.Seat, LegalCount: len(legal), Alternatives: []string{}, Limitations: traceLimitations()}
	var err error
	t.Candidates, t.HistoryEvidence, t.FrontierEvidence, t.OwnershipEvidence, err = candidatesWithOwnership(o, policy)
	if err != nil {
		return DecisionTrace{}, err
	}
	best := 0
	for i, c := range t.Candidates {
		if c.Value > t.Candidates[best].Value {
			best = i
		}
	}
	c := t.Candidates[best]
	t.Action, t.SelectedCandidateID = c.Action, c.CandidateID
	t.FactCatalog = traceFactCatalog(o, policy, t.HistoryEvidence)
	t.Support = traceSelectedSupport(o, policy, c, t.HistoryEvidence)
	if t.OwnershipEvidence != nil {
		facts := ownershipSupport(t.OwnershipEvidence)
		t.FactCatalog = append(t.FactCatalog, facts...)
		t.Support = append(t.Support, facts...)
	}
	if policy == OwnershipComparisonPolicyID {
		t.OwnershipComparisonEvidence = buildOwnershipComparisonEvidence(o, t.Candidates, t.OwnershipEvidence)
		facts := ownershipComparisonSupport(t)
		t.FactCatalog = append(t.FactCatalog, facts...)
		t.Support = append(t.Support, facts...)
	}
	return renderTrace(t), nil
}

func traceLimitations() []string {
	return []string{"This heuristic preference has not been validated as stronger play.", "Future hands and future play are unknown; conditional risks are not ownership facts or winning probabilities."}
}

// Rendering binds presentation to the ALREADY recorded action. It never picks
// a selected action, including when checking a saved trace for tampering.
func renderTrace(t DecisionTrace) DecisionTrace {
	best := -1
	for i, c := range t.Candidates {
		if c.CandidateID == t.SelectedCandidateID {
			best = i
		}
	}
	if best < 0 {
		return t
	}
	c := t.Candidates[best]
	t.Alternatives = []string{}
	t.Limitations = traceLimitations()
	if usesHistoryPolicy(t.PolicyID) {
		t.Limitations = append(t.Limitations, "Only a fourth-seat penultimate penalty trick with two actor cards and one card per other seat receives exact request-end comparison. Behavioral signals remain conditional and never receive uncalibrated action weights.")
	}
	if t.PolicyID == FrontierPolicyID {
		t.Limitations = append(t.Limitations, "In Partners Jacks choices, own-card credit stops at the first missing rank. Another player may fill a gap before your next turn, and delaying a jack may delay your teammate. Own follow-up does not establish the best team finish.")
	}
	if usesOwnershipPolicy(t.PolicyID) {
		t.Limitations = append(t.Limitations, "Ownership deductions exhaust only four-two assignments under the recorded constraints, not complete hidden deals. Immediate-opening scores retain the history policy's weights and do not establish the best team finish.")
	}
	t.Status, t.Cue, t.Summary = "tactical", actionLabel(c.Action)+" - "+c.Purpose+".", c.Reason
	alternative := -1
	tied := false
	for i, other := range t.Candidates {
		if i == best {
			continue
		}
		if math.Abs(other.Value-c.Value) < 1e-9 {
			tied = true
		}
		if alternative < 0 || other.Value > t.Candidates[alternative].Value {
			alternative = i
		}
	}
	if alternative >= 0 {
		other := t.Candidates[alternative]
		t.Alternatives = append(t.Alternatives, actionLabel(other.Action)+": "+other.Reason)
	}
	if t.LegalCount == 1 {
		t.Status = "only-option"
		t.Cue = actionLabel(c.Action) + " - the only legal option."
		t.Summary = "Only one legal action is available at this position; there is no strategic choice to compare. " + c.Reason
	} else if tied {
		t.Status = "no-clear-preference"
		t.Cue = actionLabel(c.Action) + " - the recorded heuristic scores tie."
		t.Summary = "The fixed legal order breaks a tie between the leading heuristic scores. This does not establish that the actions have equal value over the request. " + c.Reason
		t.Limitations = append(t.Limitations, "The tie-break establishes no unique tactical advantage.")
	}
	if t.PolicyID == OwnershipComparisonPolicyID {
		return renderOwnershipComparisonTrace(t)
	}
	return t
}

// BuildCoachMessage consumes saved text and evidence only. It never observes a
// later state, calls Decide, or reconstructs a preferred action.
func BuildCoachMessage(t DecisionTrace, decisionID string) (contracts.CoachMessage, error) {
	if decisionID == "" || !isTracePolicy(t.PolicyID) || t.SchemaVersion != traceSchemaFor(t.PolicyID) || t.PolicyVersion != "1.0.0" || t.SelectedCandidateID != ActionID(t.Action) || t.LegalCount != len(t.Candidates) || usesHistoryPolicy(t.PolicyID) != (t.HistoryEvidence != nil) || (t.PolicyID == FrontierPolicyID) != (t.FrontierEvidence != nil) || usesOwnershipPolicy(t.PolicyID) != (t.OwnershipEvidence != nil) || (t.PolicyID == OwnershipComparisonPolicyID) != (t.OwnershipComparisonEvidence != nil) {
		return contracts.CoachMessage{}, fmt.Errorf("invalid saved Trix trace identity")
	}
	bound := false
	for _, c := range t.Candidates {
		if c.CandidateID == t.SelectedCandidateID && actionsEqual(c.Action, t.Action) {
			bound = true
		}
	}
	if !bound {
		return contracts.CoachMessage{}, fmt.Errorf("saved Trix action lacks candidate evidence")
	}
	if !savedSelectionConsistent(t) {
		return contracts.CoachMessage{}, fmt.Errorf("saved Trix selection contradicts its recorded scores")
	}
	if t.PolicyID == OwnershipComparisonPolicyID && !savedOwnershipComparisonConsistent(t) {
		return contracts.CoachMessage{}, fmt.Errorf("invalid saved Trix comparison evidence")
	}
	for _, fact := range ownershipComparisonSupport(t) {
		if !hasComparisonSupport(t.Support, fact) || !hasComparisonSupport(t.FactCatalog, fact) {
			return contracts.CoachMessage{}, fmt.Errorf("saved Trix comparison lacks recorded support")
		}
	}
	if !sameTracePresentation(t, renderTrace(t)) {
		return contracts.CoachMessage{}, fmt.Errorf("saved Trix presentation differs from its recorded candidate")
	}
	m := contracts.CoachMessage{PresentationVersion: "coach-advice-2.0.0", DecisionID: decisionID, PolicyVersion: t.PolicyID, CueVersion: ReasoningCueVersion, Status: t.Status, SelectedAction: t.SelectedCandidateID, Cue: t.Cue, Reason: contracts.CoachReason{Summary: t.Summary, Support: append([]contracts.CoachSupport{}, t.Support...), Alternatives: append([]string{}, t.Alternatives...), Limitations: append([]string{}, t.Limitations...)}}
	if t.PolicyID == HistoryPolicyID {
		m.CueVersion = HistoryCueVersion
	}
	if t.PolicyID == FrontierPolicyID {
		m.CueVersion = FrontierCueVersion
	}
	if t.PolicyID == OwnershipPolicyID {
		m.CueVersion = OwnershipCueVersion
	}
	if t.PolicyID == OwnershipComparisonPolicyID {
		m.CueVersion = OwnershipComparisonCueVersion
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return contracts.CoachMessage{}, err
	}
	if err = contracts.Validate("CoachMessage", raw); err != nil {
		return contracts.CoachMessage{}, err
	}
	return m, nil
}

// BuildAdviceFromTrace preserves the historical module advice schema. Its
// concise alternative label points to the full comparison in the saved trace.
func BuildAdviceFromTrace(t DecisionTrace, decisionID string) (Advice, error) {
	if _, err := BuildCoachMessage(t, decisionID); err != nil {
		return Advice{}, err
	}
	origin := "code"
	if t.LegalCount == 1 {
		origin = "forced"
	}
	refs := []string{}
	for _, fact := range t.Support {
		refs = append(refs, fact.ID)
	}
	alternatives := []string{}
	for _, full := range t.Alternatives {
		for _, c := range t.Candidates {
			if full == actionLabel(c.Action)+": "+c.Reason {
				alternatives = append(alternatives, actionLabel(c.Action)+" - "+c.Purpose)
			}
		}
	}
	a := Advice{GameID: "trix", VariantID: t.VariantID, DecisionID: decisionID, Level: 3, Origin: origin, Title: t.Cue, Text: t.Summary, PolicyVersion: t.PolicyVersion, RecommendedCandidateID: t.SelectedCandidateID, Alternatives: alternatives, EvidenceRefs: refs}
	raw, err := json.Marshal(a)
	if err != nil {
		return Advice{}, err
	}
	if err = contracts.Validate("TrixAdvice", raw); err != nil {
		return Advice{}, err
	}
	return a, nil
}

// ValidateDecisionTrace checks frozen context, the complete legal set and
// candidate-bound factual explanations. It does not rerun action selection.
func ValidateDecisionTrace(o Observation, t DecisionTrace) error {
	if err := ValidateLayoutHistoryObservation(o); err != nil {
		return err
	}
	if !isTracePolicy(t.PolicyID) || t.SchemaVersion != traceSchemaFor(t.PolicyID) || t.PolicyVersion != "1.0.0" || t.ObservationDigest != observationDigest(o) || t.VariantID != o.VariantID || t.Actor != o.Seat || t.Phase != o.Phase {
		return fmt.Errorf("Trix trace context mismatch")
	}
	if o.publicSchemaVersion != "" && (t.PublicSchemaVersion != o.publicSchemaVersion || t.RuleProfileID != tracePin(o).RuleProfileID) {
		return fmt.Errorf("Trix trace profile mismatch")
	}
	legal := Legal(o)
	if len(legal) == 0 || len(legal) != t.LegalCount || len(t.Candidates) != len(legal) {
		return fmt.Errorf("Trix trace legal set mismatch")
	}
	var selected *DecisionCandidate
	factsByAction, history, frontier, ownership, err := candidatesWithOwnership(o, t.PolicyID)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(t.HistoryEvidence, history) {
		return fmt.Errorf("Trix trace history evidence mismatch")
	}
	if !reflect.DeepEqual(t.FrontierEvidence, frontier) {
		return fmt.Errorf("Trix trace frontier evidence mismatch")
	}
	if !reflect.DeepEqual(t.OwnershipEvidence, ownership) {
		return fmt.Errorf("Trix trace ownership evidence mismatch")
	}
	var comparison *OwnershipComparisonEvidence
	if t.PolicyID == OwnershipComparisonPolicyID {
		comparison = buildOwnershipComparisonEvidence(o, factsByAction, ownership)
	}
	if !reflect.DeepEqual(t.OwnershipComparisonEvidence, comparison) {
		return fmt.Errorf("Trix trace comparison evidence mismatch")
	}
	for i, a := range legal {
		c := t.Candidates[i]
		if c.CandidateID != ActionID(a) || !actionsEqual(c.Action, a) || math.IsNaN(c.Value) || math.IsInf(c.Value, 0) {
			return fmt.Errorf("Trix trace candidate mismatch")
		}
		// Recheck facts for this recorded action, without choosing an action.
		facts := factsByAction[i]
		if c.Value != facts.Value || c.Purpose != facts.Purpose || c.Reason != facts.Reason || !reflect.DeepEqual(c.Support, facts.Support) {
			return fmt.Errorf("Trix trace candidate facts mismatch")
		}
		if c.CandidateID == t.SelectedCandidateID {
			copy := c
			selected = &copy
		}
	}
	if selected == nil || !actionsEqual(selected.Action, t.Action) {
		return fmt.Errorf("Trix trace selected action mismatch")
	}
	catalog := traceFactCatalog(o, t.PolicyID, history)
	if ownership != nil {
		catalog = append(catalog, ownershipSupport(ownership)...)
	}
	comparisonFacts := ownershipComparisonSupport(t)
	catalog = append(catalog, comparisonFacts...)
	if !reflect.DeepEqual(t.FactCatalog, catalog) {
		return fmt.Errorf("Trix trace fact catalog mismatch")
	}
	support := traceSelectedSupport(o, t.PolicyID, *selected, history)
	if ownership != nil {
		support = append(support, ownershipSupport(ownership)...)
	}
	support = append(support, comparisonFacts...)
	if !reflect.DeepEqual(support, t.Support) || !sameTracePresentation(t, renderTrace(t)) {
		return fmt.Errorf("Trix trace explanation binding mismatch")
	}
	_, err = BuildCoachMessage(t, "trace-validation")
	return err
}

func sameTracePresentation(a, b DecisionTrace) bool {
	return a.Status == b.Status && a.Cue == b.Cue && a.Summary == b.Summary && reflect.DeepEqual(a.Alternatives, b.Alternatives) && reflect.DeepEqual(a.Limitations, b.Limitations)
}

// Verify the recorded ranking and tie order without invoking a selector or
// replacing the recorded action with an action generated by today's policy.
func savedSelectionConsistent(t DecisionTrace) bool {
	selected := -1
	for i, c := range t.Candidates {
		if c.CandidateID == t.SelectedCandidateID {
			if selected >= 0 {
				return false
			}
			selected = i
		}
	}
	if selected < 0 {
		return false
	}
	value := t.Candidates[selected].Value
	for i, c := range t.Candidates {
		if math.IsNaN(c.Value) || math.IsInf(c.Value, 0) || c.Value > value || (i < selected && math.Abs(c.Value-value) < 1e-9) {
			return false
		}
	}
	return true
}

// Packet JSON intentionally omits the observation's internal schema marker.
// Callers auditing a parsed packet supply its pinned module identity explicitly.
func ValidateDecisionTraceWithPin(o Observation, t DecisionTrace, p gamekernel.Pin) error {
	installed, pinErr := PinForPublicSchema(p.VariantID, p.PublicSchemaVersion)
	if pinErr != nil || p != installed || p.GameID != "trix" || p.VariantID != t.VariantID || p.PublicSchemaVersion != t.PublicSchemaVersion || p.RuleProfileID != t.RuleProfileID {
		return fmt.Errorf("Trix trace profile mismatch")
	}
	if o.publicSchemaVersion != "" && o.publicSchemaVersion != p.PublicSchemaVersion {
		return fmt.Errorf("Trix observation profile mismatch")
	}
	if (p.PublicSchemaVersion == "1.2.0") != (o.LayoutHistory != nil) {
		return fmt.Errorf("Trix trace layout history profile mismatch")
	}
	o.publicSchemaVersion = p.PublicSchemaVersion
	return ValidateDecisionTrace(o, t)
}

func actionLabel(a Action) string {
	switch a.Kind {
	case "choose-request":
		name := a.Request
		if name == "trix" {
			name = "Trix Jacks"
		}
		return "Choose " + name
	case "declare-doubles":
		if len(a.Cards) == 0 {
			return "Decline doubling"
		}
		labels := []string{}
		for _, c := range a.Cards {
			labels = append(labels, cardLabel(c))
		}
		return "Double " + strings.Join(labels, ", ")
	case "layout-pass":
		return "Pass this layout turn"
	case "layout-card", "play-card":
		return "Play " + cardLabel(a.Card)
	}
	return "Choose the saved action"
}
func cardLabel(c string) string {
	if len(c) < 2 {
		return c
	}
	suit := map[byte]string{'C': "clubs", 'D': "diamonds", 'H': "hearts", 'S': "spades"}[c[0]]
	r := c[1:]
	switch r {
	case "Q":
		r = "queen"
	case "K":
		r = "king"
	case "A":
		r = "ace"
	case "J":
		r = "jack"
	}
	return r + " of " + suit
}
