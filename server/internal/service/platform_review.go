package service

import (
	"cardford/server/internal/access"
	"cardford/server/internal/coaching"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	d "cardford/server/internal/legacydecision"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type platformHelpCommand struct {
	CommandID              string `json:"commandId"`
	GameID                 string `json:"gameId"`
	ExpectedRevision       int64  `json:"expectedRevision"`
	ControlLeaseToken      string `json:"controlLeaseToken"`
	DecisionID             string `json:"decisionId"`
	RequestedLevel         int    `json:"requestedLevel"`
	Unlock                 bool   `json:"unlock"`
	TrialID                string `json:"trialId"`
	AlternativeCandidateID string `json:"alternativeCandidateId"`
	DisplayedLevel         int    `json:"displayedLevel"`
}

func (s *Service) platformReview(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	switch r.Operation {
	case "platform-reviews":
		return s.platformReviews(ctx, owner, "")
	case "platform-review":
		return s.platformReviews(ctx, owner, r.CommandID)
	case "platform-review-access":
		return s.platformReviewAccess(ctx, owner, r.CommandID)
	case "platform-saved-advice":
		return s.platformSavedAdvice(ctx, owner, r.CommandID)
	case "platform-advice", "platform-notes":
		return s.platformHelp(ctx, owner, r)
	case "platform-exposures":
		return s.platformExposure(ctx, owner, r)
	case "platform-review-trial":
		return s.platformTrial(ctx, owner, r)
	case "platform-review-status":
		return s.platformTrialStatus(ctx, owner, r.CommandID)
	}
	return transport.Response{}, fail(404, "unknown-platform-review")
}

// platformSavedAdvice is an original-output read. It never creates a delivery,
// requests a lease, unlocks a unit, or executes analysis.
func (s *Service) platformSavedAdvice(ctx context.Context, owner, id string) (transport.Response, error) {
	marker := strings.LastIndex(id, ":decision:")
	if marker <= 0 {
		return transport.Response{}, records.ErrReadDenied
	}
	game := id[:marker]
	revision, err := records.ParsePlatformDecisionID(game, id)
	if err != nil {
		return transport.Response{}, err
	}
	saved, err := s.store.ReadPlatformHelp(ctx, owner, game, id, "advice", 3)
	if errors.Is(err, records.ErrConflict) {
		return transport.Response{}, fail(404, "original-advice-not-delivered")
	}
	if err != nil {
		return transport.Response{}, err
	}
	source, err := s.store.PlatformSource(ctx, owner, game, revision)
	if err != nil {
		return transport.Response{}, err
	}
	unit, err := s.codec.CurrentUnitID(source.Document, source.Snapshot)
	if err != nil {
		return transport.Response{}, err
	}
	return result("PlatformAdviceView", map[string]any{"advice": json.RawMessage(saved), "sourceUnitId": unit, "unlocked": true})
}

func (s *Service) platformCurrent(ctx context.Context, owner, game string) (*records.Loaded, error) {
	a, err := s.store.ReadAccess(ctx, owner)
	if err != nil {
		return nil, err
	}
	if game == "" {
		game = a.ActiveGameID
	}
	if game == "" || a.ActiveGameID != game {
		return nil, records.ErrReadDenied
	}
	return s.store.Load(ctx, owner, game)
}
func (s *Service) platformSource(ctx context.Context, owner string, live *records.Loaded, id string) (*records.Loaded, gamekernel.BoundSession, d.Observation, error) {
	var obs d.Observation
	game := live.Document.Metadata.GameID
	revision, err := records.ParsePlatformDecisionID(game, id)
	if err != nil {
		return nil, nil, obs, err
	}
	if revision > live.Document.Revision {
		return nil, nil, obs, records.ErrConflict
	}
	source := live
	if revision < live.Document.Revision {
		choices, e := s.store.PlatformCommittedSources(ctx, owner, game)
		if e != nil {
			return nil, nil, obs, e
		}
		if _, ok := choices[revision]; !ok {
			return nil, nil, obs, records.ErrReadDenied
		}
		source, err = s.store.PlatformSource(ctx, owner, game, revision)
		if err != nil {
			return nil, nil, obs, err
		}
	}
	bound, err := s.codec.Session(source.Document, source.Snapshot)
	if err != nil {
		return nil, nil, obs, err
	}
	if bound.Pin().GameID == "trix" {
		return source, bound, obs, nil
	}
	raw, err := bound.LegacyObservation(0)
	if err != nil {
		return nil, nil, obs, err
	}
	err = json.Unmarshal(raw, &obs)
	return source, bound, obs, err
}

func (s *Service) platformSourceAccess(ctx context.Context, owner string, source *records.Loaded, b gamekernel.BoundSession, tool string) (records.AccessAdmission, access.Decision, bool, error) {
	game := source.Document.Metadata.GameID
	unit, err := s.codec.CurrentUnitID(source.Document, source.Snapshot)
	if err != nil {
		return records.AccessAdmission{}, access.Decision{}, false, err
	}
	c, err := s.store.ReadAccessContext(ctx, owner, game, unit)
	if err != nil {
		return records.AccessAdmission{}, access.Decision{}, false, err
	}
	unlocked := false
	for _, u := range c.Unlocks {
		unlocked = unlocked || !u.Revoked
	}
	if s.policy != nil {
		target, op, e := sessionOperation(b, game, unit, "coach", "", tool)
		if e != nil {
			return records.AccessAdmission{}, access.Decision{}, false, e
		}
		decision, e := s.resolver.Resolve(policyInput(c, target, op))
		if e != nil {
			return records.AccessAdmission{}, decision, unlocked, e
		}
		admission, e := chosenAdmission(c, decision, unit)
		if !decision.Allowed {
			return admission, decision, unlocked, nil
		}
		return admission, decision, unlocked, e
	}
	// The explicitly separate M04C fixture has immutable legacy tools; its
	// original memory aid is included with advice, not a newly invented grant.
	if tool == "notes" {
		tool = "advice"
	}
	decision, err := s.fixturePlatformDecision(ctx, owner, b, game, unit, "coach", "", tool)
	if err != nil {
		return records.AccessAdmission{}, decision, unlocked, err
	}
	if decision.AccessGeneration != c.Access.Generation {
		return records.AccessAdmission{}, decision, unlocked, records.ErrAccess
	}
	if !decision.Allowed {
		return records.AccessAdmission{}, decision, unlocked, nil
	}
	a, err := chosenAdmission(c, decision, unit)
	return a, decision, unlocked, err
}

func (s *Service) platformReviewAccess(ctx context.Context, owner, id string) (transport.Response, error) {
	live, err := s.platformCurrent(ctx, owner, "")
	if err != nil {
		return transport.Response{}, err
	}
	source, b, _, err := s.platformSource(ctx, owner, live, id)
	if err != nil {
		return transport.Response{}, err
	}
	a, advice, unlocked, err := s.platformSourceAccess(ctx, owner, source, b, "advice")
	if err != nil {
		return transport.Response{}, err
	}
	_, trial, _, err := s.platformSourceAccess(ctx, owner, source, b, "review-alternative")
	if err != nil {
		return transport.Response{}, err
	}
	unit := a.UnitID
	if unit == "" {
		unit, err = s.codec.CurrentUnitID(source.Document, source.Snapshot)
		if err != nil {
			return transport.Response{}, err
		}
	}
	savedLevels := []int{}
	for level := 1; level <= 3; level++ {
		_, e := s.store.ReadPlatformHelp(ctx, owner, live.Document.Metadata.GameID, id, "advice", level)
		if e == nil {
			savedLevels = append(savedLevels, level)
		} else if !errors.Is(e, records.ErrConflict) {
			return transport.Response{}, e
		}
	}
	return result("PlatformReviewAccessView", map[string]any{"sourceUnitId": unit, "unlocked": unlocked, "advice": advice, "reviewAlternative": trial, "savedAdviceLevels": savedLevels})
}

func (s *Service) platformHelp(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q platformHelpCommand
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	kind, tool, schema := "advice", "advice", "PlatformAdviceView"
	level := q.RequestedLevel
	if r.Operation == "platform-notes" {
		kind, tool, schema, level = "notes", "notes", "NotesView", 1
		q.DecisionID = records.PlatformDecisionID(q.GameID, q.ExpectedRevision)
	}
	ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
	ctx, previous, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	// Source grant security is checked even for receipt-first recovery.
	saved, e := s.store.ReadPlatformHelp(ctx, owner, q.GameID, q.DecisionID, kind, level)
	if e == nil {
		if previous != nil {
			return accepted(*previous)
		}
		receipt := saved
		if kind == "advice" {
			source, err := s.store.PlatformSource(ctx, owner, q.GameID, mustDecisionRevision(q.GameID, q.DecisionID))
			if err != nil {
				return transport.Response{}, err
			}
			unit, err := s.codec.CurrentUnitID(source.Document, source.Snapshot)
			if err != nil {
				return transport.Response{}, err
			}
			receipt, _ = json.Marshal(map[string]any{"advice": json.RawMessage(saved), "sourceUnitId": unit, "unlocked": true})
		}
		out, err := s.store.ReissuePlatformHelp(ctx, owner, q.GameID, q.DecisionID, kind, level, schema, receipt)
		if err != nil {
			return transport.Response{}, err
		}
		return accepted(out)
	}
	if !errors.Is(e, records.ErrConflict) {
		return transport.Response{}, e
	}
	live, err := s.platformCurrent(ctx, owner, q.GameID)
	if err != nil {
		return transport.Response{}, err
	}
	if live.Document.Revision != q.ExpectedRevision {
		return transport.Response{}, records.ErrConflict
	}
	source, b, obs, err := s.platformSource(ctx, owner, live, q.DecisionID)
	if err != nil {
		return transport.Response{}, err
	}
	admission, decision, unlocked, err := s.platformSourceAccess(ctx, owner, source, b, tool)
	if err != nil {
		return transport.Response{}, err
	}
	if !decision.Allowed {
		return transport.Response{}, denied(decision)
	}
	var content json.RawMessage
	if b.Pin().GameID == "trix" {
		content, err = s.trixHelpContent(ctx, owner, q.GameID, q.DecisionID, source, live, b, kind, level)
	} else if kind == "notes" {
		content, err = d.Notes(obs)
	} else {
		var advice contracts.AdviceView
		original, e := s.store.PlatformOriginal(ctx, owner, q.GameID, source.Document.Revision, source.Document.Revision < live.Document.Revision)
		if e != nil {
			return transport.Response{}, e
		}
		if original != nil {
			_, frozen, e := records.OriginalDecision(*original)
			if e != nil {
				return transport.Response{}, e
			}
			advice = frozen.Levels[level-1]
			advice.DecisionID = q.DecisionID
		} else if len(obs.LegalActions) == 0 && level == 1 && source.Document.Revision == live.Document.Revision {
			notice, e := coaching.ExplainContext(ctx, obs, nil)
			if e != nil {
				return transport.Response{}, e
			}
			advice, err = coaching.ProjectAdvice(notice, 1, q.DecisionID)
		} else {
			return transport.Response{}, fail(409, "original-analysis-not-ready")
		}
		if err == nil {
			content, err = json.Marshal(advice)
		}
	}
	if err != nil {
		return transport.Response{}, err
	}
	if !unlocked && !q.Unlock {
		return transport.Response{}, records.ErrAccess
	}
	receipt := content
	if kind == "advice" {
		receipt, _ = json.Marshal(map[string]any{"advice": content, "sourceUnitId": admission.UnitID, "unlocked": true})
	}
	effectiveTool := tool
	if s.policy == nil && tool == "notes" {
		effectiveTool = "advice"
	}
	out, err := s.store.PublishPlatformHelp(ctx, records.PlatformHelpRequest{Source: source, ExpectedLiveRevision: q.ExpectedRevision, Admission: admission, DecisionID: q.DecisionID, Kind: kind, Tool: effectiveTool, Level: level, Unlock: q.Unlock, Content: content, ReceiptSchema: schema, Receipt: receipt})
	if err != nil {
		return transport.Response{}, err
	}
	return accepted(out)
}
func mustDecisionRevision(game, id string) int64 {
	revision, _ := records.ParsePlatformDecisionID(game, id)
	return revision
}

func (s *Service) platformExposure(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q platformHelpCommand
	if err := json.Unmarshal(r.Body, &q); err != nil {
		return transport.Response{}, err
	}
	saved, err := s.store.ReadPlatformHelp(ctx, owner, q.GameID, q.DecisionID, "advice", q.DisplayedLevel)
	if err != nil {
		return transport.Response{}, err
	}
	if len(saved) == 0 {
		return transport.Response{}, records.ErrReadDenied
	}
	ctx, prior, err := s.command(ctx, r, q.CommandID)
	if err != nil {
		return transport.Response{}, err
	}
	if prior != nil {
		return accepted(*prior)
	}
	receipt := json.RawMessage(`{"accepted":true}`)
	out, err := s.store.ReissuePlatformHelp(ctx, owner, q.GameID, q.DecisionID, "advice", q.DisplayedLevel, "AcceptedView", receipt)
	if err != nil {
		return transport.Response{}, err
	}
	return accepted(out)
}

func (s *Service) platformReviews(ctx context.Context, owner, selected string) (transport.Response, error) {
	live, err := s.platformCurrent(ctx, owner, "")
	if err != nil {
		return transport.Response{}, err
	}
	game := live.Document.Metadata.GameID
	if live.Document.Metadata.Pin.GameID == "trix" {
		return s.trixReviews(ctx, owner, live, selected)
	}
	choices, err := s.store.PlatformCommittedSources(ctx, owner, game)
	if err != nil {
		return transport.Response{}, err
	}
	levels, err := s.store.PlatformHelpLevels(ctx, owner, game)
	if err != nil {
		return transport.Response{}, err
	}
	selectedRevision := int64(-1)
	if selected != "" {
		selectedRevision, err = records.ParsePlatformDecisionID(game, selected)
		if err != nil {
			return transport.Response{}, err
		}
		if _, ok := choices[selectedRevision]; !ok {
			return transport.Response{}, records.ErrReadDenied
		}
	}
	cases := []any{}
	frames := []any{}
	hand := 0
	assistance := records.PlatformAssistance(choices, levels)
	_, err = s.store.PlatformReplay(ctx, owner, game, func(doc records.Document, snapshot gamekernel.Snapshot, _ *records.CommandRecord) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if selectedRevision >= 0 && (doc.Revision < selectedRevision || len(frames) >= 1000) {
			return nil
		}
		candidate, human := choices[doc.Revision]
		if selectedRevision < 0 && !human {
			return nil
		}
		b, err := s.codec.Session(doc, snapshot)
		if err != nil {
			return err
		}
		raw, err := b.LegacyObservation(0)
		if err != nil {
			return err
		}
		var obs d.Observation
		if err = json.Unmarshal(raw, &obs); err != nil {
			return err
		}
		if selectedRevision < 0 {
			var action any
			for _, a := range obs.LegalActions {
				if d.ActionID(a) == candidate {
					action = d.PublicAction(a)
				}
			}
			if action == nil {
				return fmt.Errorf("original human action unavailable")
			}
			assisted := assistance[doc.Revision] > 0
			cases = append(cases, map[string]any{"decisionId": records.PlatformDecisionID(game, doc.Revision), "handNumber": obs.HandNumber, "action": action, "assisted": assisted, "status": "not-assessed", "summary": "Your decision and the information available then."})
			if len(cases) > 1000 {
				cases = cases[1:]
			}
			return nil
		}
		if doc.Revision == selectedRevision {
			hand = obs.HandNumber
		}
		if obs.HandNumber != hand {
			return nil
		}
		presentation, err := b.Presentation(0)
		if err != nil {
			return err
		}
		var action any
		if doc.Revision == selectedRevision+1 {
			source, e := s.store.PlatformSource(ctx, owner, game, selectedRevision)
			if e != nil {
				return e
			}
			bound, e := s.codec.Session(source.Document, source.Snapshot)
			if e != nil {
				return e
			}
			raw, e := bound.LegacyObservation(0)
			if e != nil {
				return e
			}
			var before d.Observation
			if e = json.Unmarshal(raw, &before); e != nil {
				return e
			}
			for _, a := range before.LegalActions {
				if d.ActionID(a) == choices[selectedRevision] {
					action = d.PublicAction(a)
				}
			}
		}
		frames = append(frames, map[string]any{"game": presentation, "action": action, "decisionId": selected, "notes": []string{}})
		return nil
	})
	if err != nil {
		return transport.Response{}, err
	}
	if selected == "" {
		return result("ReviewIndex", map[string]any{"cases": cases})
	}
	return result("ReviewView", map[string]any{"decisionId": selected, "label": "Original", "liveRevision": live.Document.Revision, "frames": frames})
}
