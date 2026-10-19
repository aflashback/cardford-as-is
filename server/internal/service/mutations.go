package service

import (
	"context"
	"encoding/json"
	"reflect"

	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"cardford/server/internal/sessions"
)

func (s *Service) mutate(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q commandRequest
	_ = json.Unmarshal(r.Body, &q)
	ctx, previous, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if previous != nil {
		return accepted(*previous)
	}
	ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
	l, b, admission, err := s.loadCommand(ctx, owner, q)
	if err != nil {
		return transport.Response{}, err
	}
	n, err := b.Node()
	if err != nil {
		return transport.Response{}, err
	}
	decisions := []records.DecisionRecord{}
	var operation sessions.Operation
	switch r.Operation {
	case "action":
		if n.Kind != "actor" && n.Kind != "sealed" || n.Kind == "actor" && (n.Seat == nil || *n.Seat != 0) {
			return transport.Response{}, fail(409, "not-human-decision")
		}
		required := []int{0}
		if n.Kind == "sealed" {
			required = n.Actors
		}
		if len(q.PreparedWorkIDs) != len(required) {
			return transport.Response{}, fail(409, "incomplete-preparation")
		}
		seen := map[int]bool{}
		main := false
		choices := []gamekernel.SeatChoice{}
		for _, id := range q.PreparedWorkIDs {
			d, e := s.prepared(ctx, owner, id, l, admission)
			if e != nil {
				return transport.Response{}, e
			}
			if seen[d.Actor] {
				return transport.Response{}, fail(409, "duplicate-prepared-actor")
			}
			seen[d.Actor] = true
			if d.Actor == 0 {
				if id != q.PreparedDecisionID || (d.Purpose != "human-analysis" && d.Purpose != "coach-advice") {
					return transport.Response{}, fail(409, "wrong-human-preparation")
				}
				main = true
				choices = append(choices, gamekernel.SeatChoice{Seat: 0, CandidateID: q.CandidateID})
			} else {
				if d.Purpose != "bot-action" {
					return transport.Response{}, fail(409, "wrong-bot-preparation")
				}
				choices = append(choices, gamekernel.SeatChoice{Seat: d.Actor, CandidateID: d.SelectedCandidateID})
			}
			decisions = append(decisions, d)
		}
		for _, actor := range required {
			if !seen[actor] {
				return transport.Response{}, fail(409, "incomplete-preparation")
			}
		}
		if !main {
			return transport.Response{}, fail(409, "human-preparation-required")
		}
		if n.Kind == "sealed" {
			operation = sessions.SealedOperation{Kind: "sealed", WindowID: n.WindowID, Choices: choices}
		} else {
			operation = sessions.ActorOperation{Kind: "actor", Seat: 0, CandidateID: q.CandidateID}
		}
	case "advance":
		if q.Kind == "bot" {
			if n.Kind != "actor" || n.Seat == nil || *n.Seat == 0 {
				return transport.Response{}, fail(409, "not-bot-decision")
			}
			d, e := s.prepared(ctx, owner, q.PreparedDecisionID, l, admission)
			if e != nil {
				return transport.Response{}, e
			}
			if d.Actor != *n.Seat || d.Purpose != "bot-action" {
				return transport.Response{}, fail(409, "wrong-bot-preparation")
			}
			decisions = append(decisions, d)
			operation = sessions.ActorOperation{Kind: "actor", Seat: d.Actor, CandidateID: d.SelectedCandidateID}
		} else {
			if n.Kind != "automatic" || n.TransitionID != q.TransitionID {
				return transport.Response{}, fail(409, "wrong-automatic-transition")
			}
			operation = sessions.AutomaticOperation{Kind: "automatic", TransitionID: n.TransitionID}
		}
	case "next-hand":
		switch n.Kind {
		case "round-complete":
			operation = sessions.ContinueOperation{Kind: "continue-round"}
		case "chance":
			pin := b.Pin()
			installation, e := s.registry.Installation(sessions.Selector{GameID: pin.GameID, VariantID: pin.VariantID, ModuleVersion: pin.ModuleVersion, RuleProfileID: pin.RuleProfileID})
			if e != nil {
				return transport.Response{}, e
			}
			material, e := installation.NextChance(n)
			if e != nil {
				return transport.Response{}, e
			}
			operation = sessions.ChanceOperation{Kind: "chance", RequestID: n.RequestID, Material: material}
		default:
			return transport.Response{}, fail(409, "not-round-boundary")
		}
	}
	command, err := sessions.EncodeOperation(operation)
	if err != nil {
		return transport.Response{}, fail(422, "illegal-command")
	}
	if err = ctx.Err(); err != nil {
		return transport.Response{}, err
	}
	stage, err := s.codec.StageTransition(l.Document, l.Snapshot, command)
	if err != nil {
		return transport.Response{}, fail(422, "illegal-command")
	}
	if s.policy != nil {
		nextDoc, nextSnapshot := stage.NextDocument(), stage.NextSnapshot()
		nextUnit, e := s.codec.CurrentUnitID(nextDoc, nextSnapshot)
		if e != nil {
			return transport.Response{}, e
		}
		if nextUnit != admission.UnitID {
			nextBound, e := s.codec.Session(nextDoc, nextSnapshot)
			if e != nil {
				return transport.Response{}, e
			}
			nextAdmission, _, e := s.chooseAccess(ctx, owner, nextBound, q.GameID, nextUnit, "play", "start", "")
			if e != nil {
				return transport.Response{}, e
			}
			// Commit checks both original and next unit using the chosen play grant.
			nextAdmission.UnitID = admission.UnitID
			admission = nextAdmission
		}
	}
	if err = ctx.Err(); err != nil {
		return transport.Response{}, err
	}
	digest, err := records.CommandDigest(q.GameID, q.ExpectedRevision+1, command)
	if err != nil {
		return transport.Response{}, err
	}
	receipt, _ := json.Marshal(map[string]any{"commandId": q.CommandID, "gameId": q.GameID, "revision": q.ExpectedRevision + 1})
	out, err := s.store.Commit(ctx, records.AcceptedTransition{Before: l, Staged: stage, Command: records.CommandRecord{RecordVersion: records.RecordVersion, GameID: q.GameID, Revision: q.ExpectedRevision + 1, CommandID: q.CommandID, Digest: digest, Command: command}, Admission: admission, Decisions: decisions, ReceiptSchema: "LocalServiceCommandReceipt", Receipt: receipt})
	if err != nil {
		return transport.Response{}, err
	}
	// Server runner commits already own a runner; foreground human commands
	// recreate one on demand after waiting at a human/round boundary.
	if _, automated := records.PlaybackGeneration(ctx); automated {
		s.playback.wake(owner, q.GameID)
	} else {
		s.playback.wakeOrStart(ctx, owner, q.GameID, r.Tab, q.ControlLeaseToken)
	}
	return accepted(out)
}
func (s *Service) prepared(ctx context.Context, owner, id string, l *records.Loaded, a records.AccessAdmission) (records.DecisionRecord, error) {
	d, err := s.store.ReadPrepared(ctx, owner, id)
	if err != nil {
		return d, err
	}
	bound := d.Access == a
	if d.Purpose == "coach-advice" && d.Actor == 0 {
		bound = d.Access.OwnerID == a.OwnerID && d.Access.Generation == a.Generation && d.Access.ControlRevision == a.ControlRevision && d.Access.UnitID == a.UnitID
	}
	if d.GameID != l.Document.Metadata.GameID || d.Revision != l.Document.Revision || !bound || !reflect.DeepEqual(d.Policy, l.Document.Metadata.Policy) {
		return d, records.ErrWorkStale
	}
	if err = s.codec.ValidateDecision(l.Document, l.Snapshot, d); err != nil {
		return d, records.ErrWorkStale
	}
	return d, nil
}
