package trix

// Study helpers stay test-only: no runtime policy or evaluator profile changes.
import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"os"
	"reflect"
	"slices"
	"testing"
)

type layoutStudyFixture struct {
	SchemaVersion       string          `json:"schemaVersion"`
	CaseID              string          `json:"caseId"`
	RunID               string          `json:"runId"`
	ArchiveInputDigest  string          `json:"archiveInputDigest"`
	OriginalCandidateID string          `json:"originalCandidateId"`
	OriginalPolicyID    string          `json:"originalPolicyId"`
	Actor               int             `json:"actor"`
	Revision            int             `json:"revision"`
	Pin                 gamekernel.Pin  `json:"pin"`
	ActorPacket         json.RawMessage `json:"actorPacket"`
}
type layoutStudyPacket struct {
	PublicSchemaVersion string                       `json:"publicSchemaVersion"`
	GameID              string                       `json:"gameId"`
	VariantID           string                       `json:"variantId"`
	Seat                int                          `json:"seat"`
	Phase               string                       `json:"phase"`
	Observation         Observation                  `json:"observation"`
	Candidates          []gamekernel.PublicCandidate `json:"candidates"`
}
type layoutStudyPopulation struct {
	ID       string    `json:"id"`
	Policies [4]string `json:"policies"`
}
type layoutStudyFinish struct {
	CandidateID string  `json:"candidateId"`
	Margin      float64 `json:"margin"`
	FinishOrder []int   `json:"finishOrder"`
	TeamScores  []Score `json:"teamScores"`
}
type layoutStudyWorld struct {
	Stream     string              `json:"stream"`
	Ordinal    int                 `json:"ordinal"`
	Digest     string              `json:"digest"`
	Population string              `json:"population"`
	Roots      []layoutStudyFinish `json:"roots"`
}
type layoutStudySummary struct {
	Stream      string  `json:"stream"`
	Population  string  `json:"population"`
	CandidateID string  `json:"candidateId"`
	Worlds      int     `json:"worlds"`
	Mean        float64 `json:"meanDifferenceFromOriginal"`
	Min         float64 `json:"minDifferenceFromOriginal"`
	Max         float64 `json:"maxDifferenceFromOriginal"`
	Improved    int     `json:"improved"`
	Tied        int     `json:"tied"`
	Worsened    int     `json:"worsened"`
}
type layoutStudyNearby struct {
	ID                string              `json:"id"`
	SourceWorld       string              `json:"sourceWorld"`
	Path              []Action            `json:"pathFromFrozenRoot"`
	State             State               `json:"syntheticState"`
	Observation       Observation         `json:"actorObservation"`
	Pin               gamekernel.Pin      `json:"pin"`
	OriginalSelection string              `json:"reasoningSelection"`
	Population        string              `json:"population"`
	Roots             []layoutStudyFinish `json:"roots"`
}
type layoutStudyOutput struct {
	SchemaVersion  string                  `json:"schemaVersion"`
	Status         string                  `json:"status"`
	Fixture        layoutStudyFixture      `json:"fixture"`
	InputDigest    string                  `json:"inputDigest"`
	Selections     map[string]string       `json:"selections"`
	ReasoningTrace DecisionTrace           `json:"reasoningTrace"`
	Populations    []layoutStudyPopulation `json:"populations"`
	Worlds         []layoutStudyWorld      `json:"worlds"`
	Summaries      []layoutStudySummary    `json:"summaries"`
	Nearby         []layoutStudyNearby     `json:"nearby"`
	Work           EvaluationWork          `json:"work"`
	Limitations    []string                `json:"limitations"`
}

func readLayoutStudyFixture(path string) (layoutStudyFixture, layoutStudyPacket, error) {
	var f layoutStudyFixture
	var p layoutStudyPacket
	raw, err := os.ReadFile(path)
	if err != nil {
		return f, p, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&f); err != nil {
		return f, p, err
	}
	if f.SchemaVersion != "trix-layout-case-fixture-1.0.0" || f.CaseID == "" || f.OriginalCandidateID == "" {
		return f, p, fmt.Errorf("invalid study identity")
	}
	if err = contracts.Validate("RegisteredActorPacket", f.ActorPacket); err != nil {
		return f, p, err
	}
	decoder = json.NewDecoder(bytes.NewReader(f.ActorPacket))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&p); err != nil {
		return f, p, err
	}
	p.Observation.publicSchemaVersion = p.PublicSchemaVersion
	if f.Pin != AnnouncedPin("complex-partners") || p.PublicSchemaVersion != "1.1.0" || p.VariantID != f.Pin.VariantID || p.Seat != f.Actor || p.Observation.Seat != f.Actor || p.Phase != "layout" || p.Observation.Phase != "layout" || p.Observation.LayoutHistory != nil {
		return f, p, fmt.Errorf("changed archived actor pin or context")
	}
	legal := Legal(p.Observation)
	if len(legal) != len(p.Candidates) {
		return f, p, fmt.Errorf("incomplete legal alternatives")
	}
	for i, action := range legal {
		var saved Action
		if json.Unmarshal(p.Candidates[i].Public, &saved) != nil || !reflect.DeepEqual(action, saved) || p.Candidates[i].ID != ActionID(action) {
			return f, p, fmt.Errorf("changed legal payload")
		}
	}
	return f, p, nil
}

func layoutStudyPopulations() []layoutStudyPopulation {
	return []layoutStudyPopulation{
		{"baseline", [4]string{PolicyID, PolicyID, PolicyID, PolicyID}},
		{"reasoning", [4]string{ReasoningPolicyID, ReasoningPolicyID, ReasoningPolicyID, ReasoningPolicyID}},
		{"history", [4]string{HistoryPolicyID, HistoryPolicyID, HistoryPolicyID, HistoryPolicyID}},
		{"mixed-ew-reasoning", [4]string{PolicyID, ReasoningPolicyID, PolicyID, ReasoningPolicyID}},
	}
}

func layoutStudyRoots(s State, actor int, population layoutStudyPopulation, meter *evaluationMeter) ([]layoutStudyFinish, error) {
	o := Observe(s, actor)
	roots := []layoutStudyFinish{}
	for _, action := range Legal(o) {
		if err := meter.step(); err != nil {
			return nil, err
		}
		branch, err := Apply(s, actor, action)
		if err != nil {
			return nil, err
		}
		for branch.Phase != "round-complete" {
			if err = meter.step(); err != nil {
				return nil, err
			}
			seat := branch.Turn
			// Synthetic private holdings never enter the continuation selector.
			actorInput := Observe(branch, seat)
			if actorInput.LayoutHistory != nil || tracePin(actorInput) != AnnouncedPin("complex-partners") {
				return nil, fmt.Errorf("historical continuation silently gained a new observation profile")
			}
			next, e := DecideWithPolicy(actorInput, population.Policies[seat])
			if e != nil {
				return nil, e
			}
			branch, err = Apply(branch, seat, next)
			if err != nil {
				return nil, err
			}
		}
		roots = append(roots, layoutStudyFinish{ActionID(action), evaluationScore(branch, actor) - evaluationScore(s, actor), append([]int{}, branch.FinishOrder...), scores(branch, branch.DealNumber, 0)})
	}
	return roots, nil
}

func layoutStudyDifference(roots []layoutStudyFinish, candidate, original string) (float64, bool) {
	a, b := slices.IndexFunc(roots, func(r layoutStudyFinish) bool { return r.CandidateID == candidate }), slices.IndexFunc(roots, func(r layoutStudyFinish) bool { return r.CandidateID == original })
	if a < 0 || b < 0 {
		return 0, false
	}
	return roots[a].Margin - roots[b].Margin, true
}

func layoutStudySummarize(worlds []layoutStudyWorld, original string) []layoutStudySummary {
	result := []layoutStudySummary{}
	for _, row := range worlds {
		for _, root := range row.Roots {
			i := slices.IndexFunc(result, func(s layoutStudySummary) bool {
				return s.Stream == row.Stream && s.Population == row.Population && s.CandidateID == root.CandidateID
			})
			if i < 0 {
				result = append(result, layoutStudySummary{Stream: row.Stream, Population: row.Population, CandidateID: root.CandidateID, Min: math.Inf(1), Max: math.Inf(-1)})
				i = len(result) - 1
			}
			delta, ok := layoutStudyDifference(row.Roots, root.CandidateID, original)
			if !ok {
				panic("missing original root")
			}
			s := &result[i]
			s.Worlds++
			s.Mean += delta
			s.Min = math.Min(s.Min, delta)
			s.Max = math.Max(s.Max, delta)
			if delta > 0 {
				s.Improved++
			} else if delta < 0 {
				s.Worsened++
			} else {
				s.Tied++
			}
		}
	}
	for i := range result {
		result[i].Mean /= float64(result[i].Worlds)
	}
	return result
}

func TestLayoutCaseStudyArchivedSelection(t *testing.T) {
	f, p, err := readLayoutStudyFixture("testdata/layout-jacks-jd-s10.json")
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, a := range Legal(p.Observation) {
		ids = append(ids, ActionID(a))
	}
	if !reflect.DeepEqual(ids, []string{"layout:DJ", "layout:HK", "layout:S10"}) {
		t.Fatal("archived roots changed", ids)
	}
	for _, policy := range []string{PolicyID, ReasoningPolicyID, HistoryPolicyID} {
		a, e := DecideWithPolicy(p.Observation, policy)
		if e != nil || ActionID(a) != f.OriginalCandidateID {
			t.Fatalf("%s selected %s: %v", policy, ActionID(a), e)
		}
	}
}

func TestLayoutCaseStudyPairedSignAccounting(t *testing.T) {
	// A positive mean must retain the harmful world, ties and full legal set.
	rows := []layoutStudyWorld{
		{Stream: "x", Population: "p", Roots: []layoutStudyFinish{{CandidateID: "layout:DJ", Margin: 0}, {CandidateID: "layout:HK", Margin: 100}, {CandidateID: "layout:S10", Margin: 300}}},
		{Stream: "x", Population: "p", Roots: []layoutStudyFinish{{CandidateID: "layout:DJ", Margin: 100}, {CandidateID: "layout:HK", Margin: 100}, {CandidateID: "layout:S10", Margin: 0}}},
		{Stream: "x", Population: "p", Roots: []layoutStudyFinish{{CandidateID: "layout:DJ", Margin: 0}, {CandidateID: "layout:HK", Margin: 0}, {CandidateID: "layout:S10", Margin: 0}}},
	}
	got := layoutStudySummarize(rows, "layout:DJ")
	if len(got) != 3 || got[2].Worlds != 3 || got[2].Mean != 200.0/3 || got[2].Min != -100 || got[2].Max != 300 || got[2].Improved != 1 || got[2].Tied != 1 || got[2].Worsened != 1 {
		t.Fatalf("lost paired harm: %+v", got)
	}
	if got[0].Mean != 0 || got[0].Tied != 3 {
		t.Fatal("original reference not zero")
	}
}

func TestLayoutCaseStudyReproducesArchivedTwoWorldSmoke(t *testing.T) {
	f, p, err := readLayoutStudyFixture("testdata/layout-jacks-jd-s10.json")
	if err != nil {
		t.Fatal(err)
	}
	got, err := EvaluateRequest(context.Background(), p.Observation, f.Pin, DefaultRequestEvaluationConfig())
	if err != nil {
		t.Fatal(err)
	}
	// Independent literals come from the immutable saved comparison, not the
	// new study code. A changed historical pin or input cannot pass silently.
	if got.Status != "completed" || got.InputDigest != "b633a83217c675253bbe8a64744d857dbf41618678b8b9efcfb832894a9338a7" || !reflect.DeepEqual(got.Values, [][]float64{{-100, -100, -100}, {-100, -100, 200}}) {
		t.Fatalf("archived smoke changed: %+v", got)
	}
}

func TestLayoutCaseStudyNativeRootsMatchSavedScoring(t *testing.T) {
	f, p, err := readLayoutStudyFixture("testdata/layout-jacks-jd-s10.json")
	if err != nil {
		t.Fatal(err)
	}
	c := DefaultRequestEvaluationConfig()
	work := EvaluationWork{}
	meter := &evaluationMeter{ctx: context.Background(), config: c, work: &work}
	config, err := evaluationProfile(f.Pin, p.Observation)
	if err != nil {
		t.Fatal(err)
	}
	sampler, err := newEvaluationSampler(p.Observation, config, meter)
	if err != nil {
		t.Fatal(err)
	}
	digest := evaluationDigest(p.Observation, f.Pin)
	seed := sha256.Sum256(append(digest[:], []byte("/comparison/1")...))
	rng := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:16])))
	s, err := sampler.world(rng)
	if err != nil {
		t.Fatal(err)
	}
	if !sampler.matches(s) {
		t.Fatal("native witness changed actor input")
	}
	roots, err := layoutStudyRoots(s, p.Observation.Seat, layoutStudyPopulations()[0], meter)
	if err != nil {
		t.Fatal(err)
	}
	if len(roots) != 3 {
		t.Fatal("lost native root", roots)
	}
	for i, want := range []float64{-100, -100, 200} {
		if roots[i].Margin != want || len(roots[i].FinishOrder) != 4 || len(roots[i].TeamScores) != 2 {
			t.Fatalf("root %d saved scoring changed: %+v", i, roots[i])
		}
	}
}

func TestLayoutCaseStudyInvestigate(t *testing.T) {
	inputPath, outputPath := os.Getenv("TRIX_LAYOUT_STUDY_INPUT"), os.Getenv("TRIX_LAYOUT_STUDY_OUTPUT")
	if inputPath == "" && outputPath == "" {
		t.Skip("opt-in named-case study; use scripts/coach-lab-layout-case.mjs")
	}
	if inputPath == "" || outputPath == "" {
		t.Fatal("both study paths required")
	}
	f, p, err := readLayoutStudyFixture(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	digest := evaluationDigest(p.Observation, f.Pin)
	result := layoutStudyOutput{SchemaVersion: "trix-layout-case-study-1.0.0", Status: "incomplete", Fixture: f, InputDigest: hex.EncodeToString(digest[:]), Selections: map[string]string{}, Populations: layoutStudyPopulations(), Worlds: []layoutStudyWorld{}, Summaries: []layoutStudySummary{}, Nearby: []layoutStudyNearby{}, Limitations: []string{
		"64 feasible sampled synthetic worlds (32 per stream), not 64 independent origin families or a calibrated belief distribution.",
		"All populations and legal alternatives share the identical sampled state for a stream/ordinal; continuation actors see native actor observations only.",
		"Archived public1.1/module2.1 has no chronological layout ownership. No later chronology or actual archived hidden hand/outcome is backfilled.",
		"Conditional request-end team margin is a diagnostic; finite means and observed extrema do not label an action correct, validate strength, or authorize promotion.",
	}}
	for _, policy := range []string{PolicyID, ReasoningPolicyID, HistoryPolicyID} {
		a, e := DecideWithPolicy(p.Observation, policy)
		if e != nil {
			t.Fatal(e)
		}
		result.Selections[policy] = ActionID(a)
	}
	result.ReasoningTrace, err = BuildDecisionTrace(p.Observation, ReasoningPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	c := DefaultRequestEvaluationConfig()
	c.Worlds = 32
	c.MaxSamplerOperations = 16000000
	c.MaxSteps = 1000000
	meter := &evaluationMeter{ctx: context.Background(), config: c, work: &result.Work}
	config, err := evaluationProfile(f.Pin, p.Observation)
	if err != nil {
		t.Fatal(err)
	}
	sampler, err := newEvaluationSampler(p.Observation, config, meter)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		raw, e := json.MarshalIndent(result, "", "  ")
		if e != nil {
			t.Error(e)
			return
		}
		if e = os.WriteFile(outputPath, append(raw, '\n'), 0600); e != nil {
			t.Error(e)
		}
	}()
	for _, stream := range []string{"comparison", "layout-confirmation"} {
		for ordinal := 0; ordinal < c.Worlds; ordinal++ {
			seed := sha256.Sum256(append(digest[:], []byte(fmt.Sprintf("/%s/%d", stream, ordinal))...))
			rng := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:16])))
			s, e := sampler.world(rng)
			if e != nil {
				t.Fatal(e)
			}
			if !sampler.matches(s) || s.LayoutHistory != nil {
				t.Fatal("synthetic world changed the archived actor input")
			}
			raw, _ := json.Marshal(s)
			worldDigest := sha256.Sum256(raw)
			identity := hex.EncodeToString(worldDigest[:])
			for _, population := range result.Populations {
				roots, e := layoutStudyRoots(s, p.Observation.Seat, population, meter)
				if e != nil {
					t.Fatal(e)
				}
				result.Worlds = append(result.Worlds, layoutStudyWorld{stream, ordinal, identity, population.ID, roots})
			}
			result.Work.Worlds++
			// Nearby states are native continuations of synthetic witnesses. They
			// are retained separately and never pooled into the frozen-root mean.
			if len(result.Nearby) < 8 {
				nearby, e := layoutStudyFindNearby(s, identity, meter)
				if e != nil {
					t.Fatal(e)
				}
				if nearby != nil {
					result.Nearby = append(result.Nearby, *nearby)
				}
			}
			if ordinal%8 == 7 {
				t.Logf("stream %s: %d/32 worlds", stream, ordinal+1)
			}
		}
	}
	result.Summaries = layoutStudySummarize(result.Worlds, f.OriginalCandidateID)
	result.Status = "completed"
	for _, summary := range result.Summaries {
		t.Logf("%s %s %s delta mean %.3f range [%.0f,%.0f] +/0/- %d/%d/%d", summary.Stream, summary.Population, summary.CandidateID, summary.Mean, summary.Min, summary.Max, summary.Improved, summary.Tied, summary.Worsened)
	}
}

func layoutStudyFindNearby(s State, identity string, meter *evaluationMeter) (*layoutStudyNearby, error) {
	actor := s.Turn
	// Playing the third root is a minimal public perturbation that keeps both
	// debated cards in hand. Retain only a negative S10-vs-DJ continuation.
	a := Action{Kind: "layout-card", Card: "HK"}
	if !slices.ContainsFunc(Legal(Observe(s, actor)), func(v Action) bool { return ActionID(v) == ActionID(a) }) {
		return nil, nil
	}
	if e := meter.step(); e != nil {
		return nil, e
	}
	branch, err := Apply(s, actor, a)
	if err != nil {
		return nil, err
	}
	path := []Action{a}
	for i := 0; i < 12 && branch.Phase == "layout"; i++ {
		if branch.Turn == actor {
			population := layoutStudyPopulations()[0]
			roots, e := layoutStudyRoots(branch, actor, population, meter)
			if e != nil {
				return nil, e
			}
			delta, ok := layoutStudyDifference(roots, "layout:S10", "layout:DJ")
			if ok && delta < 0 {
				o := Observe(branch, actor)
				selected, e := DecideWithPolicy(o, ReasoningPolicyID)
				if e != nil {
					return nil, e
				}
				return &layoutStudyNearby{ID: "nearby-" + identity[:12], SourceWorld: identity, Path: path, State: branch, Observation: o, Pin: AnnouncedPin("complex-partners"), OriginalSelection: ActionID(selected), Population: population.ID, Roots: roots}, nil
			}
		}
		if e := meter.step(); e != nil {
			return nil, e
		}
		seat := branch.Turn
		next, e := DecideWithPolicy(Observe(branch, seat), PolicyID)
		if e != nil {
			return nil, e
		}
		branch, err = Apply(branch, seat, next)
		if err != nil {
			return nil, err
		}
		path = append(path, next)
	}
	return nil, nil
}
