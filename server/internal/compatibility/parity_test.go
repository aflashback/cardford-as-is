package compatibility

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type savedCase struct {
	Config   json.RawMessage   `json:"config"`
	Deal     []string          `json:"deal"`
	Commands []json.RawMessage `json:"commands"`
}
type checkpoint struct {
	CommandIndex                             int    `json:"commandIndex"`
	StateSHA256                              string `json:"stateSha256"`
	Observations, Legal, CandidateIDs, Views []string
}

func readFixture(t *testing.T, path string, out any) {
	t.Helper()
	b, e := os.ReadFile(filepath.Join("../../..", path))
	if e != nil {
		t.Fatal(e)
	}
	if e = json.Unmarshal(b, out); e != nil {
		t.Fatal(e)
	}
}
func sha(t *testing.T, v json.RawMessage) string {
	t.Helper()
	b, e := contracts.UTF16Canonical(v)
	if e != nil {
		t.Fatal(e)
	}
	return contracts.SHA256(b)
}
func TestOriginalCorpus(t *testing.T) {
	var original struct{ Cases []savedCase }
	readFixture(t, "web/server/tests/fixtures/legacy-module-document.json", &original)
	var expected struct {
		Cases []struct {
			Mode        string
			Checkpoints []checkpoint
		}
		HeartsScoring []struct {
			Label   string
			History json.RawMessage
			Points  [4]int
		}
	}
	readFixture(t, "qa/implementation/multi-game/m02a/corpus/original-expectations.json", &expected)
	r := Registry()
	for i, saved := range original.Cases {
		oracle := expected.Cases[i]
		t.Run(oracle.Mode, func(t *testing.T) {
			commands := saved.Commands
			if oracle.Mode == "hearts" {
				commands = commands[:1]
			}
			ex, e := gamekernel.NewExecutor(r, gamekernel.DefaultLimits())
			if e != nil {
				t.Fatal(e)
			}
			m, _ := r.Resolve(oracle.Mode)
			checked := 0
			result, e := ex.Replay(context.Background(), gamekernel.ReplayRequest{Mode: oracle.Mode, Config: saved.Config, Deal: saved.Deal, Commands: commands, Seats: []int{0, 1, 2, 3}}, func(f gamekernel.Frame) error {
				want := oracle.Checkpoints[f.CommandIndex+1]
				if got := sha(t, f.State); got != want.StateSHA256 {
					t.Fatalf("checkpoint %d state %s want %s", f.CommandIndex, got, want.StateSHA256)
				}
				for seat := 0; seat < 4; seat++ {
					legal, e := m.Legal(f.State, seat)
					if e != nil {
						t.Fatal(e)
					}
					ids, _ := json.Marshal(f.CandidateIDs[seat])
					for label, pair := range map[string][2]string{"observation": {sha(t, f.Observations[seat]), want.Observations[seat]}, "legal": {sha(t, legal), want.Legal[seat]}, "candidates": {sha(t, ids), want.CandidateIDs[seat]}, "view": {sha(t, f.Views[seat]), want.Views[seat]}} {
						if pair[0] != pair[1] {
							t.Fatalf("checkpoint %d seat %d %s mismatch", f.CommandIndex, seat, label)
						}
					}
					if e = contracts.Validate("GameView", f.Views[seat]); e != nil {
						t.Fatal(e)
					}
				}
				checked++
				return nil
			})
			if e != nil {
				t.Fatal(e)
			}
			if result.Transitions != len(commands) || checked != len(commands)+1 {
				t.Fatal("lost checkpoint")
			}
			t.Logf("%d exact checkpoints, all four actors", checked)
		})
	}
	for _, v := range expected.HeartsScoring {
		t.Run(v.Label, func(t *testing.T) {
			p, e := hearts.Score(v.History)
			if e != nil || p != v.Points {
				t.Fatalf("points=%v error=%v", p, e)
			}
		})
	}
}
