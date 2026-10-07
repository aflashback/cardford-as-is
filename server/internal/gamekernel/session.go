package gamekernel

import (
	"cardford/server/internal/contracts"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"unicode/utf16"
	"unicode/utf8"
)

// Pin and public outputs use the generated contract. Private state and actions
// remain concrete game-owned types inside BindSession's generic closure.
type Pin = contracts.ModulePin
type AccessUnit = contracts.CoachedUnit
type Node struct {
	Kind         string          `json:"kind"`
	Phase        string          `json:"phase"`
	Seat         *int            `json:"seat,omitempty"`
	WindowID     string          `json:"windowId,omitempty"`
	Actors       []int           `json:"actors,omitempty"`
	TransitionID string          `json:"transitionId,omitempty"`
	RequestID    string          `json:"requestId,omitempty"`
	Request      json.RawMessage `json:"request,omitempty"`
}
type SeatChoice struct {
	Seat        int    `json:"seat"`
	CandidateID string `json:"candidateId"`
}
type PreparedDecision struct {
	Actor                    int             `json:"actor"`
	CandidateID              string          `json:"candidateId"`
	InputDigest              string          `json:"inputDigest"`
	PolicyID                 string          `json:"policyId"`
	ObservationSchemaVersion string          `json:"observationSchemaVersion"`
	Analysis                 json.RawMessage `json:"analysis"`
}

// PrivateOutput is a game-owned, versioned persistence boundary. It is never
// included in RegisteredAnalysis or an actor's public packet.
type PrivateOutput struct {
	Schema string
	Bytes  json.RawMessage
}
type CompleteAnalysis struct {
	CandidateID    string
	Registered     json.RawMessage
	Detail, Advice PrivateOutput
}
type CompletePreparation struct {
	Prepared       PreparedDecision
	Detail, Advice PrivateOutput
}
type PreparationBinding struct {
	InputDigest  string
	Packet       json.RawMessage
	CandidateIDs []string
}
type BoundTransition struct {
	Next          BoundSession
	PrivateEvents []json.RawMessage
}
type BoundSession interface {
	Pin() Pin
	Node() (Node, error)
	AccessUnit() (*AccessUnit, error)
	SerializePrivate() (json.RawMessage, error)
	Packet(int) (json.RawMessage, error)
	View(int) (json.RawMessage, error)
	Presentation(int) (json.RawMessage, error)
	LegacyObservation(int) (json.RawMessage, error)
	Prepare(int, string) (PreparedDecision, error)
	PreparationBinding(int, string) (PreparationBinding, error)
	PrepareComplete(context.Context, int, string, string) (CompletePreparation, error)
	Persist(int) (json.RawMessage, []json.RawMessage, error)
	EventCount() int
	StorageIdentity() (string, string)
	UnitID() string
	Commit(int, string) (BoundTransition, error)
	CommitSealed(string, []SeatChoice) (BoundTransition, error)
	Advance(string) (BoundTransition, error)
	SupplyChance(string, json.RawMessage) (BoundTransition, error)
	ContinueRound() (BoundTransition, error)
}
type Candidate[A any] struct {
	ID     string
	Action A
	Public json.RawMessage
}
type PublicCandidate struct {
	ID     string          `json:"id"`
	Public json.RawMessage `json:"public"`
}
type SeatAction[A any] struct {
	Seat   int
	Action A
}
type Operation[A any] struct {
	Kind         string
	Seat         int
	Action       A
	WindowID     string
	Actions      []SeatAction[A]
	TransitionID string
	RequestID    string
	Material     json.RawMessage
}

// SessionModel is trusted installation code. Import validation belongs to the
// game factory. Clone and Reduce preserve immutable snapshots; no state JSON
// import or historical replay occurs on a trusted transition. Observe and
// Candidates return actor-scoped values used read-only by all installed
// callbacks; Analyze must not retain or mutate them. Reduce must return a new
// owned state and must never mutate its input, including on rejection.
type SessionModel[S, O, A any] struct {
	Pin        Pin
	Clone      func(S) S
	Node       func(S) Node
	AccessUnit func(S) *AccessUnit
	Document   func(S) (json.RawMessage, error)
	Observe    func(S, int) O
	Candidates func(O) []Candidate[A]
	Packet     func(O, []PublicCandidate) (json.RawMessage, error)
	View       func(O) (json.RawMessage, error)
	// LegacyObservation is the explicit actor-only compatibility adapter for the preserved UI/review.
	LegacyObservation func(O) (json.RawMessage, error)
	EncodeObservation func(O) (json.RawMessage, error)
	Analyze           func(O, string) (string, json.RawMessage, error)
	AnalyzeComplete   func(context.Context, O, string, string) (CompleteAnalysis, error)
	Persist           func(S, int) (json.RawMessage, []json.RawMessage, error)
	EventCount        func(S) int
	StorageIdentity   func(S) (string, string)
	StorageUnit       func(S) string
	Reduce            func(S, Operation[A]) (S, []json.RawMessage, error)
	ProjectEvent      func(json.RawMessage, int) (json.RawMessage, error)
}
type boundSession[S, O, A any] struct {
	model SessionModel[S, O, A]
	state S
}

func BindSession[S, O, A any](model SessionModel[S, O, A], initial S) (BoundSession, error) {
	if model.Clone == nil || model.Node == nil || model.AccessUnit == nil || model.Document == nil || model.Observe == nil || model.Candidates == nil || model.Packet == nil || model.View == nil || model.EncodeObservation == nil || model.Analyze == nil || model.Reduce == nil || model.ProjectEvent == nil {
		return nil, fmt.Errorf("incomplete session model")
	}
	if _, err := json.Marshal(model.Pin); err != nil {
		return nil, err
	}
	return &boundSession[S, O, A]{model: model, state: model.Clone(initial)}, nil
}
func ValidSeat(seat int) bool { return seat >= 0 && seat < 4 }
func ValidIdentifier(s string) bool {
	n := len(utf16.Encode([]rune(s)))
	return utf8.ValidString(s) && n > 0 && n <= 256
}
func (b *boundSession[S, O, A]) Pin() Pin { return b.model.Pin }
func (b *boundSession[S, O, A]) Node() (Node, error) {
	n := b.model.Node(b.state)
	if !ValidIdentifier(n.Phase) {
		return Node{}, fmt.Errorf("invalid lifecycle phase")
	}
	valid := false
	switch n.Kind {
	case "actor":
		valid = n.Seat != nil && ValidSeat(*n.Seat)
	case "sealed":
		valid = ValidIdentifier(n.WindowID) && len(n.Actors) > 0
		seen := map[int]bool{}
		for _, seat := range n.Actors {
			if !ValidSeat(seat) || seen[seat] {
				valid = false
			}
			seen[seat] = true
		}
	case "automatic":
		valid = ValidIdentifier(n.TransitionID)
	case "chance":
		_, err := contracts.ParseJSON(n.Request)
		valid = ValidIdentifier(n.RequestID) && err == nil
	case "round-complete", "session-complete":
		valid = true
	}
	if (n.Kind != "actor" && n.Seat != nil) || (n.Kind != "sealed" && (n.WindowID != "" || n.Actors != nil)) || (n.Kind != "automatic" && n.TransitionID != "") || (n.Kind != "chance" && (n.RequestID != "" || n.Request != nil)) {
		valid = false
	}
	if !valid {
		return Node{}, fmt.Errorf("invalid lifecycle node")
	}
	if n.Seat != nil {
		seat := *n.Seat
		n.Seat = &seat
	}
	if n.Actors != nil {
		n.Actors = append([]int{}, n.Actors...)
	}
	n.Request = append(json.RawMessage(nil), n.Request...)
	return n, nil
}
func (b *boundSession[S, O, A]) AccessUnit() (*AccessUnit, error) {
	u := b.model.AccessUnit(b.state)
	if u == nil {
		return nil, nil
	}
	copy := *u
	_, err := json.Marshal(copy)
	return &copy, err
}
func (b *boundSession[S, O, A]) SerializePrivate() (json.RawMessage, error) {
	raw, err := b.model.Document(b.state)
	if err != nil {
		return nil, err
	}
	if _, err = contracts.ParseJSON(raw); err != nil {
		return nil, err
	}
	return append(json.RawMessage(nil), raw...), nil
}
func eligible(n Node, seat int) bool {
	if n.Kind == "actor" {
		return n.Seat != nil && *n.Seat == seat
	}
	if n.Kind == "sealed" {
		for _, actor := range n.Actors {
			if actor == seat {
				return true
			}
		}
	}
	return false
}

type sessionInput[O, A any] struct {
	observation O
	candidates  []Candidate[A]
	packet      json.RawMessage
}

func (b *boundSession[S, O, A]) inputFor(seat int) (sessionInput[O, A], error) {
	var result sessionInput[O, A]
	n, err := b.Node()
	if err != nil {
		return result, err
	}
	if !ValidSeat(seat) || !eligible(n, seat) {
		return result, fmt.Errorf("seat is not eligible at this node")
	}
	o := b.model.Observe(b.state, seat)
	choices := b.model.Candidates(o)
	pub := make([]PublicCandidate, len(choices))
	for i, c := range choices {
		pub[i] = PublicCandidate{ID: c.ID, Public: c.Public}
	}
	if _, err = ProviderEligibility(pub); err != nil {
		return result, err
	}
	p, err := b.model.Packet(o, pub)
	if err != nil {
		return result, err
	}
	if err = validateSessionPublic("RegisteredActorPacket", p, b.Pin(), seat, n.Phase); err != nil {
		return result, err
	}
	var packet struct {
		Candidates []PublicCandidate `json:"candidates"`
	}
	if err = json.Unmarshal(p, &packet); err != nil {
		return result, err
	}
	left, _ := json.Marshal(packet.Candidates)
	right, _ := json.Marshal(pub)
	lv, _ := contracts.ParseJSON(left)
	rv, _ := contracts.ParseJSON(right)
	if !reflect.DeepEqual(lv, rv) {
		return result, fmt.Errorf("packet complete candidate set mismatch")
	}
	return sessionInput[O, A]{o, choices, append(json.RawMessage(nil), p...)}, nil
}

type ProviderEligibilityResult struct {
	Kind           string `json:"kind"`
	CandidateCount int    `json:"candidateCount"`
}

func ProviderEligibility(candidates []PublicCandidate) (ProviderEligibilityResult, error) {
	seen := map[string]bool{}
	for _, c := range candidates {
		if !ValidIdentifier(c.ID) || seen[c.ID] {
			return ProviderEligibilityResult{}, fmt.Errorf("invalid candidate set")
		}
		seen[c.ID] = true
	}
	if len(candidates) == 0 {
		return ProviderEligibilityResult{}, fmt.Errorf("invalid candidate set")
	}
	kind := "eligible"
	if len(candidates) == 1 {
		kind = "forced"
	} else if len(candidates) > 255 {
		kind = "unsupported-action-space"
	}
	return ProviderEligibilityResult{kind, len(candidates)}, nil
}
func validateSessionPublic(contract string, raw json.RawMessage, pin Pin, seat int, phase string) error {
	if err := contracts.Validate(contract, raw); err != nil {
		return err
	}
	var v struct {
		GameID              string `json:"gameId"`
		VariantID           string `json:"variantId"`
		PublicSchemaVersion string `json:"publicSchemaVersion"`
		Seat                int    `json:"seat"`
		Phase               string `json:"phase"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	if v.GameID != pin.GameID || v.VariantID != pin.VariantID || v.PublicSchemaVersion != pin.PublicSchemaVersion || v.Seat != seat || v.Phase != phase {
		return fmt.Errorf("public identity mismatch")
	}
	return nil
}
func (b *boundSession[S, O, A]) Packet(seat int) (json.RawMessage, error) {
	input, err := b.inputFor(seat)
	return input.packet, err
}
func (b *boundSession[S, O, A]) View(seat int) (json.RawMessage, error) {
	if !ValidSeat(seat) {
		return nil, fmt.Errorf("invalid viewer")
	}
	n, err := b.Node()
	if err != nil {
		return nil, err
	}
	v, err := b.model.View(b.model.Observe(b.state, seat))
	if err != nil {
		return nil, err
	}
	if err = validateSessionPublic("RegisteredSessionView", v, b.Pin(), seat, n.Phase); err != nil {
		return nil, err
	}
	return append(json.RawMessage(nil), v...), nil
}
func ParseRegisteredAnalysis(raw json.RawMessage, pin Pin, candidateID string) (json.RawMessage, error) {
	if err := contracts.Validate("RegisteredAnalysis", raw); err != nil {
		return nil, err
	}
	var a struct {
		GameID              string `json:"gameId"`
		VariantID           string `json:"variantId"`
		PublicSchemaVersion string `json:"publicSchemaVersion"`
		SelectedCandidateID string `json:"selectedCandidateId"`
		Facts               []struct {
			CandidateID *string `json:"candidateId"`
		} `json:"facts"`
		Estimates []struct {
			Uncertainty *struct {
				Lower float64 `json:"lower"`
				Upper float64 `json:"upper"`
			} `json:"uncertainty"`
		} `json:"estimates"`
	}
	if err := json.Unmarshal(raw, &a); err != nil {
		return nil, err
	}
	if a.GameID != pin.GameID || a.VariantID != pin.VariantID || a.PublicSchemaVersion != pin.PublicSchemaVersion || (candidateID != "" && a.SelectedCandidateID != candidateID) {
		return nil, fmt.Errorf("analysis identity mismatch")
	}
	for _, f := range a.Facts {
		if f.CandidateID != nil && *f.CandidateID != a.SelectedCandidateID {
			return nil, fmt.Errorf("analysis selected-action evidence mismatch")
		}
	}
	for _, e := range a.Estimates {
		if e.Uncertainty != nil && e.Uncertainty.Lower > e.Uncertainty.Upper {
			return nil, fmt.Errorf("analysis uncertainty interval is reversed")
		}
	}
	return append(json.RawMessage(nil), raw...), nil
}
func resolveCandidate[A any](candidates []Candidate[A], id string) (A, error) {
	var zero A
	if !ValidIdentifier(id) {
		return zero, fmt.Errorf("invalid candidate identifier")
	}
	for _, c := range candidates {
		if c.ID == id {
			return c.Action, nil
		}
	}
	return zero, fmt.Errorf("unknown or ineligible candidate")
}
func (b *boundSession[S, O, A]) Prepare(seat int, policyID string) (PreparedDecision, error) {
	var result PreparedDecision
	if !ValidIdentifier(policyID) {
		return result, fmt.Errorf("invalid policy identifier")
	}
	input, err := b.inputFor(seat)
	if err != nil {
		return result, err
	}
	digest, err := b.inputDigest(input, seat, policyID)
	if err != nil {
		return result, err
	}
	id, analysis, err := b.model.Analyze(input.observation, policyID)
	if err != nil {
		return result, err
	}
	if _, err = resolveCandidate(input.candidates, id); err != nil {
		return result, err
	}
	analysis, err = ParseRegisteredAnalysis(analysis, b.Pin(), id)
	if err != nil {
		return result, err
	}
	return PreparedDecision{seat, id, digest, policyID, b.Pin().ObservationSchemaVersion, analysis}, nil
}
func (b *boundSession[S, O, A]) apply(op Operation[A]) (BoundTransition, error) {
	next, events, err := b.model.Reduce(b.state, op)
	if err != nil {
		return BoundTransition{}, err
	}
	checked := make([]json.RawMessage, len(events))
	for i, e := range events {
		if _, err = contracts.ParseJSON(e); err != nil {
			return BoundTransition{}, err
		}
		for viewer := 0; viewer < 4; viewer++ {
			public, err := b.model.ProjectEvent(e, viewer)
			if err != nil {
				return BoundTransition{}, err
			}
			if public == nil {
				continue
			}
			if err = contracts.Validate("RegisteredActorEvent", public); err != nil {
				return BoundTransition{}, err
			}
			var p struct {
				GameID              string `json:"gameId"`
				VariantID           string `json:"variantId"`
				PublicSchemaVersion string `json:"publicSchemaVersion"`
				EventSchemaVersion  string `json:"eventSchemaVersion"`
			}
			if err = json.Unmarshal(public, &p); err != nil {
				return BoundTransition{}, err
			}
			pin := b.Pin()
			if p.GameID != pin.GameID || p.VariantID != pin.VariantID || p.PublicSchemaVersion != pin.PublicSchemaVersion || p.EventSchemaVersion != pin.EventSchemaVersion {
				return BoundTransition{}, fmt.Errorf("projected event pin mismatch")
			}
		}
		checked[i] = append(json.RawMessage(nil), e...)
	}
	// Reduce already allocated and owns the next immutable state. Rebinding
	// here does not clone the entire archive again or replay imported history.
	bound := &boundSession[S, O, A]{model: b.model, state: next}
	return BoundTransition{bound, checked}, nil
}
func (b *boundSession[S, O, A]) Commit(seat int, id string) (BoundTransition, error) {
	n, err := b.Node()
	if err != nil {
		return BoundTransition{}, err
	}
	if n.Kind != "actor" || !eligible(n, seat) {
		return BoundTransition{}, fmt.Errorf("not an actor node")
	}
	input, err := b.inputFor(seat)
	if err != nil {
		return BoundTransition{}, err
	}
	action, err := resolveCandidate(input.candidates, id)
	if err != nil {
		return BoundTransition{}, err
	}
	return b.apply(Operation[A]{Kind: "actor", Seat: seat, Action: action})
}
func (b *boundSession[S, O, A]) CommitSealed(window string, choices []SeatChoice) (BoundTransition, error) {
	n, err := b.Node()
	if err != nil {
		return BoundTransition{}, err
	}
	if n.Kind != "sealed" || n.WindowID != window {
		return BoundTransition{}, fmt.Errorf("wrong sealed window")
	}
	bySeat := map[int]string{}
	for _, choice := range choices {
		if !ValidSeat(choice.Seat) || !ValidIdentifier(choice.CandidateID) || !eligible(n, choice.Seat) {
			return BoundTransition{}, fmt.Errorf("invalid sealed choice")
		}
		if _, ok := bySeat[choice.Seat]; ok {
			return BoundTransition{}, fmt.Errorf("duplicate sealed actor")
		}
		bySeat[choice.Seat] = choice.CandidateID
	}
	if len(bySeat) != len(n.Actors) {
		return BoundTransition{}, fmt.Errorf("sealed choices must cover each participant exactly once")
	}
	// Every actor is projected from this one immutable state before any resolve or reduce.
	inputs := make([]sessionInput[O, A], len(n.Actors))
	for i, seat := range n.Actors {
		inputs[i], err = b.inputFor(seat)
		if err != nil {
			return BoundTransition{}, err
		}
	}
	actions := make([]SeatAction[A], len(n.Actors))
	for i, seat := range n.Actors {
		a, err := resolveCandidate(inputs[i].candidates, bySeat[seat])
		if err != nil {
			return BoundTransition{}, err
		}
		actions[i] = SeatAction[A]{seat, a}
	}
	return b.apply(Operation[A]{Kind: "sealed", WindowID: window, Actions: actions})
}
func (b *boundSession[S, O, A]) Advance(id string) (BoundTransition, error) {
	n, err := b.Node()
	if err != nil {
		return BoundTransition{}, err
	}
	if n.Kind != "automatic" || n.TransitionID != id {
		return BoundTransition{}, fmt.Errorf("wrong automatic transition")
	}
	return b.apply(Operation[A]{Kind: "automatic", TransitionID: id})
}
func (b *boundSession[S, O, A]) SupplyChance(id string, material json.RawMessage) (BoundTransition, error) {
	n, err := b.Node()
	if err != nil {
		return BoundTransition{}, err
	}
	if n.Kind != "chance" || n.RequestID != id {
		return BoundTransition{}, fmt.Errorf("wrong chance request")
	}
	if _, err = contracts.ParseJSON(material); err != nil {
		return BoundTransition{}, err
	}
	return b.apply(Operation[A]{Kind: "chance", RequestID: id, Material: append(json.RawMessage(nil), material...)})
}
func (b *boundSession[S, O, A]) ContinueRound() (BoundTransition, error) {
	n, err := b.Node()
	if err != nil {
		return BoundTransition{}, err
	}
	if n.Kind != "round-complete" {
		return BoundTransition{}, fmt.Errorf("not a round boundary")
	}
	return b.apply(Operation[A]{Kind: "continue-round"})
}
