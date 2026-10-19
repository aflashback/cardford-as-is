package service

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
	"context"
	"encoding/json"
	"fmt"
)

func (s *Service) trixHelpContent(ctx context.Context, owner, game, decisionID string, source, live *records.Loaded, b gamekernel.BoundSession, kind string, level int) (json.RawMessage, error) {
	if kind == "notes" {
		return json.Marshal(map[string]any{"memory": []any{}, "outgoing": []any{}, "received": []any{}, "history": []any{}})
	}
	original, err := s.store.PlatformOriginal(ctx, owner, game, source.Document.Revision, source.Document.Revision < live.Document.Revision)
	if err != nil {
		return nil, err
	}
	if original == nil {
		return nil, fail(409, "original-analysis-not-ready")
	}
	if original.AdviceSchema != "TrixAdvice" {
		return nil, fmt.Errorf("unsupported Trix saved advice")
	}
	if err = s.codec.ValidateHistoricalDecision(*original); err != nil {
		return nil, err
	}
	return projectTrixAdvice(original.Advice, decisionID, level)
}

// Projection only changes exposure, never recomputes the saved decision.
func projectTrixAdvice(raw json.RawMessage, decisionID string, level int) (json.RawMessage, error) {
	if err := contracts.Validate("TrixAdvice", raw); err != nil {
		return nil, err
	}
	var advice struct {
		GameID                 string   `json:"gameId"`
		VariantID              string   `json:"variantId"`
		DecisionID             string   `json:"decisionId"`
		Level                  int      `json:"level"`
		Origin                 string   `json:"origin"`
		Title                  string   `json:"title"`
		Text                   string   `json:"text"`
		PolicyVersion          string   `json:"policyVersion"`
		RecommendedCandidateID string   `json:"recommendedCandidateId,omitempty"`
		Alternatives           []string `json:"alternatives,omitempty"`
		EvidenceRefs           []string `json:"evidenceRefs"`
	}
	if err := json.Unmarshal(raw, &advice); err != nil {
		return nil, err
	}
	advice.DecisionID, advice.Level = decisionID, level
	if level < 3 {
		advice.RecommendedCandidateID = ""
		advice.Alternatives = nil
	}
	result, err := json.Marshal(advice)
	if err == nil {
		err = contracts.Validate("TrixAdvice", result)
	}
	return result, err
}

func (s *Service) trixReviews(ctx context.Context, owner string, live *records.Loaded, selected string) (transport.Response, error) {
	game := live.Document.Metadata.GameID
	choices, err := s.store.PlatformCommittedSources(ctx, owner, game)
	if err != nil {
		return transport.Response{}, err
	}
	levels, err := s.store.PlatformHelpLevels(ctx, owner, game)
	if err != nil {
		return transport.Response{}, err
	}
	assistance := records.PlatformAssistance(choices, levels)
	revision := int64(-1)
	if selected != "" {
		revision, err = records.ParsePlatformDecisionID(game, selected)
		if err != nil {
			return transport.Response{}, err
		}
		if _, ok := choices[revision]; !ok {
			return transport.Response{}, records.ErrReadDenied
		}
	}
	review := trixReviewCollector{game: game, selected: selected, revision: revision, choices: choices, assistance: assistance, cases: []any{}, frames: []any{}}
	_, err = s.store.PlatformReplay(ctx, owner, game, func(doc records.Document, snap gamekernel.Snapshot, _ *records.CommandRecord) error {
		return review.visit(ctx, doc.Revision, func() (gamekernel.BoundSession, error) { return s.codec.Session(doc, snap) })
	})
	if err != nil {
		return transport.Response{}, err
	}
	if selected == "" {
		return result("ReviewIndex", map[string]any{"cases": review.cases})
	}
	return result("ReviewView", map[string]any{"decisionId": selected, "label": "Original", "liveRevision": live.Document.Revision, "frames": review.frames})
}

// This collector limits public projection work to the selected request. The
// surrounding PlatformReplay still validates every later command/checkpoint;
// completing a review never terminates or bypasses that private validation.
type trixReviewCollector struct {
	game, selected string
	revision       int64
	choices        map[int64]string
	assistance     map[int64]int
	cases, frames  []any
	unit           string
	finished       bool
	selectedAction json.RawMessage
}

func (review *trixReviewCollector) visit(ctx context.Context, revision int64, resolve func() (gamekernel.BoundSession, error)) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if review.finished {
		return nil
	}
	candidate, human := review.choices[revision]
	if review.revision < 0 && !human {
		return nil
	}
	if review.revision >= 0 && (revision < review.revision || len(review.frames) >= 1000) {
		return nil
	}
	b, e := resolve()
	if e != nil {
		return e
	}
	if review.revision >= 0 {
		if revision == review.revision {
			review.unit = b.UnitID()
		}
		if review.unit != "" && b.UnitID() != review.unit {
			review.finished = true
			return nil
		}
	}
	presentation, e := b.Presentation(0)
	if e != nil {
		return e
	}
	var header struct {
		Observation struct {
			DealNumber int `json:"dealNumber"`
		} `json:"observation"`
	}
	if e = json.Unmarshal(presentation, &header); e != nil {
		return e
	}
	if human && (review.revision < 0 || revision == review.revision) {
		packet, e := b.Packet(0)
		if e != nil {
			return e
		}
		var parsed struct {
			Candidates []struct {
				ID     string          `json:"id"`
				Public json.RawMessage `json:"public"`
			} `json:"candidates"`
		}
		if e = json.Unmarshal(packet, &parsed); e != nil {
			return e
		}
		var action json.RawMessage
		for _, c := range parsed.Candidates {
			if c.ID == candidate {
				action = c.Public
			}
		}
		if action == nil {
			return fmt.Errorf("original Trix action unavailable")
		}
		if review.revision < 0 {
			review.cases = append(review.cases, map[string]any{"decisionId": records.PlatformDecisionID(review.game, revision), "handNumber": header.Observation.DealNumber, "action": action, "assisted": review.assistance[revision] > 0, "status": "not-assessed", "summary": "Your choice and the public table available then."})
			if len(review.cases) > 1000 {
				review.cases = review.cases[1:]
			}
			return nil
		}
		if revision == review.revision {
			review.selectedAction = action
		}
	}
	var action any
	if revision == review.revision+1 {
		action = review.selectedAction
	}
	review.frames = append(review.frames, map[string]any{"game": presentation, "action": action, "decisionId": review.selected, "notes": []string{}})
	return nil
}
