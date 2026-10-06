package compatibility

import (
	"cardford/server/internal/coaching"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	heartsPolicy "cardford/server/internal/games/hearts/reasoning"
	spadesPolicy "cardford/server/internal/games/spades/reasoning"
	"cardford/server/internal/legacydecision"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

type policyCheckpoint struct {
	CommandIndex int `json:"commandIndex"`
	Decisions    []struct {
		Seat                          int    `json:"seat"`
		ActionID                      string `json:"actionId"`
		Observation, Analysis, Advice string
		Projections                   []string
	} `json:"decisions"`
	Waiting []struct {
		Seat   int
		Advice string
	} `json:"waiting"`
}
type policyCase struct {
	Config      json.RawMessage
	Deal        []string
	Commands    []json.RawMessage
	Checkpoints []policyCheckpoint
}
type referenceCorpus struct {
	SchemaVersion string
	Counts        struct{ Decisions, Forced, NoDecisionAdvice, Sessions, SessionCheckpoints, Prepared int }
	Sources       []struct{ Path, SHA256 string }
	Cases         []policyCase
	Samples       []struct {
		CaseID                        string
		CommandIndex, Seat            int
		Observation, Analysis, Advice json.RawMessage
		Projections                   []json.RawMessage
	}
	Sessions []registeredCase
}

func reference(t *testing.T) referenceCorpus {
	t.Helper()
	var corpus referenceCorpus
	readFixture(t, "qa/implementation/multi-game/m04b/reference-corpus.json", &corpus)
	if corpus.SchemaVersion != "1.0.0" || len(corpus.Cases) != 107 || len(corpus.Sessions) != 5 {
		t.Fatal("incomplete M04B independent corpus")
	}
	return corpus
}
func encoded(t *testing.T, v any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func policyAnalyze(obs legacydecision.Observation) (legacydecision.Analysis, error) {
	if obs.Mode == "hearts" {
		return heartsPolicy.Analyze(obs)
	}
	return spadesPolicy.Analyze(obs)
}
func requireHash(t *testing.T, label string, raw json.RawMessage, want string) {
	t.Helper()
	got := sha(t, raw)
	if got != want {
		t.Fatalf("%s mismatch: got %s want %s\nactual: %s", label, got, want, raw)
	}
}

func TestM04BOriginalSourceFingerprints(t *testing.T) {
	for _, source := range reference(t).Sources {
		raw, err := os.ReadFile(filepath.Join("../../..", source.Path))
		if err != nil {
			t.Fatal(err)
		}
		if contracts.SHA256(raw) != source.SHA256 {
			t.Fatalf("original oracle source changed: %s", source.Path)
		}
	}
}

// Full original analysis is compared, including facts, reasons, exceptions,
// ordered candidates and tactical trace; action-only parity is insufficient.
func TestM04BOriginalPoliciesAndAdvice(t *testing.T) {
	corpus := reference(t)
	decisions, forced, waiting := 0, 0, 0
	for _, saved := range corpus.Cases {
		var config struct{ ID, Mode string }
		if err := json.Unmarshal(saved.Config, &config); err != nil {
			t.Fatal(err)
		}
		ok := t.Run(config.Mode+"/"+config.ID, func(t *testing.T) {
			module, err := Registry().ResolveSnapshot(config.Mode)
			if err != nil {
				t.Fatal(err)
			}
			state, err := module.Start(saved.Config, saved.Deal)
			if err != nil {
				t.Fatal(err)
			}
			if len(saved.Checkpoints) != len(saved.Commands)+1 {
				t.Fatal("incomplete checkpoints")
			}
			for index, want := range saved.Checkpoints {
				if want.CommandIndex != index-1 {
					t.Fatal("out-of-order checkpoint")
				}
				if index > 0 {
					state, err = state.Apply(saved.Commands[index-1])
					if err != nil {
						t.Fatal(err)
					}
				}
				seen := map[int]bool{}
				for _, decision := range want.Decisions {
					seen[decision.Seat] = true
					projection, e := state.Project(decision.Seat)
					if e != nil {
						t.Fatal(e)
					}
					label := fmt.Sprintf("command %d actor %d", index-1, decision.Seat)
					requireHash(t, label+" observation", projection.Observation, decision.Observation)
					obs, e := legacydecision.ParseObservation(projection.Observation)
					if e != nil {
						t.Fatal(e)
					}
					analysis, e := policyAnalyze(obs)
					if e != nil {
						t.Fatal(e)
					}
					if legacydecision.ActionID(analysis.Action) != decision.ActionID {
						t.Fatalf("%s action mismatch", label)
					}
					requireHash(t, label+" analysis", encoded(t, analysis), decision.Analysis)
					advice, e := coaching.Explain(obs, &analysis)
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, label+" advice", encoded(t, advice), decision.Advice)
					implicit, e := coaching.Explain(obs, nil)
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, label+" implicit shared analysis", encoded(t, implicit), decision.Advice)
					if len(decision.Projections) != 3 {
						t.Fatal("missing help levels")
					}
					for level, expected := range decision.Projections {
						projected, e := coaching.ProjectAdvice(advice, level+1, "original-decision")
						if e != nil {
							t.Fatal(e)
						}
						raw := encoded(t, projected)
						requireHash(t, label+fmt.Sprintf(" help %d", level+1), raw, expected)
						if e := contracts.Validate("AdviceView", raw); e != nil {
							t.Fatal(e)
						}
					}
					decisions++
					if analysis.Provenance == "forced" {
						forced++
					}
				}
				for _, expect := range want.Waiting {
					if seen[expect.Seat] {
						t.Fatal("duplicate eligible/waiting seat")
					}
					seen[expect.Seat] = true
					p, e := state.Project(expect.Seat)
					if e != nil {
						t.Fatal(e)
					}
					obs, e := legacydecision.ParseObservation(p.Observation)
					if e != nil {
						t.Fatal(e)
					}
					if len(obs.LegalActions) != 0 {
						t.Fatal("unexpected waiting legal action")
					}
					advice, e := coaching.Explain(obs, nil)
					if e != nil {
						t.Fatal(e)
					}
					requireHash(t, fmt.Sprintf("command %d waiting %d", index-1, expect.Seat), encoded(t, advice), expect.Advice)
					waiting++
				}
				if len(seen) != 4 {
					t.Fatal("missing actor coverage")
				}
			}
		})
		if !ok {
			return
		}
	}
	if decisions != corpus.Counts.Decisions || forced != corpus.Counts.Forced || waiting != corpus.Counts.NoDecisionAdvice {
		t.Fatalf("coverage differs: decisions=%d forced=%d waiting=%d", decisions, forced, waiting)
	}
	t.Logf("%d exact analyses/advice, %d forced; %d waiting envelopes; all three help levels", decisions, forced, waiting)
}

func TestM04BOriginalDiagnosticSamples(t *testing.T) {
	for _, sample := range reference(t).Samples {
		t.Run(fmt.Sprintf("%s/%d/%d", sample.CaseID, sample.CommandIndex, sample.Seat), func(t *testing.T) {
			obs, err := legacydecision.ParseObservation(sample.Observation)
			if err != nil {
				t.Fatal(err)
			}
			analysis, err := policyAnalyze(obs)
			if err != nil {
				t.Fatal(err)
			}
			requireHash(t, "full sample analysis", encoded(t, analysis), sha(t, sample.Analysis))
			advice, err := coaching.Explain(obs, &analysis)
			if err != nil {
				t.Fatal(err)
			}
			requireHash(t, "full sample advice", encoded(t, advice), sha(t, sample.Advice))
		})
	}
}

// Keep the imported kernel type checked here while the policy corpus replays
// through immutable native snapshots, rather than the legacy byte facade.
var _ gamekernel.SnapshotModule = gamekernel.SnapshotFuncs{}
