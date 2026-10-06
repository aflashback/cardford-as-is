package compatibility

import (
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	d "cardford/server/internal/legacydecision"
	"context"
	"encoding/json"
	"testing"
)

// Independent original TS hashes verify that the new complete preparation
// freezes precisely the original analysis/advice, including every help level.
// V1 is opened only as an explicit test oracle bridge, never repinned on disk.
func TestM04CCompletePreparationOriginalOracle(t *testing.T) {
	checked := 0
	for _, saved := range reference(t).Cases {
		var config struct{ ID, Mode string }
		if err := json.Unmarshal(saved.Config, &config); err != nil {
			t.Fatal(err)
		}
		// Five existing cue streams cover all three modes and early/late choices;
		// the preserved M04B suite independently checks all 6,380 original analyses.
		if config.ID != "legacy-cue-3300001" && config.ID != "legacy-cue-3300014" && config.ID != "legacy-cue-3300027" {
			continue
		}
		t.Run(config.ID, func(t *testing.T) {
			module, err := Registry().ResolveSnapshot(config.Mode)
			if err != nil {
				t.Fatal(err)
			}
			state, err := module.Start(saved.Config, saved.Deal)
			if err != nil {
				t.Fatal(err)
			}
			for index, want := range saved.Checkpoints {
				if index > 0 {
					state, err = state.Apply(saved.Commands[index-1])
					if err != nil {
						t.Fatal(err)
					}
				}
				if len(want.Decisions) == 0 {
					continue
				}
				raw, err := state.Export()
				if err != nil {
					t.Fatal(err)
				}
				var bound gamekernel.BoundSession
				policy := "spades-tactics-2.1.0"
				if config.Mode == "hearts" {
					bound, err = hearts.OpenV1Session(raw)
					policy = "hearts-baseline-1.0.0"
				} else {
					variant := "solo"
					if config.Mode == "spades-partners" {
						variant = "partners"
					}
					bound, err = spades.OpenV1Session(variant, raw)
				}
				if err != nil {
					t.Fatal(err)
				}
				for _, decision := range want.Decisions {
					full, err := bound.PrepareComplete(context.Background(), decision.Seat, policy, "original-decision")
					if err != nil {
						t.Fatal(err)
					}
					var analysis d.PreparedAnalysisEnvelope
					var advice d.PreparedAdviceEnvelope
					if err = json.Unmarshal(full.Detail.Bytes, &analysis); err != nil {
						t.Fatal(err)
					}
					if err = json.Unmarshal(full.Advice.Bytes, &advice); err != nil {
						t.Fatal(err)
					}
					requireHash(t, "full original analysis", encoded(t, analysis.Original), decision.Analysis)
					requireHash(t, "full original advice", encoded(t, advice.Original), decision.Advice)
					for level, view := range advice.Levels {
						requireHash(t, "frozen advice level", encoded(t, view), decision.Projections[level])
					}
					checked++
				}
			}
		})
	}
	if checked < 150 {
		t.Fatalf("incomplete original preparation integration: %d", checked)
	}
}
