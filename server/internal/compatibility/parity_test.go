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

// Longer complete-match corpora are replayed in bounded chunks, reopening the
// exact prior checkpoint. The runtime's per-request work limits stay unchanged.
func replayCheckpoints(t *testing.T, mode string, saved savedCase, expected []checkpoint) {
	t.Helper()
	if len(saved.Commands) == 0 || len(expected) != len(saved.Commands)+1 {
		t.Fatal("fixture has missing or extra checkpoints")
	}
	for index, c := range expected {
		if c.CommandIndex != index-1 || len(c.Observations) != 4 || len(c.Legal) != 4 || len(c.CandidateIDs) != 4 || len(c.Views) != 4 {
			t.Fatalf("checkpoint %d has missing actor expectations", index-1)
		}
	}
	r := Registry()
	ex, err := gamekernel.NewExecutor(r, gamekernel.DefaultLimits())
	if err != nil {
		t.Fatal(err)
	}
	m, err := r.Resolve(mode)
	if err != nil {
		t.Fatal(err)
	}
	var initial json.RawMessage
	checked := 0
	for offset := 0; offset < len(saved.Commands); {
		end := min(offset+64, len(saved.Commands))
		request := gamekernel.NativeReplayRequest{ReplayRequest: gamekernel.ReplayRequest{Mode: mode, Commands: saved.Commands[offset:end], Seats: []int{0, 1, 2, 3}}, InitialState: initial}
		if offset == 0 {
			request.Config, request.Deal = saved.Config, saved.Deal
		}
		result, err := ex.ReplayNative(context.Background(), request, func(frame gamekernel.EncodedFrame) error {
			index := offset + frame.CommandIndex
			want := expected[index+1]
			if want.CommandIndex != index || sha(t, frame.State) != want.StateSHA256 {
				t.Fatalf("checkpoint %d state mismatch", index)
			}
			for seat := 0; seat < 4; seat++ {
				legal, err := m.Legal(frame.State, seat)
				if err != nil {
					t.Fatal(err)
				}
				ids, err := json.Marshal(frame.CandidateIDs[seat])
				if err != nil {
					t.Fatal(err)
				}
				for label, pair := range map[string][2]string{"observation": {sha(t, frame.Observations[seat]), want.Observations[seat]}, "legal": {sha(t, legal), want.Legal[seat]}, "candidates": {sha(t, ids), want.CandidateIDs[seat]}, "view": {sha(t, frame.Views[seat]), want.Views[seat]}} {
					if pair[0] != pair[1] {
						t.Fatalf("checkpoint %d seat %d %s mismatch", index, seat, label)
					}
				}
				if err = contracts.Validate("GameView", frame.Views[seat]); err != nil {
					t.Fatal(err)
				}
			}
			if offset == 0 || frame.CommandIndex >= 0 {
				checked++
			}
			return nil
		})
		if err != nil {
			t.Fatalf("chunk starting command %d: %v", offset, err)
		}
		if result.Transitions != end-offset {
			t.Fatal("lost transition")
		}
		initial = result.Final.State
		offset = end
	}
	if checked != len(saved.Commands)+1 {
		t.Fatal("lost checkpoint")
	}
	t.Logf("%d exact checkpoints, all four actors; bounded reopen every 64 commands", checked)
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
	if len(original.Cases) == 0 || len(original.Cases) != len(expected.Cases) {
		t.Fatal("original corpus and oracle cases differ")
	}
	for i, saved := range original.Cases {
		oracle := expected.Cases[i]
		t.Run(oracle.Mode, func(t *testing.T) {
			replayCheckpoints(t, oracle.Mode, saved, oracle.Checkpoints)
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

func TestM04HeartsCorpus(t *testing.T) {
	var corpus struct {
		SchemaVersion   string            `json:"schemaVersion"`
		PrivateTestOnly bool              `json:"privateTestOnly"`
		Sources         map[string]string `json:"sources"`
		Cases           []struct {
			savedCase
			ID           string          `json:"id"`
			InitialState json.RawMessage `json:"initialState"`
			Checkpoints  []checkpoint    `json:"checkpoints"`
			Rounds       []struct {
				PassDirection string `json:"passDirection"`
				Phase         string `json:"phase"`
				Scores        [4]int `json:"scores"`
				Winner        *int   `json:"winner"`
			} `json:"rounds"`
		} `json:"cases"`
	}
	readFixture(t, "qa/implementation/multi-game/m04/hearts-parity-corpus.json", &corpus)
	if corpus.SchemaVersion != "m04-hearts-parity-1" || !corpus.PrivateTestOnly || len(corpus.Cases) != 2 || len(corpus.Sources) == 0 {
		t.Fatal("unexpected frozen corpus identity")
	}
	for path, expected := range corpus.Sources {
		raw, err := os.ReadFile(filepath.Join("../../..", path))
		if err != nil || contracts.SHA256(raw) != expected {
			t.Fatalf("original TypeScript oracle source drift: %s (%v)", path, err)
		}
	}
	for _, saved := range corpus.Cases {
		t.Run(saved.ID, func(t *testing.T) {
			if len(saved.Checkpoints) == 0 || sha(t, saved.InitialState) != saved.Checkpoints[0].StateSHA256 {
				t.Fatal("original initial state differs from its frozen checkpoint")
			}
			replayCheckpoints(t, "hearts", saved.savedCase, saved.Checkpoints)
		})
	}
	moon := corpus.Cases[1]
	if moon.ID != "m04-hearts-moon-tie-then-match" || len(moon.Rounds) != 5 {
		t.Fatal("missing reachable match boundary corpus")
	}
	for index, direction := range []string{"left", "right", "across", "hold", "left"} {
		if moon.Rounds[index].PassDirection != direction {
			t.Fatal("pass-cycle coverage drift")
		}
	}
	if moon.Rounds[3].Phase != "hand-end" || moon.Rounds[3].Winner != nil || moon.Rounds[3].Scores != [4]int{52, 52, 104, 104} || moon.Rounds[4].Phase != "match-end" || moon.Rounds[4].Winner == nil || *moon.Rounds[4].Winner != 0 || moon.Rounds[4].Scores != [4]int{52, 78, 130, 130} {
		t.Fatal("tied/unique minimum at the match boundary is not represented")
	}
}
