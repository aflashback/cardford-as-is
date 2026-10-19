package trixcollection

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
)

const PublicEndingProofVersion = "trix-public-ending-proof-1.0.0"
const MaxPublicEndingCards = 8

type ProofInput struct {
	Pin                 gamekernel.Pin  `json:"pin"`
	Snapshot            json.RawMessage `json:"snapshot"`
	SelectedCandidateID string          `json:"selectedCandidateId"`
	Objective           string          `json:"objective"`
}
type ProofResult struct {
	Verified    bool                     `json:"verified"`
	Reason      string                   `json:"reason"`
	Certificate *PublicEndingCertificate `json:"certificate"`
}

type PointBounds struct {
	Minimum       int `json:"minimum"`
	Maximum       int `json:"maximum"`
	TerminalCount int `json:"terminalCount"`
}
type ProofContinuation struct {
	CandidateID    string       `json:"candidateId"`
	Choices        []Choice     `json:"choices"`
	TerminalPoints int          `json:"terminalPoints"`
	ScoreTotals    []trix.Score `json:"scoreTotals"`
}
type PublicEndingCertificate struct {
	SchemaVersion          string              `json:"schemaVersion"`
	ProofKind              string              `json:"proofKind"`
	Pin                    gamekernel.Pin      `json:"pin"`
	Revision               int                 `json:"revision"`
	Actor                  int                 `json:"actor"`
	NativePacketDigest     string              `json:"nativePacketDigest"`
	SelectedCandidateID    string              `json:"selectedCandidateId"`
	AlternativeCandidateID string              `json:"alternativeCandidateId"`
	Objective              string              `json:"objective"`
	SelectedBounds         PointBounds         `json:"selectedBounds"`
	AlternativeBounds      PointBounds         `json:"alternativeBounds"`
	GuaranteedAdvantage    int                 `json:"guaranteedAdvantage"`
	PublicReconstruction   ReplayInput         `json:"publicReconstruction"`
	Continuations          []ProofContinuation `json:"continuations"`
}

// Proof preserves the earlier conservative stub API for callers without a
// bound actor packet. New independent verification uses VerifyPublicEnding.
func Proof() ProofResult {
	return ProofResult{Verified: false, Reason: "unsupported-native-public-ending-proof"}
}

// VerifyPublicEnding proves only a strong guaranteed dominance relation. It
// first reconstructs hands from public facts, rather than reading snapshot
// hands, and refuses any non-unique allocation or more than eight total cards.
// All remaining legal responses are considered, including cooperative and
// hostile responses. No minimax, policy, sampled world or margin is relabelled
// as the player's own/team-points objective.
func VerifyPublicEnding(in ProofInput) (ProofResult, error) {
	no := func(reason string) (ProofResult, error) { return ProofResult{Reason: reason}, nil }
	b, err := OpenRequest(in.Pin, in.Snapshot)
	if err != nil {
		return ProofResult{}, err
	}
	n, err := b.Node()
	if err != nil {
		return ProofResult{}, err
	}
	if n.Kind != "actor" || n.Phase != "playing" || n.Seat == nil {
		return no("unsupported-non-playing-node")
	}
	raw, err := CurrentPacket(b)
	if err != nil {
		return ProofResult{}, err
	}
	var packet struct {
		Observation trix.Observation             `json:"observation"`
		Candidates  []gamekernel.PublicCandidate `json:"candidates"`
	}
	if err = json.Unmarshal(raw, &packet); err != nil {
		return ProofResult{}, err
	}
	o := packet.Observation
	if o.Request == nil {
		return ProofResult{}, fmt.Errorf("proof packet omitted request")
	}
	rules, err := RulesDescriptor(in.Pin, *o.Request)
	if err != nil {
		return ProofResult{}, err
	}
	if in.Objective != rules.Objective {
		return no("objective-mismatch")
	}
	selectedPresent := false
	for _, c := range packet.Candidates {
		if c.ID == in.SelectedCandidateID {
			selectedPresent = true
		}
	}
	if !selectedPresent {
		return no("selected-candidate-not-legal")
	}
	if len(packet.Candidates) < 2 {
		return no("forced-decision")
	}
	remaining := 0
	for _, count := range o.HandCounts {
		remaining += count
	}
	if remaining > MaxPublicEndingCards {
		return no("unsupported-ending-size")
	}
	hands, allocations, err := publicEndingHands(o)
	if err != nil {
		return ProofResult{}, err
	}
	if allocations != 1 {
		return no("ambiguous-public-ownership")
	}
	independent, reconstruction, err := reconstructPublicEnding(in.Pin, o, hands)
	if err != nil {
		return ProofResult{}, fmt.Errorf("public reconstruction: %w", err)
	}
	independentPacket, err := CurrentPacket(independent)
	if err != nil {
		return ProofResult{}, err
	}
	if !bytes.Equal(independentPacket, raw) {
		return ProofResult{}, fmt.Errorf("public reconstruction packet mismatch")
	}
	continuations := []ProofContinuation{}
	bounds := map[string]PointBounds{}
	for _, candidate := range packet.Candidates {
		first := Choice{Actor: o.Seat, CandidateID: candidate.ID}
		next, err := CommitRequest(independent, independent.EventCount(), first.Actor, first.CandidateID)
		if err != nil {
			return ProofResult{}, err
		}
		leaves, err := enumeratePublicContinuations(next, o.Seat, in.Objective, candidate.ID, []Choice{first})
		if err != nil {
			return ProofResult{}, err
		}
		if len(leaves) == 0 {
			return ProofResult{}, fmt.Errorf("no complete proof continuations")
		}
		v := PointBounds{Minimum: leaves[0].TerminalPoints, Maximum: leaves[0].TerminalPoints, TerminalCount: len(leaves)}
		for _, leaf := range leaves {
			if leaf.TerminalPoints < v.Minimum {
				v.Minimum = leaf.TerminalPoints
			}
			if leaf.TerminalPoints > v.Maximum {
				v.Maximum = leaf.TerminalPoints
			}
		}
		bounds[candidate.ID] = v
		continuations = append(continuations, leaves...)
	}
	selected := bounds[in.SelectedCandidateID]
	alternative := ""
	for _, candidate := range packet.Candidates {
		if candidate.ID != in.SelectedCandidateID && bounds[candidate.ID].Minimum > selected.Maximum {
			if alternative == "" || bounds[candidate.ID].Minimum > bounds[alternative].Minimum {
				alternative = candidate.ID
			}
		}
	}
	if alternative == "" {
		return no("no-guaranteed-dominance")
	}
	// Shared UTF-16 sorted-key canonical JSON matches the operator's digest().
	canonicalPacket, err := contracts.UTF16Canonical(raw)
	if err != nil {
		return ProofResult{}, err
	}
	digest := sha256.Sum256(canonicalPacket)
	certificate := &PublicEndingCertificate{SchemaVersion: PublicEndingProofVersion, ProofKind: "native-objective-dominance", Pin: in.Pin, Revision: b.EventCount(), Actor: o.Seat,
		NativePacketDigest: hex.EncodeToString(digest[:]), SelectedCandidateID: in.SelectedCandidateID, AlternativeCandidateID: alternative, Objective: in.Objective,
		SelectedBounds: selected, AlternativeBounds: bounds[alternative], GuaranteedAdvantage: bounds[alternative].Minimum - selected.Maximum,
		PublicReconstruction: reconstruction, Continuations: continuations}
	return ProofResult{Verified: true, Reason: "verified-public-ending-guaranteed-dominance", Certificate: certificate}, nil
}

// publicEndingHands uses only own cards, counts, standard deck, chronological
// public plays and follow-suit-derived voids. Counts/voids can overapproximate
// other knowledge; declining those ambiguous cases is deliberately conservative.
func publicEndingHands(o trix.Observation) ([4][]string, int, error) {
	var out [4][]string
	var voids [4]map[byte]bool
	for seat := range voids {
		voids[seat] = map[byte]bool{}
	}
	seen := map[string]bool{}
	plays := [][]trix.Play{}
	for _, trick := range o.Tricks {
		plays = append(plays, trick.Plays)
	}
	if len(o.Trick) > 0 {
		plays = append(plays, o.Trick)
	}
	for _, trick := range plays {
		lead := trick[0].Card[0]
		for _, play := range trick {
			if seen[play.Card] {
				return out, 0, fmt.Errorf("duplicate public card")
			}
			seen[play.Card] = true
			if play.Card[0] != lead {
				voids[play.Seat][lead] = true
			}
		}
	}
	out[o.Seat] = append([]string{}, o.Hand...)
	for _, card := range o.Hand {
		if seen[card] || voids[o.Seat][card[0]] {
			return out, 0, fmt.Errorf("own cards contradict public history")
		}
		seen[card] = true
	}
	unknown := []string{}
	for _, card := range trix.Deck() {
		if !seen[card] {
			unknown = append(unknown, card)
		}
	}
	capacity := o.HandCounts
	if capacity[o.Seat] != len(o.Hand) {
		return out, 0, fmt.Errorf("own hand count mismatch")
	}
	capacity[o.Seat] = 0
	choices := map[string][]int{}
	for _, card := range unknown {
		for seat := 0; seat < 4; seat++ {
			if seat != o.Seat && !voids[seat][card[0]] {
				choices[card] = append(choices[card], seat)
			}
		}
	}
	sort.SliceStable(unknown, func(i, j int) bool { return len(choices[unknown[i]]) < len(choices[unknown[j]]) })
	allocations := 0
	var unique [4][]string
	var search func(int)
	search = func(index int) {
		if allocations >= 2 {
			return
		}
		if index == len(unknown) {
			if capacity != [4]int{} {
				return
			}
			allocations++
			if allocations == 1 {
				for seat := range out {
					unique[seat] = append([]string{}, out[seat]...)
				}
			}
			return
		}
		card := unknown[index]
		for _, seat := range choices[card] {
			if capacity[seat] == 0 {
				continue
			}
			capacity[seat]--
			out[seat] = append(out[seat], card)
			search(index + 1)
			out[seat] = out[seat][:len(out[seat])-1]
			capacity[seat]++
		}
	}
	search(0)
	return unique, allocations, nil
}

func reconstructPublicEnding(pin gamekernel.Pin, o trix.Observation, remaining [4][]string) (gamekernel.BoundSession, ReplayInput, error) {
	original := [4][]string{}
	choices := []Choice{}
	for _, declaration := range o.Declarations {
		choices = append(choices, Choice{Actor: declaration.Seat, CandidateID: "doubles:" + strings.Join(declaration.Cards, ",")})
	}
	add := func(play trix.Play) {
		original[play.Seat] = append(original[play.Seat], play.Card)
		choices = append(choices, Choice{Actor: play.Seat, CandidateID: "play:" + play.Card})
	}
	for _, trick := range o.Tricks {
		for _, play := range trick.Plays {
			add(play)
		}
	}
	for _, play := range o.Trick {
		add(play)
	}
	deck := []string{}
	for seat := range original {
		original[seat] = append(original[seat], remaining[seat]...)
		if len(original[seat]) != 13 {
			return nil, ReplayInput{}, fmt.Errorf("public original hand count mismatch")
		}
		deck = append(deck, original[seat]...)
	}
	in := ReplayInput{Variant: pin.VariantID, Request: *o.Request, ID: o.ID, Deck: deck, Choices: choices}
	b, err := StartRequest(in.Variant, in.Request, in.ID, in.Deck)
	if err != nil {
		return nil, in, err
	}
	for _, choice := range choices {
		b, err = CommitRequest(b, b.EventCount(), choice.Actor, choice.CandidateID)
		if err != nil {
			return nil, in, err
		}
	}
	return b, in, nil
}

func enumeratePublicContinuations(b gamekernel.BoundSession, actor int, objective, candidateID string, path []Choice) ([]ProofContinuation, error) {
	n, err := b.Node()
	if err != nil {
		return nil, err
	}
	if n.Kind == "round-complete" {
		out, err := FinishRequest(b)
		if err != nil {
			return nil, err
		}
		points, err := terminalObjectivePoints(out, actor, objective)
		if err != nil {
			return nil, err
		}
		return []ProofContinuation{{CandidateID: candidateID, Choices: append([]Choice{}, path...), TerminalPoints: points, ScoreTotals: out.ScoreTotals}}, nil
	}
	if n.Kind != "actor" || n.Phase != "playing" || len(path) > MaxPublicEndingCards {
		return nil, fmt.Errorf("proof escaped bounded card ending")
	}
	raw, err := CurrentPacket(b)
	if err != nil {
		return nil, err
	}
	var packet struct {
		Candidates []gamekernel.PublicCandidate `json:"candidates"`
	}
	if err = json.Unmarshal(raw, &packet); err != nil {
		return nil, err
	}
	leaves := []ProofContinuation{}
	for _, candidate := range packet.Candidates {
		choice := Choice{Actor: *n.Seat, CandidateID: candidate.ID}
		next, err := CommitRequest(b, b.EventCount(), choice.Actor, choice.CandidateID)
		if err != nil {
			return nil, err
		}
		nextPath := append(append([]Choice{}, path...), choice)
		branch, err := enumeratePublicContinuations(next, actor, objective, candidateID, nextPath)
		if err != nil {
			return nil, err
		}
		leaves = append(leaves, branch...)
	}
	return leaves, nil
}

func terminalObjectivePoints(out Outcome, actor int, objective string) (int, error) {
	expected := "own-request-points"
	if len(out.ScoreTotals) == 2 {
		expected = "combined-team-request-points"
	}
	if objective != expected {
		return 0, fmt.Errorf("terminal objective mismatch")
	}
	for _, score := range out.ScoreTotals {
		for _, seat := range score.Seats {
			if seat == actor {
				return score.Total, nil
			}
		}
	}
	return 0, fmt.Errorf("terminal actor competitor missing")
}
