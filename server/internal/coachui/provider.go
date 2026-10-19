// Package coachui provides presentation-only Coach previews. It has no game,
// storage, entitlement, clock or network authority.
package coachui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cardford/server/internal/contracts"
)

const Version = "ui-preview-v1"
const MaxFrames = 120
const MaxContextBytes = 2 << 20

var ErrInvalidInput = errors.New("invalid actor-visible Coach context")

type Metadata struct {
	Source   string `json:"source"`
	Version  string `json:"version"`
	Mock     bool   `json:"mock"`
	Preview  bool   `json:"preview"`
	Language string `json:"language"`
}

type RatingPreview struct {
	Fictional   bool   `json:"fictional"`
	CohortLabel string `json:"cohortLabel"`
	Percentile  int    `json:"percentile"`
	SampleSize  int    `json:"sampleSize"`
	Label       string `json:"label"`
}

// Input accepts only schema-validated public review frames. Callers must project
// the authenticated actor's view before constructing it; schema validation cannot
// establish ownership. The service separately validates selected cards/actions.
type Input struct {
	Kind          string
	DecisionID    string
	Frames        []json.RawMessage
	SelectedCards []string
	Action        json.RawMessage
}

type PreviewItem struct {
	Kind        string         `json:"kind"`
	Title       string         `json:"title"`
	Body        string         `json:"body"`
	Explanation string         `json:"explanation"`
	Rating      *RatingPreview `json:"rating,omitempty"`
}

type Provider interface {
	Metadata() Metadata
	Generate(context.Context, Input) ([]PreviewItem, error)
}

type MockProvider struct{}

func (MockProvider) Metadata() Metadata {
	return Metadata{Source: "mock", Version: Version, Mock: true, Preview: true, Language: "en"}
}

func validateInput(in Input) error {
	switch in.Kind {
	case "cue", "review", "rating", "selection", "confirmed", "postplay":
	default:
		return ErrInvalidInput
	}
	if len(in.DecisionID) == 0 || len(in.DecisionID) > 256 || len(in.Frames) == 0 || len(in.Frames) > MaxFrames || len(in.SelectedCards) > 13 {
		return ErrInvalidInput
	}
	bytes := 0
	for _, frame := range in.Frames {
		bytes += len(frame)
		if bytes > MaxContextBytes || contracts.Validate("ReviewFrame", frame) != nil {
			return ErrInvalidInput
		}
	}
	seen := map[string]bool{}
	for _, card := range in.SelectedCards {
		raw, err := json.Marshal(card)
		if err != nil || seen[card] || contracts.Validate("Card", raw) != nil {
			return ErrInvalidInput
		}
		seen[card] = true
	}
	if len(in.Action) > 0 {
		bytes += len(in.Action)
		if bytes > MaxContextBytes || (contracts.Validate("GameAction", in.Action) != nil && contracts.Validate("TrixAction", in.Action) != nil) {
			return ErrInvalidInput
		}
	}
	if in.Kind == "selection" && len(in.Action) > 0 {
		return ErrInvalidInput
	}
	if (in.Kind == "confirmed" || in.Kind == "postplay") && (len(in.Action) == 0 || len(in.SelectedCards) > 0) {
		return ErrInvalidInput
	}
	if in.Kind != "selection" && len(in.SelectedCards) > 0 {
		return ErrInvalidInput
	}
	if in.Kind != "confirmed" && in.Kind != "postplay" && len(in.Action) > 0 {
		return ErrInvalidInput
	}
	return nil
}

// Generate is deterministic UI scaffolding, not a strategy assessment. It never
// forwards frame contents into output or infers skill from scores or assistance.
func (MockProvider) Generate(ctx context.Context, in Input) ([]PreviewItem, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateInput(in); err != nil {
		return nil, err
	}
	explanation := "Mock preview using saved actor-visible context. Move quality is not assessed."
	item := PreviewItem{Kind: in.Kind, Explanation: explanation}
	switch in.Kind {
	case "cue":
		item.Title = "Before you choose"
		item.Body = "Preview cue for this saved decision."
	case "selection":
		item.Title = "Pending selection"
		cards := strings.Join(in.SelectedCards, ", ")
		if cards == "" {
			cards = "none"
		}
		item.Body = fmt.Sprintf("Selected: %s. This choice is not confirmed.", cards)
	case "confirmed":
		item.Title = "Recorded choice"
		item.Body = "The server-confirmed choice is saved with this preview."
	case "postplay":
		item.Title = "After your move"
		item.Body = "Revisit the saved choice and its public context."
	case "review":
		return []PreviewItem{
			{Kind: "review", Title: "Strength", Body: "Preview review slot. No strength assessment is available yet.", Explanation: explanation},
			{Kind: "review", Title: "Next practice", Body: "Replay the saved decision and compare its public constraints.", Explanation: explanation},
		}, nil
	case "rating":
		item.Title = "Fictional comparison"
		item.Body = "Sample placement only. This is not a comparison with real players."
		item.Rating = &RatingPreview{Fictional: true, CohortLabel: "Fictional preview cohort", Percentile: 50, SampleSize: 100, Label: "Sample percentile; no skill assessment"}
	}
	return []PreviewItem{item}, nil
}
