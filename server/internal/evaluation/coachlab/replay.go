package coachlab

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
)

// Replay verifies native transitions, original binding and events without
// re-executing any saved policy preparation. A pending original survives crash.
func Replay(e RunEnvelope, entries []JournalEntry) (map[string]*EpisodeState, error) {
	return ReplayContext(context.Background(), e, entries)
}
func ReplayVisit(e RunEnvelope, entries []JournalEntry, visit func(DecisionRecord) error) (map[string]*EpisodeState, error) {
	return ReplayVisitContext(context.Background(), e, entries, visit)
}
func ReplayContext(ctx context.Context, e RunEnvelope, entries []JournalEntry) (map[string]*EpisodeState, error) {
	return ReplayVisitContext(ctx, e, entries, nil)
}
func ReplayVisitContext(ctx context.Context, e RunEnvelope, entries []JournalEntry, visit func(DecisionRecord) error) (map[string]*EpisodeState, error) {
	if ctx == nil {
		return nil, fmt.Errorf("replay context required")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	a, err := NewAdapter(e.Lab.Selector)
	if err != nil {
		return nil, err
	}
	states := map[string]*EpisodeState{}
	specs := map[string]EpisodeSpec{}
	for _, s := range EpisodeSpecs(e) {
		specs[s.ID] = s
	}
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		switch entry.Kind {
		case "run-start", "run-receipt", "checkpoint":
		case "episode-start":
			var start EpisodeStart
			if err = strict(entry.Payload, &start); err != nil {
				return nil, err
			}
			spec, ok := specs[start.Spec.ID]
			if !ok || states[spec.ID] != nil || !reflect.DeepEqual(start.Spec, spec) {
				return nil, fmt.Errorf("unknown/duplicate episode")
			}
			s, err := NewEpisodeState(e, spec, a)
			if err != nil {
				return nil, err
			}
			if !reflect.DeepEqual(start, s.StartRecord()) {
				return nil, fmt.Errorf("episode creation mismatch")
			}
			states[spec.ID] = s
		case "prepared":
			var p PreparedRecord
			if err = strict(entry.Payload, &p); err != nil {
				return nil, err
			}
			s := states[p.EpisodeID]
			if s == nil || s.Result != nil || s.Revision != p.Revision {
				return nil, fmt.Errorf("preparation outside original revision")
			}
			actor := p.Decision.Actor
			if actor < 0 || actor > 3 {
				return nil, fmt.Errorf("invalid prepared actor")
			}
			if _, ok := s.Pending[actor]; ok {
				return nil, fmt.Errorf("duplicate original decision")
			}
			h, err := stateDigest(s.Session)
			if err != nil {
				return nil, err
			}
			if h != p.PreStateDigest {
				return nil, fmt.Errorf("original pre-state mismatch")
			}
			binding, err := s.Session.PreparationBinding(actor, s.Spec.Policies[actor].ID)
			if err != nil {
				return nil, err
			}
			if binding.InputDigest != p.Decision.InputDigest || binding.InputDigest != p.Preparation.Prepared.InputDigest || !jsonEqual(binding.Packet, p.Decision.ActorPacket) || p.Decision.PolicyPin != s.Spec.Policies[actor] || p.Preparation.Prepared.PolicyID != s.Spec.Policies[actor].ID || p.Preparation.Prepared.CandidateID != p.Decision.SelectedCandidateID {
				return nil, fmt.Errorf("saved actor/policy binding differs")
			}
			if s.Adapter.Selector.GameID != "trix" {
				oRaw, err := s.Session.LegacyObservation(actor)
				if err != nil {
					return nil, err
				}
				if err = json.Unmarshal(oRaw, &p.Decision.ActorObservation); err != nil {
					return nil, err
				}
				_ = json.Unmarshal(p.Decision.OriginalAnalysis, &p.Decision.NativeAnalysis)
				_ = json.Unmarshal(p.Decision.OriginalAdvice, &p.Decision.NativeAdvice)
				if AuditDecision(p.Decision, p.Decision.ActorObservation).Status == "failed" {
					return nil, fmt.Errorf("original decision failed replay audit")
				}
			} else if AuditTrixDecision(p.Decision).Status == "failed" {
				return nil, fmt.Errorf("original Trix decision failed replay audit")
			}
			if err = verifySavedPreparation(p); err != nil {
				return nil, err
			}
			if visit != nil {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
				if err = visit(p.Decision); err != nil {
					return nil, err
				}
			}
			s.Pending[actor] = p
			s.Decisions++
			if p.Decision.Forced {
				s.Forced++
			}
		case "transition":
			var c AppliedCommand
			if err = strict(entry.Payload, &c); err != nil {
				return nil, err
			}
			s := states[c.EpisodeID]
			if s == nil || s.Result != nil || s.Revision != c.Revision {
				return nil, fmt.Errorf("transition outside revision")
			}
			h, err := stateDigest(s.Session)
			if err != nil {
				return nil, err
			}
			if h != c.PreStateDigest {
				return nil, fmt.Errorf("transition pre-state mismatch")
			}
			n, err := s.Session.Node()
			if err != nil {
				return nil, err
			}
			if n.Kind != c.Kind {
				return nil, fmt.Errorf("replay native node mismatch")
			}
			actors := []int{}
			if c.Kind == "actor" {
				actors = []int{c.Actor}
				if n.Seat == nil || *n.Seat != c.Actor {
					return nil, fmt.Errorf("wrong replay actor")
				}
			} else if c.Kind == "sealed" {
				actors = n.Actors
				if len(c.Choices) != len(actors) {
					return nil, fmt.Errorf("incomplete sealed choices")
				}
			}
			if len(c.DecisionIDs) != len(actors) {
				return nil, fmt.Errorf("missing original decision refs")
			}
			for i, seat := range actors {
				p, ok := s.Pending[seat]
				if !ok || p.Decision.DecisionID != c.DecisionIDs[i] {
					return nil, fmt.Errorf("action lacks original preparation")
				}
				choice := c.CandidateID
				if c.Kind == "sealed" {
					if c.Choices[i].Seat != seat {
						return nil, fmt.Errorf("sealed actor order mismatch")
					}
					choice = c.Choices[i].CandidateID
				}
				if choice != p.Decision.SelectedCandidateID {
					return nil, fmt.Errorf("committed action differs from original recommendation")
				}
			}
			if c.Kind == "chance" && !jsonEqual(c.Material, s.Adapter.Material(s.Spec.Seed, s.Rounds, s.Spec.Rotation)) {
				return nil, fmt.Errorf("private chance stream mismatch")
			}
			tr, err := apply(s.Session, c)
			if err != nil {
				return nil, err
			}
			h, err = stateDigest(tr.Next)
			if err != nil {
				return nil, err
			}
			if h != c.PostStateDigest || !reflect.DeepEqual(tr.PrivateEvents, c.Events) {
				return nil, fmt.Errorf("transition state/events replay mismatch")
			}
			s.Session = tr.Next
			s.Revision++
			s.Actions += len(actors)
			if c.Kind == "chance" {
				s.Rounds++
			}
			s.Pending = map[int]PreparedRecord{}
		case "episode-result":
			var r EpisodeReceipt
			if err = strict(entry.Payload, &r); err != nil {
				return nil, err
			}
			s := states[r.EpisodeID]
			if s == nil || s.Result != nil {
				return nil, fmt.Errorf("duplicate/unknown result")
			}
			expected := s.Receipt(r.Status, r.Reason)
			if r.Status == "complete" {
				out, err := a.ReadTerminalOutcome(s.Session)
				if err != nil {
					return nil, err
				}
				expected.Outcome = &out
			} else if r.Status != "failed" && r.Status != "incomplete" {
				return nil, fmt.Errorf("invalid episode status")
			}
			if !reflect.DeepEqual(expected, r) {
				return nil, fmt.Errorf("episode receipt mismatch")
			}
			s.Result = &r
		default:
			return nil, fmt.Errorf("unknown journal kind %q", entry.Kind)
		}
	}
	return states, nil
}
func jsonEqual(a, b json.RawMessage) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	return reflect.DeepEqual(x, y)
}
