package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"sort"
	"strings"

	"cardford/server/internal/coachui"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	transport "cardford/server/internal/http"
	"cardford/server/internal/records"
)

type coachUICommand struct {
	CommandID         string          `json:"commandId"`
	GameID            string          `json:"gameId"`
	ExpectedRevision  int64           `json:"expectedRevision"`
	ControlLeaseToken string          `json:"controlLeaseToken"`
	DecisionID        string          `json:"decisionId"`
	Kind              string          `json:"kind"`
	SessionID         string          `json:"sessionId"`
	SelectedCards     []string        `json:"selectedCards"`
	Action            json.RawMessage `json:"action"`
}

func coachUIID() (string, error) {
	b := make([]byte, 24)
	_, e := rand.Read(b)
	return hex.EncodeToString(b), e
}
func coachUIFrame(b gamekernel.BoundSession, id string, action json.RawMessage) (json.RawMessage, error) {
	presentation, e := b.Presentation(0)
	if e != nil {
		return nil, e
	}
	raw, e := json.Marshal(map[string]any{"game": presentation, "action": action, "decisionId": id, "notes": []string{}})
	if e != nil {
		return nil, e
	}
	if e = contracts.Validate("ReviewFrame", raw); e != nil {
		return nil, e
	}
	return raw, nil
}
func coachUIHuman(b gamekernel.BoundSession) bool {
	n, e := b.Node()
	if e != nil {
		return false
	}
	if n.Kind == "actor" && n.Seat != nil && *n.Seat == 0 {
		return true
	}
	if n.Kind == "sealed" {
		for _, seat := range n.Actors {
			if seat == 0 {
				return true
			}
		}
	}
	return false
}
func coachUICandidates(b gamekernel.BoundSession) ([]gamekernel.PublicCandidate, error) {
	raw, e := b.Packet(0)
	if e != nil {
		return nil, e
	}
	var packet struct {
		Candidates []gamekernel.PublicCandidate `json:"candidates"`
	}
	e = json.Unmarshal(raw, &packet)
	return packet.Candidates, e
}
func coachUISelection(b gamekernel.BoundSession, cards []string) error {
	if !coachUIHuman(b) {
		return records.ErrConflict
	}
	n, e := b.Node()
	if e != nil {
		return e
	}
	if n.Phase != "pass" && n.Phase != "declare-doubles" && n.Phase != "play" && n.Phase != "playing" && n.Phase != "layout" {
		return fail(400, "selection-phase-required")
	}
	candidates, e := coachUICandidates(b)
	if e != nil {
		return e
	}
	seen := map[string]bool{}
	for _, card := range cards {
		if seen[card] {
			return fail(400, "duplicate-selection")
		}
		seen[card] = true
	}
	// A partial selection must extend to a legal actor-zero pass, declaration,
	// or one-card play. An empty selection clears the current pending choice.
	// This proves card ownership and eligibility without exposing another hand.
	for _, candidate := range candidates {
		var action struct {
			Cards []string `json:"cards"`
			Card  string   `json:"card"`
		}
		if json.Unmarshal(candidate.Public, &action) != nil {
			continue
		}
		owned := map[string]bool{}
		if action.Card != "" {
			owned[action.Card] = true
		}
		for _, card := range action.Cards {
			owned[card] = true
		}
		valid := true
		for _, card := range cards {
			valid = valid && owned[card]
		}
		if valid {
			return nil
		}
	}
	return fail(400, "selection-not-owned-or-eligible")
}
func sameCoachUIAction(a, b json.RawMessage) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	// Passing/doubling chooses a set; the browser's tap order need not match
	// the engine's canonical candidate order. Other action fields stay exact.
	for _, value := range []any{x, y} {
		object, ok := value.(map[string]any)
		if !ok {
			return false
		}
		kind, _ := object["kind"].(string)
		if kind != "pass" && kind != "declare-doubles" {
			continue
		}
		if _, present := object["cards"]; !present && kind == "declare-doubles" {
			object["cards"] = []any{}
		}
		cards, ok := object["cards"].([]any)
		if !ok {
			return false
		}
		names := make([]string, len(cards))
		seen := map[string]bool{}
		for i, card := range cards {
			name, ok := card.(string)
			if !ok || seen[name] {
				return false
			}
			seen[name] = true
			names[i] = name
		}
		sort.Strings(names)
		object["cards"] = names
	}
	return reflect.DeepEqual(x, y)
}

func (s *Service) platformCoach(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	switch r.Operation {
	case "coach-ui-status":
		a, e := s.store.ReadAccess(ctx, owner)
		if e != nil {
			return transport.Response{}, e
		}
		game, variant := "", ""
		if a.ActiveGameID != "" {
			l, e := s.store.Load(ctx, owner, a.ActiveGameID)
			if e != nil {
				return transport.Response{}, e
			}
			game = l.Document.Metadata.Pin.GameID
			variant = l.Document.Metadata.Pin.VariantID
		}
		access, now, e := s.store.CoachUIAccess(ctx, owner, game, variant)
		if e != nil {
			return transport.Response{}, e
		}
		recent, e := s.store.RecentCoachUISessions(ctx, owner, 20)
		if e != nil {
			return transport.Response{}, e
		}
		return result("CoachUIStatusView", map[string]any{"schemaVersion": 1, "playerId": owner, "serverTime": now.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"), "provider": (coachui.MockProvider{}).Metadata(), "access": access, "recent": recent})
	case "coach-ui-session":
		saved, e := s.store.ReadCoachUISession(ctx, owner, r.CommandID)
		if e != nil {
			return transport.Response{}, e
		}
		return result("CoachUISessionView", saved)
	case "coach-ui-replay":
		replay, e := s.store.ReadCoachUIReplay(ctx, owner, r.CommandID)
		if e != nil {
			return transport.Response{}, e
		}
		return result("CoachUIReplayView", replay)
	case "coach-ui-feedback":
		var q struct {
			CommandID                string `json:"commandId"`
			ItemID                   string `json:"itemId"`
			ExpectedFeedbackRevision int64  `json:"expectedFeedbackRevision"`
			Value                    string `json:"value"`
			Reason                   string `json:"reason"`
			Text                     string `json:"text"`
		}
		_ = json.Unmarshal(r.Body, &q)
		ctx, prior, e := s.command(ctx, r, q.CommandID)
		if e != nil {
			return transport.Response{}, e
		}
		if prior != nil {
			return accepted(*prior)
		}
		out, e := s.store.SaveCoachUIFeedback(ctx, owner, q.ItemID, q.ExpectedFeedbackRevision, q.Value, q.Reason, q.Text)
		if e != nil {
			return transport.Response{}, e
		}
		return accepted(out)
	case "coach-ui-start", "coach-ui-item":
		return s.platformCoachWrite(ctx, owner, r)
	}
	return transport.Response{}, fail(404, "unknown-coach-operation")
}
func (s *Service) platformCoachWrite(ctx context.Context, owner string, r transport.Request) (transport.Response, error) {
	var q coachUICommand
	_ = json.Unmarshal(r.Body, &q)
	ctx, prior, e := s.command(ctx, r, q.CommandID)
	if e != nil {
		return transport.Response{}, e
	}
	if prior != nil {
		return accepted(*prior)
	}
	ctx = records.WithControl(ctx, r.Tab, q.ControlLeaseToken)
	live, b, admission, e := s.loadCommand(ctx, owner, commandRequest{GameID: q.GameID, ExpectedRevision: q.ExpectedRevision, ControlLeaseToken: q.ControlLeaseToken})
	if e != nil {
		return transport.Response{}, e
	}
	provider := coachui.MockProvider{}
	var summary records.CoachUISummary
	var frames []json.RawMessage
	create := r.Operation == "coach-ui-start"
	if create {
		if q.DecisionID != records.PlatformDecisionID(q.GameID, q.ExpectedRevision) {
			return transport.Response{}, records.ErrConflict
		}
		if q.Kind == "cue" && !coachUIHuman(b) {
			return transport.Response{}, records.ErrConflict
		}
		id, e := coachUIID()
		if e != nil {
			return transport.Response{}, e
		}
		summary = records.CoachUISummary{SessionID: id, GameID: q.GameID, GameType: b.Pin().GameID, VariantID: b.Pin().VariantID, SourceUnitID: admission.UnitID, DecisionID: q.DecisionID, SourceRevision: q.ExpectedRevision, Kind: q.Kind, Provider: provider.Metadata()}
		if q.Kind == "review" || q.Kind == "rating" {
			// Replay projection is bounded and stops at the captured revision. Only
			// actor-zero presentations cross into the replaceable preview provider.
			_, e = s.store.PlatformReplay(ctx, owner, q.GameID, func(doc records.Document, snapshot gamekernel.Snapshot, _ *records.CommandRecord) error {
				if doc.Revision > q.ExpectedRevision {
					return nil
				}
				bound, e := s.codec.Session(doc, snapshot)
				if e != nil {
					return e
				}
				frame, e := coachUIFrame(bound, records.PlatformDecisionID(q.GameID, doc.Revision), nil)
				if e != nil {
					return e
				}
				frames = append(frames, frame)
				if len(frames) > 120 {
					frames = frames[1:]
				}
				return nil
			})
			if e != nil {
				return transport.Response{}, e
			}
		} else {
			frame, e := coachUIFrame(b, q.DecisionID, nil)
			if e != nil {
				return transport.Response{}, e
			}
			frames = []json.RawMessage{frame}
		}
	} else {
		saved, e := s.store.ReadCoachUISession(ctx, owner, q.SessionID)
		if e != nil {
			return transport.Response{}, e
		}
		summary = saved.Session.CoachUISummary
		if summary.GameID != q.GameID || summary.DecisionID != q.DecisionID {
			return transport.Response{}, records.ErrReadDenied
		}
		source := live
		if summary.SourceRevision != live.Document.Revision {
			source, e = s.store.PlatformSource(ctx, owner, q.GameID, summary.SourceRevision)
			if e != nil {
				return transport.Response{}, e
			}
		}
		b, e = s.codec.Session(source.Document, source.Snapshot)
		if e != nil {
			return transport.Response{}, e
		}
		if q.Kind == "selection" {
			if summary.SourceRevision != q.ExpectedRevision {
				return transport.Response{}, records.ErrConflict
			}
			if e = coachUISelection(b, q.SelectedCards); e != nil {
				return transport.Response{}, e
			}
		} else {
			committed, e := s.store.PlatformCommittedSources(ctx, owner, q.GameID)
			if e != nil {
				return transport.Response{}, e
			}
			candidateID, exists := committed[summary.SourceRevision]
			if !exists {
				return transport.Response{}, records.ErrConflict
			}
			candidates, e := coachUICandidates(b)
			if e != nil {
				return transport.Response{}, e
			}
			var actual json.RawMessage
			for _, candidate := range candidates {
				if candidate.ID == candidateID {
					actual = candidate.Public
					break
				}
			}
			if len(actual) == 0 || !sameCoachUIAction(actual, q.Action) {
				return transport.Response{}, fail(400, "action-does-not-match-committed-choice")
			}
			var action struct {
				Kind string `json:"kind"`
			}
			_ = json.Unmarshal(actual, &action)
			isPlay := action.Kind == "play" || action.Kind == "play-card" || action.Kind == "layout-card" || action.Kind == "layout-pass"
			if q.Kind == "postplay" && !isPlay || q.Kind == "confirmed" && isPlay {
				return transport.Response{}, fail(400, "comment-kind-mismatches-action")
			}
			q.Action = actual
		}
		frame, e := coachUIFrame(b, q.DecisionID, q.Action)
		if e != nil {
			return transport.Response{}, e
		}
		if q.Kind == "selection" {
			var captured map[string]json.RawMessage
			if e = json.Unmarshal(frame, &captured); e != nil {
				return transport.Response{}, e
			}
			note := "Pending selection: none. Not confirmed."
			if len(q.SelectedCards) > 0 {
				note = "Pending selection: " + strings.Join(q.SelectedCards, ", ") + ". Not confirmed."
			}
			captured["notes"], _ = json.Marshal([]string{note})
			frame, e = json.Marshal(captured)
			if e != nil {
				return transport.Response{}, e
			}
		}
		frames = []json.RawMessage{frame}
	}
	// Persist at most 1 MiB of actor context, trimming oldest history first.
	for len(frames) > 1 {
		size := 0
		for _, frame := range frames {
			size += len(frame)
		}
		if size < 900000 {
			break
		}
		frames = frames[1:]
	}
	previews, e := provider.Generate(ctx, coachui.Input{Kind: q.Kind, DecisionID: q.DecisionID, Frames: frames, SelectedCards: q.SelectedCards, Action: q.Action})
	if e != nil {
		return transport.Response{}, e
	}
	items := make([]records.CoachUIStoredItem, 0, len(previews))
	for _, preview := range previews {
		id, e := coachUIID()
		if e != nil {
			return transport.Response{}, e
		}
		items = append(items, records.CoachUIStoredItem{Item: records.CoachUIItem{ItemID: id, SessionID: summary.SessionID, Kind: preview.Kind, Title: preview.Title, Body: preview.Body, Explanation: preview.Explanation, SourceRevision: summary.SourceRevision, DecisionID: summary.DecisionID, Provider: provider.Metadata(), ReplayAvailable: true, Rating: preview.Rating}, Frames: frames})
	}
	out, e := s.store.SaveCoachUISession(ctx, admission, q.ExpectedRevision, summary, items, create)
	if e != nil {
		return transport.Response{}, e
	}
	return accepted(out)
}
