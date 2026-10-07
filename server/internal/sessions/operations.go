package sessions

import (
	"cardford/server/internal/contracts"
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
	return decodeOperation(raw)
}

// decodeOperation returns the same closed typed value that passed validation.
// The historical journal uses its existing document/parser byte bounds; only
// DecodeOperation applies the narrower service-operation limit above.
func decodeOperation(raw json.RawMessage) (Operation, error) {
	var tag struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &tag); err != nil {
		return nil, err
	}
	switch tag.Kind {
	case "actor":
		var v ActorOperation
		if err := strictDecode(raw, &v); err != nil {
			return nil, err
		}
		if !gamekernel.ValidSeat(v.Seat) || !gamekernel.ValidIdentifier(v.CandidateID) {
			return nil, fmt.Errorf("invalid actor operation")
		}
		return v, nil
	case "sealed":
		var v SealedOperation
		if err := strictDecode(raw, &v); err != nil {
			return nil, err
		}
		if !gamekernel.ValidIdentifier(v.WindowID) || len(v.Choices) == 0 {
			return nil, fmt.Errorf("invalid sealed operation")
		}
		seen := map[int]bool{}
		for _, choice := range v.Choices {
			if !gamekernel.ValidSeat(choice.Seat) || !gamekernel.ValidIdentifier(choice.CandidateID) || seen[choice.Seat] {
				return nil, fmt.Errorf("invalid sealed choices")
			}
			seen[choice.Seat] = true
		}
		return v, nil
	case "automatic":
		var v AutomaticOperation
		if err := strictDecode(raw, &v); err != nil {
			return nil, err
		}
		if !gamekernel.ValidIdentifier(v.TransitionID) {
			return nil, fmt.Errorf("invalid transition identifier")
		}
		return v, nil
	case "chance":
		var v ChanceOperation
		if err := strictDecode(raw, &v); err != nil {
			return nil, err
		}
		if !gamekernel.ValidIdentifier(v.RequestID) {
			return nil, fmt.Errorf("invalid request identifier")
		}
		if _, err := contracts.ParseJSON(v.Material); err != nil {
			return nil, err
		}
		return v, nil
	case "continue-round":
		var v ContinueOperation
		if err := strictDecode(raw, &v); err != nil {
			return nil, err
		}
		return v, nil
	}
	return nil, fmt.Errorf("unsupported recorded operation")
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
