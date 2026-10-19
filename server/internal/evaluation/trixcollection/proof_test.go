package trixcollection

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
)

// Authored reachable mechanics fixture, not player/model evidence. At the
// final West discard, public voids uniquely locate all five remaining cards.
var publicProofDeck = []string{
	"SA", "H7", "S9", "H4", "D8", "D10", "CQ", "D7", "CJ", "SQ", "D4", "C5", "DQ",
	"S2", "H3", "H2", "SJ", "DJ", "D2", "HQ", "C9", "D3", "C4", "D6", "DK", "H6",
	"C6", "C3", "S10", "D5", "S3", "C8", "H10", "C7", "HJ", "D9", "CK", "CA", "S6",
	"S4", "H8", "C2", "H5", "H9", "HA", "S5", "DA", "C10", "S7", "HK", "S8", "SK",
}

const publicProofPrelude = "D10 DA D5 D6 H5 H10 H6 H7 CA C4 CQ C2 S10 S2 SA S8 CJ C10 C7 C9 D7 S4 D9 DK H3 H4 H9 HJ C6 D2 C5 S7 S6 SJ S9 S5 HQ D8 H8 C8 D3 DQ SK CK SQ HA S3"

func publicProofFixture(t *testing.T, variant string, plays int) gamekernel.BoundSession {
	t.Helper()
	b := start(t, variant, "lutoosh", publicProofDeck)
	for i, card := range strings.Fields(publicProofPrelude) {
		if i >= plays {
			break
		}
		n, err := b.Node()
		if err != nil {
			t.Fatal(err)
		}
		b = commit(t, b, *n.Seat, "play:"+card)
	}
	return b
}
func proofInput(t *testing.T, b gamekernel.BoundSession, selected, objective string) ProofInput {
	t.Helper()
	raw, err := b.SerializePrivate()
	if err != nil {
		t.Fatal(err)
	}
	return ProofInput{Pin: b.Pin(), Snapshot: raw, SelectedCandidateID: selected, Objective: objective}
}

func TestVerifiedPublicEndingOwnAndTeamPointsWithReplayEvidence(t *testing.T) {
	for _, variant := range []string{"basic-solo", "basic-partners"} {
		t.Run(variant, func(t *testing.T) {
			b := publicProofFixture(t, variant, 47)
			objective := "own-request-points"
			selectedPoints, alternativePoints := -60, -45
			if variant == "basic-partners" {
				objective = "combined-team-request-points"
				selectedPoints, alternativePoints = -75, -60
			}
			before, _ := b.SerializePrivate()
			in := proofInput(t, b, "play:H2", objective)
			proof, err := VerifyPublicEnding(in)
			if err != nil {
				t.Fatal(err)
			}
			if !proof.Verified || proof.Certificate == nil {
				t.Fatalf("publicly determined positive ending refused: %+v", proof)
			}
			c := proof.Certificate
			packet, err := CurrentPacket(b)
			if err != nil {
				t.Fatal(err)
			}
			canonicalPacket, err := contracts.UTF16Canonical(packet)
			if err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256(canonicalPacket)
			if c.SchemaVersion != PublicEndingProofVersion || c.ProofKind != "native-objective-dominance" || c.Pin != b.Pin() || c.Actor != 1 || c.Revision != 49 || c.NativePacketDigest != hex.EncodeToString(digest[:]) || c.Objective != objective || c.SelectedCandidateID != "play:H2" || c.AlternativeCandidateID != "play:DJ" {
				t.Fatal("certificate context not bound", c)
			}
			if c.SelectedBounds != (PointBounds{Minimum: selectedPoints, Maximum: selectedPoints, TerminalCount: 1}) || c.AlternativeBounds != (PointBounds{Minimum: alternativePoints, Maximum: alternativePoints, TerminalCount: 1}) || c.GuaranteedAdvantage != 15 {
				t.Fatal("incorrect literal own/team point bounds", c.SelectedBounds, c.AlternativeBounds, c.GuaranteedAdvantage)
			}
			// Partners margin advantage would be 30; this certificate is 15 own-team points.
			if len(c.Continuations) != 2 || len(c.PublicReconstruction.Choices) != 47 {
				t.Fatal("complete branch evidence missing")
			}
			for _, leaf := range c.Continuations {
				replay := c.PublicReconstruction
				replay.Choices = append(append([]Choice{}, replay.Choices...), leaf.Choices...)
				frame, err := Replay(replay)
				if err != nil {
					t.Fatal("certificate leaf cannot replay", err)
				}
				if !reflect.DeepEqual(frame.Outcome.ScoreTotals, leaf.ScoreTotals) {
					t.Fatal("certificate replay score mismatch")
				}
				points, err := terminalObjectivePoints(*frame.Outcome, c.Actor, c.Objective)
				if err != nil || points != leaf.TerminalPoints {
					t.Fatal("certificate points differ from native replay", err)
				}
			}
			after, _ := b.SerializePrivate()
			if !bytes.Equal(before, after) {
				t.Fatal("proof mutated source session")
			}
			// Already choosing the better action cannot receive a correction.
			better, err := VerifyPublicEnding(proofInput(t, b, "play:DJ", objective))
			if err != nil || better.Verified || better.Certificate != nil || better.Reason != "no-guaranteed-dominance" {
				t.Fatal("invented correction of best ending choice", better, err)
			}
		})
	}
}

func TestPublicEndingAmbiguityInvariantUnderPrivateAllocations(t *testing.T) {
	deck := trix.Deck()
	left := start(t, "basic-solo", "lutoosh", deck)
	for i := 0; i < 44; i++ {
		n, _ := left.Node()
		raw, err := CurrentPacket(left)
		if err != nil {
			t.Fatal(err)
		}
		var packet struct {
			Candidates []gamekernel.PublicCandidate `json:"candidates"`
		}
		json.Unmarshal(raw, &packet)
		left = commit(t, left, *n.Seat, packet.Candidates[0].ID)
	}
	// Exchange only unplayed South/West cards. Prior public play remains legal.
	twin := append([]string{}, deck...)
	twin[11], twin[12], twin[24], twin[25] = deck[24], deck[25], deck[11], deck[12]
	right := start(t, "basic-solo", "lutoosh", twin)
	var history struct {
		Events []json.RawMessage `json:"events"`
	}
	snapshot, _ := left.SerializePrivate()
	json.Unmarshal(snapshot, &history)
	for _, raw := range history.Events[2:] {
		var event struct {
			Seat   int         `json:"seat"`
			Action trix.Action `json:"action"`
		}
		json.Unmarshal(raw, &event)
		right = commit(t, right, event.Seat, trix.ActionID(event.Action))
	}
	p, _ := CurrentPacket(left)
	q, _ := CurrentPacket(right)
	if !bytes.Equal(p, q) {
		t.Fatal("ambiguity fixture actor packets differ")
	}
	for _, b := range []gamekernel.BoundSession{left, right} {
		result, err := VerifyPublicEnding(proofInput(t, b, "play:HK", "own-request-points"))
		if err != nil || result.Verified || result.Certificate != nil || result.Reason != "ambiguous-public-ownership" {
			t.Fatal("hidden allocation supplied false public proof", result, err)
		}
	}
}

func TestPublicEndingForcedObjectiveIllegalAndSizeRejection(t *testing.T) {
	b := publicProofFixture(t, "basic-solo", 47)
	tests := []struct {
		b                           gamekernel.BoundSession
		selected, objective, reason string
	}{
		{b, "play:H2", "own-minus-opponents", "objective-mismatch"},
		{b, "play:SA", "own-request-points", "selected-candidate-not-legal"},
		{start(t, "basic-solo", "lutoosh", trix.Deck()), "play:H2", "own-request-points", "unsupported-ending-size"},
		{commit(t, b, 1, "play:H2"), "play:D4", "own-request-points", "forced-decision"},
	}
	for _, test := range tests {
		result, err := VerifyPublicEnding(proofInput(t, test.b, test.selected, test.objective))
		if err != nil || result.Verified || result.Certificate != nil || result.Reason != test.reason {
			t.Fatal("unsupported proof gate admitted", result, test.reason, err)
		}
	}
	finished, _ := complete(t, b)
	result, err := VerifyPublicEnding(proofInput(t, finished, "play:H2", "own-request-points"))
	if err != nil || result.Verified || result.Reason != "unsupported-non-playing-node" {
		t.Fatal("terminal proof admitted", result, err)
	}
	bad := proofInput(t, b, "play:H2", "own-request-points")
	bad.Pin = trix.LegacyPin("basic-solo")
	if _, err = VerifyPublicEnding(bad); err == nil {
		t.Fatal("historical proof pin admitted")
	}
}

func TestNativeContinuationSearchIncludesEveryLegalResponse(t *testing.T) {
	b := publicProofFixture(t, "basic-solo", 44)
	next := commit(t, b, 0, "play:SQ")
	leaves, err := enumeratePublicContinuations(next, 0, "own-request-points", "play:SQ", []Choice{{Actor: 0, CandidateID: "play:SQ"}})
	if err != nil {
		t.Fatal(err)
	}
	// East has HK/HA and West has H2/DJ, all four combinations are legal;
	// North must follow with S3. The final trick is then forced.
	if len(leaves) != 4 {
		t.Fatal("legal response branches pruned", len(leaves))
	}
	combos := map[string]bool{}
	minimum, maximum := 0, -1000
	for _, leaf := range leaves {
		if len(leaf.Choices) != 8 {
			t.Fatal("incomplete native continuation")
		}
		combos[leaf.Choices[1].CandidateID+"/"+leaf.Choices[3].CandidateID] = true
		if leaf.TerminalPoints < minimum {
			minimum = leaf.TerminalPoints
		}
		if leaf.TerminalPoints > maximum {
			maximum = leaf.TerminalPoints
		}
	}
	if len(combos) != 4 || minimum != -75 || maximum != -60 {
		t.Fatal("exhaustive literal point range mismatch", combos, minimum, maximum)
	}
}
