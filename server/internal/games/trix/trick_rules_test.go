package trix

import (
	"bytes"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

// A complete, fixed deal: South owns H7 and leads C10; East must follow
// with C2 or CJ; North is void in clubs and can discard a diamond or spade.
func trickRulesDeck() []string {
	hands := [4][]string{
		{"C3", "C4", "C5", "C6", "C7", "C8", "C10", "CQ", "CK", "CA", "H2", "H3", "H7"},
		{"C9", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "DJ", "DQ", "DK"},
		{"DA", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "SJ", "SQ", "SK", "SA"},
		{"C2", "CJ", "H4", "H5", "H6", "H8", "H9", "H10", "HJ", "HQ", "HK", "HA", "S2"},
	}
	deck := []string{}
	for _, hand := range hands {
		deck = append(deck, hand...)
	}
	return deck
}

func trickRulesRequest(variant string) string {
	if variant == "complex-solo" || variant == "complex-partners" {
		return "complex"
	}
	return "diamonds"
}

func trickRulesState(t *testing.T, variant string) State {
	t.Helper()
	config := Config{ID: "trix-trick-rules", Variant: variant, LayoutHistoryVersion: layoutHistoryVersion}
	if partners(variant) {
		config.ProfileVersion = announcedTwosProfile
	}
	s, err := New(config, trickRulesDeck())
	if err != nil {
		t.Fatal(err)
	}
	s = mustApply(t, s, 0, Action{Kind: "choose-request", Request: trickRulesRequest(variant)})
	if s.Request == "complex" {
		for _, seat := range []int{0, 3, 2, 1} {
			s = mustApply(t, s, seat, Action{Kind: "declare-doubles"})
		}
	}
	if s.Phase != "playing" || s.Turn != 0 {
		t.Fatalf("fixture did not reach South's lead: phase=%s turn=%d", s.Phase, s.Turn)
	}
	return s
}

func trickRulesJSON(t *testing.T, value any) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestTrixFollowSuit(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			following := mustApply(t, trickRulesState(t, variant), 0, Action{Kind: "play-card", Card: "C10"})
			void := mustApply(t, following, 3, Action{Kind: "play-card", Card: "C2"})
			for _, test := range []struct {
				name  string
				state State
				seat  int
				cards []string
			}{
				{"must-follow-including-losing-card", following, 3, []string{"C2", "CJ"}},
				{"void-may-play-any-held-card", void, 2, []string{"DA", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "SJ", "SQ", "SK", "SA"}},
			} {
				t.Run(test.name, func(t *testing.T) {
					// Expected cards are explicit, not calculated by Legal itself.
					want := make([]Action, len(test.cards))
					for i, card := range test.cards {
						want[i] = Action{Kind: "play-card", Card: card}
					}
					before := trickRulesJSON(t, test.state)
					if got := Legal(Observe(test.state, test.seat)); !reflect.DeepEqual(got, want) {
						t.Fatalf("legal actions = %+v, want %+v", got, want)
					}
					for _, action := range want {
						next := mustApply(t, test.state, test.seat, action)
						if len(next.Hands[test.seat]) != len(test.state.Hands[test.seat])-1 || contains(next.Hands[test.seat], action.Card) {
							t.Fatalf("accepted %s did not remove exactly one held card", action.Card)
						}
						if len(next.Trick) != len(test.state.Trick)+1 || next.Trick[len(next.Trick)-1] != (Play{test.seat, action.Card}) {
							t.Fatalf("accepted %s was not appended to the trick", action.Card)
						}
						if !bytes.Equal(before, trickRulesJSON(t, test.state)) {
							t.Fatalf("accepted %s mutated its input state", action.Card)
						}
					}
				})
			}
		})
	}
}

func TestTrixRejectsIllegalPlays(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			s := mustApply(t, trickRulesState(t, variant), 0, Action{Kind: "play-card", Card: "C10"})
			for _, test := range []struct {
				name string
				seat int
				card string
			}{
				{"off-suit-while-holding-clubs", 3, "HA"},
				{"wrong-turn", 2, "DA"},
				{"card-owned-by-another-seat", 3, "C9"},
				{"already-played-card", 3, "C10"},
			} {
				t.Run(test.name, func(t *testing.T) {
					before := trickRulesJSON(t, s)
					if _, err := Apply(s, test.seat, Action{Kind: "play-card", Card: test.card}); err == nil {
						t.Fatalf("accepted illegal card %s from seat %d", test.card, test.seat)
					}
					if !bytes.Equal(before, trickRulesJSON(t, s)) {
						t.Fatal("rejection changed state (hands, turn, trick, score or history)")
					}
				})
			}
		})
	}
}

func TestTrixTrickWinnerAndNextLeader(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			for _, test := range []struct {
				name       string
				eastCard   string
				winner     int
				nextLead   string
				nextPlayer int
			}{
				{"leader-keeps-trick", "C2", 0, "H2", 3},
				{"follower-wins-trick", "CJ", 3, "HA", 2},
			} {
				t.Run(test.name, func(t *testing.T) {
					s := trickRulesState(t, variant)
					plays := []Play{{0, "C10"}, {3, test.eastCard}, {2, "SA"}, {1, "C9"}}
					for i, play := range plays {
						if s.Turn != play.Seat {
							t.Fatalf("play %d: turn=%d, want %d", i+1, s.Turn, play.Seat)
						}
						s = mustApply(t, s, play.Seat, Action{Kind: "play-card", Card: play.Card})
						if i < 3 && (len(s.Tricks) != 0 || len(s.Trick) != i+1) {
							t.Fatal("trick resolved before all four seats played")
						}
					}
					want := []Trick{{Number: 1, Leader: 0, Winner: test.winner, Plays: plays}}
					if !reflect.DeepEqual(s.Tricks, want) || len(s.Trick) != 0 || s.Turn != test.winner || s.Phase != "playing" {
						t.Fatalf("wrong trick result: tricks=%+v current=%+v turn=%d phase=%s", s.Tricks, s.Trick, s.Turn, s.Phase)
					}
					for seat, hand := range s.Hands {
						if len(hand) != 12 {
							t.Fatalf("seat %d has %d cards after one trick, want 12", seat, len(hand))
						}
					}
					// Trix has no trump or hearts-leading restriction.
					s = mustApply(t, s, test.winner, Action{Kind: "play-card", Card: test.nextLead})
					if !reflect.DeepEqual(s.Trick, []Play{{test.winner, test.nextLead}}) || s.Turn != test.nextPlayer {
						t.Fatalf("winner did not lead the next trick: %+v, turn=%d", s.Trick, s.Turn)
					}
				})
			}
		})
	}
}

func TestTrixBotFollowSuitCommit(t *testing.T) {
	for _, installation := range Installations() {
		if installation.Historical {
			continue
		}
		t.Run(installation.Pin.VariantID, func(t *testing.T) {
			variant := installation.Pin.VariantID
			b, err := installation.Start(trickRulesJSON(t, Config{ID: "trix-bot-rules", Variant: variant}), trickRulesJSON(t, Chance{Deck: trickRulesDeck()}))
			if err != nil {
				t.Fatal(err)
			}
			commit := func(seat int, id string) {
				t.Helper()
				transition, err := b.Commit(seat, id)
				if err != nil {
					t.Fatal(err)
				}
				b = transition.Next
			}
			commit(0, "choose:"+trickRulesRequest(variant))
			if trickRulesRequest(variant) == "complex" {
				for _, seat := range []int{0, 3, 2, 1} {
					commit(seat, "doubles:")
				}
			}
			commit(0, "play:C10")
			before, events, err := b.Persist(0)
			if err != nil {
				t.Fatal(err)
			}
			prepared, err := b.PrepareComplete(context.Background(), 3, PolicyID, "trix-follow-suit")
			if err != nil {
				t.Fatal(err)
			}
			id := prepared.Prepared.CandidateID
			if id != "play:C2" && id != "play:CJ" {
				t.Fatalf("bot selected %q while holding clubs", id)
			}
			if _, err := b.Commit(3, "play:HA"); err == nil {
				t.Fatal("server commit accepted an off-suit card while holding clubs")
			}
			after, afterEvents, err := b.Persist(0)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(before, after) || !reflect.DeepEqual(events, afterEvents) {
				t.Fatal("bot preparation or rejected commit mutated state/history")
			}
			transition, err := b.Commit(3, id)
			if err != nil {
				t.Fatal(err)
			}
			raw, _, err := transition.Next.Persist(0)
			if err != nil {
				t.Fatal(err)
			}
			var checkpoint hot
			if err := json.Unmarshal(raw, &checkpoint); err != nil {
				t.Fatal(err)
			}
			s := checkpoint.State
			if !reflect.DeepEqual(s.Trick, []Play{{0, "C10"}, {3, id[len("play:"):]}}) || len(s.Hands[3]) != 12 || contains(s.Hands[3], id[len("play:"):]) || s.Turn != 2 {
				t.Fatalf("bot commit did not advance the expected play: trick=%+v hand=%v turn=%d", s.Trick, s.Hands[3], s.Turn)
			}
		})
	}
}
