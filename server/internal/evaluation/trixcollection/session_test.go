package trixcollection

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"

	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
)

func fixtureDeck(t *testing.T, hands [4][]string) []string {
	t.Helper()
	seen := map[string]bool{}
	for _, hand := range hands {
		for _, card := range hand {
			if seen[card] {
				t.Fatal("duplicate fixture card")
			}
			seen[card] = true
		}
	}
	remaining := []string{}
	for _, card := range trix.Deck() {
		if !seen[card] {
			remaining = append(remaining, card)
		}
	}
	for seat := range hands {
		for len(hands[seat]) < 13 {
			hands[seat] = append(hands[seat], remaining[0])
			remaining = remaining[1:]
		}
	}
	deck := []string{}
	for _, hand := range hands {
		deck = append(deck, hand...)
	}
	return deck
}
func start(t *testing.T, variant, request string, deck []string) gamekernel.BoundSession {
	t.Helper()
	b, err := StartRequest(variant, request, "mechanics-fixture", deck)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func commit(t *testing.T, b gamekernel.BoundSession, actor int, id string) gamekernel.BoundSession {
	t.Helper()
	next, err := CommitRequest(b, b.EventCount(), actor, id)
	if err != nil {
		t.Fatalf("commit actor %d %s: %v", actor, id, err)
	}
	return next
}
func declarations(t *testing.T, b gamekernel.BoundSession, cards map[int]string) gamekernel.BoundSession {
	t.Helper()
	for i := 0; i < 4; i++ {
		n, err := b.Node()
		if err != nil {
			t.Fatal(err)
		}
		if n.Phase != "declare-doubles" {
			t.Fatal("missing declaration circuit")
		}
		b = commit(t, b, *n.Seat, "doubles:"+cards[*n.Seat])
	}
	return b
}

// Fixture continuation selects only enumerated actor candidates. It is test
// mechanics, never a player transport, deterministic policy, or collected data.
func complete(t *testing.T, b gamekernel.BoundSession) (gamekernel.BoundSession, []Choice) {
	t.Helper()
	choices := []Choice{}
	for i := 0; i < 57; i++ {
		n, err := b.Node()
		if err != nil {
			t.Fatal(err)
		}
		if n.Kind == "round-complete" {
			return b, choices
		}
		p, err := CurrentPacket(b)
		if err != nil {
			t.Fatal(err)
		}
		var packet struct {
			Candidates []gamekernel.PublicCandidate `json:"candidates"`
		}
		if err = json.Unmarshal(p, &packet); err != nil {
			t.Fatal(err)
		}
		choice := Choice{Actor: *n.Seat, CandidateID: packet.Candidates[0].ID}
		choices = append(choices, choice)
		b = commit(t, b, choice.Actor, choice.CandidateID)
	}
	t.Fatal("fixture failed to reach request boundary")
	return nil, nil
}
func totalSum(out Outcome) int {
	sum := 0
	for _, score := range out.ScoreTotals {
		sum += score.Total
	}
	return sum
}

func TestTenCompleteRequestCombinationsAndReplay(t *testing.T) {
	for _, variant := range trix.Variants {
		requests := []string{"diamonds", "king", "queens", "lutoosh"}
		if variant == "complex-solo" || variant == "complex-partners" {
			requests = []string{"complex"}
		}
		for _, request := range requests {
			t.Run(variant+"/"+request, func(t *testing.T) {
				deck := trix.Deck()
				b := start(t, variant, request, deck)
				if b.Pin() != trix.Pin(variant) || b.EventCount() != 2 {
					t.Fatal("incorrect current pin/admission revision")
				}
				scheduled, err := ScheduledRequest(b)
				if err != nil {
					t.Fatal(err)
				}
				if scheduled != (Choice{2, "choose:" + request}) {
					t.Fatalf("H7 owner admission: %+v", scheduled)
				}
				observation, err := publicObservation(b)
				if err != nil {
					t.Fatal(err)
				}
				wantPool := []string{"diamonds", "lutoosh", "queens", "king", "trix"}
				if variant == "complex-solo" || variant == "complex-partners" {
					wantPool = []string{"complex", "trix"}
				}
				remaining := []string{}
				for _, r := range wantPool {
					if r != request {
						remaining = append(remaining, r)
					}
				}
				if !reflect.DeepEqual(observation.RemainingRequests, remaining) {
					t.Fatal("native request pool rewritten")
				}
				if _, err = FinishRequest(b); err == nil {
					t.Fatal("incomplete request finished")
				}
				shared, err := RulesDescriptor(b.Pin(), request)
				if err != nil {
					t.Fatal(err)
				}
				b, choices := complete(t, b)
				out, err := FinishRequest(b)
				if err != nil {
					t.Fatal(err)
				}
				if out.CompletedTricks != 13 || out.AcceptedPlays != 52 || out.NativeTerminalPhase != "round-complete" {
					t.Fatalf("premature completion: %+v", out)
				}
				wantTotal := map[string]int{"diamonds": -130, "king": -75, "queens": -100, "lutoosh": -195, "complex": -500}[request]
				if totalSum(out) != wantTotal {
					t.Fatalf("score sum %d want literal %d", totalSum(out), wantTotal)
				}
				frame, err := SnapshotFrame(b, nil)
				if err != nil {
					t.Fatal(err)
				}
				if frame.NativeActorPacket != nil || frame.Outcome == nil || frame.ScheduledRequest != nil || frame.Rules != shared {
					t.Fatal("terminal frame or shared rules changed")
				}
				opened, err := OpenRequest(b.Pin(), frame.Snapshot)
				if err != nil {
					t.Fatal(err)
				}
				openedOut, err := FinishRequest(opened)
				if err != nil || !reflect.DeepEqual(openedOut, out) {
					t.Fatal("native snapshot replay changed outcome", err)
				}
				replayed, err := Replay(ReplayInput{Variant: variant, Request: request, ID: "mechanics-fixture", Deck: deck, Choices: choices})
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(*replayed.Outcome, out) || !bytes.Equal(replayed.Snapshot, frame.Snapshot) {
					t.Fatal("accepted action replay differs")
				}
				if _, err = Replay(ReplayInput{Variant: variant, Request: request, ID: "mechanics-fixture", Deck: deck, Choices: choices[:len(choices)-1]}); err == nil {
					t.Fatal("incomplete replay accepted")
				}
				if _, err = CommitRequest(b, b.EventCount(), 0, "play:C2"); err == nil {
					t.Fatal("terminal commit accepted")
				}
				if _, err = CurrentPacket(b); err == nil {
					t.Fatal("terminal actor packet synthesized")
				}
			})
		}
	}
}

func TestH7OwnersAndRightwardSeatMapping(t *testing.T) {
	for owner := 0; owner < 4; owner++ {
		hands := [4][]string{}
		hands[owner] = []string{"H7"}
		b := start(t, "basic-solo", "queens", fixtureDeck(t, hands))
		for i := 0; i < 4; i++ {
			n, err := b.Node()
			if err != nil {
				t.Fatal(err)
			}
			if *n.Seat != (owner+4-i)%4 {
				t.Fatal("not 0 South -> 3 East -> 2 North -> 1 West")
			}
			b = commit(t, b, *n.Seat, "doubles:")
		}
		n, _ := b.Node()
		if *n.Seat != owner {
			t.Fatal("owner does not lead after declaration circuit")
		}
	}
}

func TestRejectScopePinRevisionActorAndIllegalCard(t *testing.T) {
	for _, v := range []string{"spades", "basic-solo", "basic-partners", "complex-solo", "complex-partners"} {
		for _, r := range []string{"trix", "unknown"} {
			if _, err := StartRequest(v, r, "reject", trix.Deck()); err == nil {
				t.Fatal("out-of-scope request accepted")
			}
		}
	}
	for _, pair := range [][2]string{{"basic-solo", "complex"}, {"complex-solo", "diamonds"}, {"complex-partners", "king"}} {
		if _, err := StartRequest(pair[0], pair[1], "reject", trix.Deck()); err == nil {
			t.Fatal("mixed variant request accepted")
		}
	}
	b := start(t, "basic-solo", "diamonds", trix.Deck())
	raw, _ := b.SerializePrivate()
	for _, pin := range []gamekernel.Pin{trix.LegacyPin("basic-solo"), trix.Pin("complex-solo"), {GameID: "spades"}} {
		if _, err := OpenRequest(pin, raw); err == nil {
			t.Fatal("mismatched pin accepted")
		}
	}
	changed := trix.Pin("basic-solo")
	changed.EventSchemaVersion = "9.0.0"
	if _, err := OpenRequest(changed, raw); err == nil {
		t.Fatal("partial pin accepted")
	}
	for _, c := range []struct {
		revision, actor int
		id              string
	}{{1, 2, "play:H2"}, {2, 0, "play:C2"}, {2, 2, "play:C2"}, {2, 2, "choose:trix"}, {2, 2, "doubles:"}} {
		if _, err := CommitRequest(b, c.revision, c.actor, c.id); err == nil {
			t.Fatal("invalid commit accepted", c)
		}
	}
	after, _ := b.SerializePrivate()
	if !bytes.Equal(raw, after) {
		t.Fatal("rejection mutated snapshot")
	}
	// A valid native continuation is still invalid for an isolated collection.
	b, _ = complete(t, b)
	next, err := b.ContinueRound()
	if err != nil {
		t.Fatal(err)
	}
	continued, _ := next.Next.SerializePrivate()
	if _, err = OpenRequest(next.Next.Pin(), continued); err == nil {
		t.Fatal("native chance continuation admitted")
	}
	// Native Jacks sessions are legal engine input but outside collection scope.
	r, _ := registration(trix.Pin("basic-solo"))
	config, _ := json.Marshal(trix.Config{ID: "layout", Variant: "basic-solo"})
	material, _ := json.Marshal(trix.Chance{Deck: trix.Deck()})
	layout, err := r.Start(config, material)
	if err != nil {
		t.Fatal(err)
	}
	transition, err := layout.Commit(2, "choose:trix")
	if err != nil {
		t.Fatal(err)
	}
	bad, _ := transition.Next.SerializePrivate()
	if _, err = OpenRequest(layout.Pin(), bad); err == nil {
		t.Fatal("Jacks snapshot admitted")
	}
}
