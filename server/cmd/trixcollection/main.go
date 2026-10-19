// trixcollection is an offline, single-command JSON adapter. Frame.snapshot is
// private coordinator material; only Frame.nativeActorPacket is player input.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"cardford/server/internal/contracts"
	"cardford/server/internal/evaluation/trixcollection"
	"cardford/server/internal/gamekernel"
)

func run(args []string, input io.Reader, output io.Writer) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: trixcollection start|packet|commit|finish|replay|proof")
	}
	raw, err := io.ReadAll(io.LimitReader(input, contracts.MaxJSONBytes+1))
	if err != nil {
		return err
	}
	var result any
	switch args[0] {
	case "start":
		var in trixcollection.StartInput
		if err = gamekernel.DecodeSessionJSON(raw, &in); err != nil {
			return err
		}
		b, err := trixcollection.StartRequest(in.Variant, in.Request, in.ID, in.Deck)
		if err != nil {
			return err
		}
		scheduled, err := trixcollection.ScheduledRequest(b)
		if err != nil {
			return err
		}
		result, err = trixcollection.SnapshotFrame(b, &scheduled)
		if err != nil {
			return err
		}
	case "packet", "finish":
		var in trixcollection.SnapshotInput
		if err = gamekernel.DecodeSessionJSON(raw, &in); err != nil {
			return err
		}
		b, err := trixcollection.OpenRequest(in.Pin, in.Snapshot)
		if err != nil {
			return err
		}
		if args[0] == "finish" {
			if _, err = trixcollection.FinishRequest(b); err != nil {
				return err
			}
		}
		result, err = trixcollection.SnapshotFrame(b, nil)
		if err != nil {
			return err
		}
	case "commit":
		var in trixcollection.CommitInput
		if err = gamekernel.DecodeSessionJSON(raw, &in); err != nil {
			return err
		}
		b, err := trixcollection.OpenRequest(in.Pin, in.Snapshot)
		if err != nil {
			return err
		}
		b, err = trixcollection.CommitRequest(b, in.ExpectedRevision, in.Actor, in.CandidateID)
		if err != nil {
			return err
		}
		result, err = trixcollection.SnapshotFrame(b, nil)
		if err != nil {
			return err
		}
	case "replay":
		var in trixcollection.ReplayInput
		if err = gamekernel.DecodeSessionJSON(raw, &in); err != nil {
			return err
		}
		result, err = trixcollection.Replay(in)
		if err != nil {
			return err
		}
	case "proof":
		var in trixcollection.ProofInput
		if err = gamekernel.DecodeSessionJSON(raw, &in); err != nil {
			return err
		}
		result, err = trixcollection.VerifyPublicEnding(in)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown native collection command")
	}
	return json.NewEncoder(output).Encode(result)
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
