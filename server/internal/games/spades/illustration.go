package spades

import (
	"cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"fmt"
)

// Illustrate never accepts the live aggregate or another actor's real hand.
func Illustrate(ctx context.Context, o d.Observation, alternative string, seed uint32, policy string) ([]d.Observation, error) {
	analyze := reasoning.AnalyzeContext
	if policy == reasoning.PartnerResourcePolicy && o.Mode == "spades-partners" {
		analyze = reasoning.AnalyzePartnerResourcesContext
	} else if policy != reasoning.PolicyVersion {
		return nil, fmt.Errorf("unsupported source continuation")
	}
	if (o.Mode != "spades-solo" && o.Mode != "spades-partners") || o.Phase != "play" || o.Turn == nil || *o.Turn != o.Seat {
		return nil, fmt.Errorf("unsupported source continuation")
	}
	var first *d.Action
	for _, a := range o.LegalActions {
		if a.Kind == "play" && d.ActionID(a) == alternative {
			v := a
			first = &v
		}
	}
	if first == nil {
		return nil, fmt.Errorf("illegal original alternative")
	}
	hands, err := d.SampleHands(ctx, o, seed)
	if err != nil {
		return nil, err
	}
	raw, err := d.SyntheticWorld(o, hands)
	if err != nil {
		return nil, err
	}
	var s State
	if err = json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	observe := func(seat int) (d.Observation, error) {
		return legacySessionObservationContext(ctx, observeSession(&sessionState{original: &s}, seat))
	}
	initial, err := observe(o.Seat)
	if err != nil {
		return nil, err
	}
	frames := []d.Observation{initial}
	for step := 0; step < 4 && s.Phase == "play"; step++ {
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		a := *first
		if step > 0 {
			actor, err := observe(*s.Turn)
			if err != nil {
				return nil, err
			}
			analysis, err := analyze(ctx, actor)
			if err != nil {
				return nil, err
			}
			a = analysis.Action
		}
		card := a.Card
		if err = applyAction(&s, Action{Kind: "play", Seat: a.Seat, Card: &card}); err != nil {
			return nil, err
		}
		frame, err := observe(o.Seat)
		if err != nil {
			return nil, err
		}
		frames = append(frames, frame)
	}
	return frames, ctx.Err()
}
