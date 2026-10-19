package trix

import (
	"cardford/server/internal/gamekernel"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
)

const JacksTimingVersion = "trix-jacks-timing-1.0.0"

// JacksTimingConfig is an offline diagnostic. Both independently seeded streams
// use this many samples with replacement. It never selects a runtime action.
type JacksTimingConfig struct {
	Version              string               `json:"version"`
	WorldsPerStream      int                  `json:"worldsPerStream"`
	MaxSamplerOperations int                  `json:"maxSamplerOperations"`
	MaxSteps             int                  `json:"maxSteps"`
	Profiles             []JacksEndingProfile `json:"profiles"`
}

type JacksTimingResult struct {
	Version           string             `json:"version"`
	Status            string             `json:"status"`
	InputDigest       string             `json:"inputDigest"`
	RulePin           gamekernel.Pin     `json:"rulePin"`
	Configuration     JacksTimingConfig  `json:"configuration"`
	Objective         string             `json:"objective"`
	CandidateIDs      []string           `json:"candidateIds"`
	Streams           []string           `json:"streams"`
	SamplingComplete  bool               `json:"samplingComplete"`
	Rows              []JacksTimingWorld `json:"rows"`
	UniqueAllocations int                `json:"uniqueAllocations"`
	RepeatedSamples   int                `json:"repeatedSamples"`
	Work              EvaluationWork     `json:"work"`
	Limitations       []string           `json:"limitations"`
}

// A digest identifies only a synthetic remaining allocation. Neither the
// original private deal nor the synthetic private hands are an output field.
type JacksTimingWorld struct {
	Stream           string                     `json:"stream"`
	Ordinal          int                        `json:"ordinal"`
	AllocationDigest string                     `json:"allocationDigest"`
	Profiles         []JacksEndingProfileResult `json:"profiles"`
}

func DefaultJacksTimingConfig() JacksTimingConfig {
	return JacksTimingConfig{Version: JacksTimingVersion, WorldsPerStream: 16, MaxSamplerOperations: 16000000, MaxSteps: 2000000, Profiles: DefaultJacksEndingConfig().Profiles}
}

func (c JacksTimingConfig) Validate() error {
	if c.Version != JacksTimingVersion || c.WorldsPerStream < 1 || c.WorldsPerStream > 128 || c.MaxSamplerOperations < 1 || c.MaxSamplerOperations > 16000000 || c.MaxSteps < 1 || c.MaxSteps > 2000000 || len(c.Profiles) < 1 || len(c.Profiles) > 8 {
		return fmt.Errorf("invalid bounded Trix Jacks timing configuration")
	}
	seen := map[string]bool{}
	for _, profile := range c.Profiles {
		if profile.ID == "" || len(profile.ID) > 100 || seen[profile.ID] {
			return fmt.Errorf("invalid or repeated Jacks timing profile identity")
		}
		seen[profile.ID] = true
		for _, policy := range profile.Policies {
			if !SupportsPolicy(policy) {
				return fmt.Errorf("unsupported Trix Jacks timing continuation policy")
			}
		}
	}
	return nil
}

// EvaluateJacksTiming compares every native legal root under every declared
// fixed continuation profile on the same sampled worlds. Full public chronology
// permits native replay of each allocation without a private deal or seed.
// Future choices use Observe(branch, actor) through jacksEndingContinuation.
// Work caps cover both streams together, including rejected sampler attempts.
func EvaluateJacksTiming(ctx context.Context, o Observation, pin gamekernel.Pin, c JacksTimingConfig) (out JacksTimingResult, err error) {
	c.Profiles = append([]JacksEndingProfile{}, c.Profiles...)
	out = JacksTimingResult{Version: JacksTimingVersion, Status: "incomplete", RulePin: pin, Configuration: c, Objective: "own-request-points", CandidateIDs: []string{}, Streams: []string{"timing-primary", "timing-confirmation"}, Rows: []JacksTimingWorld{}, Limitations: []string{
		"Fixed samples with replacement from remaining allocations conditional on actor cards and public hard constraints, checked by full native chronology replay. These are hypothetical allocations, not the actual hidden deal, a calibrated behavioral belief distribution, or independent game origins.",
		"Each stream and ordinal derives only from the semantic actor observation, exact pin and fixed evaluator version/stream. All legal roots and declared profiles share each world; no per-world best future action or optimal-play value is computed.",
		"Completed means the configured samples finished in both streams, not exhaustive allocation coverage. Repeated allocations are retained and counted. An incomplete run retains only fully paired worlds and does not establish a ranking or representative sample.",
		"Partners objective is combined team request points; Solo objective is own request points. Team points and team-minus-opponents margin are separate units. Seat awards include seats already finished.",
		"Turns and release times are hypothetical native continuations. First playable is board availability, not the holder's turn or actual placement. These results are not new decision-time facts, action correctness labels, strength validation or promotion evidence.",
	}}
	if ctx == nil {
		return out, fmt.Errorf("evaluation context required")
	}
	if err = c.Validate(); err != nil {
		return out, err
	}
	if err = ctx.Err(); err != nil {
		return out, err
	}
	config, err := evaluationProfile(pin, o)
	if err != nil {
		return out, err
	}
	if err = ValidateLayoutHistoryObservation(o); err != nil {
		return out, err
	}
	if partners(o.VariantID) {
		out.Objective = "combined-team-request-points"
	}
	if o.GameID != "trix" || !validVariant(o.VariantID) || o.ID == "" || o.Seat < 0 || o.Seat > 3 || o.Owner < 0 || o.Owner > 3 || o.HandCounts[o.Seat] != len(o.Hand) || len(o.Hand) > 13 || o.DealNumber < 1 || o.DealNumber > 4*len(requests(o.VariantID)) || o.Kingdom < 1 || o.Kingdom > 4 || len(o.Tricks) > 13 || len(o.Trick) > 3 || len(o.Passes) > 156 || len(o.Declarations) > 4 || len(o.FinishOrder) > 4 || len(o.RemainingRequests) > 5 || len(o.Ledger) > 4096 || len(o.WithheldBonuses) > 512 {
		return out, fmt.Errorf("invalid or oversized Trix timing observation")
	}
	for _, count := range o.HandCounts {
		if count < 0 || count > 13 {
			return out, fmt.Errorf("invalid Trix timing remaining count")
		}
	}
	for _, card := range o.Hand {
		if !contains(Deck(), card) {
			return out, fmt.Errorf("invalid Trix timing actor card")
		}
	}
	digest := evaluationDigest(o, pin)
	out.InputDigest = hex.EncodeToString(digest[:])
	if o.Phase != "layout" || o.Request == nil || *o.Request != "trix" || pin.PublicSchemaVersion != "1.2.0" || o.LayoutHistory == nil || o.LayoutHistory.Status != "available" {
		out.Status = "outside-scope"
		out.Limitations = append(out.Limitations, "Requires active Jacks and full available current-profile chronology; historical observations do not acquire missing public history.")
		return out, nil
	}
	if o.Turn == nil || *o.Turn != o.Seat || len(o.Trick) != 0 || len(o.Tricks) != 0 || len(o.Declarations) != 0 {
		return out, fmt.Errorf("invalid active Jacks timing context")
	}
	legal := Legal(o)
	if len(legal) == 0 {
		return out, fmt.Errorf("no legal Trix Jacks alternative")
	}
	for _, action := range legal {
		out.CandidateIDs = append(out.CandidateIDs, ActionID(action))
	}
	requestConfig := DefaultRequestEvaluationConfig()
	requestConfig.MaxSamplerOperations, requestConfig.MaxSteps = c.MaxSamplerOperations, c.MaxSteps
	meter := &evaluationMeter{ctx: ctx, config: requestConfig, work: &out.Work}
	finish := func(e error) (JacksTimingResult, error) {
		if errors.Is(e, errEvaluationBudget) {
			out.Limitations = append(out.Limitations, e.Error())
			return out, nil
		}
		return out, e
	}
	sampler, err := newEvaluationSampler(o, config, meter)
	if err != nil {
		return finish(err)
	}
	unique := map[string]bool{}
	for _, stream := range out.Streams {
		for ordinal := 0; ordinal < c.WorldsPerStream; ordinal++ {
			seed := sha256.Sum256(append(digest[:], []byte(fmt.Sprintf("/%s/%s/%d", JacksTimingVersion, stream, ordinal))...))
			rng := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:16])))
			world, e := sampler.world(rng)
			if e != nil {
				return finish(e)
			}
			raw, e := json.Marshal(world.Hands)
			if e != nil {
				return out, e
			}
			allocationDigest := sha256.Sum256(raw)
			identity := hex.EncodeToString(allocationDigest[:])
			row := JacksTimingWorld{Stream: stream, Ordinal: ordinal + 1, AllocationDigest: identity, Profiles: []JacksEndingProfileResult{}}
			for _, profile := range c.Profiles {
				entry := JacksEndingProfileResult{ProfileID: profile.ID, Roots: []JacksEndingFinish{}}
				for _, root := range legal {
					value, e := jacksEndingContinuation(world, o.Seat, root, profile, meter)
					if e != nil {
						return finish(e)
					}
					entry.Roots = append(entry.Roots, value)
				}
				row.Profiles = append(row.Profiles, entry)
			}
			// Counts and rows commit together only after every profile/root finishes.
			out.Rows = append(out.Rows, row)
			out.Work.Worlds++
			if unique[identity] {
				out.RepeatedSamples++
			} else {
				unique[identity] = true
				out.UniqueAllocations++
			}
		}
	}
	out.Status, out.SamplingComplete = "completed", true
	return out, nil
}
