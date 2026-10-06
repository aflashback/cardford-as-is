// Package demo serves the closed authored MG-15 example without game work.
package demo

import (
	"cardford/server/internal/contracts"
	"encoding/json"
	"errors"
	"fmt"
)

// ContentVersion pins the unchanged original five-frame Spades example.
const ContentVersion = "spades-example-1.0.0"

// ErrInvalidRequest covers malformed DTOs and uninstalled graph references.
var ErrInvalidRequest = errors.New("invalid demo request")

// GetFrame resolves only installed authored choices. No identity, authoritative
// game state, engine, provider or allowance is needed for this public example.
func GetFrame(request contracts.DemoFrameRequest) (contracts.DemoFrame, error) {
	return GetFrameJSON(request.RawJSON())
}

// GetFrameJSON is the strict transport boundary for the frozen demo DTO. It
// rejects extra fields, duplicate properties and mixed live commands before
// looking up a node. It does not normalize unknown content versions or IDs.
func GetFrameJSON(raw []byte) (contracts.DemoFrame, error) {
	if err := contracts.Validate("DemoFrameRequest", raw); err != nil {
		return contracts.DemoFrame{}, fmt.Errorf("%w: malformed frame request", ErrInvalidRequest)
	}
	// This projection is decoded only after the complete frozen union validates.
	var request struct {
		Kind           string `json:"kind"`
		ContentVersion string `json:"contentVersion"`
		NodeID         string `json:"nodeId"`
		ChoiceID       string `json:"choiceId"`
	}
	if err := json.Unmarshal(raw, &request); err != nil {
		return contracts.DemoFrame{}, fmt.Errorf("%w: malformed frame request", ErrInvalidRequest)
	}
	if request.ContentVersion != ContentVersion {
		return contracts.DemoFrame{}, fmt.Errorf("%w: content version is not installed", ErrInvalidRequest)
	}
	nodeID := "opening"
	if request.Kind == "choose" {
		node, found := graph[request.NodeID]
		if !found {
			return contracts.DemoFrame{}, fmt.Errorf("%w: node is not installed", ErrInvalidRequest)
		}
		matched := false
		for _, choice := range node.choices {
			if choice.id == request.ChoiceID {
				nodeID, matched = choice.next, true
				break
			}
		}
		if !matched {
			return contracts.DemoFrame{}, fmt.Errorf("%w: choice does not belong to node", ErrInvalidRequest)
		}
	}
	return project(nodeID), nil
}

type authoredChoice struct{ id, label, next string }
type authoredNode struct {
	title, body string
	choices     []authoredChoice
	complete    bool
}

// The graph is server-owned and closed. Next-node references are never returned
// in frames, so the browser can present only the confirmed node's choices.
var graph = map[string]authoredNode{
	"opening": {
		title:   "A short example game",
		body:    "In Spades, you play fourth. The first three cards are the 2, ace and 7 of clubs. You hold the 4 and king of clubs.",
		choices: []authoredChoice{{"play-four", "Play the 4 of clubs", "notice"}, {"play-king", "Play the king of clubs", "notice"}},
	},
	"notice": {
		title:   "Notice",
		body:    "Both cards follow suit. Neither can beat the visible ace. Keeping the king preserves a higher card for a later trick.",
		choices: []authoredChoice{{"show-original", "Show the original", "original"}, {"compare-choice", "Compare another choice", "continuation"}},
	},
	"original": {
		title:   "Original",
		body:    "In this authored example, you play the 4 of clubs. The ace wins this trick. Your king stays in your hand.",
		choices: []authoredChoice{{"compare-choice", "Compare another choice", "continuation"}, {"finish", "Finish example", "complete"}},
	},
	"continuation": {
		title:   "Possible continuation",
		body:    "If you played the king instead, the visible ace would still win this trick. This example explains that tradeoff; it does not predict a whole game.",
		choices: []authoredChoice{{"show-original", "Show the original", "original"}, {"finish", "Finish example", "complete"}},
	},
	"complete": {
		title:    "Example complete",
		body:     "You have reached the end of this fixed example. Replay it or return to your account.",
		choices:  []authoredChoice{{"replay", "Replay example", "opening"}},
		complete: true,
	},
}

func project(nodeID string) contracts.DemoFrame {
	node := graph[nodeID]
	frame := contracts.DemoFrame{
		ContentVersion: ContentVersion, NodeID: nodeID, Label: "demo",
		Title: node.title, Body: node.body, Cards: []contracts.Card{"C4", "CK", "CA"}, Complete: node.complete,
	}
	for _, choice := range node.choices {
		frame.Choices = append(frame.Choices, struct {
			ID    string `json:"id"`
			Label string `json:"label"`
		}{choice.id, choice.label})
	}
	return frame
}
