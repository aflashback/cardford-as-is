package coachlab

import (
	"bytes"
	"cardford/server/internal/coaching"
	"cardford/server/internal/gamekernel"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type EpisodeSpec struct {
	ID          string           `json:"id"`
	FamilyID    string           `json:"familyId"`
	Arm         string           `json:"arm"`
	Rotation    int              `json:"rotation"`
	Environment string           `json:"environment"`
	Seed        string           `json:"seed"`
	Policies    [4]SeatPolicyPin `json:"policies"`
}

func EpisodeSpecs(e RunEnvelope) []EpisodeSpec {
	specs := []EpisodeSpec{}
	for _, f := range e.Base.Families {
		for _, rotation := range e.Base.Rotations {
			for _, arm := range []string{"reference", "candidate"} {
				id := Digest([]byte(e.RunID + "\x00" + f.ID + fmt.Sprintf("\x00%d\x00%s", rotation, arm)))[:24]
				s := EpisodeSpec{ID: "episode-" + id, FamilyID: f.ID, Arm: arm, Rotation: rotation, Environment: e.Base.Environments[0], Seed: f.Seed}
				for _, p := range e.Lab.SeatPolicies {
					seat := (p.Seat + rotation) % 4
					p.Seat = seat
					s.Policies[seat] = p
				}
				idPolicy := e.Base.Candidate.ID
				if arm == "reference" {
					idPolicy = e.Base.Reference.ID
				}
				version, _ := policyVersion(idPolicy)
				for _, originalSeat := range e.Base.SeatAssignments.Candidate {
					seat := (originalSeat + rotation) % 4
					s.Policies[seat] = SeatPolicyPin{seat, idPolicy, version}
				}
				specs = append(specs, s)
			}
		}
	}
	return specs
}

type EpisodeState struct {
	Spec                                         EpisodeSpec
	Adapter                                      LabVariantAdapter
	Session                                      gamekernel.BoundSession
	Config                                       json.RawMessage
	Revision, Actions, Decisions, Forced, Rounds int
	Pending                                      map[int]PreparedRecord
	Result                                       *EpisodeReceipt
	MaxDecisionMS                                int
}
type EpisodeStart struct {
	Spec        EpisodeSpec     `json:"spec"`
	Config      json.RawMessage `json:"config"`
	Material    json.RawMessage `json:"material"`
	StateDigest string          `json:"stateDigest"`
}

func NewEpisodeState(e RunEnvelope, s EpisodeSpec, a LabVariantAdapter) (*EpisodeState, error) {
	var c map[string]json.RawMessage
	if err := json.Unmarshal(e.Lab.Config, &c); err != nil {
		return nil, err
	}
	c["id"], _ = json.Marshal(s.ID)
	if a.Selector.GameID != "trix" {
		var dealer int
		_ = json.Unmarshal(c["dealer"], &dealer)
		c["dealer"], _ = json.Marshal((dealer + s.Rotation) % 4)
	}
	config, _ := json.Marshal(c)
	b, err := a.Start(config, a.Material(s.Seed, 0, s.Rotation))
	if err != nil {
		return nil, err
	}
	return &EpisodeState{Spec: s, Adapter: a, Session: b, Config: config, Pending: map[int]PreparedRecord{}, Rounds: 1, MaxDecisionMS: e.Base.MaxDecisionMS}, nil
}
func stateDigest(b gamekernel.BoundSession) (string, error) {
	raw, err := b.SerializePrivate()
	if err != nil {
		return "", err
	}
	return Digest(raw), nil
}
func (s *EpisodeState) StartRecord() EpisodeStart {
	h, _ := stateDigest(s.Session)
	return EpisodeStart{s.Spec, s.Config, s.Adapter.Material(s.Spec.Seed, 0, s.Spec.Rotation), h}
}

type AuditCheck struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}
type DecisionAudit struct {
	Status string       `json:"status"`
	Checks []AuditCheck `json:"checks"`
}
type DecisionRecord struct {
	SchemaVersion       string          `json:"schemaVersion"`
	DecisionID          string          `json:"decisionId"`
	FamilyID            string          `json:"familyId"`
	EpisodeID           string          `json:"episodeId"`
	Revision            int             `json:"revision"`
	Actor               int             `json:"actor"`
	Phase               string          `json:"phase"`
	ExecutionStatus     string          `json:"executionStatus"`
	Forced              bool            `json:"forced"`
	PolicyPin           SeatPolicyPin   `json:"policyPin"`
	InputDigest         string          `json:"inputDigest"`
	ActorPacket         json.RawMessage `json:"actorPacket"`
	ActorObservation    d.Observation   `json:"-"`
	NativeAnalysis      d.Analysis      `json:"-"`
	NativeAdvice        d.Advice        `json:"-"`
	LegalCandidates     []LabCandidate  `json:"legalCandidates"`
	SelectedCandidateID string          `json:"selectedCandidateId"`
	RegisteredAnalysis  json.RawMessage `json:"registeredAnalysis"`
	OriginalAnalysis    json.RawMessage `json:"originalAnalysis"`
	OriginalAdvice      json.RawMessage `json:"originalAdvice"`
	CoachMessage        json.RawMessage `json:"coachMessage,omitempty"`
	Audit               DecisionAudit   `json:"audit"`
}
type LabCandidate struct {
	ID     string          `json:"id"`
	Action json.RawMessage `json:"action"`
}
type PreparedRecord struct {
	EpisodeID      string                         `json:"episodeId"`
	Revision       int                            `json:"revision"`
	PreStateDigest string                         `json:"preStateDigest"`
	Decision       DecisionRecord                 `json:"decision"`
	Preparation    gamekernel.CompletePreparation `json:"preparation"`
}

func PrepareRecord(ctx context.Context, s *EpisodeState, seat int) (PreparedRecord, error) {
	id := "case-" + Digest([]byte(fmt.Sprintf("%s\x00%d\x00%d", s.Spec.ID, s.Revision, seat)))[:32]
	pin := s.Spec.Policies[seat]
	p, err := Prepare(ctx, s.Session, pin, id)
	if err != nil {
		return PreparedRecord{}, err
	}
	if s.Adapter.Selector.GameID == "trix" {
		return prepareTrixRecord(s, seat, id, p)
	}
	binding, err := s.Session.PreparationBinding(seat, pin.ID)
	if err != nil {
		return PreparedRecord{}, err
	}
	raw, err := s.Session.LegacyObservation(seat)
	if err != nil {
		return PreparedRecord{}, err
	}
	var o d.Observation
	if err = json.Unmarshal(raw, &o); err != nil {
		return PreparedRecord{}, err
	}
	var packet struct {
		Candidates []gamekernel.PublicCandidate `json:"candidates"`
	}
	if err = json.Unmarshal(binding.Packet, &packet); err != nil {
		return PreparedRecord{}, err
	}
	var analysis d.PreparedAnalysisEnvelope
	var advice d.PreparedAdviceEnvelope
	if err = json.Unmarshal(p.Detail.Bytes, &analysis); err != nil {
		return PreparedRecord{}, err
	}
	if err = json.Unmarshal(p.Advice.Bytes, &advice); err != nil {
		return PreparedRecord{}, err
	}
	h, err := stateDigest(s.Session)
	if err != nil {
		return PreparedRecord{}, err
	}
	candidates := []LabCandidate{}
	for _, c := range packet.Candidates {
		candidates = append(candidates, LabCandidate{c.ID, c.Public})
	}
	originalAnalysis, _ := json.Marshal(analysis.Original)
	originalAdvice, _ := json.Marshal(advice.Original)
	rec := DecisionRecord{SchemaVersion: "coach-lab-decision-1.0.0", DecisionID: id, FamilyID: s.Spec.FamilyID, EpisodeID: s.Spec.ID, Revision: s.Revision, Actor: seat, Phase: o.Phase, ExecutionStatus: "prepared", Forced: len(o.LegalActions) == 1, PolicyPin: pin, InputDigest: binding.InputDigest, ActorPacket: binding.Packet, ActorObservation: o, NativeAnalysis: analysis.Original, NativeAdvice: advice.Original, LegalCandidates: candidates, SelectedCandidateID: p.Prepared.CandidateID, RegisteredAnalysis: p.Prepared.Analysis, OriginalAnalysis: originalAnalysis, OriginalAdvice: originalAdvice}
	rec.Audit = AuditDecision(rec, o)
	message, err := coaching.BuildCoachMessage(o, analysis.Original, id, coaching.ContextualCueVersion)
	if err != nil {
		return PreparedRecord{}, err
	}
	rec.CoachMessage, err = json.Marshal(message)
	if err != nil {
		return PreparedRecord{}, err
	}
	if message.Status == "insufficient-reason" {
		rec.Audit.Checks = append(rec.Audit.Checks, AuditCheck{"strategic-content", "pending", "saved contextual coach message reports insufficient-reason"})
	}
	if rec.Audit.Status == "failed" {
		return PreparedRecord{}, fmt.Errorf("preparation exact audit failed")
	}
	return PreparedRecord{s.Spec.ID, s.Revision, h, rec, p}, nil
}

type AppliedCommand struct {
	EpisodeID       string                  `json:"episodeId"`
	Revision        int                     `json:"revision"`
	Kind            string                  `json:"kind"`
	Actor           int                     `json:"actor,omitempty"`
	CandidateID     string                  `json:"candidateId,omitempty"`
	WindowID        string                  `json:"windowId,omitempty"`
	Choices         []gamekernel.SeatChoice `json:"choices,omitempty"`
	TransitionID    string                  `json:"transitionId,omitempty"`
	RequestID       string                  `json:"requestId,omitempty"`
	Material        json.RawMessage         `json:"material,omitempty"`
	DecisionIDs     []string                `json:"decisionIds"`
	PreStateDigest  string                  `json:"preStateDigest"`
	PostStateDigest string                  `json:"postStateDigest"`
	Events          []json.RawMessage       `json:"events"`
}
type EpisodeReceipt struct {
	EpisodeID        string           `json:"episodeId"`
	FamilyID         string           `json:"familyId"`
	Arm              string           `json:"arm"`
	Status           string           `json:"status"`
	Reason           string           `json:"reason"`
	Decisions        int              `json:"decisions"`
	CommittedActions int              `json:"committedActions"`
	ForcedDecisions  int              `json:"forcedDecisions"`
	PendingAudits    int              `json:"pendingAudits"`
	Transitions      int              `json:"transitions"`
	Rounds           int              `json:"rounds"`
	Outcome          *TerminalOutcome `json:"outcome"`
}
type RunReceipt struct {
	SchemaVersion string           `json:"schemaVersion"`
	RunID         string           `json:"runId"`
	Status        string           `json:"status"`
	ManifestHash  string           `json:"manifestHash"`
	SourceDigest  string           `json:"sourceDigest"`
	BinaryDigest  string           `json:"binaryDigest"`
	Episodes      []EpisodeReceipt `json:"episodes"`
	Decisions     int              `json:"decisions"`
	Committed     int              `json:"committed"`
	Pending       int              `json:"pending"`
	Forced        int              `json:"forced"`
	Unforced      int              `json:"unforced"`
	ProviderMode  string           `json:"providerMode"`
	StrengthClaim bool             `json:"strengthClaim"`
	Errors        []string         `json:"errors"`
}

func (s *EpisodeState) Receipt(status, reason string) EpisodeReceipt {
	return EpisodeReceipt{EpisodeID: s.Spec.ID, FamilyID: s.Spec.FamilyID, Arm: s.Spec.Arm, Status: status, Reason: reason, Decisions: s.Decisions, CommittedActions: s.Actions, ForcedDecisions: s.Forced, PendingAudits: s.Decisions, Transitions: s.Revision, Rounds: s.Rounds}
}

func Run(ctx context.Context, e RunEnvelope, j *Journal) (RunReceipt, error) {
	receipt := RunReceipt{SchemaVersion: "coach-lab-receipt-1.0.0", RunID: e.RunID, Status: "complete", ManifestHash: e.ManifestHash(), SourceDigest: e.Lab.SourceIdentity.SourceDigest, BinaryDigest: e.Lab.SourceIdentity.BinaryDigest, Episodes: []EpisodeReceipt{}, ProviderMode: "fixture", Errors: []string{}}
	if err := e.Validate(); err != nil {
		return receipt, err
	}
	a, err := NewAdapter(e.Lab.Selector)
	if err != nil {
		return receipt, err
	}
	deadlineCtx, cancel := context.WithTimeout(ctx, time.Duration(e.Lab.Caps.MaxWallMS)*time.Millisecond)
	defer cancel()
	states, err := ReplayContext(deadlineCtx, e, j.Entries())
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			r := FailureReceipt(e, j, err)
			r.Status = "checkpointed"
			r.Errors = []string{}
			for i := range r.Episodes {
				r.Episodes[i].Status = "incomplete"
				r.Episodes[i].Reason = "replay timeout/cancellation; resumable; terminal outcomes not reverified"
			}
			if err = j.Append("checkpoint", r); err != nil {
				return r, err
			}
			if err = j.Append("run-receipt", r); err != nil {
				return r, err
			}
			return r, nil
		}
		return receipt, err
	}
	totalDecisions := 0
	for _, s := range states {
		totalDecisions += s.Decisions
	}
	for _, spec := range EpisodeSpecs(e) {
		s := states[spec.ID]
		if s == nil {
			s, err = NewEpisodeState(e, spec, a)
			if err != nil {
				return receipt, err
			}
			if err = j.Append("episode-start", s.StartRecord()); err != nil {
				return receipt, err
			}
		}
		before := s.Decisions
		if s.Result == nil {
			if err = runEpisode(deadlineCtx, e, s, j, s.Decisions+e.Base.MaxDecisions-totalDecisions); err != nil {
				return receipt, err
			}
		}
		totalDecisions += s.Decisions - before
		if s.Result != nil {
			receipt.Episodes = append(receipt.Episodes, *s.Result)
		} else {
			receipt.Episodes = append(receipt.Episodes, s.Receipt("incomplete", "invocation deadline/cancellation; resumable"))
		}
		ep := receipt.Episodes[len(receipt.Episodes)-1]
		receipt.Decisions += ep.Decisions
		receipt.Committed += ep.CommittedActions
		receipt.Pending += ep.PendingAudits
		receipt.Forced += ep.ForcedDecisions
		if ep.Status == "failed" {
			receipt.Status = "failed"
			receipt.Errors = append(receipt.Errors, ep.EpisodeID+": "+ep.Reason)
		} else if ep.Status != "complete" && receipt.Status != "failed" {
			if s.Result == nil {
				receipt.Status = "checkpointed"
			} else if receipt.Status != "checkpointed" {
				receipt.Status = "censored"
			}
		}
	}
	receipt.Unforced = receipt.Decisions - receipt.Forced
	if err = j.Append("run-receipt", receipt); err != nil {
		return receipt, err
	}
	return receipt, nil
}
func runEpisode(ctx context.Context, e RunEnvelope, s *EpisodeState, j *Journal, decisionLimit int) error {
	for {
		n, err := s.Session.Node()
		if err != nil {
			return err
		}
		if n.Kind == "session-complete" {
			out, err := s.Adapter.ReadTerminalOutcome(s.Session)
			if err != nil {
				return err
			}
			r := s.Receipt("complete", "")
			r.Outcome = &out
			s.Result = &r
			return j.Append("episode-result", r)
		}
		reason := ""
		if s.Revision >= e.Lab.Caps.MaxTransitions {
			reason = "transition cap"
		}
		if s.Actions >= e.Lab.Caps.MaxActions {
			reason = "action cap"
		}
		if s.Rounds >= e.Lab.Caps.MaxRounds && n.Kind == "round-complete" {
			reason = "round cap"
		}
		if reason != "" {
			r := s.Receipt("incomplete", reason)
			s.Result = &r
			return j.Append("episode-result", r)
		}
		if err = ctx.Err(); err != nil {
			return j.Append("checkpoint", s.Receipt("incomplete", "invocation deadline/cancellation; resumable"))
		}
		seats := []int{}
		if n.Kind == "actor" {
			if n.Seat == nil {
				return fmt.Errorf("actor missing seat")
			}
			seats = []int{*n.Seat}
		} else if n.Kind == "sealed" {
			seats = append(seats, n.Actors...)
			if s.Actions+len(seats) > e.Lab.Caps.MaxActions {
				r := s.Receipt("incomplete", "insufficient action budget for atomic sealed window")
				s.Result = &r
				return j.Append("episode-result", r)
			}
		}
		needed := 0
		for _, seat := range seats {
			if _, ok := s.Pending[seat]; !ok {
				needed++
			}
		}
		if s.Decisions+needed > decisionLimit {
			r := s.Receipt("incomplete", "global decision cap; remaining paired arm retained")
			s.Result = &r
			return j.Append("episode-result", r)
		}
		for _, seat := range seats {
			if _, ok := s.Pending[seat]; !ok {
				decisionCtx, cancel := context.WithTimeout(ctx, time.Duration(s.MaxDecisionMS)*time.Millisecond)
				record, err := PrepareRecord(decisionCtx, s, seat)
				cancel()
				if err != nil {
					if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
						return j.Append("checkpoint", s.Receipt("incomplete", "preparation timeout/cancellation; resumable"))
					}
					r := s.Receipt("failed", "preparation: "+err.Error())
					s.Result = &r
					return j.Append("episode-result", r)
				}
				if err = j.Append("prepared", record); err != nil {
					return err
				}
				s.Pending[seat] = record
				s.Decisions++
				if record.Decision.Forced {
					s.Forced++
				}
			}
		}
		command := AppliedCommand{EpisodeID: s.Spec.ID, Revision: s.Revision, Kind: n.Kind, DecisionIDs: []string{}}
		command.PreStateDigest, err = stateDigest(s.Session)
		if err != nil {
			return err
		}
		switch n.Kind {
		case "actor":
			command.Actor = *n.Seat
			command.CandidateID = s.Pending[*n.Seat].Decision.SelectedCandidateID
			command.DecisionIDs = append(command.DecisionIDs, s.Pending[*n.Seat].Decision.DecisionID)
		case "sealed":
			command.WindowID = n.WindowID
			for _, seat := range n.Actors {
				command.Choices = append(command.Choices, gamekernel.SeatChoice{seat, s.Pending[seat].Decision.SelectedCandidateID})
				command.DecisionIDs = append(command.DecisionIDs, s.Pending[seat].Decision.DecisionID)
			}
		case "automatic":
			command.TransitionID = n.TransitionID
		case "chance":
			command.RequestID = n.RequestID
			command.Material = s.Adapter.Material(s.Spec.Seed, s.Rounds, s.Spec.Rotation)
		case "round-complete":
		default:
			return fmt.Errorf("unsupported native lifecycle %q", n.Kind)
		}
		transition, err := apply(s.Session, command)
		if err != nil {
			r := s.Receipt("failed", "transition: "+err.Error())
			s.Result = &r
			return j.Append("episode-result", r)
		}
		command.PostStateDigest, err = stateDigest(transition.Next)
		if err != nil {
			return err
		}
		command.Events = transition.PrivateEvents
		// If killed here, only in-memory work is lost. Replay applies the saved
		// preparation exactly once; the durable journal is the commit boundary.
		if err = j.Append("transition", command); err != nil {
			return err
		}
		s.Session = transition.Next
		s.Revision++
		s.Actions += len(seats)
		if n.Kind == "chance" {
			s.Rounds++
		}
		s.Pending = map[int]PreparedRecord{}
	}
}
func apply(b gamekernel.BoundSession, c AppliedCommand) (gamekernel.BoundTransition, error) {
	switch c.Kind {
	case "actor":
		return b.Commit(c.Actor, c.CandidateID)
	case "sealed":
		return b.CommitSealed(c.WindowID, c.Choices)
	case "automatic":
		return b.Advance(c.TransitionID)
	case "chance":
		return b.SupplyChance(c.RequestID, c.Material)
	case "round-complete":
		return b.ContinueRound()
	}
	return gamekernel.BoundTransition{}, fmt.Errorf("unknown replay operation")
}

// FailureReceipt retains the complete admitted episode denominator even when
// an infrastructure failure prevents an ordinary terminal receipt. Counts are
// journal occurrences; failed infrastructure is never strategic evidence.
func FailureReceipt(e RunEnvelope, j *Journal, cause error) RunReceipt {
	r := RunReceipt{SchemaVersion: "coach-lab-receipt-1.0.0", RunID: e.RunID, Status: "failed", ManifestHash: e.ManifestHash(), SourceDigest: e.Lab.SourceIdentity.SourceDigest, BinaryDigest: e.Lab.SourceIdentity.BinaryDigest, Episodes: []EpisodeReceipt{}, ProviderMode: "fixture", Errors: []string{cause.Error()}}
	counts := map[string]*EpisodeReceipt{}
	for _, s := range EpisodeSpecs(e) {
		ep := EpisodeReceipt{EpisodeID: s.ID, FamilyID: s.FamilyID, Arm: s.Arm, Status: "failed", Reason: "infrastructure failure; outcome invalid"}
		r.Episodes = append(r.Episodes, ep)
		counts[s.ID] = &r.Episodes[len(r.Episodes)-1]
	}
	// Build pointer index after slice growth, so addresses cannot become stale.
	for i := range r.Episodes {
		counts[r.Episodes[i].EpisodeID] = &r.Episodes[i]
	}
	for _, entry := range j.Entries() {
		if entry.Kind == "prepared" {
			var p PreparedRecord
			if json.Unmarshal(entry.Payload, &p) == nil {
				if c := counts[p.EpisodeID]; c != nil {
					c.Decisions++
					c.PendingAudits++
					if p.Decision.Forced {
						c.ForcedDecisions++
					}
				}
			}
		} else if entry.Kind == "transition" {
			var c AppliedCommand
			if json.Unmarshal(entry.Payload, &c) == nil {
				if ep := counts[c.EpisodeID]; ep != nil {
					ep.Transitions++
					ep.CommittedActions += len(c.DecisionIDs)
				}
			}
		}
	}
	for _, ep := range r.Episodes {
		r.Decisions += ep.Decisions
		r.Committed += ep.CommittedActions
		r.Pending += ep.PendingAudits
		r.Forced += ep.ForcedDecisions
	}
	r.Unforced = r.Decisions - r.Forced
	return r
}
func ExportCorpus(j *Journal, r RunReceipt) error {
	entries := j.Entries()
	if len(entries) == 0 {
		return fmt.Errorf("empty journal")
	}
	suffix := entries[len(entries)-1].Hash[:24]
	var decisions, blind bytes.Buffer
	committed := map[string]bool{}
	for _, entry := range entries {
		if entry.Kind == "transition" {
			var c AppliedCommand
			if err := json.Unmarshal(entry.Payload, &c); err != nil {
				return err
			}
			for _, id := range c.DecisionIDs {
				committed[id] = true
			}
		}
	}
	for _, entry := range entries {
		if entry.Kind != "prepared" {
			continue
		}
		var p PreparedRecord
		if err := json.Unmarshal(entry.Payload, &p); err != nil {
			return err
		}
		if committed[p.Decision.DecisionID] {
			p.Decision.ExecutionStatus = "committed"
		}
		if err := json.NewEncoder(&decisions).Encode(p.Decision); err != nil {
			return err
		}
		packet, err := ExportBlindPacket(p.Decision)
		if err != nil {
			return err
		}
		if err = json.NewEncoder(&blind).Encode(packet); err != nil {
			return err
		}
	}
	raw, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	for _, artifact := range []struct {
		name string
		data []byte
	}{{"exports/" + suffix + "/decisions.jsonl", decisions.Bytes()}, {"blind/" + suffix + "/packets.jsonl", blind.Bytes()}, {"exports/" + suffix + "/receipt.json", append(raw, '\n')}} {
		if err = j.ExportSnapshot(artifact.name, artifact.data); err != nil {
			return err
		}
	}
	return j.PublishExportPointer("exports/"+suffix, Digest(decisions.Bytes()), Digest(append(raw, '\n')))
}
