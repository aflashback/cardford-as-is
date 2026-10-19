package coachlab

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

func prepareTrixRecord(s *EpisodeState, seat int, id string, p gamekernel.CompletePreparation) (PreparedRecord, error) {
	pin := s.Spec.Policies[seat]
	binding, err := s.Session.PreparationBinding(seat, pin.ID)
	if err != nil {
		return PreparedRecord{}, err
	}
	var packet struct {
		Phase       string                       `json:"phase"`
		Observation trix.Observation             `json:"observation"`
		Candidates  []gamekernel.PublicCandidate `json:"candidates"`
	}
	if err = json.Unmarshal(binding.Packet, &packet); err != nil {
		return PreparedRecord{}, err
	}
	candidates := []LabCandidate{}
	for _, c := range packet.Candidates {
		candidates = append(candidates, LabCandidate{c.ID, c.Public})
	}
	rec := DecisionRecord{SchemaVersion: "coach-lab-decision-1.0.0", DecisionID: id, FamilyID: s.Spec.FamilyID, EpisodeID: s.Spec.ID, Revision: s.Revision, Actor: seat, Phase: packet.Phase, ExecutionStatus: "prepared", Forced: len(candidates) == 1, PolicyPin: pin, InputDigest: binding.InputDigest, ActorPacket: binding.Packet, LegalCandidates: candidates, SelectedCandidateID: p.Prepared.CandidateID, RegisteredAnalysis: p.Prepared.Analysis, OriginalAnalysis: append(json.RawMessage{}, p.Detail.Bytes...), OriginalAdvice: append(json.RawMessage{}, p.Advice.Bytes...)}
	expectedSchema := "RegisteredAnalysis"
	if trix.SupportsPolicy(pin.ID) && pin.ID != trix.PolicyID {
		expectedSchema = "TrixDecisionTrace"
	}
	if p.Detail.Schema != expectedSchema {
		return PreparedRecord{}, fmt.Errorf("Trix policy detail schema mismatch")
	}
	message, err := savedTrixMessage(rec)
	if err != nil {
		return PreparedRecord{}, err
	}
	rec.CoachMessage, err = json.Marshal(message)
	if err != nil {
		return PreparedRecord{}, err
	}
	rec.Audit = AuditTrixDecision(rec)
	if rec.Audit.Status == "failed" {
		failed := []string{}
		for _, check := range rec.Audit.Checks {
			if check.Status == "failed" {
				failed = append(failed, check.ID)
			}
		}
		return PreparedRecord{}, fmt.Errorf("Trix original decision failed exact audit: %s", strings.Join(failed, ", "))
	}
	h, err := stateDigest(s.Session)
	if err != nil {
		return PreparedRecord{}, err
	}
	return PreparedRecord{s.Spec.ID, s.Revision, h, rec, p}, nil
}

func savedTrixMessage(rec DecisionRecord) (contracts.CoachMessage, error) {
	if rec.PolicyPin.ID == trix.PolicyID {
		return trixBaselineMessage(rec), nil
	}
	if !trix.SupportsPolicy(rec.PolicyPin.ID) {
		return contracts.CoachMessage{}, fmt.Errorf("unknown saved Trix policy")
	}
	var trace trix.DecisionTrace
	if err := strict(rec.OriginalAnalysis, &trace); err != nil {
		return contracts.CoachMessage{}, err
	}
	return trix.BuildCoachMessage(trace, rec.DecisionID)
}

// The historical baseline has no saved contextual trace. Keep its original
// explanation gap visible; never manufacture candidate reasons for that action.
func trixBaselineMessage(rec DecisionRecord) contracts.CoachMessage {
	message := contracts.CoachMessage{PresentationVersion: "coach-advice-2.0.0", DecisionID: rec.DecisionID, PolicyVersion: rec.PolicyPin.ID, CueVersion: "trix-lab-content-gap-1.0.0", Status: "insufficient-reason", SelectedAction: rec.SelectedCandidateID, Cue: trixActionLabel(rec) + ". Its tactical reason needs review.", Reason: contracts.CoachReason{Summary: "The saved deterministic Trix policy selected this action. The current module has no complete trace-supported contextual coaching bundle.", Support: []contracts.CoachSupport{}, Alternatives: []string{}, Limitations: []string{"This is a recorded explanation gap, not a claim of best play.", "Request selection, doubling, penalty play and layout require separate game-specific coaching review."}}}
	if rec.Forced {
		message.Status = "only-option"
		message.Cue = trixActionLabel(rec) + "; this is the only legal option."
		message.Reason.Summary = "The module's complete legal set has one action, so there is no strategic choice at this position."
		message.Reason.Support = append(message.Reason.Support, contracts.CoachSupport{ID: "trix-legal-count", Kind: "exact", Text: "One legal option."})
	}
	return message
}
func trixActionLabel(r DecisionRecord) string {
	for _, c := range r.LegalCandidates {
		if c.ID != r.SelectedCandidateID {
			continue
		}
		var a trix.Action
		if json.Unmarshal(c.Action, &a) != nil {
			continue
		}
		switch a.Kind {
		case "choose-request":
			return "Choose " + strings.ReplaceAll(a.Request, "-", " ")
		case "play", "layout-card":
			return "Play " + d.CardLabel(a.Card)
		case "layout-pass":
			return "Pass this layout turn"
		case "declare-doubles":
			if len(a.Cards) == 0 {
				return "Decline doubling"
			}
			labels := []string{}
			for _, card := range a.Cards {
				labels = append(labels, d.CardLabel(card))
			}
			return "Double " + strings.Join(labels, ", ")
		}
	}
	return "Choose the saved legal action"
}
func AuditTrixDecision(r DecisionRecord) DecisionAudit {
	audit := DecisionAudit{Status: "partially-checkable", Checks: []AuditCheck{}}
	check := func(id string, ok bool) {
		status := "passed"
		if !ok {
			status = "failed"
			audit.Status = "failed"
		}
		audit.Checks = append(audit.Checks, AuditCheck{id, status, "exact original Trix module projection"})
	}
	packetValid := contracts.Validate("RegisteredActorPacket", r.ActorPacket) == nil
	check("actor-packet", packetValid)
	if !packetValid {
		return audit
	}
	var packet struct {
		PublicSchemaVersion string                       `json:"publicSchemaVersion"`
		GameID              string                       `json:"gameId"`
		VariantID           string                       `json:"variantId"`
		Seat                int                          `json:"seat"`
		Phase               string                       `json:"phase"`
		Observation         trix.Observation             `json:"observation"`
		Candidates          []gamekernel.PublicCandidate `json:"candidates"`
	}
	if json.Unmarshal(r.ActorPacket, &packet) != nil {
		audit.Status = "failed"
		return audit
	}
	check("actor-context", packet.GameID == "trix" && packet.VariantID == packet.Observation.VariantID && packet.Seat == r.Actor && packet.Phase == r.Phase && packet.Observation.Phase == r.Phase && packet.Observation.Seat == r.Actor && r.PolicyPin.Seat == r.Actor)
	pin, pinErr := validateTrixObservationPin(packet.VariantID, packet.PublicSchemaVersion, packet.Observation)
	check("exact-observation-pin", pinErr == nil)
	if pinErr != nil {
		return audit
	}
	check("policy-pin", trix.SupportsPolicy(r.PolicyPin.ID) && r.PolicyPin.Version == "1.0.0")
	legal := trix.Legal(packet.Observation)
	check("complete-legal-set", len(legal) == len(r.LegalCandidates) && len(legal) == len(packet.Candidates) && len(legal) > 0)
	ids := map[string]bool{}
	for _, a := range legal {
		ids[trix.ActionID(a)] = true
	}
	selected := ids[r.SelectedCandidateID]
	for _, c := range r.LegalCandidates {
		var a trix.Action
		err := json.Unmarshal(c.Action, &a)
		check("legal-candidate", err == nil && ids[c.ID] && trix.ActionID(a) == c.ID)
		delete(ids, c.ID)
	}
	check("legal-coverage", len(ids) == 0)
	for _, c := range packet.Candidates {
		var action trix.Action
		ok := strict(c.Public, &action) == nil && c.ID == trix.ActionID(action)
		matched := false
		for _, saved := range r.LegalCandidates {
			if saved.ID == c.ID && jsonEqual(saved.Action, c.Public) {
				matched = true
			}
		}
		check("packet-candidate-binding", ok && matched)
	}
	check("selected-legal", selected)
	check("forced-status", r.Forced == (len(legal) == 1))
	var advice trix.Advice
	check("original-advice-schema", contracts.Validate("TrixAdvice", r.OriginalAdvice) == nil && json.Unmarshal(r.OriginalAdvice, &advice) == nil)
	origin := "code"
	if r.Forced {
		origin = "forced"
	}
	check("original-advice-action", advice.GameID == "trix" && advice.DecisionID == r.DecisionID && advice.RecommendedCandidateID == r.SelectedCandidateID && advice.VariantID == packet.Observation.VariantID && advice.PolicyVersion == r.PolicyPin.Version && advice.Origin == origin)
	var analysis struct {
		SelectedCandidateID string            `json:"selectedCandidateId"`
		PublicSchemaVersion string            `json:"publicSchemaVersion"`
		GameID              string            `json:"gameId"`
		VariantID           string            `json:"variantId"`
		Origin              string            `json:"origin"`
		Objective           json.RawMessage   `json:"objective"`
		Horizon             json.RawMessage   `json:"horizon"`
		Estimates           []json.RawMessage `json:"estimates"`
		Scenarios           []json.RawMessage `json:"scenarios"`
		Facts               []struct {
			ID          string   `json:"id"`
			Kind        string   `json:"kind"`
			Summary     string   `json:"summary"`
			Evidence    []string `json:"evidence"`
			CandidateID *string  `json:"candidateId"`
		} `json:"facts"`
		Assumptions []string `json:"assumptions"`
	}
	check("registered-analysis-schema", contracts.Validate("RegisteredAnalysis", r.RegisteredAnalysis) == nil)
	check("registered-analysis-context", json.Unmarshal(r.RegisteredAnalysis, &analysis) == nil && analysis.SelectedCandidateID == r.SelectedCandidateID && analysis.PublicSchemaVersion == packet.PublicSchemaVersion && analysis.GameID == "trix" && analysis.VariantID == packet.VariantID && analysis.Origin == origin)
	check("registered-analysis-metadata", jsonEqual(analysis.Objective, json.RawMessage(`{"id":"trix-high-score","version":"1.0.0","metric":"points","direction":"higher"}`)) && jsonEqual(analysis.Horizon, json.RawMessage(`{"id":"trix-request","version":"1.0.0","scope":"request"}`)) && len(analysis.Estimates) == 0 && len(analysis.Scenarios) == 0)
	if trix.SupportsPolicy(r.PolicyPin.ID) && r.PolicyPin.ID != trix.PolicyID {
		var trace trix.DecisionTrace
		traceErr := strict(r.OriginalAnalysis, &trace)
		check("original-analysis-schema", traceErr == nil)
		check("saved-trace-facts", traceErr == nil && trix.ValidateDecisionTraceWithPin(packet.Observation, trace, pin) == nil)
		check("original-analysis-action", trace.PolicyID == r.PolicyPin.ID && trace.PolicyVersion == r.PolicyPin.Version && trace.SelectedCandidateID == r.SelectedCandidateID)
		assumptions := []string{}
		facts := 0
		projected := true
		for _, support := range trace.Support {
			if support.Kind != "exact" {
				assumptions = append(assumptions, support.Text)
				continue
			}
			if facts >= len(analysis.Facts) {
				projected = false
				continue
			}
			fact := analysis.Facts[facts]
			facts++
			projected = projected && fact.ID == support.ID && fact.Kind == "exact" && fact.CandidateID == nil && fact.Summary == support.Text && slices.Equal(fact.Evidence, []string{support.ID})
		}
		check("registered-trace-facts", projected && facts == len(analysis.Facts) && slices.Equal(assumptions, analysis.Assumptions))
		original, adviceErr := trix.BuildAdviceFromTrace(trace, r.DecisionID)
		originalBytes, marshalErr := json.Marshal(original)
		check("original-advice-trace", adviceErr == nil && marshalErr == nil && jsonEqual(originalBytes, r.OriginalAdvice))
		audit.Checks = append(audit.Checks, AuditCheck{"heuristic-strategic-quality", "pending", "Exact facts and saved presentation are checked; heuristic preferences and stronger play require independent evidence"})
	} else {
		check("original-analysis-schema", contracts.Validate("RegisteredAnalysis", r.OriginalAnalysis) == nil)
		check("original-analysis-action", jsonEqual(r.OriginalAnalysis, r.RegisteredAnalysis))
		check("original-legal-count", len(analysis.Facts) == 1 && analysis.Facts[0].ID == "trix-legal-count" && analysis.Facts[0].Kind == "exact" && analysis.Facts[0].CandidateID == nil && analysis.Facts[0].Summary == fmt.Sprintf("%d legal choices.", len(legal)) && slices.Equal(analysis.Facts[0].Evidence, []string{fmt.Sprintf("legal-count:%d", len(legal))}))
		audit.Checks = append(audit.Checks, AuditCheck{"explanation-semantics", "pending", "Historical baseline contextual reasoning remains an explicit gap; original module advice remains archived"})
		audit.Checks = append(audit.Checks, AuditCheck{"remaining-context-facts", "pending", "Baseline request, current winner, declarations and score claims require additional independent fact checks"})
	}
	message, messageErr := savedTrixMessage(r)
	expected, marshalErr := json.Marshal(message)
	check("saved-coach-message", messageErr == nil && marshalErr == nil && contracts.Validate("CoachMessage", r.CoachMessage) == nil && jsonEqual(r.CoachMessage, expected))
	return audit
}
func verifyTrixPreparation(p PreparedRecord) error {
	expectedSchema := "RegisteredAnalysis"
	if trix.SupportsPolicy(p.Decision.PolicyPin.ID) && p.Decision.PolicyPin.ID != trix.PolicyID {
		expectedSchema = "TrixDecisionTrace"
	}
	if p.Preparation.Detail.Schema != expectedSchema || !jsonEqual(p.Preparation.Detail.Bytes, p.Decision.OriginalAnalysis) || !jsonEqual(p.Preparation.Advice.Bytes, p.Decision.OriginalAdvice) || !jsonEqual(p.Preparation.Prepared.Analysis, p.Decision.RegisteredAnalysis) {
		return fmt.Errorf("saved Trix original output mismatch")
	}
	if AuditTrixDecision(p.Decision).Status == "failed" {
		return fmt.Errorf("saved Trix audit failed")
	}
	var m contracts.CoachMessage
	if err := json.Unmarshal(p.Decision.CoachMessage, &m); err != nil {
		return err
	}
	if m.DecisionID != p.Decision.DecisionID || m.SelectedAction != p.Decision.SelectedCandidateID || m.PolicyVersion != p.Decision.PolicyPin.ID {
		return fmt.Errorf("saved Trix coach identity mismatch")
	}
	return nil
}
