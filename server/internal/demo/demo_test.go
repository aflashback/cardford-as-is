package demo

import (
	"cardford/server/internal/contracts"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
)

// MG-15: a wrong edge or changed teaching frame must fail this traversal.
func TestAuthoredGraphEveryBranch(t *testing.T) {
	frames := map[string]struct {
		title, body string
		labels      []string
		complete    bool
	}{
		"opening":      {"A short example game", "In Spades, you play fourth. The first three cards are the 2, ace and 7 of clubs. You hold the 4 and king of clubs.", []string{"Play the 4 of clubs", "Play the king of clubs"}, false},
		"notice":       {"Notice", "Both cards follow suit. Neither can beat the visible ace. Keeping the king preserves a higher card for a later trick.", []string{"Show the original", "Compare another choice"}, false},
		"original":     {"Original", "In this authored example, you play the 4 of clubs. The ace wins this trick. Your king stays in your hand.", []string{"Compare another choice", "Finish example"}, false},
		"continuation": {"Possible continuation", "If you played the king instead, the visible ace would still win this trick. This example explains that tradeoff; it does not predict a whole game.", []string{"Show the original", "Finish example"}, false},
		"complete":     {"Example complete", "You have reached the end of this fixed example. Replay it or return to your account.", []string{"Replay example"}, true},
	}
	choiceIDs := map[string][]string{
		"opening": {"play-four", "play-king"}, "notice": {"show-original", "compare-choice"},
		"original": {"compare-choice", "finish"}, "continuation": {"show-original", "finish"}, "complete": {"replay"},
	}
	check := func(frame contracts.DemoFrame, node string) {
		t.Helper()
		want := frames[node]
		if frame.ContentVersion != "spades-example-1.0.0" || frame.NodeID != node || frame.Label != "demo" || frame.Title != want.title || frame.Body != want.body || frame.Complete != want.complete {
			t.Fatalf("wrong authored frame for %s: %+v", node, frame)
		}
		if !reflect.DeepEqual(frame.Cards, []contracts.Card{"C4", "CK", "CA"}) {
			t.Fatalf("wrong visible cards: %v", frame.Cards)
		}
		labels := make([]string, len(frame.Choices))
		ids := make([]string, len(frame.Choices))
		for i, choice := range frame.Choices {
			labels[i] = choice.Label
			ids[i] = choice.ID
		}
		if !reflect.DeepEqual(labels, want.labels) {
			t.Fatalf("wrong labels for %s: %v", node, labels)
		}
		if !reflect.DeepEqual(ids, choiceIDs[node]) {
			t.Fatalf("wrong allowed choice IDs for %s: %v", node, ids)
		}
		if _, err := json.Marshal(frame); err != nil {
			t.Fatalf("frame violates frozen DTO: %v", err)
		}
	}
	check(frameJSON(t, `{"kind":"open","contentVersion":"spades-example-1.0.0"}`), "opening")
	edges := []struct{ from, choice, to string }{
		{"opening", "play-four", "notice"}, {"opening", "play-king", "notice"},
		{"notice", "show-original", "original"}, {"notice", "compare-choice", "continuation"},
		{"original", "compare-choice", "continuation"}, {"original", "finish", "complete"},
		{"continuation", "show-original", "original"}, {"continuation", "finish", "complete"},
		{"complete", "replay", "opening"},
	}
	for _, edge := range edges {
		t.Run(edge.from+"/"+edge.choice, func(t *testing.T) {
			raw, _ := json.Marshal(map[string]string{"kind": "choose", "contentVersion": "spades-example-1.0.0", "nodeId": edge.from, "choiceId": edge.choice})
			check(frameJSON(t, string(raw)), edge.to)
		})
	}
	check(frameJSON(t, `{"kind":"replay","contentVersion":"spades-example-1.0.0"}`), "opening")
}

func frameJSON(t *testing.T, raw string) contracts.DemoFrame {
	t.Helper()
	frame, err := GetFrameJSON([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	return frame
}

// MG-15: requests may select installed authored content only, never supply a
// position, seed, live command or a forged transition.
func TestRejectUntrustedDemoRequests(t *testing.T) {
	invalid := map[string]string{
		"empty":                  "",
		"null":                   "null",
		"array":                  "[]",
		"malformed":              "{",
		"missing-kind":           `{"contentVersion":"spades-example-1.0.0"}`,
		"missing-version":        `{"kind":"open"}`,
		"wrong-kind":             `{"kind":"advance","contentVersion":"spades-example-1.0.0"}`,
		"unknown-version":        `{"kind":"open","contentVersion":"invented"}`,
		"replay-version":         `{"kind":"replay","contentVersion":"invented"}`,
		"choose-version":         `{"kind":"choose","contentVersion":"invented","nodeId":"opening","choiceId":"play-four"}`,
		"empty-version":          `{"kind":"open","contentVersion":""}`,
		"number-version":         `{"kind":"open","contentVersion":1}`,
		"extra-open-node":        `{"kind":"open","contentVersion":"spades-example-1.0.0","nodeId":"complete"}`,
		"extra-open-choice":      `{"kind":"open","contentVersion":"spades-example-1.0.0","choiceId":"finish"}`,
		"extra-replay-node":      `{"kind":"replay","contentVersion":"spades-example-1.0.0","nodeId":"complete"}`,
		"missing-node":           `{"kind":"choose","contentVersion":"spades-example-1.0.0","choiceId":"play-four"}`,
		"missing-choice":         `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"opening"}`,
		"unknown-node":           `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"invented","choiceId":"play-four"}`,
		"unknown-choice":         `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"opening","choiceId":"invented"}`,
		"empty-node":             `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"","choiceId":"play-four"}`,
		"null-choice":            `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"opening","choiceId":null}`,
		"duplicate-property":     `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"opening","choiceId":"invented","choiceId":"play-four"}`,
		"trailing-value":         `{"kind":"open","contentVersion":"spades-example-1.0.0"} {}`,
		"unpaired-surrogate":     `{"kind":"open","contentVersion":"\ud800"}`,
		"case-insensitive-field": `{"kind":"open","ContentVersion":"spades-example-1.0.0"}`,
		"overlong-version":       `{"kind":"open","contentVersion":"` + strings.Repeat("a", 257) + `"}`,
		"overlong-node":          `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"` + strings.Repeat("a", 257) + `","choiceId":"play-four"}`,
		"overlong-choice":        `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"opening","choiceId":"` + strings.Repeat("a", 257) + `"}`,
	}
	for _, extra := range []string{
		`"position":{"hand":["CA"]}`, `"seed":1`, `"commandId":"client-command"`,
		`"expectedRevision":1`, `"action":{"card":"C4"}`, `"ownerId":"someone"`, `"plan":"paid"`,
		`"nextNodeId":"complete"`, `"cards":["CA"]`, `"body":"invented advice"`,
	} {
		invalid["mixed-"+extra] = `{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"opening","choiceId":"play-four",` + extra + `}`
	}
	for name, raw := range invalid {
		t.Run(name, func(t *testing.T) {
			frame, err := GetFrameJSON([]byte(raw))
			if !errors.Is(err, ErrInvalidRequest) {
				t.Fatalf("expected invalid request, got %+v, %v", frame, err)
			}
			if !reflect.DeepEqual(frame, contracts.DemoFrame{}) {
				t.Fatalf("rejection returned authored output: %+v", frame)
			}
		})
	}
	if _, err := GetFrame(contracts.DemoFrameRequest{}); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("uninitialized typed request accepted: %v", err)
	}
}

func TestChoicesAreScopedToTheCurrentNode(t *testing.T) {
	allowed := map[string]map[string]bool{
		"opening":      {"play-four": true, "play-king": true},
		"notice":       {"show-original": true, "compare-choice": true},
		"original":     {"compare-choice": true, "finish": true},
		"continuation": {"show-original": true, "finish": true},
		"complete":     {"replay": true},
	}
	for node, choices := range allowed {
		for _, choice := range []string{"play-four", "play-king", "show-original", "compare-choice", "finish", "replay"} {
			if choices[choice] {
				continue
			}
			t.Run(node+"/"+choice, func(t *testing.T) {
				raw, _ := json.Marshal(map[string]string{"kind": "choose", "contentVersion": "spades-example-1.0.0", "nodeId": node, "choiceId": choice})
				if _, err := GetFrameJSON(raw); !errors.Is(err, ErrInvalidRequest) {
					t.Fatalf("foreign node choice accepted: %v", err)
				}
			})
		}
	}
}

func TestReturnedFramesCannotMutateInstalledContent(t *testing.T) {
	raw := []byte(`{"kind":"open","contentVersion":"spades-example-1.0.0"}`)
	var request contracts.DemoFrameRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		t.Fatal(err)
	}
	first, err := GetFrame(request)
	if err != nil {
		t.Fatal(err)
	}
	first.Cards[0] = "SA"
	first.Choices[0].ID = "finish"
	first.Choices[0].Label = "Invented"
	first.Body = "Invented"
	// RawJSON must also remain private to its validated binding.
	copy := request.RawJSON()
	copy[0] = '['
	next, err := GetFrame(request)
	if err != nil {
		t.Fatal(err)
	}
	if next.Cards[0] != "C4" || next.Choices[0].ID != "play-four" || next.Choices[0].Label != "Play the 4 of clubs" || next.Body == "Invented" {
		t.Fatalf("caller mutated installed content: %+v", next)
	}
}

func TestAnonymousRequestsAreRepeatableAndIndependent(t *testing.T) {
	var workers sync.WaitGroup
	for range 16 {
		workers.Go(func() {
			for range 8 {
				frame, err := GetFrameJSON([]byte(`{"kind":"choose","contentVersion":"spades-example-1.0.0","nodeId":"original","choiceId":"finish"}`))
				if err != nil || frame.NodeID != "complete" || !frame.Complete {
					t.Errorf("independent repeat failed: %+v, %v", frame, err)
					return
				}
				frame.Cards[0] = "SA"
			}
		})
	}
	workers.Wait()
}
