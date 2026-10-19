package trix

import (
	"cardford/server/internal/gamekernel"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/rand/v2"
)

const JacksEndingVersion = "trix-jacks-ending-1.0.0"

// JacksEndingConfig is an offline diagnostic, never a runtime policy. The card
// limit counts every remaining hand, including the actor's known cards.
type JacksEndingConfig struct {
	Version              string               `json:"version"`
	MaxRemainingCards    int                  `json:"maxRemainingCards"`
	MaxAllocations       int                  `json:"maxAllocations"`
	MaxSamplerOperations int                  `json:"maxSamplerOperations"`
	MaxSteps             int                  `json:"maxSteps"`
	Profiles             []JacksEndingProfile `json:"profiles"`
}

type JacksEndingProfile struct {
	ID       string    `json:"id"`
	Policies [4]string `json:"policies"`
}

type JacksEndingResult struct {
	Version             string                  `json:"version"`
	Status              string                  `json:"status"`
	InputDigest         string                  `json:"inputDigest"`
	RulePin             gamekernel.Pin          `json:"rulePin"`
	Configuration       JacksEndingConfig       `json:"configuration"`
	Objective           string                  `json:"objective"`
	CandidateIDs        []string                `json:"candidateIds"`
	EnumerationComplete bool                    `json:"enumerationComplete"`
	Rows                []JacksEndingAllocation `json:"rows"`
	Work                EvaluationWork          `json:"work"`
	Limitations         []string                `json:"limitations"`
}

// Ordinals identify distinct compatible remaining allocations in stable card
// and seat order. No private fixture hand, seed, or real outcome is retained.
type JacksEndingAllocation struct {
	Ordinal  int                        `json:"ordinal"`
	Profiles []JacksEndingProfileResult `json:"profiles"`
}

type JacksEndingProfileResult struct {
	ProfileID string              `json:"profileId"`
	Roots     []JacksEndingFinish `json:"roots"`
}

type JacksEndingFinish struct {
	CandidateID             string               `json:"candidateId"`
	FinishOrder             []int                `json:"finishOrder"`
	SeatPoints              [4]int               `json:"seatPoints"`
	OwnPoints               int                  `json:"ownPoints"`
	PartnerPoints           *int                 `json:"partnerPoints,omitempty"`
	TeamPoints              *int                 `json:"teamPoints,omitempty"`
	OpposingTeamPoints      *int                 `json:"opposingTeamPoints,omitempty"`
	ObjectivePoints         int                  `json:"objectivePoints"`
	Margin                  float64              `json:"margin"`
	ResidualMargin          float64              `json:"residualMargin"`
	UnforcedFutureDecisions int                  `json:"unforcedFutureDecisions"`
	Turns                   []JacksEndingTurn    `json:"turns"`
	PassCounts              [4]int               `json:"passCounts"`
	ReleaseTimes            []JacksEndingRelease `json:"releaseTimes"`
}

type JacksEndingTurn struct {
	Offset          int      `json:"offset"`
	Seat            int      `json:"seat"`
	Action          Action   `json:"action"`
	LegalCount      int      `json:"legalCount"`
	HandCountsAfter [4]int   `json:"handCountsAfter"`
	NewlyPlayable   []string `json:"newlyPlayable"`
}

// Offsets count accepted native actions, including passes, from this root.
// FirstPlayableOffset=0 means board-playable before the root. Becoming playable
// is not the owner's turn or placement; no timing is a real-world prediction.
type JacksEndingRelease struct {
	Card                string `json:"card"`
	Seat                int    `json:"seat"`
	FirstPlayableOffset int    `json:"firstPlayableOffset"`
	PlacementOffset     int    `json:"placementOffset"`
}

func DefaultJacksEndingConfig() JacksEndingConfig {
	return JacksEndingConfig{Version: JacksEndingVersion, MaxRemainingCards: 8, MaxAllocations: 256, MaxSamplerOperations: 2000000, MaxSteps: 100000, Profiles: []JacksEndingProfile{
		{ID: "history", Policies: [4]string{HistoryPolicyID, HistoryPolicyID, HistoryPolicyID, HistoryPolicyID}},
		{ID: "ownership", Policies: [4]string{OwnershipPolicyID, OwnershipPolicyID, OwnershipPolicyID, OwnershipPolicyID}},
		{ID: "baseline", Policies: [4]string{PolicyID, PolicyID, PolicyID, PolicyID}},
	}}
}

func (c JacksEndingConfig) Validate() error {
	if c.Version != JacksEndingVersion || c.MaxRemainingCards < 1 || c.MaxRemainingCards > 12 || c.MaxAllocations < 1 || c.MaxAllocations > 4096 || c.MaxSamplerOperations < 1 || c.MaxSamplerOperations > 16000000 || c.MaxSteps < 1 || c.MaxSteps > 1000000 || len(c.Profiles) < 1 || len(c.Profiles) > 8 {
		return fmt.Errorf("invalid bounded Trix Jacks ending configuration")
	}
	seen := map[string]bool{}
	for _, profile := range c.Profiles {
		if profile.ID == "" || len(profile.ID) > 100 || seen[profile.ID] {
			return fmt.Errorf("invalid or repeated Jacks continuation profile identity")
		}
		seen[profile.ID] = true
		for _, policy := range profile.Policies {
			if !SupportsPolicy(policy) {
				return fmt.Errorf("unsupported Trix Jacks continuation policy")
			}
		}
	}
	return nil
}

// EvaluateJacksEnding enumerates every compatible remaining allocation, once,
// and compares every legal root under each declared fixed continuation profile.
// Each future choice receives only Observe(branch, currentActor). Exhaustive
// allocations do not turn those policies into optimal or adversarial play.
// Full available chronology is required: legacy witness search cannot certify
// this complete allocation set within its randomized bounded witness search.
func EvaluateJacksEnding(ctx context.Context, o Observation, pin gamekernel.Pin, c JacksEndingConfig) (out JacksEndingResult, err error) {
	c.Profiles = append([]JacksEndingProfile{}, c.Profiles...)
	out = JacksEndingResult{Version: JacksEndingVersion, Status: "incomplete", Configuration: c, RulePin: pin, CandidateIDs: []string{}, Rows: []JacksEndingAllocation{}, Objective: "own-request-points", Limitations: []string{
		"Complete means all remaining allocations compatible with the actor's current cards, public chronology and exact native profile; one unit per allocation, not one per history witness. Allocation counts are not probabilities.",
		"Every legal root and declared profile shares each allocation. Future policies receive only their own observations; no per-world best action, minimax value, all-legal-path envelope or optimal-play claim is computed.",
		"Final request points include seats already finished. Partners maximize combined team points; Solo maximizes own points. Margin is team minus opponents for Partners, own minus mean opponents for Solo; point changes and margin changes have different units.",
		"Turns and release times are hypothetical native continuations, not predictions or new decision-time facts. Timing offsets count accepted actions including passes; zero is before the root, first playable is board availability, and placement is a later accepted action.",
		"Incomplete enumeration is a traversal prefix, not a sample or distribution estimate. Completed rows remain diagnostics only; no rankings, means, policy changes or promotion result are produced.",
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
		return out, fmt.Errorf("invalid or oversized Trix ending observation")
	}
	for _, card := range o.Hand {
		if !contains(Deck(), card) {
			return out, fmt.Errorf("invalid actor card")
		}
	}
	digest := evaluationDigest(o, pin)
	out.InputDigest = hex.EncodeToString(digest[:])
	remaining := 0
	for _, count := range o.HandCounts {
		if count < 0 || count > 13 {
			return out, fmt.Errorf("invalid remaining hand count")
		}
		remaining += count
	}
	if o.Phase != "layout" || o.Request == nil || *o.Request != "trix" || o.LayoutHistory == nil || o.LayoutHistory.Status != "available" || remaining > c.MaxRemainingCards {
		out.Status = "outside-scope"
		out.Limitations = append(out.Limitations, "Requires active Jacks with full available current-profile chronology and total remaining cards within the configured bound.")
		return out, nil
	}
	if o.Turn == nil || *o.Turn != o.Seat || len(o.Trick) != 0 || len(o.Tricks) != 0 || len(o.Declarations) != 0 {
		return out, fmt.Errorf("invalid active Jacks ending context")
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
	finish := func(e error) (JacksEndingResult, error) {
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
	var visit func(int, [4][]string, [4]int) error
	visit = func(index int, hands [4][]string, left [4]int) error {
		if e := meter.sample(); e != nil {
			return e
		}
		if index < len(sampler.cards) {
			for seat := 0; seat < 4; seat++ {
				if left[seat] == 0 || sampler.masks[index]&(1<<seat) == 0 {
					continue
				}
				next := hands
				next[seat] = append(append([]string{}, hands[seat]...), sampler.cards[index])
				counts := left
				counts[seat]--
				if e := visit(index+1, next, counts); e != nil {
					return e
				}
			}
			return nil
		}
		out.Work.Attempts++
		// This path uses full recorded chronology, so the RNG is unused. Keep
		// reconstruction shared with the established observation-only evaluator.
		world, ok, e := sampler.reconstruct(hands, rand.New(rand.NewPCG(1, 2)))
		if e != nil || !ok {
			return e
		}
		if len(out.Rows) >= c.MaxAllocations {
			return errEvaluationBudget
		}
		row := JacksEndingAllocation{Ordinal: len(out.Rows) + 1, Profiles: []JacksEndingProfileResult{}}
		for _, profile := range c.Profiles {
			entry := JacksEndingProfileResult{ProfileID: profile.ID, Roots: []JacksEndingFinish{}}
			for _, root := range legal {
				value, e := jacksEndingContinuation(world, o.Seat, root, profile, meter)
				if e != nil {
					return e
				}
				entry.Roots = append(entry.Roots, value)
			}
			row.Profiles = append(row.Profiles, entry)
		}
		// Commit only a fully paired allocation, never a partly compared root.
		out.Rows = append(out.Rows, row)
		out.Work.Worlds++
		return nil
	}
	hands := [4][]string{}
	hands[o.Seat] = append([]string{}, o.Hand...)
	if err = visit(0, hands, sampler.capacities); err != nil {
		return finish(err)
	}
	if len(out.Rows) == 0 {
		return out, fmt.Errorf("no allocation reproduces the native Jacks observation")
	}
	out.Status, out.EnumerationComplete = "completed", true
	return out, nil
}

func jacksEndingContinuation(s State, actor int, root Action, profile JacksEndingProfile, meter *evaluationMeter) (out JacksEndingFinish, err error) {
	out = JacksEndingFinish{CandidateID: ActionID(root), FinishOrder: []int{}, Turns: []JacksEndingTurn{}, ReleaseTimes: []JacksEndingRelease{}}
	baseMargin := evaluationScore(s, actor)
	firstPlayable := map[string]int{}
	for _, card := range Deck() {
		if placeable(s.Board, card) {
			firstPlayable[card] = 0
		}
	}
	branch := s
	for branch.Phase != "round-complete" {
		if err = meter.step(); err != nil {
			return out, err
		}
		seat := branch.Turn
		observation := Observe(branch, seat)
		legal := Legal(observation)
		action := root
		if len(out.Turns) > 0 {
			if len(legal) > 1 {
				out.UnforcedFutureDecisions++
			}
			action, err = DecideWithPolicy(observation, profile.Policies[seat])
			if err != nil {
				return out, err
			}
		}
		branch, err = Apply(branch, seat, action)
		if err != nil {
			return out, err
		}
		offset := len(out.Turns) + 1
		turn := JacksEndingTurn{Offset: offset, Seat: seat, Action: action, LegalCount: len(legal), NewlyPlayable: []string{}}
		for seat, hand := range branch.Hands {
			turn.HandCountsAfter[seat] = len(hand)
		}
		for _, card := range Deck() {
			if _, seen := firstPlayable[card]; !seen && placeable(branch.Board, card) {
				firstPlayable[card] = offset
				turn.NewlyPlayable = append(turn.NewlyPlayable, card)
			}
		}
		if action.Kind == "layout-pass" {
			out.PassCounts[seat]++
		} else {
			available, known := firstPlayable[action.Card]
			if !known || available >= offset {
				return out, fmt.Errorf("native Jacks placement has no earlier playable frontier")
			}
			out.ReleaseTimes = append(out.ReleaseTimes, JacksEndingRelease{Card: action.Card, Seat: seat, FirstPlayableOffset: available, PlacementOffset: offset})
		}
		out.Turns = append(out.Turns, turn)
	}
	out.FinishOrder = append([]int{}, branch.FinishOrder...)
	for _, entry := range branch.Ledger {
		if entry.DealNumber == branch.DealNumber && entry.Recipient.Kind == "seat" && entry.Recipient.Seat != nil {
			out.SeatPoints[*entry.Recipient.Seat] += entry.Delta
		}
	}
	out.OwnPoints = out.SeatPoints[actor]
	out.ObjectivePoints = out.OwnPoints
	if partners(branch.Config.Variant) {
		partner := out.SeatPoints[(actor+2)%4]
		team := out.OwnPoints + partner
		opponents := out.SeatPoints[(actor+1)%4] + out.SeatPoints[(actor+3)%4]
		out.PartnerPoints, out.TeamPoints, out.OpposingTeamPoints = &partner, &team, &opponents
		out.ObjectivePoints = team
	}
	out.Margin = evaluationScore(branch, actor)
	out.ResidualMargin = out.Margin - baseMargin
	return out, nil
}
