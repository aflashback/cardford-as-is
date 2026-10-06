package hearts

import (
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"fmt"
	"strconv"
)

func heartsSessionNode(v *sessionState) gamekernel.Node {
	s := v.original
	n := gamekernel.Node{Phase: sessionPhase(v)}
	if v.awaitingDeal {
		n.Kind = "chance"
		n.RequestID = fmt.Sprintf("%s:hand:%d:deal", s.ID, s.HandNumber+1)
		n.Request = json.RawMessage(fmt.Sprintf(`{"kind":"request-deal","roundNumber":%d}`, s.HandNumber+1))
		return n
	}
	switch s.Phase {
	case "pass":
		n.Kind = "sealed"
		n.WindowID = fmt.Sprintf("%s:hand:%d:pass", s.ID, s.HandNumber)
		n.Actors = []int{0, 1, 2, 3}
	case "play":
		n.Kind = "actor"
		n.Seat = s.Turn
	case "trick-end":
		n.Kind = "automatic"
		n.TransitionID = fmt.Sprintf("%s:hand:%d:collect:%d", s.ID, s.HandNumber, len(s.History))
	case "hand-end":
		n.Kind = "round-complete"
	case "match-end":
		n.Kind = "session-complete"
	}
	return n
}
func sessionCandidates(o sessionObservation) []gamekernel.Candidate[action] {
	result := []gamekernel.Candidate[action]{}
	for _, a := range observationActions(o) {
		public := map[string]any{"kind": a.Kind}
		if a.Kind == "pass" {
			public["cards"] = a.Cards
		} else {
			public["card"] = a.Card
		}
		raw, _ := json.Marshal(public)
		result = append(result, gamekernel.Candidate[action]{ID: actionID(a), Action: a, Public: raw})
	}
	return result
}
func bindHeartsSession(s *sessionState) (gamekernel.BoundSession, error) {
	return gamekernel.BindSession(gamekernel.SessionModel[*sessionState, sessionObservation, action]{
		Pin: SessionPin(), Clone: cloneSession, Node: heartsSessionNode,
		AccessUnit: func(s *sessionState) *gamekernel.AccessUnit { return observationUnit(observeSession(s, 0)) },
		Document:   func(s *sessionState) (json.RawMessage, error) { return json.Marshal(sessionPayload(s)) },
		Observe:    observeSession, Candidates: sessionCandidates,
		Packet: func(o sessionObservation, c []gamekernel.PublicCandidate) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "hearts", "variantId": "solo", "seat": o.Seat, "phase": o.Phase, "observation": publicSessionObservation(o), "candidates": c})
		},
		View: func(o sessionObservation) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "hearts", "variantId": "solo", "seat": o.Seat, "phase": o.Phase, "table": publicSessionObservation(o), "accessUnit": observationUnit(o)})
		},
		EncodeObservation: func(o sessionObservation) (json.RawMessage, error) { return json.Marshal(o) }, Analyze: analyzeSession,
		Reduce: reduceSession, ProjectEvent: projectSessionEvent,
	}, s)
}
func reduceSession(source *sessionState, op gamekernel.Operation[action]) (*sessionState, []json.RawMessage, error) {
	next := cloneSession(source)
	s := next.original
	n := heartsSessionNode(source)
	var err error
	switch op.Kind {
	case "actor":
		if n.Kind != "actor" || n.Seat == nil || *n.Seat != op.Seat || op.Action.Seat != op.Seat || op.Action.Kind != "play" {
			return nil, nil, fmt.Errorf("wrong Hearts actor operation")
		}
		err = applyPlay(s, op.Seat, op.Action.Card)
	case "sealed":
		if n.Kind != "sealed" || op.WindowID != n.WindowID || len(op.Actions) != 4 {
			return nil, nil, fmt.Errorf("wrong Hearts sealed operation")
		}
		var passes [4][]string
		seen := [4]bool{}
		for _, entry := range op.Actions {
			if !seatOK(entry.Seat) || seen[entry.Seat] || entry.Action.Kind != "pass" || entry.Action.Seat != entry.Seat {
				return nil, nil, fmt.Errorf("invalid Hearts sealed bundle")
			}
			seen[entry.Seat] = true
			passes[entry.Seat] = append([]string{}, entry.Action.Cards...)
		}
		err = applyPass(s, passes)
	case "automatic":
		if n.Kind != "automatic" || op.TransitionID != n.TransitionID {
			return nil, nil, fmt.Errorf("wrong Hearts collection")
		}
		err = collect(s)
	case "continue-round":
		if n.Kind != "round-complete" {
			return nil, nil, fmt.Errorf("wrong Hearts round boundary")
		}
		next.awaitingDeal = true
	case "chance":
		if n.Kind != "chance" || op.RequestID != n.RequestID {
			return nil, nil, fmt.Errorf("wrong Hearts chance request")
		}
		var deck []string
		deck, err = parseSessionDeal(op.Material)
		if err == nil {
			if s.HandNumber >= maxSafeInteger {
				return nil, nil, fmt.Errorf("unsafe next Hearts round")
			}
			s.Dealer = (s.Dealer + 1) % 4
			s.HandNumber++
			err = deal(s, deck)
			next.awaitingDeal = false
		}
	default:
		return nil, nil, fmt.Errorf("unsupported Hearts operation")
	}
	if err != nil {
		return nil, nil, err
	}
	events := make([]json.RawMessage, len(s.Events)-len(source.original.Events))
	for i, e := range s.Events[len(source.original.Events):] {
		if err = validateSessionEvent(e); err != nil {
			return nil, nil, err
		}
		events[i], err = json.Marshal(e)
		if err != nil {
			return nil, nil, err
		}
	}
	return next, events, nil
}
func projectSessionEvent(raw json.RawMessage, viewer int) (json.RawMessage, error) {
	if !seatOK(viewer) {
		return nil, fmt.Errorf("invalid viewer")
	}
	var e event
	if err := decode(raw, &e); err != nil {
		return nil, err
	}
	if err := validateSessionEvent(e); err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "hearts", "variantId": "solo", "eventSchemaVersion": "2.0.0", "id": strconv.Itoa(e.ID), "type": e.Type, "message": e.Message, "seat": e.Seat, "card": e.Card, "bid": nil})
}
