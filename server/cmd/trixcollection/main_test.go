package main

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"cardford/server/internal/evaluation/trixcollection"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
)

func invoke(t *testing.T, command string, input any) trixcollection.Frame {
	t.Helper()
	raw, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err = run([]string{command}, bytes.NewReader(raw), &output); err != nil {
		t.Fatal(err)
	}
	var frame trixcollection.Frame
	if err = json.Unmarshal(output.Bytes(), &frame); err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(output.Bytes(), &fields); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"schemaVersion", "pin", "revision", "node", "snapshot", "nativeActorPacket", "rules", "outcome", "scheduledRequest"} {
		if _, ok := fields[key]; !ok {
			t.Fatal("missing required frame field", key)
		}
	}
	return frame
}

func TestCLIReplayFinishAndTerminalPacket(t *testing.T) {
	b, err := trixcollection.StartRequest("complex-partners", "complex", "cli-terminal-fixture", trix.Deck())
	if err != nil {
		t.Fatal(err)
	}
	choices := []trixcollection.Choice{}
	for {
		n, err := b.Node()
		if err != nil {
			t.Fatal(err)
		}
		if n.Kind == "round-complete" {
			break
		}
		packet, err := trixcollection.CurrentPacket(b)
		if err != nil {
			t.Fatal(err)
		}
		var p struct {
			Candidates []gamekernel.PublicCandidate `json:"candidates"`
		}
		if err = json.Unmarshal(packet, &p); err != nil {
			t.Fatal(err)
		}
		choice := trixcollection.Choice{Actor: *n.Seat, CandidateID: p.Candidates[0].ID}
		choices = append(choices, choice)
		b, err = trixcollection.CommitRequest(b, b.EventCount(), choice.Actor, choice.CandidateID)
		if err != nil {
			t.Fatal(err)
		}
	}
	replayed := invoke(t, "replay", trixcollection.ReplayInput{Variant: "complex-partners", Request: "complex", ID: "cli-terminal-fixture", Deck: trix.Deck(), Choices: choices})
	if replayed.Outcome == nil || replayed.Outcome.AcceptedPlays != 52 || replayed.Outcome.CompletedTricks != 13 || string(replayed.NativeActorPacket) != "null" || replayed.Revision != 58 {
		t.Fatal("CLI incomplete terminal receipt")
	}
	input := trixcollection.SnapshotInput{Pin: replayed.Pin, Snapshot: replayed.Snapshot}
	finished := invoke(t, "finish", input)
	packet := invoke(t, "packet", input)
	if !reflect.DeepEqual(finished.Outcome, replayed.Outcome) || !reflect.DeepEqual(packet.Outcome, replayed.Outcome) || finished.ScheduledRequest != nil || string(packet.NativeActorPacket) != "null" {
		t.Fatal("CLI terminal receipt changed")
	}
}
func TestCLIStartPacketCommitAndStrictBoundary(t *testing.T) {
	frame := invoke(t, "start", trixcollection.StartInput{Variant: "basic-solo", Request: "diamonds", ID: "cli-fixture", Deck: trix.Deck()})
	if frame.Revision != 2 || frame.ScheduledRequest == nil || frame.ScheduledRequest.Actor != 2 {
		t.Fatal("missing request admission receipt")
	}
	packet := invoke(t, "packet", trixcollection.SnapshotInput{Pin: frame.Pin, Snapshot: frame.Snapshot})
	if !bytes.Equal(packet.NativeActorPacket, frame.NativeActorPacket) || packet.ScheduledRequest != nil {
		t.Fatal("packet frame changed")
	}
	committed := invoke(t, "commit", trixcollection.CommitInput{Pin: frame.Pin, Snapshot: frame.Snapshot, ExpectedRevision: 2, Actor: 2, CandidateID: "play:H2"})
	if committed.Revision != 3 || committed.ScheduledRequest != nil {
		t.Fatal("native event count is not revision")
	}
	for _, input := range []string{`{}`, `null`, `{} {}`, `{"variant":"basic-solo","variant":"basic-solo"}`, `{"variant":"basic-solo","request":"diamonds","id":"reject","deck":[],"hands":[]}`} {
		var output bytes.Buffer
		if err := run([]string{"start"}, strings.NewReader(input), &output); err == nil || output.Len() != 0 {
			t.Fatal("non-strict JSON input accepted", input)
		}
	}
	raw, _ := json.Marshal(trixcollection.SnapshotInput{Pin: frame.Pin, Snapshot: frame.Snapshot})
	var output bytes.Buffer
	if err := run([]string{"finish"}, bytes.NewReader(raw), &output); err == nil {
		t.Fatal("incomplete finish accepted")
	}
	proofInput, _ := json.Marshal(trixcollection.ProofInput{Pin: frame.Pin, Snapshot: frame.Snapshot, SelectedCandidateID: "play:H2", Objective: "own-request-points"})
	if err := run([]string{"proof"}, bytes.NewReader(proofInput), &output); err != nil {
		t.Fatal(err)
	}
	var proof trixcollection.ProofResult
	if err := json.Unmarshal(output.Bytes(), &proof); err != nil || proof.Verified || proof.Reason == "" {
		t.Fatal("proof must be explicitly unsupported")
	}
}
