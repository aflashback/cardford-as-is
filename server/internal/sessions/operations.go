package sessions

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
)

// Operation is a closed, typed service command. Seats and sealed bot choices
// come from authenticated orchestration, never directly from a public request.
type Operation interface{ sessionOperation() }
type ActorOperation struct {
	Kind        string `json:"kind"`
	Seat        int    `json:"seat"`
	CandidateID string `json:"candidateId"`
}
type SealedOperation struct {
	Kind     string                  `json:"kind"`
	WindowID string                  `json:"windowId"`
	Choices  []gamekernel.SeatChoice `json:"choices"`
}
type AutomaticOperation struct {
	Kind         string `json:"kind"`
	TransitionID string `json:"transitionId"`
}
type ChanceOperation struct {
	Kind      string          `json:"kind"`
	RequestID string          `json:"requestId"`
	Material  json.RawMessage `json:"material"`
}
type ContinueOperation struct {
	Kind string `json:"kind"`
}

func (ActorOperation) sessionOperation()     {}
func (SealedOperation) sessionOperation()    {}
func (AutomaticOperation) sessionOperation() {}
func (ChanceOperation) sessionOperation()    {}
func (ContinueOperation) sessionOperation()  {}
func EncodeOperation(op Operation) (json.RawMessage, error) {
	raw, err := json.Marshal(op)
	if err != nil {
		return nil, err
	}
	if _, err = DecodeOperation(raw); err != nil {
		return nil, err
	}
	return raw, nil
}
func DecodeOperation(raw json.RawMessage) (Operation, error) {
	if len(raw) == 0 || len(raw) > 256<<10 {
		return nil, fmt.Errorf("operation byte budget")
	}
	if err := validateOperation(raw); err != nil {
		return nil, err
	}
	var tag struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &tag); err != nil {
		return nil, err
	}
	switch tag.Kind {
	case "actor":
		var v ActorOperation
		err := strictDecode(raw, &v)
		return v, err
	case "sealed":
		var v SealedOperation
		err := strictDecode(raw, &v)
		return v, err
	case "automatic":
		var v AutomaticOperation
		err := strictDecode(raw, &v)
		return v, err
	case "chance":
		var v ChanceOperation
		err := strictDecode(raw, &v)
		return v, err
	case "continue-round":
		var v ContinueOperation
		err := strictDecode(raw, &v)
		return v, err
	}
	return nil, fmt.Errorf("unsupported operation")
}
func ApplyOperation(s gamekernel.BoundSession, op Operation) (gamekernel.BoundTransition, error) {
	// The lifecycle validates typed IDs, participants and candidate membership.
	// Trusted operations do not serialize and reimport their own payloads.
	switch v := op.(type) {
	case ActorOperation:
		if v.Kind == "actor" {
			return s.Commit(v.Seat, v.CandidateID)
		}
	case SealedOperation:
		if v.Kind == "sealed" {
			return s.CommitSealed(v.WindowID, v.Choices)
		}
	case AutomaticOperation:
		if v.Kind == "automatic" {
			return s.Advance(v.TransitionID)
		}
	case ChanceOperation:
		if v.Kind == "chance" {
			return s.SupplyChance(v.RequestID, v.Material)
		}
	case ContinueOperation:
		if v.Kind == "continue-round" {
			return s.ContinueRound()
		}
	}
	return gamekernel.BoundTransition{}, fmt.Errorf("operation kind/type mismatch")
}
