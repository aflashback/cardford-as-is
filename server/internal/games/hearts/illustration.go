package hearts

import (
	"cardford/server/internal/games/hearts/reasoning"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"fmt"
)

// Illustrate samples solely from the original permitted observation and stops
// at the first completed trick. The original hidden deal is not an argument.
func Illustrate(ctx context.Context, o d.Observation, alternative string, seed uint32, policy string) ([]d.Observation, error) {
	if o.Mode != "hearts" || policy != reasoning.PolicyVersion || o.Phase != "play" || o.Turn == nil || *o.Turn != o.Seat {
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
	var s state
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
			analysis, err := reasoning.AnalyzeContext(ctx, actor)
			if err != nil {
				return nil, err
			}
			a = analysis.Action
		}
		if err = applyPlay(&s, a.Seat, a.Card); err != nil {
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
