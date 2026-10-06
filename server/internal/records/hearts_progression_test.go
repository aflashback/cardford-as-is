package records

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"

	"cardford/server/internal/gamekernel"
)

type heartsRecordCheckpoint struct {
	CommandIndex                             int    `json:"commandIndex"`
	StateSHA256                              string `json:"stateSha256"`
	Observations, Legal, CandidateIDs, Views []string
}

type heartsRecordCorpus struct {
	Config      json.RawMessage
	Deal        []string
	Commands    []json.RawMessage
	Checkpoints []heartsRecordCheckpoint
}

// These expectations predate the Go Hearts implementation. Do not regenerate
// them from the records codec or the game under test.
func heartsRecordsCorpus(t *testing.T) heartsRecordCorpus {
	t.Helper()
	var original struct {
		Cases []struct {
			Config   json.RawMessage   `json:"config"`
			Deal     []string          `json:"deal"`
			Commands []json.RawMessage `json:"commands"`
		}
	}
	var oracle struct {
		Cases []struct {
			Mode        string
			Checkpoints []heartsRecordCheckpoint
		}
	}
	for path, target := range map[string]any{
		"../../../web/server/tests/fixtures/legacy-module-document.json":               &original,
		"../../../qa/implementation/multi-game/m02a/corpus/original-expectations.json": &oracle,
	} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if err = json.Unmarshal(raw, target); err != nil {
			t.Fatal(err)
		}
	}
	var found heartsRecordCorpus
	for _, f := range original.Cases {
		var header struct{ Mode string }
		if err := json.Unmarshal(f.Config, &header); err != nil {
			t.Fatal(err)
		}
		if header.Mode == "hearts" {
			found.Config, found.Deal, found.Commands = f.Config, f.Deal, f.Commands
		}
	}
	for _, f := range oracle.Cases {
		if f.Mode == "hearts" {
			found.Checkpoints = f.Checkpoints
		}
	}
	if len(found.Commands) == 0 || len(found.Checkpoints) != len(found.Commands)+1 {
		t.Fatal("missing independent original Hearts checkpoints")
	}
	return found
}

func heartsRecordsStart(t *testing.T, c *DocumentCodec, f heartsRecordCorpus, owner string) (Document, ReplayAnchor, []EventRecord, gamekernel.Snapshot) {
	t.Helper()
	var config struct{ ID string }
	if err := json.Unmarshal(f.Config, &config); err != nil {
		t.Fatal(err)
	}
	d, anchor, events, err := c.Start(PracticeMetadata("hearts", config.ID, owner, codecPolicy()), f.Config, f.Deal)
	if err != nil {
		t.Fatal(err)
	}
	s, disposition, err := c.Open(d, events)
	if err != nil || !disposition.Playable {
		t.Fatalf("open: %+v %v", disposition, err)
	}
	return d, anchor, events, s
}

func heartsRecordAssertCheckpoint(t *testing.T, s gamekernel.Snapshot, want heartsRecordCheckpoint) {
	t.Helper()
	raw, err := s.Export()
	if err != nil {
		t.Fatal(err)
	}
	if got, err := JSONDigest(raw); err != nil || got != want.StateSHA256 {
		t.Fatalf("original Hearts checkpoint %d state differs: %v", want.CommandIndex, err)
	}
	for actor := 0; actor < 4; actor++ {
		p, err := s.Project(actor)
		if err != nil {
			t.Fatal(err)
		}
		var observation struct {
			Legal json.RawMessage `json:"legalActions"`
		}
		if err = json.Unmarshal(p.Observation, &observation); err != nil {
			t.Fatal(err)
		}
		for label, check := range map[string]struct {
			raw    []byte
			digest string
		}{
			"observation":   {p.Observation, want.Observations[actor]},
			"view":          {p.View, want.Views[actor]},
			"legal":         {observation.Legal, want.Legal[actor]},
			"candidate IDs": {codecJSON(t, p.CandidateIDs), want.CandidateIDs[actor]},
		} {
			if got, err := JSONDigest(check.raw); err != nil || got != check.digest {
				t.Fatalf("original checkpoint %d actor %d %s differs: %v", want.CommandIndex, actor, label, err)
			}
		}
	}
}

func TestRecordHeartsProgressionCompactReopenAndReplay(t *testing.T) {
	f := heartsRecordsCorpus(t)
	c := codecFixture(t, "hearts")
	d, anchor, events, snapshot := heartsRecordsStart(t, c, f, "hearts-record-owner")
	heartsRecordAssertCheckpoint(t, snapshot, f.Checkpoints[0])
	commands := make([]CommandRecord, 0, len(f.Commands))
	hand, collections, draws := 1, 0, 0
	for i, raw := range f.Commands {
		prefix := codecJSON(t, events)
		next, delta, err := c.Advance(d, snapshot, raw)
		if err != nil {
			t.Fatalf("command %d: %v", i, err)
		}
		if !bytes.Equal(prefix, codecJSON(t, events)) {
			t.Fatal("advance rewrote an existing archive event")
		}
		for j, event := range delta {
			if event.Sequence != int64(len(events)+j+1) || event.Revision != d.Revision+1 {
				t.Fatal("append events lost sequence or accepted revision")
			}
		}
		events = append(events, delta...)
		d = next
		var hot struct {
			Events     []json.RawMessage
			HandNumber int
			Phase      string
		}
		if err = json.Unmarshal(d.Checkpoint.State, &hot); err != nil {
			t.Fatal(err)
		}
		if len(hot.Events) != 0 || d.Checkpoint.EventCount != int64(len(events)) {
			t.Fatal("compact state duplicates or loses event archive")
		}
		var command struct {
			Type string
			Deal []string
		}
		if err = json.Unmarshal(raw, &command); err != nil {
			t.Fatal(err)
		}
		if command.Type == "collect-trick" {
			collections++
		}
		if command.Type == "next-hand" {
			hand++
			draws++
			if len(command.Deal) != 52 {
				t.Fatal("next hand omitted its actual chance draw")
			}
		}
		if hot.HandNumber != hand {
			t.Fatal("hand changed outside the accepted chance boundary")
		}
		snapshot, _, err = c.Open(d, events)
		if err != nil {
			t.Fatalf("reopen command %d: %v", i, err)
		}
		for _, unit := range []func() (string, error){func() (string, error) { return c.CurrentUnitID(d, snapshot) }, func() (string, error) { return c.UnitID(d) }} {
			got, err := unit()
			if err != nil || got != fmt.Sprintf("hand-%d", hand) {
				t.Fatalf("unit at command %d: %q %v", i, got, err)
			}
		}
		window, err := c.WindowID(d)
		if err != nil || window != fmt.Sprintf("v1:%d:%s", i+1, hot.Phase) {
			t.Fatalf("window at command %d: %q %v", i, window, err)
		}
		heartsRecordAssertCheckpoint(t, snapshot, f.Checkpoints[i+1])
		digest, err := CommandDigest(d.Metadata.GameID, d.Revision, raw)
		if err != nil {
			t.Fatal(err)
		}
		commands = append(commands, CommandRecord{RecordVersion: RecordVersion, GameID: d.Metadata.GameID, Revision: d.Revision, CommandID: fmt.Sprintf("hearts-%d", i), Digest: digest, Command: raw})
	}
	if hand != 4 || draws != 3 || collections != 52 {
		t.Fatalf("incomplete four-hand corpus: hands=%d draws=%d collections=%d", hand, draws, collections)
	}
	visited := 0
	replayed, final, archive, err := c.ReplayVisit(d.Metadata, anchor, commands, func(d Document, s gamekernel.Snapshot) error {
		heartsRecordAssertCheckpoint(t, s, f.Checkpoints[d.Revision])
		visited++
		return nil
	})
	if err != nil || visited != len(commands) {
		t.Fatalf("replay lost accepted boundary: %d %v", visited, err)
	}
	if !equalCheckpoint(replayed.Checkpoint, d.Checkpoint) || !reflect.DeepEqual(events, archive) {
		t.Fatal("replay changed compact checkpoint or event archive")
	}
	heartsRecordAssertCheckpoint(t, final, f.Checkpoints[len(commands)])
	if _, _, err = c.Open(d, events[:len(events)-1]); err == nil {
		t.Fatal("missing final event accepted")
	}
	corrupt := append([]EventRecord{}, events...)
	corrupt[0].Payload = codecMutate(t, corrupt[0].Payload, func(v map[string]any) { v["message"] = "rewritten prior hand" })
	if _, _, err = c.Open(d, corrupt); err == nil {
		t.Fatal("changed prior-hand archive accepted")
	}
}

func heartsRecordDecision(t *testing.T, c *DocumentCodec, d Document, s gamekernel.Snapshot, actor int, selected string) DecisionRecord {
	t.Helper()
	_, digest, window, err := c.PermittedInput(d, s, actor)
	if err != nil {
		t.Fatal(err)
	}
	unit, err := c.CurrentUnitID(d, s)
	if err != nil {
		t.Fatal(err)
	}
	purpose := "bot-action"
	if actor == 0 {
		purpose = "human-analysis"
	}
	analysis := codecJSON(t, map[string]any{"publicSchemaVersion": "2.0.0", "gameId": "hearts", "variantId": "solo", "origin": "demo", "selectedCandidateId": selected, "objective": map[string]any{"id": "fixture", "version": "1", "metric": "penalty-points", "direction": "lower"}, "horizon": map[string]any{"id": "hand", "version": "1", "scope": "hand"}, "facts": []any{}, "estimates": []any{}, "scenarios": []any{}, "assumptions": []string{"records fixture; not a policy"}})
	id := fmt.Sprintf("hearts-decision-%d-%d", d.Revision, actor)
	advice := map[string]any{"focus": "Recorded fixture", "notice": "Original actor knowledge", "reason": "Saved original bytes", "suggestion": "Fixture selection", "source": "code", "requestedLevel": 1, "decisionId": id}
	if strings.HasPrefix(selected, "play:") {
		advice["card"] = strings.TrimPrefix(selected, "play:")
	} else {
		advice["pass"] = strings.Split(strings.TrimPrefix(selected, "pass:"), ",")
	}
	return DecisionRecord{RecordVersion: RecordVersion, ID: id, OwnerID: d.Metadata.OwnerID, GameID: d.Metadata.GameID, Revision: d.Revision, Actor: actor, WindowID: window, Purpose: purpose, PacketVersion: "1.0.0", InputDigest: digest, Policy: d.Metadata.Policy, SelectedCandidateID: selected, AnalysisSchema: "RegisteredAnalysis", Analysis: append([]byte(" \n"), analysis...), AdviceSchema: "AdviceView", Advice: append(codecJSON(t, advice), '\n'), Access: AccessAdmission{OwnerID: d.Metadata.OwnerID, Generation: 2, ControlRevision: 1, GrantID: "hearts-grant", UnitID: unit}, ReceiptID: id + "-receipt", AttemptID: id + "-attempt", AttemptFence: 1}
}

func TestRecordHeartsDecisionAndRejectedCommandBindings(t *testing.T) {
	f := heartsRecordsCorpus(t)
	c := codecFixture(t, "hearts")
	d, _, events, s := heartsRecordsStart(t, c, f, "hearts-record-owner")
	assertRejected := func(command []byte) {
		t.Helper()
		before, _ := s.Export()
		document := codecJSON(t, d)
		archive := codecJSON(t, events)
		if _, _, err := c.Advance(d, s, command); err == nil {
			t.Fatalf("accepted rejected command %s", command)
		}
		after, _ := s.Export()
		if !bytes.Equal(before, after) || !bytes.Equal(document, codecJSON(t, d)) || !bytes.Equal(archive, codecJSON(t, events)) {
			t.Fatal("rejected command changed source revision/state/history")
		}
	}
	assertRejected([]byte(`{"type":"collect-trick"}`))
	assertRejected(codecJSON(t, map[string]any{"type": "next-hand", "deal": f.Deal}))
	assertRejected([]byte(`{"type":"action","action":{"kind":"pass-bundle","passes":[[],[],[],[]]}}`))
	var bundle struct{ Action struct{ Passes [4][]string } }
	if err := json.Unmarshal(f.Commands[0], &bundle); err != nil {
		t.Fatal(err)
	}
	for actor := 0; actor < 4; actor++ {
		selected := "pass:" + strings.Join(bundle.Action.Passes[actor], ",")
		decision := heartsRecordDecision(t, c, d, s, actor, selected)
		if err := c.ValidateDecision(d, s, decision); err != nil {
			t.Fatal(err)
		}
		if err := c.ValidateDecisionCommand(decision, f.Commands[0]); err != nil {
			t.Fatal(err)
		}
		if actor > 0 {
			projection, err := s.Project(actor)
			if err != nil {
				t.Fatal(err)
			}
			for _, candidate := range projection.CandidateIDs {
				if candidate != selected {
					other := bundle.Action.Passes
					other[actor] = strings.Split(strings.TrimPrefix(candidate, "pass:"), ",")
					if c.ValidateDecisionCommand(decision, codecJSON(t, map[string]any{"type": "action", "action": map[string]any{"kind": "pass-bundle", "passes": other}})) == nil {
						t.Fatal("bot sealed selection changed")
					}
					break
				}
			}
		}
	}
	var err error
	for i, command := range f.Commands {
		var action struct {
			Type   string
			Action struct {
				Kind string
				Seat int
				Card string
			}
		}
		if err = json.Unmarshal(command, &action); err != nil {
			t.Fatal(err)
		}
		if action.Action.Kind == "play" {
			decision := heartsRecordDecision(t, c, d, s, action.Action.Seat, "play:"+action.Action.Card)
			if err = c.ValidateDecision(d, s, decision); err != nil {
				t.Fatalf("decision at command %d: %v", i, err)
			}
			if err = c.ValidateDecisionCommand(decision, command); err != nil {
				t.Fatal(err)
			}
			wrongActor := codecMutate(t, command, func(v map[string]any) { v["action"].(map[string]any)["seat"] = (action.Action.Seat + 1) % 4 })
			if c.ValidateDecisionCommand(decision, wrongActor) == nil {
				t.Fatal("decision attached to another actor's play")
			}
			assertRejected(wrongActor)
			if action.Action.Seat != 0 {
				wrongCard := codecMutate(t, command, func(v map[string]any) {
					v["action"].(map[string]any)["card"] = "H2"
					if action.Action.Card == "H2" {
						v["action"].(map[string]any)["card"] = "H3"
					}
				})
				if c.ValidateDecisionCommand(decision, wrongCard) == nil {
					t.Fatal("bot selected card changed")
				}
				if c.ValidateDecisionCommand(decision, []byte(`{"type":"collect-trick"}`)) == nil {
					t.Fatal("decision attached to collection")
				}
				return
			}
		}
		next, delta, err := c.Advance(d, s, command)
		if err != nil {
			t.Fatal(err)
		}
		d, events = next, append(events, delta...)
		s, _, err = c.Open(d, events)
		if err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("fixture contains no bot play decision")
}

func TestRecordHeartsTerminalHistoryRemainsOriginalAndReadOnly(t *testing.T) {
	raw, err := os.ReadFile("../../../qa/implementation/multi-game/m04/hearts-parity-corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []struct {
			ID          string
			Config      json.RawMessage
			Deal        []string
			Commands    []json.RawMessage
			Checkpoints []heartsRecordCheckpoint
		}
	}
	if err = json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range corpus.Cases {
		if fixture.ID != "m04-hearts-moon-tie-then-match" {
			continue
		}
		f := heartsRecordCorpus{Config: fixture.Config, Deal: fixture.Deal, Commands: fixture.Commands, Checkpoints: fixture.Checkpoints}
		c := codecFixture(t, "hearts")
		d, anchor, _, _ := heartsRecordsStart(t, c, f, "hearts-terminal-owner")
		commands := make([]CommandRecord, len(f.Commands))
		for i, command := range f.Commands {
			digest, err := CommandDigest(d.Metadata.GameID, int64(i+1), command)
			if err != nil {
				t.Fatal(err)
			}
			commands[i] = CommandRecord{RecordVersion: RecordVersion, GameID: d.Metadata.GameID, Revision: int64(i + 1), CommandID: fmt.Sprintf("terminal-%d", i), Digest: digest, Command: command}
		}
		// A supported reader with no installed execution policy must retain the
		// original complete match rather than repinning or truncating its history.
		reader := NewDocumentCodec()
		final, _, archive, err := reader.Replay(d.Metadata, anchor, commands)
		if err != nil {
			t.Fatal(err)
		}
		restored, disposition, err := reader.Open(final, archive)
		if err != nil || disposition.Playable || disposition.Reason != "unsupported-policy-pin" {
			t.Fatalf("terminal historical read: %+v %v", disposition, err)
		}
		heartsRecordAssertCheckpoint(t, restored, f.Checkpoints[len(f.Commands)])
		unit, err := reader.CurrentUnitID(final, restored)
		if err != nil || unit != "hand-5" {
			t.Fatalf("terminal access unit=%q error=%v", unit, err)
		}
		for actor := 0; actor < 4; actor++ {
			projection, err := restored.Project(actor)
			if err != nil || len(projection.CandidateIDs) != 0 {
				t.Fatalf("terminal actor %d received actions: %v", actor, err)
			}
		}
		if _, _, err = reader.Advance(final, restored, codecJSON(t, map[string]any{"type": "next-hand", "deal": f.Deal})); err == nil {
			t.Fatal("read-only terminal history resumed")
		}
		playable, _, err := c.Open(final, archive)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err = c.Advance(final, playable, codecJSON(t, map[string]any{"type": "next-hand", "deal": f.Deal})); err == nil {
			t.Fatal("terminal match accepted another hand under installed policy")
		}
		return
	}
	t.Fatal("missing original moon/tied-threshold/terminal fixture")
}

func TestRecordCompactEventPlaceholderRequiresArray(t *testing.T) {
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			c := codecFixture(t, mode)
			d, _, events, _ := codecStart(t, c, mode)
			d.Checkpoint.State = codecMutate(t, d.Checkpoint.State, func(v map[string]any) { v["events"] = nil })
			if err := c.ValidateDocument(d); err == nil {
				t.Error("compact events:null accepted instead of required empty array")
			}
			if _, _, err := c.Open(d, events); err == nil {
				t.Error("archive import silently normalized malformed compact events:null")
			}
		})
	}
}
