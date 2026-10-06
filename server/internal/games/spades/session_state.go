package spades

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"unicode/utf8"
)

type sessionState struct {
	original     *State
	awaitingDeal bool
}
type sessionCompatibility struct {
	HeartsBroken  bool          `json:"heartsBroken"`
	PassDirection string        `json:"passDirection"`
	Passes        [4]PassMemory `json:"passes"`
}
type sessionDocument struct {
	ID                 string               `json:"id"`
	Mode               string               `json:"mode"`
	ModuleVersion      string               `json:"moduleVersion"`
	StateSchemaVersion string               `json:"stateSchemaVersion"`
	RuleProfileID      string               `json:"ruleProfileId"`
	EventSchemaVersion string               `json:"eventSchemaVersion"`
	Phase              string               `json:"phase"`
	Hands              [4][]string          `json:"hands"`
	Bids               [4]*int              `json:"bids"`
	Tricks             [4]int               `json:"tricks"`
	Scores             [4]int               `json:"scores"`
	Bags               [4]int               `json:"bags"`
	Trick              []Play               `json:"trick"`
	History            []Trick              `json:"history"`
	Turn               *int                 `json:"turn"`
	Dealer             int                  `json:"dealer"`
	HandNumber         int                  `json:"handNumber"`
	SpadesBroken       bool                 `json:"spadesBroken"`
	Events             []Event              `json:"events"`
	HandResult         *HandResult          `json:"handResult,omitempty"`
	AwaitingDeal       bool                 `json:"awaitingDeal"`
	Compatibility      sessionCompatibility `json:"compatibility"`
}

func SessionPin(variant string) (gamekernel.Pin, error) {
	if variant != "solo" && variant != "partners" {
		return gamekernel.Pin{}, fmt.Errorf("unsupported Spades variant")
	}
	return gamekernel.Pin{GameID: "spades", VariantID: variant, ModuleVersion: "2.0.0", RuleProfileID: ruleProfile("spades-" + variant), StateSchemaVersion: "2.0.0", ObservationSchemaVersion: "2.0.0", PublicSchemaVersion: "2.0.0", EventSchemaVersion: "2.0.0"}, nil
}
func cloneSession(s *sessionState) *sessionState {
	return &sessionState{cloneState(s.original), s.awaitingDeal}
}
func sessionVariant(s *sessionState) string {
	if s.original.Mode == "spades-solo" {
		return "solo"
	}
	return "partners"
}
func sessionPhase(s *sessionState) string {
	if s.awaitingDeal {
		return "deal"
	}
	return s.original.Phase
}
func sessionPayload(v *sessionState) sessionDocument {
	s := v.original
	return sessionDocument{ID: s.ID, Mode: s.Mode, ModuleVersion: "2.0.0", StateSchemaVersion: "2.0.0", RuleProfileID: s.RuleProfileID, EventSchemaVersion: "2.0.0", Phase: s.Phase, Hands: s.Hands, Bids: s.Bids, Tricks: s.Tricks, Scores: s.Scores, Bags: s.Bags, Trick: s.Trick, History: s.History, Turn: s.Turn, Dealer: s.Dealer, HandNumber: s.HandNumber, SpadesBroken: s.SpadesBroken, Events: s.Events, HandResult: s.HandResult, AwaitingDeal: v.awaitingDeal, Compatibility: sessionCompatibility{s.HeartsBroken, s.PassDirection, s.Passes}}
}
func stateFromSessionDocument(d sessionDocument) *sessionState {
	return &sessionState{original: &State{ID: d.ID, Mode: d.Mode, ModuleVersion: "1.0.0", RuleProfileID: d.RuleProfileID, EventSchemaVersion: "1.0.0", Phase: d.Phase, Hands: d.Hands, Bids: d.Bids, Tricks: d.Tricks, Scores: d.Scores, Bags: d.Bags, Trick: d.Trick, History: d.History, Turn: d.Turn, Dealer: d.Dealer, HandNumber: d.HandNumber, HeartsBroken: d.Compatibility.HeartsBroken, SpadesBroken: d.SpadesBroken, Events: d.Events, HandResult: d.HandResult, PassDirection: d.Compatibility.PassDirection, Passes: d.Compatibility.Passes}, awaitingDeal: d.AwaitingDeal}
}
func OpenSession(variant string, raw json.RawMessage) (gamekernel.BoundSession, error) {
	pin, err := SessionPin(variant)
	if err != nil {
		return nil, err
	}
	var d sessionDocument
	if err = gamekernel.DecodeSessionJSON(raw, &d); err != nil {
		return nil, err
	}
	if d.Mode != "spades-"+variant || d.ModuleVersion != "2.0.0" || d.StateSchemaVersion != "2.0.0" || d.EventSchemaVersion != "2.0.0" || d.RuleProfileID != pin.RuleProfileID || (d.AwaitingDeal && d.Phase != "hand-end") {
		return nil, fmt.Errorf("unsupported Spades session pin/boundary")
	}
	s := stateFromSessionDocument(d)
	if err = validateStateWithTextLength(s.original, utf8.RuneCountInString); err != nil {
		return nil, err
	}
	return bindSpadesSession(s)
}
func OpenV1Session(variant string, raw json.RawMessage) (gamekernel.BoundSession, error) {
	if _, err := SessionPin(variant); err != nil {
		return nil, err
	}
	s, err := DecodeState(raw)
	if err != nil {
		return nil, err
	}
	if s.Mode != "spades-"+variant {
		return nil, fmt.Errorf("Spades variant mismatch")
	}
	return bindSpadesSession(&sessionState{original: s})
}

type sessionConfig struct {
	ID     string `json:"id"`
	Dealer int    `json:"dealer"`
}
type sessionDeal struct {
	Kind string   `json:"kind"`
	Deck []string `json:"deck"`
}

func parseSessionDeal(raw json.RawMessage) ([]string, error) {
	var d sessionDeal
	if err := gamekernel.DecodeSessionJSON(raw, &d); err != nil {
		return nil, err
	}
	if d.Kind != "deal" {
		return nil, fmt.Errorf("explicit Spades deal required")
	}
	if err := validateDeal(d.Deck); err != nil {
		return nil, err
	}
	return d.Deck, nil
}
func StartSession(variant string, rawConfig, rawMaterial json.RawMessage) (gamekernel.BoundSession, error) {
	pin, err := SessionPin(variant)
	if err != nil {
		return nil, err
	}
	var c sessionConfig
	if err = gamekernel.DecodeSessionJSON(rawConfig, &c); err != nil {
		return nil, err
	}
	if !gamekernel.ValidIdentifier(c.ID) || !seatOK(c.Dealer) {
		return nil, fmt.Errorf("invalid Spades configuration")
	}
	deck, err := parseSessionDeal(rawMaterial)
	if err != nil {
		return nil, err
	}
	s := &State{ID: c.ID, Mode: "spades-" + variant, ModuleVersion: "1.0.0", RuleProfileID: pin.RuleProfileID, EventSchemaVersion: "1.0.0", Dealer: c.Dealer, HandNumber: 1, Events: []Event{}}
	if err = deal(s, deck); err != nil {
		return nil, err
	}
	return bindSpadesSession(&sessionState{original: s})
}
