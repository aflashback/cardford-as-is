package coachlab

import (
	"cardford/server/internal/coaching"
	"cardford/server/internal/contracts"
	"cardford/server/internal/games/trix"
	d "cardford/server/internal/legacydecision"
	"encoding/json"
	"fmt"
	"reflect"
)

func AuditDecision(r DecisionRecord, o d.Observation) DecisionAudit {
	var original d.Analysis
	var advice d.Advice
	if json.Unmarshal(r.OriginalAnalysis, &original) != nil || json.Unmarshal(r.OriginalAdvice, &advice) != nil {
		return DecisionAudit{Status: "failed", Checks: []AuditCheck{{"original-envelope", "failed", "unreadable original"}}}
	}
	audit := DecisionAudit{Status: "partially-checkable", Checks: []AuditCheck{}}
	check := func(id string, ok bool, detail string) {
		status := "passed"
		if !ok {
			status = "failed"
			audit.Status = "failed"
		}
		audit.Checks = append(audit.Checks, AuditCheck{id, status, detail})
	}
	check("actor-context", r.Actor == o.Seat && r.Phase == o.Phase && r.PolicyPin.Seat == o.Seat, "saved actor and decision-time phase")
	ids := map[string]bool{}
	for _, a := range o.LegalActions {
		ids[d.ActionID(a)] = true
	}
	check("complete-legal-set", len(ids) == len(r.LegalCandidates) && len(ids) > 0, "all legal options retained")
	for _, c := range r.LegalCandidates {
		check("legal-candidate", ids[c.ID], c.ID)
		delete(ids, c.ID)
	}
	check("legal-coverage", len(ids) == 0, "no omitted or repeated legal IDs")
	legal := false
	for _, a := range o.LegalActions {
		if d.ActionID(a) == r.SelectedCandidateID {
			legal = true
		}
	}
	check("selected-legal", legal, "selected original is legal")
	check("original-action", d.ActionID(original.Action) == r.SelectedCandidateID && original.Action.Seat == o.Seat && original.PolicyVersion == r.PolicyPin.ID, "selected analysis/action/policy parity")
	check("forced-status", r.Forced == (len(o.LegalActions) == 1), "forced is legal-set cardinality, not confidence")
	action := original.Action
	parity := advice.PolicyVersion == r.PolicyPin.ID
	switch action.Kind {
	case "play":
		parity = parity && advice.Card == action.Card
	case "bid":
		parity = parity && advice.Bid != nil && *advice.Bid == action.Bid
	case "pass":
		parity = parity && reflect.DeepEqual(advice.Pass, action.Cards)
	default:
		parity = false
	}
	check("original-advice-action", parity, "same recommendation archived before commit")
	// Public suit-void proofs are checked directly from chronology, independently
	// of the policy's reasoning weights. Never infer rank absence from a follower.
	voids := map[string]map[int]bool{}
	for _, s := range []string{"C", "D", "H", "S"} {
		voids[s] = map[int]bool{}
	}
	plays := [][]d.Play{}
	for _, h := range o.History {
		plays = append(plays, h.Plays)
	}
	plays = append(plays, o.Trick)
	for _, trick := range plays {
		if len(trick) > 0 {
			led := d.CardSuit(trick[0].Card)
			for _, p := range trick {
				if d.CardSuit(p.Card) != led {
					voids[led][p.Seat] = true
				}
			}
		}
	}
	for _, m := range o.Memory {
		for _, seat := range m.VoidSeats {
			check("public-void", voids[m.Suit][seat], fmt.Sprintf("seat %d cannot follow %s", seat, m.Suit))
		}
	}
	audit.Checks = append(audit.Checks, AuditCheck{"explanation-semantics", "pending", "mechanical checks cannot certify strategic purpose or complete truthful prose"})
	audit.Checks = append(audit.Checks, AuditCheck{"remaining-context-facts", "pending", "bid interpretation, current winner and score claims require additional independent fact checks"})
	return audit
}
func verifySavedPreparation(p PreparedRecord) error {
	if p.Preparation.Advice.Schema == "TrixAdvice" {
		return verifyTrixPreparation(p)
	}
	var a d.PreparedAnalysisEnvelope
	var advice d.PreparedAdviceEnvelope
	if p.Preparation.Detail.Schema != d.PreparedAnalysisSchema || p.Preparation.Advice.Schema != d.PreparedAdviceSchema {
		return fmt.Errorf("unsupported original envelope")
	}
	if err := jsonUnmarshal(p.Preparation.Detail.Bytes, &a); err != nil {
		return err
	}
	if err := jsonUnmarshal(p.Preparation.Advice.Bytes, &advice); err != nil {
		return err
	}
	originalA, _ := json.Marshal(a.Original)
	originalAdvice, _ := json.Marshal(advice.Original)
	if !jsonEqual(originalA, p.Decision.OriginalAnalysis) || !jsonEqual(originalAdvice, p.Decision.OriginalAdvice) || !jsonEqual(a.Registered, p.Decision.RegisteredAnalysis) {
		return fmt.Errorf("original output differs from preparation")
	}
	if len(p.Decision.CoachMessage) > 0 {
		var m contracts.CoachMessage
		if err := json.Unmarshal(p.Decision.CoachMessage, &m); err != nil {
			return err
		}
		if m.DecisionID != p.Decision.DecisionID {
			return fmt.Errorf("saved coach identity mismatch")
		}
		if err := coaching.ValidateCoachMessage(m, a.Original); err != nil {
			return err
		}
	}
	for i, v := range advice.Levels {
		expected, err := coaching.ProjectAdvice(advice.Original, i+1, p.Decision.DecisionID)
		if err != nil {
			return err
		}
		if !reflect.DeepEqual(v, expected) {
			return fmt.Errorf("saved legacy advice projection changed")
		}
	}
	return nil
}
func jsonUnmarshal(raw []byte, out any) error { return json.Unmarshal(raw, out) }

type BlindPacket struct {
	SchemaVersion   string          `json:"schemaVersion"`
	CaseID          string          `json:"caseId"`
	RuleProfileID   string          `json:"ruleProfileId"`
	ActorPacket     json.RawMessage `json:"actorPacket"`
	LegalCandidates []LabCandidate  `json:"legalCandidates"`
}

// ExportBlindPacket validates the module projection and builds an allowlisted
// object. Archive metadata, saved answers, policies, seeds and private hashes
// never enter it. Module observation itself is strict generated actor-only DTO.
func ExportBlindPacket(r DecisionRecord) (BlindPacket, error) {
	if err := contracts.Validate("RegisteredActorPacket", r.ActorPacket); err != nil {
		return BlindPacket{}, err
	}
	var packet struct {
		PublicSchemaVersion string          `json:"publicSchemaVersion"`
		GameID              string          `json:"gameId"`
		VariantID           string          `json:"variantId"`
		Seat                int             `json:"seat"`
		Phase               string          `json:"phase"`
		Observation         json.RawMessage `json:"observation"`
		Candidates          []struct {
			ID     string          `json:"id"`
			Public json.RawMessage `json:"public"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(r.ActorPacket, &packet); err != nil {
		return BlindPacket{}, err
	}
	// Schema-validated observation contains public state plus this seat's own
	// hand/pass memory only. Remove game identity/derived archive linkage fields.
	var observation map[string]json.RawMessage
	if err := json.Unmarshal(packet.Observation, &observation); err != nil {
		return BlindPacket{}, err
	}
	profile := r.ActorObservation.RuleProfileID
	if packet.GameID == "trix" {
		var actor trix.Observation
		if err := strict(packet.Observation, &actor); err != nil {
			return BlindPacket{}, err
		}
		pin, err := validateTrixObservationPin(packet.VariantID, packet.PublicSchemaVersion, actor)
		if err != nil {
			return BlindPacket{}, err
		}
		if actor.Seat != packet.Seat || actor.Phase != packet.Phase || profile != "" && profile != pin.RuleProfileID {
			return BlindPacket{}, fmt.Errorf("Trix blind packet exact context mismatch")
		}
		profile = pin.RuleProfileID
	}
	allowed := []string{"hand", "handCounts", "bids", "tricks", "scores", "bags", "trick", "history", "turn", "dealer", "roundNumber", "heartsBroken", "spadesBroken", "passDirection", "pass", "knownHoldings", "memory"}
	if packet.GameID == "trix" {
		allowed = []string{"gameId", "variantId", "seat", "phase", "turn", "kingdom", "dealNumber", "owner", "request", "remainingRequests", "hand", "handCounts", "trick", "tricks", "declarations", "board", "finishOrder", "passes", "ledger", "withheldBonuses", "lastExternalLeader", "totals", "requestTotals", "kingdomTotals", "winners", "twoAnnouncements", "layoutHistory"}
	}
	safe := map[string]json.RawMessage{}
	for _, key := range allowed {
		if v, ok := observation[key]; ok {
			safe[key] = v
		}
	}
	if packet.GameID == "trix" {
		safe["id"] = json.RawMessage(`"actor-context"`)
	}
	raw, _ := json.Marshal(map[string]any{"publicSchemaVersion": packet.PublicSchemaVersion, "gameId": packet.GameID, "variantId": packet.VariantID, "seat": packet.Seat, "phase": packet.Phase, "observation": safe, "candidates": packet.Candidates})
	if profile == "" {
		if packet.GameID == "hearts" {
			profile = "hearts-training-1.0.0"
		} else if packet.VariantID == "partners" {
			profile = "spades-training-1.0.0"
		} else {
			profile = "spades-solo-training-1.0.0"
		}
	}
	return BlindPacket{"coach-lab-blind-1.0.0", "case-" + Digest(raw)[:24], profile, raw, append([]LabCandidate{}, r.LegalCandidates...)}, nil
}
