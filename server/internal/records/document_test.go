package records

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/hearts"
	"cardford/server/internal/games/spades"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
)

func codecPolicy() PolicyPin {
	return PolicyPin{ID: "m03-fixture-policy", Version: "1.0.0", BudgetVersion: "fixed-fixture-1", Components: []ComponentVersion{{ID: "fixture", Version: "1.0.0"}}}
}
func codecFixture(t *testing.T, modes ...string) *DocumentCodec {
	t.Helper()
	c := NewDocumentCodec()
	for _, mode := range modes {
		if err := c.RegisterPolicy(PolicyRegistration{Module: OriginalPin(mode), Policy: codecPolicy(), PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}); err != nil {
			t.Fatal(err)
		}
	}
	return c
}
func codecJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func codecDeck() []string {
	d := []string{}
	for _, suit := range []string{"C", "D", "H", "S"} {
		for _, rank := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			d = append(d, suit+rank)
		}
	}
	return d
}
func codecStart(t *testing.T, c *DocumentCodec, mode string) (Document, ReplayAnchor, []EventRecord, gamekernel.Snapshot) {
	t.Helper()
	m := PracticeMetadata(mode, "codec-game", "owner", codecPolicy())
	d, a, e, err := c.Start(m, codecJSON(t, map[string]any{"id": m.GameID, "mode": mode, "dealer": 0}), codecDeck())
	if err != nil {
		t.Fatal(err)
	}
	s, status, err := c.Open(d, e)
	if err != nil || !status.Playable {
		t.Fatalf("opening: %+v %v", status, err)
	}
	return d, a, e, s
}
func codecMutate(t *testing.T, raw []byte, f func(map[string]any)) []byte {
	t.Helper()
	var v map[string]any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	f(v)
	return codecJSON(t, v)
}

func TestRecordClosedUntrustedEnvelope(t *testing.T) {
	c := codecFixture(t, "spades-partners")
	d, _, _, _ := codecStart(t, c, "spades-partners")
	raw := codecJSON(t, d)
	cases := map[string][]byte{
		"unknown":         codecMutate(t, raw, func(v map[string]any) { v["hidden"] = true }),
		"missing":         codecMutate(t, raw, func(v map[string]any) { delete(v, "revision") }),
		"null":            codecMutate(t, raw, func(v map[string]any) { v["revision"] = nil }),
		"fraction":        codecMutate(t, raw, func(v map[string]any) { v["revision"] = 0.5 }),
		"unsafe":          codecMutate(t, raw, func(v map[string]any) { v["revision"] = 9007199254740992.0 }),
		"casing":          bytes.Replace(raw, []byte(`"revision"`), []byte(`"Revision"`), 1),
		"duplicate":       append([]byte(`{"revision":0,`), raw[1:]...),
		"nested":          codecMutate(t, raw, func(v map[string]any) { v["metadata"].(map[string]any)["secret"] = true }),
		"unknown-version": codecMutate(t, raw, func(v map[string]any) { v["recordVersion"] = "future" }),
		"bad-unicode":     bytes.Replace(raw, []byte(`"owner"`), []byte(`"\ud800"`), 1),
	}
	for name, b := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := c.DecodeDocument(b); err == nil {
				t.Fatal("unchecked private document accepted")
			}
		})
	}
	if _, err := c.DecodeDocument(raw); err != nil {
		t.Fatal(err)
	}
}
func TestRecordArchiveAndInvalidStateFailClosed(t *testing.T) {
	c := codecFixture(t, "spades-partners")
	d, _, events, s := codecStart(t, c, "spades-partners")
	before, _ := s.Export()
	if _, _, err := c.Open(d, nil); err == nil {
		t.Fatal("missing archive accepted")
	}
	bad := append([]EventRecord{}, events...)
	bad[0].Payload = codecMutate(t, bad[0].Payload, func(v map[string]any) { v["message"] = "changed original" })
	if _, _, err := c.Open(d, bad); err == nil {
		t.Fatal("changed event archive accepted")
	}
	for name, change := range map[string]func(map[string]any){"duplicate-card": func(v map[string]any) { h := v["hands"].([]any); h[0].([]any)[0] = h[1].([]any)[0] }, "turn": func(v map[string]any) { v["turn"] = 2.0 }, "hot-history": func(v map[string]any) {
		v["events"] = []any{map[string]any{"id": 1, "type": "hand-started", "message": "bad"}}
	}, "false-score": func(v map[string]any) { v["scores"].([]any)[0] = 500.0 }} {
		t.Run(name, func(t *testing.T) {
			badDoc := d
			badDoc.Checkpoint.State = codecMutate(t, d.Checkpoint.State, change)
			if _, _, err := c.Open(badDoc, events); err == nil {
				t.Fatal("corrupt state accepted")
			}
		})
	}
	after, _ := s.Export()
	if !bytes.Equal(before, after) {
		t.Fatal("failed reads mutated original snapshot")
	}
	other := d
	other.Metadata.OwnerID = "another-owner"
	if _, _, err := c.Advance(other, s, []byte(`{"type":"collect-trick"}`)); err == nil {
		t.Fatal("snapshot accepted with changed metadata")
	}
}
func TestRecordExactPolicyModuleAndReadOnlyReaders(t *testing.T) {
	c := codecFixture(t, "spades-partners")
	d, _, events, s := codecStart(t, c, "spades-partners")
	for _, change := range []func(*SessionMetadata){func(m *SessionMetadata) { m.Policy.Version = "future" }, func(m *SessionMetadata) { m.Policy.BudgetVersion = "future" }, func(m *SessionMetadata) {
		m.Policy.Components = append([]ComponentVersion{}, m.Policy.Components...)
		m.Policy.Components[0].Version = "future"
	}} {
		bad := d
		change(&bad.Metadata)
		opened, status, err := c.Open(bad, events)
		if err != nil || status.Playable || status.Reason != "unsupported-policy-pin" {
			t.Fatalf("unsupported pin read: %+v %v", status, err)
		}
		if _, _, err = c.Advance(bad, opened, []byte(`{"type":"action","action":{"kind":"bid","seat":1,"bid":3}}`)); err == nil {
			t.Fatal("unavailable policy resumed")
		}
		if _, err = opened.Project(0); err != nil {
			t.Fatal(err)
		}
	}
	meta := PracticeMetadata("hearts", "codec-game", "owner", codecPolicy())
	if _, _, _, err := c.Start(meta, []byte(`{"id":"codec-game","mode":"hearts","dealer":0}`), codecDeck()); err == nil {
		t.Fatal("Spades policy globally authorized Hearts")
	}
	for _, p := range []PolicyRegistration{{Module: OriginalPin("spades-solo"), Policy: codecPolicy(), PacketVersion: "future", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}, {Module: OriginalPin("spades-solo"), Policy: PolicyPin{}, PacketVersion: "1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView"}} {
		if err := c.RegisterPolicy(p); err == nil {
			t.Fatal("invalid policy registration accepted")
		}
	}
	unknown := d
	unknown.Metadata.Pin.ModuleVersion = "old-reader"
	if _, _, err := c.Open(unknown, events); err == nil {
		t.Fatal("unknown module projected without trusted reader")
	}
	err := c.RegisterHistoricalReader(HistoricalReader{Pin: unknown.Metadata.Pin, Mode: "spades-partners", Open: spades.OpenStored, ValidateHot: spades.ValidateStoredShape, ReplayStart: spades.Start})
	if err != nil {
		t.Fatal(err)
	}
	opened, status, err := c.Open(unknown, events)
	if err != nil || status.Playable || status.Reason != "historical-reader-only" {
		t.Fatalf("trusted historical read: %+v %v", status, err)
	}
	want, _ := s.Project(0)
	got, _ := opened.Project(0)
	if !bytes.Equal(want.Observation, got.Observation) {
		t.Fatal("historical reader changed original projection")
	}
}
func TestRecordOpeningAnchorBindsConfigChanceAndCheckpoint(t *testing.T) {
	c := codecFixture(t, "spades-partners")
	d, a, _, _ := codecStart(t, c, "spades-partners")
	if err := c.ValidateAnchor(d.Metadata, a); err != nil {
		t.Fatal(err)
	}
	mutations := []func(*ReplayAnchor){func(a *ReplayAnchor) {
		a.Config = bytes.Replace(a.Config, []byte(`"dealer":0`), []byte(`"dealer":1`), 1)
	}, func(a *ReplayAnchor) {
		a.OpeningChance = append([]string{}, a.OpeningChance...)
		a.OpeningChance[0], a.OpeningChance[1] = a.OpeningChance[1], a.OpeningChance[0]
	}, func(a *ReplayAnchor) { a.MetadataDigest = strings.Repeat("0", 64) }, func(a *ReplayAnchor) { a.Initial.EventDigest = strings.Repeat("0", 64) }}
	for _, mutate := range mutations {
		bad := a
		mutate(&bad)
		if err := c.ValidateAnchor(d.Metadata, bad); err == nil {
			t.Fatal("changed immutable anchor accepted")
		}
	}
	a.Config[0] = '['
	if d.Checkpoint.State[0] != '{' {
		t.Fatal("anchor aliases saved checkpoint")
	}
}
func codecDecision(t *testing.T, c *DocumentCodec, d Document, s gamekernel.Snapshot) DecisionRecord {
	t.Helper()
	_, digest, window, err := c.PermittedInput(d, s, 1)
	if err != nil {
		t.Fatal(err)
	}
	return DecisionRecord{RecordVersion: RecordVersion, ID: "decision", OwnerID: d.Metadata.OwnerID, GameID: d.Metadata.GameID, Revision: d.Revision, Actor: 1, WindowID: window, Purpose: "bot-action", PacketVersion: "1.0.0", InputDigest: digest, Policy: d.Metadata.Policy, SelectedCandidateID: "bid:3", AnalysisSchema: "RegisteredAnalysis", Analysis: []byte("{\n  \"publicSchemaVersion\":\"2.0.0\",\"gameId\":\"spades\",\"variantId\":\"partners\",\"origin\":\"demo\",\"selectedCandidateId\":\"bid:3\",\"objective\":{\"id\":\"test\",\"version\":\"1\",\"metric\":\"points\",\"direction\":\"higher\"},\"horizon\":{\"id\":\"hand\",\"version\":\"1\",\"scope\":\"hand\"},\"facts\":[],\"estimates\":[],\"scenarios\":[],\"assumptions\":[]\n}"), AdviceSchema: "AdviceView", Advice: []byte("{ \"focus\":\"fixture\", \"notice\":\"demo\", \"suggestion\":\"fixture\", \"source\":\"code\", \"requestedLevel\":1, \"reason\":\"original bytes\", \"bid\":3, \"decisionId\":\"decision\" }"), Access: AccessAdmission{OwnerID: d.Metadata.OwnerID, Generation: 2, ControlRevision: 3, GrantID: "grant", UnitID: "hand-1"}, ReceiptID: "receipt", AttemptID: "attempt", AttemptFence: 1}
}
func TestRecordDecisionBindingsAndOriginalBytes(t *testing.T) {
	c := codecFixture(t, "spades-partners")
	d, _, _, s := codecStart(t, c, "spades-partners")
	decision := codecDecision(t, c, d, s)
	if err := c.ValidateDecision(d, s, decision); err != nil {
		t.Fatal(err)
	}
	raw := codecJSON(t, decision)
	decoded, err := DecodeDecision(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decoded.Analysis, decision.Analysis) || !bytes.Equal(decoded.Advice, decision.Advice) {
		t.Fatal("original result bytes rewritten")
	}
	if bytes.Contains(raw, []byte(`"packet"`)) {
		t.Fatal("decision duplicates full history packet")
	}
	mutations := map[string]func(*DecisionRecord){"actor": func(d *DecisionRecord) { d.Actor = 2 }, "revision": func(d *DecisionRecord) { d.Revision++ }, "window": func(d *DecisionRecord) { d.WindowID = "stale" }, "purpose": func(d *DecisionRecord) { d.Purpose = "arbitrary" }, "input": func(d *DecisionRecord) { d.InputDigest = strings.Repeat("0", 64) }, "packet-version": func(d *DecisionRecord) { d.PacketVersion = "future" }, "policy-budget": func(d *DecisionRecord) { d.Policy.BudgetVersion = "different" }, "selection": func(d *DecisionRecord) { d.SelectedCandidateID = "bid:99" }, "owner": func(d *DecisionRecord) { d.OwnerID = "other" }, "access": func(d *DecisionRecord) { d.Access.Generation = -1 }, "advice-selection": func(d *DecisionRecord) { d.Advice = []byte(`{"focus":"fixture","reason":"different bid","bid":4}`) }, "unknown-schema": func(d *DecisionRecord) { d.AnalysisSchema = "unchecked-private-json" }}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			bad := decision
			mutate(&bad)
			if err := c.ValidateDecision(d, s, bad); err == nil {
				t.Fatal("invalid decision binding accepted")
			}
		})
	}
	if err := NewDocumentCodec().ValidateHistoricalDecision(decision); err != nil {
		t.Fatal("safe original advice unavailable after policy uninstall:", err)
	}
	unknown := codecMutate(t, raw, func(v map[string]any) { v["privateDeal"] = codecDeck() })
	if _, err := DecodeDecision(unknown); err == nil {
		t.Fatal("extra hidden decision field accepted")
	}
}
func TestRecordSupportedOriginalLegacyStateBytes(t *testing.T) {
	c := codecFixture(t, "spades-partners")
	_, _, _, s := codecStart(t, c, "spades-partners")
	raw, _ := s.Export()
	raw = append([]byte(" \n"), raw...)
	legacy, err := c.ReadLegacyState(OriginalPin("spades-partners"), raw)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw, legacy.Original) || legacy.Disposition.Playable {
		t.Fatal("legacy original changed or activated")
	}
	if _, err = legacy.Snapshot.Apply([]byte(`{}`)); err == nil {
		t.Fatal("legacy reader allowed gameplay")
	}
	if _, err = c.ReadLegacyState(OriginalPin("hearts"), raw); err == nil {
		t.Fatal("legacy cross-game state accepted")
	}
}
func TestRecordCommandDigestBindsEntireIntent(t *testing.T) {
	raw := []byte(`{"type":"action","action":{"kind":"bid","seat":1,"bid":3}}`)
	digest, err := CommandDigest("first", 1, raw)
	if err != nil {
		t.Fatal(err)
	}
	good := CommandRecord{RecordVersion: RecordVersion, GameID: "first", Revision: 1, CommandID: "idempotent", Digest: digest, Command: raw}
	if err = ValidateCommand(good); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*CommandRecord){func(c *CommandRecord) { c.GameID = "another" }, func(c *CommandRecord) { c.Revision = 2 }} {
		bad := good
		mutate(&bad)
		if ValidateCommand(bad) == nil {
			t.Fatal("changed intent reused old command digest")
		}
	}
	canonicalDigest, err := CommandDigest("first", 1, []byte(` {"action":{"bid":3,"seat":1,"kind":"bid"},"type":"action"} `))
	if err != nil || canonicalDigest != digest {
		t.Fatal("formatting changed equivalent command identity")
	}
}
func TestRecordDecisionCommandAndWindowBinding(t *testing.T) {
	c := codecFixture(t, "spades-partners")
	d, _, _, s := codecStart(t, c, "spades-partners")
	decision := codecDecision(t, c, d, s)
	window, err := c.WindowID(d)
	if err != nil || window != decision.WindowID {
		t.Fatal("different command and decision windows")
	}
	good := []byte(`{"type":"action","action":{"kind":"bid","seat":1,"bid":3}}`)
	if err = c.ValidateDecisionCommand(decision, good); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{`{"type":"action","action":{"kind":"bid","seat":1,"bid":4}}`, `{"type":"action","action":{"kind":"bid","seat":2,"bid":3}}`, `{"type":"collect-trick"}`} {
		if c.ValidateDecisionCommand(decision, []byte(bad)) == nil {
			t.Fatal("prepared bot selected action was not enforced")
		}
	}
	for _, zeroControl := range []bool{false, true} {
		bad := decision
		if zeroControl {
			bad.Access.ControlRevision = 0
		} else {
			bad.Access.Generation = 0
		}
		if c.ValidateDecision(d, s, bad) == nil {
			t.Fatal("zero admission generation accepted")
		}
	}
}
func TestRecordHeartsSealedOpeningRestoresKnownHoldings(t *testing.T) {
	c := codecFixture(t, "hearts")
	d, a, events, s := codecStart(t, c, "hearts")
	var initial struct {
		Hands [4][]string `json:"hands"`
	}
	raw, _ := s.Export()
	if err := json.Unmarshal(raw, &initial); err != nil {
		t.Fatal(err)
	}
	passes := [4][]string{}
	for seat := 0; seat < 4; seat++ {
		passes[seat] = initial.Hands[seat][:3]
	}
	command := codecJSON(t, map[string]any{"type": "action", "action": map[string]any{"kind": "pass-bundle", "passes": passes}})
	next, delta, err := c.Advance(d, s, command)
	if err != nil {
		t.Fatal(err)
	}
	restored, _, err := c.Open(next, append(events, delta...))
	if err != nil {
		t.Fatal(err)
	}
	reference, err := hearts.Start(a.Config, a.OpeningChance)
	if err != nil {
		t.Fatal(err)
	}
	reference, err = reference.Apply(command)
	if err != nil {
		t.Fatal(err)
	}
	for actor := 0; actor < 4; actor++ {
		want, _ := reference.Project(actor)
		got, _ := restored.Project(actor)
		if !reflect.DeepEqual(want, got) {
			t.Fatalf("sealed knowledge changed for actor %d", actor)
		}
		var ob struct {
			Known []json.RawMessage `json:"knownHoldings"`
		}
		json.Unmarshal(got.Observation, &ob)
		if len(ob.Known) != 3 {
			t.Fatal("remembered outgoing holdings lost")
		}
	}
	// Dealer 0 deals C2 to seat 1; that seat passes it left to seat 2.
	played, playEvents, err := c.Advance(next, restored, []byte(`{"type":"action","action":{"kind":"play","seat":2,"card":"C2"}}`))
	if err != nil {
		t.Fatal("legal Hearts play did not advance after the sealed pass:", err)
	}
	if played.Revision != next.Revision+1 || played.Checkpoint.EventCount != next.Checkpoint.EventCount+1 || len(playEvents) != 1 {
		t.Fatal("Hearts play lost its accepted revision or event")
	}
}
func TestRecordReplayFrozenOriginalCorpus(t *testing.T) {
	raw, err := os.ReadFile("../../../web/server/tests/fixtures/legacy-module-document.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures struct {
		Cases []struct {
			Config   spades.Config     `json:"config"`
			Deal     []string          `json:"deal"`
			Commands []json.RawMessage `json:"commands"`
			FinalSHA string            `json:"finalSha256"`
		} `json:"cases"`
	}
	if err = json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures.Cases {
		t.Run(f.Config.Mode, func(t *testing.T) {
			c := codecFixture(t, f.Config.Mode)
			m := PracticeMetadata(f.Config.Mode, f.Config.ID, "owner", codecPolicy())
			_, a, _, err := c.Start(m, codecJSON(t, f.Config), f.Deal)
			if err != nil {
				t.Fatal(err)
			}
			commands := []CommandRecord{}
			chance := 0
			collections := 0
			for i, b := range f.Commands {
				digest, _ := CommandDigest(m.GameID, int64(i+1), b)
				commands = append(commands, CommandRecord{RecordVersion: RecordVersion, GameID: m.GameID, Revision: int64(i + 1), CommandID: fmt.Sprint(i), Digest: digest, Command: b})
				if bytes.Contains(b, []byte(`"next-hand"`)) {
					chance++
				}
				if bytes.Contains(b, []byte(`"collect-trick"`)) {
					collections++
				}
			}
			last := int64(0)
			hand := 1
			d, s, events, err := c.ReplayVisit(m, a, commands, func(d Document, s gamekernel.Snapshot) error {
				if d.Revision != last+1 {
					return fmt.Errorf("lost collection/command boundary")
				}
				last = d.Revision
				if bytes.Contains(commands[d.Revision-1].Command, []byte(`"next-hand"`)) {
					hand++
				}
				unit, err := c.CurrentUnitID(d, s)
				if err != nil || unit != fmt.Sprintf("hand-%d", hand) {
					return fmt.Errorf("access unit did not follow accepted chance boundary")
				}
				hotUnit, err := c.UnitID(d)
				if err != nil || hotUnit != unit {
					return fmt.Errorf("hot and typed access unit differ")
				}
				return nil
			})
			if err != nil {
				t.Fatal(err)
			}
			exported, _ := s.Export()
			hash, _ := JSONDigest(exported)
			if hash != f.FinalSHA {
				t.Fatal("frozen original final hash changed")
			}
			if chance == 0 || collections == 0 {
				t.Fatal("fixture lost actual subsequent deals or collection boundaries")
			}
			restored, _, err := c.Open(d, events)
			if err != nil {
				t.Fatal(err)
			}
			for actor := 0; actor < 4; actor++ {
				p, _ := s.Project(actor)
				q, _ := restored.Project(actor)
				if !reflect.DeepEqual(p, q) {
					t.Fatal("replay projection changed after compact storage")
				}
			}
			missing := NewDocumentCodec()
			_, _, _, err = missing.Replay(m, a, commands)
			if err != nil {
				t.Fatal("read-only policy history replay failed:", err)
			}
		})
	}
}
