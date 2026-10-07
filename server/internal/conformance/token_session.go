package conformance

import (
	"bytes"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"context"
	"encoding/json"
	"fmt"
)

const TokenPolicy = "token-demo-first-legal-1.0.0"

// TokenRegistry is an explicit test constructor. Application startup never calls it.
func TokenRegistry() (*sessions.Registry, error) {
	handlers := sessions.DefaultHandlers()
	handlers.UI = append(handlers.UI, "token-table-test")
	handlers.Schemas = append(handlers.Schemas, "token-state-v2", "token-observation-v2", "token-public-v2", "token-event-v2")
	installed := []sessions.Registration{}
	for _, variant := range []string{"individual", "neighbour-teams"} {
		pin, _ := TokenPin(variant)
		competition, _ := TokenCompetition(variant)
		comp := sessions.Competition{Mode: "individual", Competitors: []sessions.Competitor{}}
		if variant == "neighbour-teams" {
			comp.Mode = "partnership"
		}
		for _, group := range competition {
			comp.Competitors = append(comp.Competitors, sessions.Competitor{ID: group.ID, Seats: group.Seats})
		}
		installed = append(installed, sessions.Registration{Pin: pin, Mode: "token-" + variant, TestOnly: true,
			Descriptor: sessions.Descriptor{GameID: TokenGameID, ModuleVersion: "2.0.0", Variants: []sessions.Variant{{ID: variant, RuleProfileID: pin.RuleProfileID, Competition: comp, TableTypes: []string{"practice"}, DefaultPolicy: sessions.VersionedComponent{ID: TokenPolicy, Version: "1.0.0"}}}, Schemas: sessions.Schemas{State: "token-state-v2", Observation: "token-observation-v2", Public: "token-public-v2", Event: "token-event-v2"}, RequiredEngineCapabilities: []string{"actor", "automatic", "chance"}, RequiredUICapabilities: []string{"token-table-test"}, SupportedHorizonIDs: []string{"token-round"}},
			Start: func(c, m json.RawMessage) (gamekernel.BoundSession, error) {
				s, e := StartToken(c, m)
				if e != nil {
					return nil, e
				}
				if s.state.Config.Variant != variant {
					return nil, fmt.Errorf("token variant mismatch")
				}
				return bindToken(s)
			},
			Open: func(raw json.RawMessage) (gamekernel.BoundSession, error) { return openTokenBound(raw, variant) },
			OpenStored: func(raw json.RawMessage, events []json.RawMessage) (gamekernel.BoundSession, error) {
				s, e := openTokenSnapshot(raw, variant)
				if e != nil {
					return nil, e
				}
				want := tokenEvents(s)
				if len(events) != len(want) {
					return nil, fmt.Errorf("token event count mismatch")
				}
				for i := range want {
					if !bytes.Equal(want[i], events[i]) {
						return nil, fmt.Errorf("token immutable event mismatch")
					}
				}
				return bindToken(s)
			},
			ValidateHot: func(raw json.RawMessage, id, mode string) error {
				s, e := openTokenSnapshot(raw, variant)
				if e != nil {
					return e
				}
				if s.state.Config.ID != id || mode != "token-"+variant {
					return fmt.Errorf("token storage identity mismatch")
				}
				return nil
			},
			Window: func(raw json.RawMessage, revision int64) (string, error) {
				s, e := openTokenSnapshot(raw, variant)
				if e != nil {
					return "", e
				}
				return fmt.Sprintf("%s:token-round:1:revision:%d:phase:%s", s.state.Config.ID, revision, s.state.Phase), nil
			},
			Unit: func(raw json.RawMessage) (string, error) {
				s, e := openTokenSnapshot(raw, variant)
				if e != nil {
					return "", e
				}
				return tokenUnit(s), nil
			},
			Bootstrap: func(id string) (json.RawMessage, json.RawMessage, error) {
				config, e := json.Marshal(TokenConfig{ID: id, Variant: variant, Opener: 0})
				if e != nil {
					return nil, nil, e
				}
				tokens := make([]int, 20)
				for i := range tokens {
					tokens[i] = i + 1
				}
				material, e := json.Marshal(TokenChance{Kind: "token-layout", Tokens: tokens})
				return config, material, e
			},
			NextChance: func(n gamekernel.Node) (json.RawMessage, error) {
				if n.Kind != "chance" || n.RequestID != "token-layout:1" {
					return nil, fmt.Errorf("unsupported token chance")
				}
				tokens := make([]int, 20)
				for i := range tokens {
					tokens[i] = i + 1
				}
				return json.Marshal(TokenChance{Kind: "token-layout", Tokens: tokens})
			},
			Policy: sessions.ExecutionPolicy{ID: TokenPolicy, Version: "1.0.0", BudgetVersion: "token-demo-budget-1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "AdviceView", Components: []sessions.VersionedComponent{{ID: "token-first-legal-fixture", Version: "1.0.0"}}},
		})
	}
	return sessions.NewRegistryWithRegistrations(handlers, installed...)
}
func openTokenSnapshot(raw json.RawMessage, variant string) (*TokenSnapshot, error) {
	s, e := OpenToken(raw)
	if e != nil {
		return nil, e
	}
	v := s.(*TokenSnapshot)
	if v.state.Config.Variant != variant {
		return nil, fmt.Errorf("token variant mismatch")
	}
	return v, nil
}
func openTokenBound(raw json.RawMessage, variant string) (gamekernel.BoundSession, error) {
	s, e := openTokenSnapshot(raw, variant)
	if e != nil {
		return nil, e
	}
	return bindToken(s)
}
func tokenUnit(s *TokenSnapshot) string { return s.state.Config.ID + ":token-round:1" }
func tokenObserve(s *TokenSnapshot, seat int) TokenObservation {
	p, _ := s.Project(seat)
	var o TokenObservation
	_ = json.Unmarshal(p.Observation, &o)
	return o
}
func tokenCandidates(o TokenObservation) []gamekernel.Candidate[int] {
	result := []gamekernel.Candidate[int]{}
	if o.Phase != "reveal" || o.Turn == nil || *o.Turn != o.Seat {
		return result
	}
	for _, v := range o.Own {
		raw, _ := json.Marshal(map[string]any{"kind": "reveal", "token": v})
		result = append(result, gamekernel.Candidate[int]{ID: fmt.Sprintf("reveal:%d", v), Action: v, Public: raw})
	}
	return result
}
func tokenAnalysis(o TokenObservation, policy string) (string, json.RawMessage, error) {
	if policy != TokenPolicy {
		return "", nil, fmt.Errorf("uninstalled token policy")
	}
	choices := tokenCandidates(o)
	if len(choices) == 0 {
		return "", nil, fmt.Errorf("no token actor choices")
	}
	origin := "demo"
	if len(choices) == 1 {
		origin = "forced"
	}
	id := choices[0].ID
	raw, e := json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": TokenGameID, "variantId": o.Variant, "origin": origin, "selectedCandidateId": id, "objective": map[string]any{"id": "lowest-collections", "version": "1.0.0", "metric": "collected-cycles", "direction": "lower"}, "horizon": map[string]any{"id": "token-round", "version": "1.0.0", "scope": "five-cycles"}, "facts": []any{}, "estimates": []any{}, "scenarios": []any{}, "assumptions": []string{"Test fixture selects the first legal numeric token; no strategic strength claim."}})
	return id, raw, e
}
func bindToken(s *TokenSnapshot) (gamekernel.BoundSession, error) {
	pin, _ := TokenPin(s.state.Config.Variant)
	return gamekernel.BindSession(gamekernel.SessionModel[*TokenSnapshot, TokenObservation, int]{
		Pin: pin, Clone: func(s *TokenSnapshot) *TokenSnapshot { return &TokenSnapshot{state: cloneToken(s.state)} }, Node: func(s *TokenSnapshot) gamekernel.Node { return s.Node() },
		AccessUnit: func(s *TokenSnapshot) *gamekernel.AccessUnit {
			return &gamekernel.AccessUnit{ID: tokenUnit(s), Kind: "token-round", AtAdmissionBoundary: len(s.state.Cycles) == 0 && len(s.state.Current) == 0}
		}, Document: func(s *TokenSnapshot) (json.RawMessage, error) { return s.Export() }, Observe: tokenObserve, Candidates: tokenCandidates,
		Packet: func(o TokenObservation, c []gamekernel.PublicCandidate) (json.RawMessage, error) {
			phase := o.Phase
			if phase == "chance" {
				phase = "token-layout"
			}
			return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": TokenGameID, "variantId": o.Variant, "seat": o.Seat, "phase": phase, "observation": o, "candidates": c})
		},
		View: func(o TokenObservation) (json.RawMessage, error) {
			phase := o.Phase
			if phase == "chance" {
				phase = "token-layout"
			}
			return json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": TokenGameID, "variantId": o.Variant, "seat": o.Seat, "phase": phase, "table": o, "accessUnit": gamekernel.AccessUnit{ID: tokenUnit(s), Kind: "token-round", AtAdmissionBoundary: len(o.Cycles) == 0 && len(o.Current) == 0}})
		},
		Presentation: func(o TokenObservation) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"id": s.state.Config.ID, "gameId": TokenGameID, "variantId": o.Variant, "seat": o.Seat, "observation": o})
		},
		EncodeObservation: func(o TokenObservation) (json.RawMessage, error) { return json.Marshal(o) }, Analyze: tokenAnalysis,
		AnalyzeComplete: func(ctx context.Context, o TokenObservation, policy, decisionID string) (gamekernel.CompleteAnalysis, error) {
			id, raw, e := tokenAnalysis(o, policy)
			if e != nil {
				return gamekernel.CompleteAnalysis{}, e
			}
			source := "demo"
			if len(tokenCandidates(o)) == 1 {
				source = "forced"
			}
			advice, e := json.Marshal(map[string]any{"focus": "Token conformance fixture", "notice": "Demo test output", "reason": "First legal token only; no strategic assessment.", "suggestion": id, "source": source, "decisionId": decisionID, "requestedLevel": 1, "policyVersion": "1.0.0"})
			return gamekernel.CompleteAnalysis{CandidateID: id, Registered: raw, Detail: gamekernel.PrivateOutput{Schema: "RegisteredAnalysis", Bytes: raw}, Advice: gamekernel.PrivateOutput{Schema: "AdviceView", Bytes: advice}}, e
		},
		Persist: func(s *TokenSnapshot, after int) (json.RawMessage, []json.RawMessage, error) {
			events := tokenEvents(s)
			if after < 0 || after > len(events) {
				return nil, nil, fmt.Errorf("invalid token archive offset")
			}
			raw, e := s.Export()
			return raw, events[after:], e
		}, EventCount: func(s *TokenSnapshot) int { return len(tokenEvents(s)) }, StorageIdentity: func(s *TokenSnapshot) (string, string) { return s.state.Config.ID, "token-" + s.state.Config.Variant }, StorageUnit: tokenUnit,
		Reduce: func(s *TokenSnapshot, op gamekernel.Operation[int]) (*TokenSnapshot, []json.RawMessage, error) {
			var command any
			switch op.Kind {
			case "actor":
				command = map[string]any{"kind": "actor", "seat": op.Seat, "token": op.Action}
			case "automatic":
				command = map[string]any{"kind": "automatic", "transitionId": op.TransitionID}
			case "chance":
				command = map[string]any{"kind": "chance", "requestId": op.RequestID, "material": op.Material}
			default:
				return nil, nil, fmt.Errorf("unsupported token lifecycle")
			}
			raw, e := json.Marshal(command)
			if e != nil {
				return nil, nil, e
			}
			next, e := s.Apply(raw)
			if e != nil {
				return nil, nil, e
			}
			v := next.(*TokenSnapshot)
			return v, tokenEvents(v)[len(tokenEvents(s)):], nil
		},
		ProjectEvent: func(raw json.RawMessage, seat int) (json.RawMessage, error) {
			return append(json.RawMessage(nil), raw...), nil
		},
	}, s)
}
func tokenEvents(s *TokenSnapshot) []json.RawMessage {
	events := []json.RawMessage{}
	add := func(kind string, seat *int, token *int) {
		raw, _ := json.Marshal(map[string]any{"publicSchemaVersion": "2.0.0", "gameId": TokenGameID, "variantId": s.state.Config.Variant, "eventSchemaVersion": "2.0.0", "id": fmt.Sprintf("token-event:%d", len(events)+1), "type": kind, "seat": seat, "token": token})
		events = append(events, raw)
	}
	add("layout-requested", nil, nil)
	if s.state.Phase != "chance" {
		add("tokens-assigned", nil, nil)
	}
	for _, cycle := range s.state.Cycles {
		for _, r := range cycle.Reveals {
			add("token-revealed", &r.Seat, &r.Token)
		}
		add("cycle-collected", &cycle.Collector, nil)
	}
	for _, r := range s.state.Current {
		add("token-revealed", &r.Seat, &r.Token)
	}
	return events
}
