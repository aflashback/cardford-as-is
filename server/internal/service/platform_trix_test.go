package service

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/games/trix"
	"context"
	"encoding/json"
	"testing"
)

func TestTrixSavedAdviceExposure(t *testing.T) {
	raw := json.RawMessage(`{"gameId":"trix","variantId":"complex-solo","decisionId":"original-work-id","level":3,"origin":"code","title":"Choose a request","text":"Your own diamonds carry ten points each.","policyVersion":"1.0.0","recommendedCandidateId":"choose:complex","alternatives":["choose:trix"],"evidenceRefs":["own-hand"]}`)
	for _, level := range []int{1, 2, 3} {
		result, err := projectTrixAdvice(raw, "game:decision:4", level)
		if err != nil {
			t.Fatal(err)
		}
		if err = contracts.Validate("RegisteredAdvice", result); err != nil {
			t.Fatal(err)
		}
		var v struct {
			DecisionID   string   `json:"decisionId"`
			Level        int      `json:"level"`
			Recommended  string   `json:"recommendedCandidateId"`
			Alternatives []string `json:"alternatives"`
		}
		if err = json.Unmarshal(result, &v); err != nil {
			t.Fatal(err)
		}
		if v.DecisionID != "game:decision:4" || v.Level != level {
			t.Fatal("exposure lost public source identity")
		}
		if level < 3 && (v.Recommended != "" || len(v.Alternatives) > 0) {
			t.Fatal("suggestion leaked at notice/reason depth")
		}
		if level == 3 && v.Recommended != "choose:complex" {
			t.Fatal("original selection changed")
		}
	}
	hidden := json.RawMessage(`{"gameId":"trix","variantId":"complex-solo","decisionId":"d","level":3,"origin":"code","title":"t","text":"t","policyVersion":"1.0.0","evidenceRefs":[],"hiddenHands":[]}`)
	if _, err := projectTrixAdvice(hidden, "d", 1); err == nil {
		t.Fatal("accepted hidden field")
	}
}

type countedTrixReviewSession struct {
	gamekernel.BoundSession
	presentations, packets *int
}

func (b countedTrixReviewSession) Presentation(seat int) (json.RawMessage, error) {
	*b.presentations++
	return b.BoundSession.Presentation(seat)
}
func (b countedTrixReviewSession) Packet(seat int) (json.RawMessage, error) {
	*b.packets++
	return b.BoundSession.Packet(seat)
}

// A first-request review in a complete Basic game must retain identical frames
// while avoiding projections and snapshot rebinding for the nineteen later
// requests. Count actual boundary calls rather than asserting flaky timings.
func TestTrixSelectedReviewProjectsOnlyOriginalRequest(t *testing.T) {
	r := trix.Installations()[0]
	deck := trix.Deck()
	for i, c := range deck {
		if c == "H7" {
			deck[0], deck[i] = deck[i], deck[0]
			break
		}
	}
	config, _ := json.Marshal(trix.Config{ID: "review-full-basic", Variant: "basic-solo"})
	material, _ := json.Marshal(trix.Chance{Deck: deck})
	b, err := r.Start(config, material)
	if err != nil {
		t.Fatal(err)
	}
	selected := "review-full-basic:decision:0"
	review := trixReviewCollector{game: "review-full-basic", selected: selected, revision: 0, choices: map[int64]string{}, assistance: map[int64]int{}, cases: []any{}, frames: []any{}}
	firstUnit := b.UnitID()
	expected := []any{}
	var selectedAction json.RawMessage
	presentations, packets, resolves, requests := 0, 0, 0, 0
	for revision := int64(0); revision < 2000; revision++ {
		node, e := b.Node()
		if e != nil {
			t.Fatal(e)
		}
		candidate := ""
		if node.Kind == "actor" {
			raw, e := b.Packet(*node.Seat)
			if e != nil {
				t.Fatal(e)
			}
			var p struct {
				Candidates []struct {
					ID     string          `json:"id"`
					Public json.RawMessage `json:"public"`
				} `json:"candidates"`
			}
			if e = json.Unmarshal(raw, &p); e != nil {
				t.Fatal(e)
			}
			candidate = p.Candidates[0].ID
			if *node.Seat == 0 {
				review.choices[revision] = candidate
			}
			if revision == 0 {
				selectedAction = p.Candidates[0].Public
			}
		}
		if b.UnitID() == firstUnit {
			presentation, e := b.Presentation(0)
			if e != nil {
				t.Fatal(e)
			}
			var action any
			if revision == 1 {
				action = selectedAction
			}
			expected = append(expected, map[string]any{"game": presentation, "action": action, "decisionId": selected, "notes": []string{}})
		}
		wrapped := countedTrixReviewSession{BoundSession: b, presentations: &presentations, packets: &packets}
		if e := review.visit(context.Background(), revision, func() (gamekernel.BoundSession, error) { resolves++; return wrapped, nil }); e != nil {
			t.Fatal(e)
		}
		if node.Kind == "session-complete" {
			break
		}
		var next gamekernel.BoundTransition
		switch node.Kind {
		case "actor":
			next, e = b.Commit(*node.Seat, candidate)
		case "round-complete":
			requests++
			next, e = b.ContinueRound()
		case "chance":
			next, e = b.SupplyChance(node.RequestID, material)
		default:
			t.Fatalf("unexpected %s", node.Kind)
		}
		if e != nil {
			t.Fatal(e)
		}
		b = next.Next
	}
	if requests != 20 {
		t.Fatalf("only replayed %d requests", requests)
	}
	want, _ := json.Marshal(expected)
	got, _ := json.Marshal(review.frames)
	if !bytes.Equal(want, got) {
		t.Fatal("saved first-request frames changed")
	}
	if !review.finished || presentations != len(expected) || packets != 1 || resolves != len(expected)+1 {
		t.Fatalf("unexpected review work: frames=%d presentations=%d packets=%d resolves=%d finished=%v", len(expected), presentations, packets, resolves, review.finished)
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if e := review.visit(canceled, 2001, func() (gamekernel.BoundSession, error) { t.Fatal("resolved canceled review"); return nil, nil }); e != context.Canceled {
		t.Fatal("completed projection swallowed cancellation")
	}
}
