package sessions

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"reflect"
	"testing"
)

func packetChoices(t *testing.T, s gamekernel.BoundSession, seat int) []gamekernel.PublicCandidate {
	t.Helper()
	raw, err := s.Packet(seat)
	if err != nil {
		t.Fatal(err)
	}
	var p struct {
		Candidates []gamekernel.PublicCandidate `json:"candidates"`
	}
	if err = json.Unmarshal(raw, &p); err != nil {
		t.Fatal(err)
	}
	return p.Candidates
}
func unchanged(t *testing.T, s gamekernel.BoundSession, before json.RawMessage) {
	t.Helper()
	after, err := s.SerializePrivate()
	if err != nil || !bytes.Equal(before, after) {
		t.Fatalf("immutable predecessor changed: %v", err)
	}
}

func TestRegisteredLifecycleRoundChanceAndRejections(t *testing.T) {
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			r := testRegistry(t)
			s := testStart(t, r, mode)
			for steps := 0; steps < 100; steps++ {
				n, err := s.Node()
				if err != nil {
					t.Fatal(err)
				}
				if n.Kind == "round-complete" {
					break
				}
				before, err := s.SerializePrivate()
				if err != nil {
					t.Fatal(err)
				}
				if _, err = s.ContinueRound(); err == nil {
					t.Fatal("continued before round boundary")
				}
				if _, err = s.SupplyChance("forged", testMaterial(t)); err == nil {
					t.Fatal("supplied chance outside request")
				}
				var tx gamekernel.BoundTransition
				switch n.Kind {
				case "sealed":
					choices := []gamekernel.SeatChoice{}
					for _, seat := range n.Actors {
						c := packetChoices(t, s, seat)
						if len(c) != 286 {
							t.Fatal("Hearts combinations pruned")
						}
						eligibility, err := gamekernel.ProviderEligibility(c)
						if err != nil || eligibility.Kind != "unsupported-action-space" {
							t.Fatal("large action space misrepresented")
						}
						choices = append(choices, gamekernel.SeatChoice{Seat: seat, CandidateID: c[0].ID})
					}
					if _, err = s.CommitSealed(n.WindowID, choices[:3]); err == nil {
						t.Fatal("partial sealed bundle accepted")
					}
					bad := append([]gamekernel.SeatChoice{}, choices...)
					bad[3] = bad[0]
					if _, err = s.CommitSealed(n.WindowID, bad); err == nil {
						t.Fatal("duplicate sealed actor accepted")
					}
					bad = append([]gamekernel.SeatChoice{}, choices...)
					bad[3].CandidateID = choices[0].CandidateID
					if _, err = s.CommitSealed(n.WindowID, bad); err == nil {
						t.Fatal("sibling actor's choice accepted")
					}
					tx, err = s.CommitSealed(n.WindowID, choices)
				case "actor":
					if _, err = s.Packet((*n.Seat + 1) % 4); err == nil {
						t.Fatal("ineligible packet exposed")
					}
					if _, err = s.Commit(*n.Seat, "play:not-a-card"); err == nil {
						t.Fatal("unknown candidate accepted")
					}
					if _, err = s.Commit((*n.Seat+1)%4, packetChoices(t, s, *n.Seat)[0].ID); err == nil {
						t.Fatal("wrong actor committed")
					}
					tx, err = s.Commit(*n.Seat, packetChoices(t, s, *n.Seat)[0].ID)
				case "automatic":
					if _, err = s.Advance("wrong"); err == nil {
						t.Fatal("wrong transition ID accepted")
					}
					tx, err = s.Advance(n.TransitionID)
				default:
					t.Fatalf("unexpected lifecycle node %+v", n)
				}
				if err != nil {
					t.Fatal(err)
				}
				unchanged(t, s, before)
				s = tx.Next
			}
			n, err := s.Node()
			if err != nil || n.Kind != "round-complete" {
				t.Fatalf("no round boundary: %+v %v", n, err)
			}
			finished, err := s.SerializePrivate()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = s.SupplyChance("deal:2", testMaterial(t)); err == nil {
				t.Fatal("chance bypassed round confirmation")
			}
			confirmed, err := s.ContinueRound()
			if err != nil {
				t.Fatal(err)
			}
			unchanged(t, s, finished)
			if len(confirmed.PrivateEvents) != 0 {
				t.Fatal("confirmation invented a game event")
			}
			pending := confirmed.Next
			n, err = pending.Node()
			if err != nil || n.Kind != "chance" {
				t.Fatalf("confirmation not a distinct chance node: %+v %v", n, err)
			}
			pendingBytes, err := pending.SerializePrivate()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = pending.ContinueRound(); err == nil {
				t.Fatal("confirmed round twice")
			}
			if _, err = pending.Packet(0); err == nil {
				t.Fatal("chance exposed actor choices")
			}
			for _, bad := range []json.RawMessage{json.RawMessage(`{"kind":"request-deal","roundNumber":2}`), json.RawMessage(`{"kind":"deal","deck":[]}`), json.RawMessage(`{"kind":"deal","deck":[],"privateExtra":true}`), json.RawMessage(`null`)} {
				if _, err = pending.SupplyChance(n.RequestID, bad); err == nil {
					t.Fatal("bad chance material accepted")
				}
				unchanged(t, pending, pendingBytes)
			}
			view, err := pending.View(0)
			if err != nil {
				t.Fatal(err)
			}
			var v struct {
				Table struct {
					RoundNumber int   `json:"roundNumber"`
					History     []any `json:"history"`
				} `json:"table"`
			}
			if err = json.Unmarshal(view, &v); err != nil || v.Table.RoundNumber != 1 || len(v.Table.History) != 13 {
				t.Fatal("confirmation erased finished review")
			}
			reopened, err := r.DecodeDocument(pendingBytes)
			if err != nil {
				t.Fatal(err)
			}
			dealt, err := reopened.SupplyChance(n.RequestID, testMaterial(t))
			if err != nil {
				t.Fatal(err)
			}
			unchanged(t, pending, pendingBytes)
			view, err = dealt.Next.View(0)
			if err != nil {
				t.Fatal(err)
			}
			if err = json.Unmarshal(view, &v); err != nil || v.Table.RoundNumber != 2 || len(v.Table.History) != 0 {
				t.Fatal("chance did not create next hand")
			}
			if len(dealt.PrivateEvents) != 1 {
				t.Fatal("deal event boundary mismatch")
			}
		})
	}
}

func TestRegisteredHiddenHandsAndPreparedReviewIsolation(t *testing.T) {
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		t.Run(mode, func(t *testing.T) {
			r := testRegistry(t)
			source := testStart(t, r, mode)
			actor := 1
			policy := "spades-tactics-2.1.0"
			if mode == "hearts" {
				actor = 0
				policy = "hearts-baseline-1.0.0"
			}
			raw, err := source.SerializePrivate()
			if err != nil {
				t.Fatal(err)
			}
			var m map[string]any
			if err = json.Unmarshal(raw, &m); err != nil {
				t.Fatal(err)
			}
			payload := m["payload"].(map[string]any)
			hands := payload["hands"].([]any)
			a, b := (actor+1)%4, (actor+2)%4
			hands[a], hands[b] = hands[b], hands[a]
			payload["id"] = "different-private-identity"
			changed, err := json.Marshal(m)
			if err != nil {
				t.Fatal(err)
			}
			twin, err := r.DecodeDocument(changed)
			if err != nil {
				t.Fatal(err)
			}
			first, err := source.Prepare(actor, policy)
			if err != nil {
				t.Fatal(err)
			}
			second, err := twin.Prepare(actor, policy)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(first, second) {
				t.Fatal("hidden hand/identity permutation changed original actor preparation")
			}
			firstPacket, err := source.Packet(actor)
			if err != nil {
				t.Fatal(err)
			}
			secondPacket, err := twin.Packet(actor)
			if err != nil || !bytes.Equal(firstPacket, secondPacket) {
				t.Fatal("packet leaks hidden state")
			}
			firstView, err := source.View(actor)
			if err != nil {
				t.Fatal(err)
			}
			secondView, err := twin.View(actor)
			if err != nil || !bytes.Equal(firstView, secondView) {
				t.Fatal("view leaks hidden state")
			}
			first.Analysis[0] = 'x'
			again, err := source.Prepare(actor, policy)
			if err != nil || !reflect.DeepEqual(again, second) {
				t.Fatal("prepared output aliases saved actor data")
			}
			if _, err = source.Prepare(actor, "unknown-policy"); err == nil {
				t.Fatal("unknown policy silently fell back")
			}
			unchanged(t, source, raw)
			firstPacket[0] = 'x'
			firstView[0] = 'x'
			unchanged(t, source, raw)
			if mode != "hearts" {
				_, err = source.Commit(actor, again.CandidateID)
				if err != nil {
					t.Fatal(err)
				}
				historical, err := source.Prepare(actor, policy)
				if err != nil || !reflect.DeepEqual(historical, again) {
					t.Fatal("later branch changed original review preparation")
				}
			}
		})
	}
}
