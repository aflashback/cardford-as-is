package trix

// CFL-13 is deliberately test-only. No runtime selector imports this comparison.
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
	"reflect"
	"testing"
)

const kingReturnVersion = "trix-king-return-1.0.0"

type kingReturnProfile struct {
	ID       string    `json:"id"`
	Policies [4]string `json:"policies"`
}
type kingReturnConfig struct {
	WorldsPerStream      int                 `json:"worldsPerStream"`
	MaxSamplerOperations int                 `json:"maxSamplerOperations"`
	MaxSteps             int                 `json:"maxSteps"`
	Profiles             []kingReturnProfile `json:"profiles"`
	Streams              []string            `json:"streams"`
}

func kingReturnConfiguration() kingReturnConfig {
	b, c := PolicyID, OwnershipComparisonPolicyID
	return kingReturnConfig{16, 16000000, 200000, []kingReturnProfile{
		{"all-baseline", [4]string{b, b, b, b}}, {"all-comparison", [4]string{c, c, c, c}},
		{"ns-comparison", [4]string{c, b, c, b}}, {"ns-baseline", [4]string{b, c, b, c}},
	}, []string{"king-return-primary", "king-return-confirmation"}}
}

type kingReturnCase struct {
	CaseID                 string         `json:"caseId"`
	RulePin                gamekernel.Pin `json:"rulePin"`
	Observation            Observation    `json:"observation"`
	ReferenceCandidateID   string         `json:"referenceCandidateId"`
	AlternativeCandidateID string         `json:"alternativeCandidateId"`
}
type kingReturnRelease struct {
	Seat                    int `json:"seat"`
	Trick                   int `json:"trick"`
	PlayOrdinal             int `json:"playOrdinal"`
	ContinuationPlayOrdinal int `json:"continuationPlayOrdinal"`
}
type kingReturnRoot struct {
	CandidateID     string                    `json:"candidateId"`
	TeamPoints      int                       `json:"teamPoints"`
	KingNetPoints   int                       `json:"kingNetPoints"`
	ComponentTotals map[string]map[string]int `json:"componentTotals"`
	RequestTotals   []Score                   `json:"requestTotals"`
	CompletedTricks int                       `json:"completedTricks"`
	KingCapture     kingScenarioCapture       `json:"kingCapture"`
	KingRelease     kingReturnRelease         `json:"kingRelease"`
	FirstTrick      Trick                     `json:"firstTrick"`
	Ledger          []LedgerEntry             `json:"ledger"`
	WithheldBonuses []WithheldBonus           `json:"withheldBonuses"`
}
type kingReturnProfileResult struct {
	ProfileID string           `json:"profileId"`
	Roots     []kingReturnRoot `json:"roots"`
}
type kingReturnSelection struct {
	ProfileID   string `json:"profileId"`
	CandidateID string `json:"candidateId"`
}
type kingReturnWorld struct {
	Stream           string                    `json:"stream"`
	Ordinal          int                       `json:"ordinal"`
	AllocationDigest string                    `json:"allocationDigest"`
	Profiles         []kingReturnProfileResult `json:"profiles"`
}
type kingReturnResult struct {
	CaseID                 string                `json:"caseId"`
	ReferenceCandidateID   string                `json:"referenceCandidateId"`
	AlternativeCandidateID string                `json:"alternativeCandidateId"`
	ActorObservation       Observation           `json:"actorObservation"`
	Version                string                `json:"version"`
	Status                 string                `json:"status"`
	InputDigest            string                `json:"inputDigest"`
	RulePin                gamekernel.Pin        `json:"rulePin"`
	Objective              string                `json:"objective"`
	CandidateIDs           []string              `json:"candidateIds"`
	PolicySelections       []kingReturnSelection `json:"policySelections"`
	Streams                []string              `json:"streams"`
	SamplingComplete       bool                  `json:"samplingComplete"`
	Rows                   []kingReturnWorld     `json:"rows"`
	UniqueAllocations      int                   `json:"uniqueAllocations"`
	RepeatedSamples        int                   `json:"repeatedSamples"`
	Work                   EvaluationWork        `json:"work"`
	Limitations            []string              `json:"limitations"`
}

func kingReturnValidate(in kingReturnCase) (Config, []Action, error) {
	o := in.Observation
	if in.CaseID == "" || len(in.CaseID) > 100 || o.GameID != "trix" || (o.VariantID != "basic-partners" && o.VariantID != "complex-partners") || in.RulePin != Pin(o.VariantID) {
		return Config{}, nil, fmt.Errorf("king return requires a unique case identity and current exact Partners pin")
	}
	if len(o.ID) > 100 || o.ID == "" || o.Seat != 2 || o.Phase != "playing" || o.Turn == nil || *o.Turn != 2 || o.Owner < 0 || o.Owner > 3 || o.Kingdom != 1 || o.DealNumber != 1 || o.Request == nil || o.VariantID == "basic-partners" && *o.Request != "king" || o.VariantID == "complex-partners" && *o.Request != "complex" || len(o.Tricks) != 2 || len(o.Trick) != 0 || len(o.Hand) != 11 || o.HandCounts != [4]int{11, 11, 11, 11} {
		return Config{}, nil, fmt.Errorf("king return requires North's third-trick lead observation")
	}
	if len(o.Declarations) != 4 || len(o.Board) != 4 || len(o.RemainingRequests) > 5 || len(o.Ledger) > 64 || len(o.WithheldBonuses) > 16 || len(o.Totals) > 4 || len(o.RequestTotals) > 4 || len(o.KingdomTotals) > 4 || len(o.Winners) > 4 || len(o.Passes) != 0 || len(o.FinishOrder) != 0 || o.TwoAnnouncements != nil {
		return Config{}, nil, fmt.Errorf("oversized or out-of-scope king return public context")
	}
	declared := false
	for _, d := range o.Declarations {
		if len(d.Cards) > 5 || len(d.Ref) > 128 {
			return Config{}, nil, fmt.Errorf("oversized declaration")
		}
		if d.Seat == 0 && contains(d.Cards, "HK") {
			declared = true
		}
	}
	if !declared {
		return Config{}, nil, fmt.Errorf("requires South's public HK double declaration")
	}
	for _, tr := range o.Tricks {
		if len(tr.Plays) != 4 {
			return Config{}, nil, fmt.Errorf("requires complete public tricks")
		}
		for _, p := range tr.Plays {
			if p.Card == "HK" || !contains(Deck(), p.Card) || p.Seat < 0 || p.Seat > 3 {
				return Config{}, nil, fmt.Errorf("invalid public play or already captured king")
			}
		}
	}
	for _, card := range o.Hand {
		if !contains(Deck(), card) {
			return Config{}, nil, fmt.Errorf("invalid actor card")
		}
	}
	config, err := evaluationProfile(in.RulePin, o)
	if err != nil {
		return Config{}, nil, err
	}
	if err = ValidateLayoutHistoryObservation(o); err != nil {
		return Config{}, nil, err
	}
	legal := Legal(o)
	ids := map[string]bool{}
	for _, a := range legal {
		if a.Kind != "play-card" {
			return Config{}, nil, fmt.Errorf("non-play root")
		}
		ids[ActionID(a)] = true
	}
	if in.ReferenceCandidateID == in.AlternativeCandidateID || !ids[in.ReferenceCandidateID] || !ids[in.AlternativeCandidateID] {
		return Config{}, nil, fmt.Errorf("reference and alternative must be distinct legal roots")
	}
	return config, legal, nil
}

func kingReturnContinuation(world State, root Action, profile kingReturnProfile, meter *evaluationMeter) (kingReturnRoot, error) {
	out := kingReturnRoot{CandidateID: ActionID(root)}
	if err := meter.step(); err != nil {
		return out, err
	}
	branch, err := Apply(world, 2, root)
	if err != nil {
		return out, err
	}
	for branch.Phase != "round-complete" {
		if err = meter.step(); err != nil {
			return out, err
		}
		actor := branch.Turn
		a, e := DecideWithPolicy(Observe(branch, actor), profile.Policies[actor])
		if e != nil {
			return out, e
		}
		branch, err = Apply(branch, actor, a)
		if err != nil {
			return out, err
		}
	}
	// Reuse the native literal scoring/provenance oracle. Team bonuses are
	// competitor entries, so they are counted once, never once per teammate.
	finished := kingScenarioRun{}
	if err = kingScenarioFinish(&finished, branch); err != nil {
		return out, err
	}
	out.TeamPoints = finished.ObjectivePoints
	out.ComponentTotals = finished.ComponentTotals
	out.RequestTotals = finished.RequestTotals
	out.CompletedTricks = finished.CompletedTricks
	out.KingCapture = finished.KingCapture
	out.Ledger = finished.Ledger
	out.WithheldBonuses = finished.WithheldBonuses
	out.FirstTrick = branch.Tricks[len(world.Tricks)]
	for _, e := range branch.Ledger {
		if e.Card != "HK" || e.Component != "king" && e.Component != "double-bonus" {
			continue
		}
		if e.Recipient.Kind == "competitor" && e.Recipient.Competitor == "NS" || e.Recipient.Kind == "seat" && e.Recipient.Seat != nil && *e.Recipient.Seat%2 == 0 {
			out.KingNetPoints += e.Delta
		}
	}
	for _, tr := range branch.Tricks {
		for i, p := range tr.Plays {
			if p.Card == "HK" {
				ordinal := (tr.Number-1)*4 + i + 1
				out.KingRelease = kingReturnRelease{p.Seat, tr.Number, ordinal, ordinal - len(world.Tricks)*4}
			}
		}
	}
	return out, nil
}

// Only the strict actor observation and pin enter the sampler. Identity is
// normalized by evaluationDigest; case IDs and source-deal identities are not seeds.
func kingReturnEvaluate(ctx context.Context, in kingReturnCase, c kingReturnConfig) (out kingReturnResult, err error) {
	out = kingReturnResult{CaseID: in.CaseID, ReferenceCandidateID: in.ReferenceCandidateID, AlternativeCandidateID: in.AlternativeCandidateID, ActorObservation: in.Observation, Version: kingReturnVersion, Status: "incomplete", RulePin: in.RulePin, Objective: "combined-team-request-points", CandidateIDs: []string{}, Streams: append([]string{}, c.Streams...), Rows: []kingReturnWorld{}, Limitations: []string{
		"Synthetic remaining allocations conditional on actor cards and public hard constraints, checked by full native public chronology replay; not actual hidden hands, calibrated behavioral beliefs or independent game origins.",
		"Both independently seeded streams sample with replacement; every legal root and fixed continuation profile shares each world. Future decisions receive only Observe(branch, actor).",
		"Complete means both fixed streams finished; incomplete output retains only fully paired worlds and supplies no ranking. No optimal-play, stronger-policy, acceptable-action or promotion label is established.",
		"Full combined NS request points are the objective. King net points include HK capture and its own double bonus; Complex costs and other declared-card bonuses remain separate ledger components.",
		"North's private cards can prove facts that South cannot prove from South's own observation. Hypothetical South discards and release timing are continuation outcomes, not decision-time facts for North.",
	}}
	if ctx == nil {
		return out, fmt.Errorf("context required")
	}
	// Reduced world/budget counts are available only to bounded unit checks.
	fixed := kingReturnConfiguration()
	if c.WorldsPerStream < 1 || c.WorldsPerStream > fixed.WorldsPerStream || c.MaxSamplerOperations < 1 || c.MaxSamplerOperations > fixed.MaxSamplerOperations || c.MaxSteps < 1 || c.MaxSteps > fixed.MaxSteps || !reflect.DeepEqual(c.Profiles, fixed.Profiles) || !reflect.DeepEqual(c.Streams, fixed.Streams) {
		return out, fmt.Errorf("invalid fixed king return configuration")
	}
	config, legal, e := kingReturnValidate(in)
	if e != nil {
		return out, e
	}
	for _, a := range legal {
		out.CandidateIDs = append(out.CandidateIDs, ActionID(a))
	}
	for _, profile := range c.Profiles {
		a, e := DecideWithPolicy(in.Observation, profile.Policies[in.Observation.Seat])
		if e != nil {
			return out, e
		}
		out.PolicySelections = append(out.PolicySelections, kingReturnSelection{profile.ID, ActionID(a)})
	}
	digest := evaluationDigest(in.Observation, in.RulePin)
	out.InputDigest = hex.EncodeToString(digest[:])
	mc := DefaultRequestEvaluationConfig()
	mc.MaxSamplerOperations = c.MaxSamplerOperations
	mc.MaxSteps = c.MaxSteps
	meter := &evaluationMeter{ctx: ctx, config: mc, work: &out.Work}
	finish := func(e error) (kingReturnResult, error) {
		if errors.Is(e, errEvaluationBudget) || errors.Is(e, context.Canceled) || errors.Is(e, context.DeadlineExceeded) {
			out.Limitations = append(out.Limitations, e.Error())
			return out, nil
		}
		return out, e
	}
	sampler, e := newEvaluationSampler(in.Observation, config, meter)
	if e != nil {
		return finish(e)
	}
	unique := map[string]bool{}
	for _, stream := range c.Streams {
		for ordinal := 0; ordinal < c.WorldsPerStream; ordinal++ {
			seed := sha256.Sum256(append(digest[:], []byte(fmt.Sprintf("/%s/%s/%d", kingReturnVersion, stream, ordinal))...))
			rng := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:16])))
			world, e := sampler.world(rng)
			if e != nil {
				return finish(e)
			}
			raw, e := json.Marshal(world.Hands)
			if e != nil {
				return out, e
			}
			hash := sha256.Sum256(raw)
			identity := hex.EncodeToString(hash[:])
			row := kingReturnWorld{Stream: stream, Ordinal: ordinal + 1, AllocationDigest: identity, Profiles: []kingReturnProfileResult{}}
			for _, profile := range c.Profiles {
				pr := kingReturnProfileResult{ProfileID: profile.ID, Roots: []kingReturnRoot{}}
				for _, root := range legal {
					value, e := kingReturnContinuation(world, root, profile, meter)
					if e != nil {
						return finish(e)
					}
					pr.Roots = append(pr.Roots, value)
				}
				row.Profiles = append(row.Profiles, pr)
			}
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
	out.Status = "completed"
	out.SamplingComplete = true
	return out, nil
}

func kingReturnTestObservation(t *testing.T, variant string) kingReturnCase {
	t.Helper()
	corpus, _ := kingScenarioFixtures(t)
	f := corpus.Fixtures[0]
	s, err := kingScenarioNew(f, variant)
	if err != nil {
		t.Fatal(err)
	}
	request := "king"
	if variant == "complex-partners" {
		request = "complex"
	}
	s, err = Apply(s, s.Turn, Action{Kind: "choose-request", Request: request})
	if err != nil {
		t.Fatal(err)
	}
	for s.Phase == "declare-doubles" {
		cards := []string{}
		if s.Turn == 0 {
			cards = []string{"HK"}
		}
		s, err = Apply(s, s.Turn, Action{Kind: "declare-doubles", Cards: cards})
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, card := range []string{"DA", "D8", "S4", "D2", "D4", "DK", "S5", "C2"} {
		s, err = Apply(s, s.Turn, Action{Kind: "play-card", Card: card})
		if err != nil {
			t.Fatal(err)
		}
	}
	return kingReturnCase{"king-return-" + variant, Pin(variant), Observe(s, 2), "play:S2", "play:D3"}
}

func TestKingReturnCommonWorldsAndIdentity(t *testing.T) {
	for _, variant := range []string{"basic-partners", "complex-partners"} {
		t.Run(variant, func(t *testing.T) { kingReturnCheckCommonWorlds(t, variant) })
	}
}

func kingReturnCheckCommonWorlds(t *testing.T, variant string) {
	t.Helper()
	in := kingReturnTestObservation(t, variant)
	before, _ := json.Marshal(in)
	c := kingReturnConfiguration()
	c.WorldsPerStream = 1
	out, err := kingReturnEvaluate(context.Background(), in, c)
	if err != nil {
		t.Fatal(err)
	}
	if !out.SamplingComplete || len(out.Rows) != 2 || out.Work.Worlds != 2 {
		t.Fatalf("incomplete bounded comparison: %+v", out.Work)
	}
	if len(out.PolicySelections) != 4 {
		t.Fatal("missing current profile root selections")
	}
	for i, selection := range out.PolicySelections {
		a, e := DecideWithPolicy(in.Observation, c.Profiles[i].Policies[2])
		if e != nil || selection.ProfileID != c.Profiles[i].ID || selection.CandidateID != ActionID(a) {
			t.Fatal("current profile root selection changed")
		}
	}
	for _, row := range out.Rows {
		if len(row.Profiles) != 4 {
			t.Fatal("missing paired profiles")
		}
		for _, pr := range row.Profiles {
			if len(pr.Roots) != len(out.CandidateIDs) {
				t.Fatal("missing paired roots")
			}
			for i, r := range pr.Roots {
				if r.CandidateID != out.CandidateIDs[i] || r.FirstTrick.Plays[0].Card != Legal(in.Observation)[i].Card || r.CompletedTricks != 13 || r.KingRelease.PlayOrdinal-r.KingRelease.ContinuationPlayOrdinal != 8 {
					t.Fatal("root, full request, or release timing changed")
				}
				// Independent team-routing sum. A competitor bonus belongs to
				// NS once even though NS contains two seats.
				team, king, bonusCount := 0, 0, 0
				for _, e := range r.Ledger {
					mine := e.Recipient.Kind == "competitor" && e.Recipient.Competitor == "NS"
					if e.Recipient.Kind == "seat" && e.Recipient.Seat != nil {
						mine = *e.Recipient.Seat == 0 || *e.Recipient.Seat == 2
					}
					if mine {
						team += e.Delta
						if e.Card == "HK" {
							king += e.Delta
						}
					}
					if e.Card == "HK" && e.Component == "double-bonus" {
						bonusCount++
						if e.Delta != 75 || e.Recipient.Kind != "competitor" {
							t.Fatal("literal team HK bonus changed")
						}
					}
				}
				wantKing := 75
				if r.KingCapture.Seat%2 == 0 {
					wantKing = -150
				}
				if team != r.TeamPoints || king != r.KingNetPoints || r.KingNetPoints != wantKing || bonusCount != 1 {
					t.Fatal("full team score or once-only literal HK bonus changed")
				}
				components := 0
				for _, value := range r.ComponentTotals["NS"] {
					components += value
				}
				if components != r.TeamPoints {
					t.Fatal("component ledger changed full objective")
				}
			}
		}
	}
	after, _ := json.Marshal(in)
	if string(before) != string(after) {
		t.Fatal("input observation mutated")
	}
	var decoded kingReturnCase
	if err = json.Unmarshal(before, &decoded); err != nil {
		t.Fatal(err)
	}
	decoded.CaseID = "different-case"
	decoded.Observation.ID = "different-original-identity"
	other, err := kingReturnEvaluate(context.Background(), decoded, c)
	if err != nil {
		t.Fatal(err)
	}
	if out.InputDigest != other.InputDigest || !reflect.DeepEqual(out.Rows, other.Rows) {
		t.Fatal("original identity or JSON roundtrip changed semantic comparison")
	}
	// Full native replay must reproduce every actor-visible field, not merely
	// deal capacity and void masks. Sampling never receives the fixture hands.
	config, _, err := kingReturnValidate(in)
	if err != nil {
		t.Fatal(err)
	}
	work := EvaluationWork{}
	mc := DefaultRequestEvaluationConfig()
	meter := &evaluationMeter{context.Background(), mc, &work}
	sampler, err := newEvaluationSampler(in.Observation, config, meter)
	if err != nil {
		t.Fatal(err)
	}
	w, err := sampler.world(rand.New(rand.NewPCG(11, 23)))
	if err != nil || !sampler.matches(w) {
		t.Fatalf("full native history replay: %v", err)
	}
}

func TestKingReturnIncompleteAndFixedScope(t *testing.T) {
	in := kingReturnTestObservation(t, "complex-partners")
	c := kingReturnConfiguration()
	c.WorldsPerStream = 1
	c.MaxSteps = 1
	out, err := kingReturnEvaluate(context.Background(), in, c)
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "incomplete" || out.SamplingComplete || len(out.Rows) != 0 || out.Work.Worlds != 0 || out.UniqueAllocations != 0 || out.RepeatedSamples != 0 {
		t.Fatal("partially paired world escaped")
	}
	// Permit exactly one paired world plus the first action of the next.
	c.MaxSteps = 11*4*44 + 1
	out, err = kingReturnEvaluate(context.Background(), in, c)
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "incomplete" || out.SamplingComplete || len(out.Rows) != 1 || out.Work.Worlds != 1 || out.UniqueAllocations != 1 || out.RepeatedSamples != 0 {
		t.Fatal("incomplete output did not retain exactly its fully paired prefix")
	}
	bad := in
	bad.RulePin.PublicSchemaVersion = "1.1.0"
	if _, _, err = kingReturnValidate(bad); err == nil {
		t.Fatal("historical pin accepted")
	}
	bad = in
	bad.AlternativeCandidateID = "play:HA"
	if _, _, err = kingReturnValidate(bad); err == nil {
		t.Fatal("illegal root accepted")
	}
	c = kingReturnConfiguration()
	c.Profiles[0].Policies[0] = OwnershipComparisonPolicyID
	if _, err = kingReturnEvaluate(context.Background(), in, c); err == nil {
		t.Fatal("mutable continuation configuration accepted")
	}
}
