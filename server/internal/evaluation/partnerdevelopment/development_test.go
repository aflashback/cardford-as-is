// Package partnerdevelopment records a fresh bounded offline activation pilot.
// It does not estimate playing strength or use private state as a policy input.
package partnerdevelopment

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"cardford/server/internal/games/spades"
	"cardford/server/internal/games/spades/coaching"
	"cardford/server/internal/games/spades/reasoning"
	d "cardford/server/internal/legacydecision"
)

var seeds = []string{"cardford-pr5-development-001", "cardford-pr5-development-002", "cardford-pr5-development-003", "cardford-pr5-development-004", "cardford-pr5-development-005", "cardford-pr5-development-006", "cardford-pr5-development-007", "cardford-pr5-development-008"}

const generator = "sha256-counter-fisher-yates-rejection-1.0.0"

func digest(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }
func encoded(value any) json.RawMessage {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return raw
}
func shuffled(seed string) []string {
	deck := d.FullDeck()
	counter := uint64(0)
	next := func() uint64 {
		raw := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", seed, counter)))
		counter++
		return binary.BigEndian.Uint64(raw[:8])
	}
	for i := len(deck) - 1; i > 0; i-- {
		bound := uint64(i + 1)
		threshold := -bound % bound
		var x uint64
		for {
			x = next()
			if x >= threshold {
				break
			}
		}
		j := int(x % bound)
		deck[i], deck[j] = deck[j], deck[i]
	}
	return deck
}

type decision struct {
	FamilyID       string          `json:"familyId"`
	Arm            string          `json:"arm"`
	Sequence       int             `json:"sequence"`
	Actor          int             `json:"actor"`
	Packet         json.RawMessage `json:"packet"`
	PacketHash     string          `json:"packetHash"`
	Policy         string          `json:"policy"`
	Action         d.Action        `json:"action"`
	BaselineAction d.Action        `json:"baselineAction"`
	Changed        bool            `json:"changedFromFrozenOnSameActorPacket"`
	Analysis       d.Analysis      `json:"analysis"`
	Advice         d.Advice        `json:"advice"`
	AnalysisHash   string          `json:"analysisHash"`
	Activation     []string        `json:"activation"`
	Forced         bool            `json:"forced"`
	Label          string          `json:"label"`
}
type stream struct {
	FamilyID        string `json:"familyId"`
	Seed            string `json:"seed"`
	Arm             string `json:"arm"`
	DealHash        string `json:"dealHash"`
	Status          string `json:"status"`
	Decisions       int    `json:"decisions"`
	Changed         int    `json:"changedDecisions"`
	Offer           int    `json:"offerActivations"`
	Conserve        int    `json:"conserveActivations"`
	Scores          [4]int `json:"scores"`
	Tricks          [4]int `json:"tricks"`
	FinalStateHash  string `json:"finalStateHash"`
	OutcomeEligible bool   `json:"outcomeEligible"`
}

func walk(ctx context.Context, family, seed, arm string, dealer int) (stream, []decision, error) {
	deck := shuffled(seed)
	result := stream{FamilyID: family, Seed: seed, Arm: arm, DealHash: digest(encoded(deck)), Status: "censored"}
	rows := []decision{}
	state, err := spades.Create(encoded(spades.Config{ID: family + ":" + arm, Mode: "spades-partners", Dealer: dealer}), deck)
	if err != nil {
		return result, rows, err
	}
	for step := 0; step < 80; step++ {
		if err = ctx.Err(); err != nil {
			return result, rows, err
		}
		current, e := spades.DecodeState(state)
		if e != nil {
			return result, rows, e
		}
		if current.Phase == "hand-end" || current.Phase == "match-end" {
			result.Status = "complete-hand"
			result.Scores = current.Scores
			result.Tricks = current.Tricks
			result.FinalStateHash = digest(state)
			result.OutcomeEligible = true
			return result, rows, nil
		}
		if current.Phase == "trick-end" {
			state, e = spades.Apply(state, encoded(map[string]string{"type": "collect-trick"}))
			if e != nil {
				return result, rows, e
			}
			continue
		}
		if current.Turn == nil {
			return result, rows, fmt.Errorf("missing actor")
		}
		actor := *current.Turn
		packet, e := spades.Observe(state, actor)
		if e != nil {
			return result, rows, e
		}
		var fields map[string]json.RawMessage
		if e = json.Unmarshal(packet, &fields); e != nil {
			return result, rows, e
		}
		for _, forbidden := range []string{"hands", "deal", "seed", "shuffleSeed", "botDecisionAudits", "decisionAnalyses", "state", "id"} {
			if _, ok := fields[forbidden]; ok {
				return result, rows, fmt.Errorf("actor packet contains %s", forbidden)
			}
		}
		var obs d.Observation
		if e = json.Unmarshal(packet, &obs); e != nil {
			return result, rows, e
		}
		before := encoded(obs)
		baseline, e := reasoning.AnalyzeContext(ctx, obs)
		if e != nil {
			return result, rows, e
		}
		selected := baseline
		if arm == "candidate" && actor == 0 {
			selected, e = reasoning.AnalyzePartnerResourcesContext(ctx, obs)
			if e != nil {
				return result, rows, e
			}
		}
		if !reflect.DeepEqual(before, encoded(obs)) {
			return result, rows, fmt.Errorf("mutated actor input")
		}
		chosen := d.ActionID(selected.Action)
		legal := false
		for _, action := range obs.LegalActions {
			legal = legal || d.ActionID(action) == chosen
		}
		if !legal {
			return result, rows, fmt.Errorf("illegal selected action")
		}
		var advice d.Advice
		if selected.PolicyVersion == reasoning.PartnerResourcePolicy {
			advice, e = coaching.RenderPartnerResources(obs, selected)
		} else {
			advice, e = coaching.Render(obs, selected)
		}
		if e != nil {
			return result, rows, e
		}
		if selected.Action.Kind == "play" && advice.Card != selected.Action.Card {
			return result, rows, fmt.Errorf("bot/coach card mismatch")
		}
		if selected.Action.Kind == "bid" && (advice.Bid == nil || *advice.Bid != selected.Action.Bid) {
			return result, rows, fmt.Errorf("bot/coach bid mismatch")
		}
		active := []string{}
		for _, reason := range selected.Reasons {
			if strings.HasPrefix(reason.ID, "CASE-01.") {
				active = append(active, reason.ID)
				if reason.Kind != "heuristic" {
					return result, rows, fmt.Errorf("heuristic preference claimed exact")
				}
			}
		}
		changed := arm == "candidate" && actor == 0 && chosen != d.ActionID(baseline.Action)
		row := decision{FamilyID: family, Arm: arm, Sequence: len(rows) + 1, Actor: actor, Packet: packet, PacketHash: digest(packet), Policy: selected.PolicyVersion, Action: selected.Action, BaselineAction: baseline.Action, Changed: changed, Analysis: selected, Advice: advice, AnalysisHash: digest(encoded(selected)), Activation: active, Forced: len(obs.LegalActions) == 1, Label: "unreviewed"}
		rows = append(rows, row)
		result.Decisions++
		if changed {
			result.Changed++
		}
		if slices.Contains(active, "CASE-01.offer-safe-ruff") {
			result.Offer++
		}
		if slices.Contains(active, "CASE-01.partner-secure") {
			result.Conserve++
		}
		state, e = spades.Apply(state, encoded(struct {
			Type   string   `json:"type"`
			Action d.Action `json:"action"`
		}{"action", selected.Action}))
		if e != nil {
			return result, rows, e
		}
	}
	return result, rows, fmt.Errorf("fixed hand transition cap reached")
}
func TestSeededDevelopmentDecksAreDistinctReproduciblePermutations(t *testing.T) {
	hashes := map[string]bool{}
	for _, seed := range seeds {
		deck := shuffled(seed)
		if !reflect.DeepEqual(deck, shuffled(seed)) {
			t.Fatal("unreproducible generator")
		}
		sorted := append([]string{}, deck...)
		slices.Sort(sorted)
		full := d.FullDeck()
		slices.Sort(full)
		if !reflect.DeepEqual(sorted, full) {
			t.Fatal("bad deck permutation")
		}
		hash := digest(encoded(deck))
		if hashes[hash] {
			t.Fatal("duplicate family deck")
		}
		hashes[hash] = true
	}
}
func TestFreshPairedPartnerDevelopment(t *testing.T) {
	if os.Getenv("CARDFORD_PARTNER_DEVELOPMENT") != "1" {
		t.Skip("explicit bounded development invocation only; never auto-resume or silently rerun")
	}
	root, e := filepath.Abs("../../../..")
	if e != nil {
		t.Fatal(e)
	}
	out := os.Getenv("CARDFORD_PARTNER_DEVELOPMENT_OUT")
	if out == "" {
		t.Fatal("explicit fresh output directory required")
	}
	out, e = filepath.Abs(out)
	if e != nil {
		t.Fatal(e)
	}
	allowed := filepath.Join(root, "qa", "implementation", "multi-game", "m11") + string(os.PathSeparator)
	if !strings.HasPrefix(strings.ToLower(out), strings.ToLower(allowed)) {
		t.Fatal("output must remain under this packet evidence directory")
	}
	if _, e = os.Stat(out); !os.IsNotExist(e) {
		t.Fatal("output already exists or cannot be checked; use a new run identity")
	}
	if e = os.MkdirAll(out, 0700); e != nil {
		t.Fatal(e)
	}
	sources := map[string]string{}
	for _, dir := range []string{"server/internal/games/spades", "server/internal/legacydecision", "server/internal/evaluation/partnerdevelopment"} {
		e = filepath.WalkDir(filepath.Join(root, dir), func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !entry.IsDir() && strings.HasSuffix(path, ".go") {
				raw, err := os.ReadFile(path)
				if err != nil {
					return err
				}
				relative, _ := filepath.Rel(root, path)
				sources[filepath.ToSlash(relative)] = digest(raw)
			}
			return nil
		})
		if e != nil {
			t.Fatal(e)
		}
	}
	for _, path := range []string{"go.mod", "go.sum", "scripts/windows-tools.json"} {
		raw, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			t.Fatal(err)
		}
		sources[path] = digest(raw)
	}
	manifest := map[string]any{"schemaVersion": "partner-resource-go-development-1.0.0", "purpose": "development-activation-only", "horizon": "complete-hand", "candidate": reasoning.PartnerResourcePolicy, "reference": reasoning.PolicyVersion, "variant": "spades-partners", "evaluatedSeat": 0, "otherSeats": "fixed tactics2.1", "generator": generator, "seeds": seeds, "sourceHashes": sources, "maxWallMs": 60000, "maxDecisionsPerArm": 56, "stoppingRule": "Exactly eight paired authored seed families; do not extend to chase activation", "labels": "unreviewed", "confirmationEligible": false, "freshness": "New deterministic random deals; no archived source fixture is replayed"}
	write := func(name string, value any) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(out, name), append(encoded(value), '\n'), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("manifest.json", manifest)
	file, e := os.OpenFile(filepath.Join(out, "actor-decisions.jsonl"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		t.Fatal(e)
	}
	defer file.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	streams := []stream{}
	failures := []string{}
	started := time.Now()
	for index, seed := range seeds {
		family := fmt.Sprintf("fresh-pr5-%03d", index+1)
		for _, arm := range []string{"reference", "candidate"} {
			result, rows, err := walk(ctx, family, seed, arm, index%4)
			streams = append(streams, result)
			for _, row := range rows {
				if _, e = file.Write(append(encoded(row), '\n')); e != nil {
					t.Fatal(e)
				}
			}
			if err != nil {
				failures = append(failures, family+":"+arm+":"+err.Error())
				break
			}
			if result.Decisions != 56 {
				failures = append(failures, "incomplete accepted-action count")
			}
		}
		if len(failures) > 0 {
			break
		}
	}
	if e = file.Sync(); e != nil {
		t.Fatal(e)
	}
	raw, e := os.ReadFile(filepath.Join(out, "actor-decisions.jsonl"))
	if e != nil {
		t.Fatal(e)
	}
	completed, changed, offer, conserve := 0, 0, 0, 0
	for _, s := range streams {
		if s.OutcomeEligible {
			completed++
		}
		changed += s.Changed
		offer += s.Offer
		conserve += s.Conserve
	}
	status := "passed-development-readiness"
	if len(failures) > 0 || completed != 16 {
		status = "partial-unverified"
	}
	var legalBreaches, coachMismatches any
	if status == "passed-development-readiness" {
		legalBreaches = 0
		coachMismatches = 0
	}
	write("results.json", map[string]any{"schemaVersion": "partner-resource-go-development-results-1.0.0", "status": status, "streams": streams, "completedHands": completed, "changedCandidateDecisions": changed, "offerActivations": offer, "conserveActivations": conserve, "failures": failures, "elapsedMs": time.Since(started).Milliseconds(), "actorDecisionsSha256": digest(raw), "legalBreaches": legalBreaches, "botCoachMismatches": coachMismatches, "humanLabels": "absent", "independentFamilies": "declared development group; not a strength study", "confirmationEligible": false, "limitations": []string{"Eight complete-hand seed families, not complete matches or representative strength.", "One candidate seat, fixed tactics2.1 partner/opponents; no unfamiliar-style robustness.", "Zero activation or zero changes remains a coverage finding, never automatic extra runs.", "Actor trajectories and related arms are withheld until blind human labels freeze; archive is offline private evaluation evidence."}})
	t.Logf("fresh paired development: completeHands=%d changedCandidateDecisions=%d offer=%d conserve=%d; no strength claim", completed, changed, offer, conserve)
	if status != "passed-development-readiness" {
		t.Fatalf("bounded development partial; preserve %s: %v", out, failures)
	}
}
