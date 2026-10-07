package spades

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"strconv"
)

func spadesSessionNode(v *sessionState) gamekernel.Node {
	s := v.original
	n := gamekernel.Node{Phase: sessionPhase(v)}
	if v.awaitingDeal {
		n.Kind = "chance"
		n.RequestID = fmt.Sprintf("deal:%d", s.HandNumber+1)
		n.Request = json.RawMessage(fmt.Sprintf(`{"kind":"request-deal","roundNumber":%d}`, s.HandNumber+1))
		return n
	}
	switch s.Phase {
	case "bid", "play":
		n.Kind = "actor"
		n.Seat = s.Turn
	case "trick-end":
		n.Kind = "automatic"
		n.TransitionID = fmt.Sprintf("collect:%d:%d", s.HandNumber, len(s.History))
	case "hand-end":
		n.Kind = "round-complete"
	case "match-end":
		n.Kind = "session-complete"
	}
	return n
}
func sessionCandidates(o sessionObservation) []gamekernel.Candidate[Action] {
	result := []gamekernel.Candidate[Action]{}
	for _, a := range observationActions(o) {
		public, _ := json.Marshal(publicAction{Kind: a.Kind, Card: a.Card, Bid: a.Bid})
		result = append(result, gamekernel.Candidate[Action]{ID: actionID(a), Action: a, Public: public})
	}
	return result
}
func bindSpadesSession(s *sessionState) (gamekernel.BoundSession, error) {
	variant := sessionVariant(s)
	pin, err := SessionPin(variant)
	if err != nil {
		return nil, err
	}
	return gamekernel.BindSession(gamekernel.SessionModel[*sessionState, sessionObservation, Action]{Pin: pin, Clone: cloneSession, Node: spadesSessionNode, AccessUnit: func(s *sessionState) *gamekernel.AccessUnit { return observationUnit(observeSession(s, 0)) }, Document: func(s *sessionState) (json.RawMessage, error) { return json.Marshal(sessionPayload(s)) }, Observe: observeSession, Candidates: sessionCandidates,
		Packet: func(o sessionObservation, c []gamekernel.PublicCandidate) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "spades", "variantId": o.VariantID, "seat": o.Seat, "phase": o.Phase, "observation": o.Table, "candidates": c})
		},
		LegacyObservation: func(o sessionObservation) (json.RawMessage, error) {
			v, e := legacySessionObservation(o)
			if e != nil {
				return nil, e
			}
			return json.Marshal(v)
		},
		View: func(o sessionObservation) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "spades", "variantId": o.VariantID, "seat": o.Seat, "phase": o.Phase, "table": o.Table, "accessUnit": observationUnit(o)})
		}, EncodeObservation: func(o sessionObservation) (json.RawMessage, error) { return json.Marshal(o) }, Analyze: analyzeSession, Reduce: reduceSession,
		AnalyzeComplete: analyzeSessionComplete, Persist: persistSession, EventCount: func(s *sessionState) int { return len(s.original.Events) }, StorageIdentity: func(s *sessionState) (string, string) { return s.original.ID, s.original.Mode }, StorageUnit: func(s *sessionState) string {
			return fmt.Sprintf("spades:%s:hand:%d", sessionVariant(s), s.original.HandNumber)
		},
		ProjectEvent: func(raw json.RawMessage, viewer int) (json.RawMessage, error) {
			return projectSessionEvent(variant, raw, viewer)
		},
	}, s)
}
func reduceSession(source *sessionState, op gamekernel.Operation[Action]) (*sessionState, []json.RawMessage, error) {
	next := cloneSession(source)
	s := next.original
	n := spadesSessionNode(source)
	var err error
	switch op.Kind {
	case "actor":
		if n.Kind != "actor" || n.Seat == nil || *n.Seat != op.Seat || op.Action.Seat != op.Seat {
			return nil, nil, fmt.Errorf("wrong Spades actor")
		}
		if err = validateAction(&op.Action); err == nil {
			err = applyAction(s, op.Action)
		}
	case "automatic":
		if n.Kind != "automatic" || op.TransitionID != n.TransitionID || len(s.Trick) != 4 {
			return nil, nil, fmt.Errorf("wrong Spades collection")
		}
		s.Trick = []Play{}
		s.Phase = "play"
		if s.HandResult != nil {
			s.Phase = "hand-end"
			if s.HandResult.Winner != nil {
				s.Phase = "match-end"
			}
		}
		emit(s, "trick-collected", "Completed trick cleared from the table.", nil, nil, nil)
	case "continue-round":
		if n.Kind != "round-complete" {
			return nil, nil, fmt.Errorf("wrong Spades round boundary")
		}
		next.awaitingDeal = true
	case "chance":
		if n.Kind != "chance" || op.RequestID != n.RequestID {
			return nil, nil, fmt.Errorf("wrong Spades deal request")
		}
		var deck []string
		deck, err = parseSessionDeal(op.Material)
		if err == nil {
			if s.HandNumber >= maxSafeInteger {
				return nil, nil, fmt.Errorf("unsafe next Spades round")
			}
			s.Dealer = (s.Dealer + 1) % 4
			s.HandNumber++
			err = deal(s, deck)
			next.awaitingDeal = false
		}
	default:
		return nil, nil, fmt.Errorf("unsupported Spades operation")
	}
	if err != nil {
		return nil, nil, err
	}
	if len(s.Events) > 100000 {
		return nil, nil, fmt.Errorf("Spades event limit reached")
	}
	events := make([]json.RawMessage, len(s.Events)-len(source.original.Events))
	for i, e := range s.Events[len(source.original.Events):] {
		if err = validateEvent(e, e.ID-1); err != nil {
			return nil, nil, err
		}
		events[i], err = json.Marshal(e)
		if err != nil {
			return nil, nil, err
		}
	}
	return next, events, nil
}
func projectSessionEvent(variant string, raw json.RawMessage, viewer int) (json.RawMessage, error) {
	if !seatOK(viewer) {
		return nil, fmt.Errorf("invalid viewer")
	}
	var e Event
	if err := strictDecode(raw, &e); err != nil {
		return nil, err
	}
	if err := validateEvent(e, e.ID-1); err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "spades", "variantId": variant, "eventSchemaVersion": "2.0.0", "id": strconv.Itoa(e.ID), "type": e.Type, "message": e.Message, "seat": e.Seat, "card": e.Card, "bid": e.Bid})
}
