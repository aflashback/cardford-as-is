package trix

import (
	"bytes"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"cardford/server/internal/sessions"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
)

type command struct {
	Kind   string   `json:"kind"`
	Seat   int      `json:"seat"`
	Action *Action  `json:"action,omitempty"`
	Deck   []string `json:"deck,omitempty"`
}
type snapshot struct {
	State  State
	Events []json.RawMessage
}
type document struct {
	Version string            `json:"version"`
	Pin     gamekernel.Pin    `json:"pin"`
	Config  Config            `json:"config"`
	Events  []json.RawMessage `json:"events"`
}
type hot struct {
	Version    string         `json:"version"`
	Pin        gamekernel.Pin `json:"pin"`
	State      State          `json:"state"`
	EventCount int            `json:"eventCount"`
	Digest     string         `json:"digest"`
}

func Pin(variant string) gamekernel.Pin {
	p := AnnouncedPin(variant)
	p.ModuleVersion = "2.2.0"
	p.StateSchemaVersion = "1.2.0"
	p.ObservationSchemaVersion = "1.2.0"
	p.PublicSchemaVersion = "1.2.0"
	return p
}
func AnnouncedPin(variant string) gamekernel.Pin {
	p := LegacyPin(variant)
	if partners(variant) {
		p.ModuleVersion = "2.1.0"
		p.RuleProfileID = "trix-" + variant + "-1.1.0"
		p.StateSchemaVersion = "1.1.0"
		p.ObservationSchemaVersion = "1.1.0"
		p.PublicSchemaVersion = "1.1.0"
	}
	return p
}
func LegacyPin(variant string) gamekernel.Pin {
	return gamekernel.Pin{GameID: "trix", VariantID: variant, ModuleVersion: "2.0.0", RuleProfileID: "trix-" + variant + "-1.0.0", StateSchemaVersion: "1.0.0", ObservationSchemaVersion: "1.0.0", PublicSchemaVersion: "1.0.0", EventSchemaVersion: "1.0.0"}
}
func pinForConfig(c Config) gamekernel.Pin {
	if c.LayoutHistoryVersion == layoutHistoryVersion {
		return Pin(c.Variant)
	}
	if c.ProfileVersion == announcedTwosProfile {
		return AnnouncedPin(c.Variant)
	}
	return LegacyPin(c.Variant)
}

// PinForPublicSchema resolves the exact historical public contract. An older
// observation must never be admitted under the current module implicitly.
func PinForPublicSchema(variant, version string) (gamekernel.Pin, error) {
	if !validVariant(variant) {
		return gamekernel.Pin{}, fmt.Errorf("unsupported Trix variant")
	}
	switch version {
	case "1.0.0":
		return LegacyPin(variant), nil
	case "1.1.0":
		if partners(variant) {
			return AnnouncedPin(variant), nil
		}
	case "1.2.0":
		return Pin(variant), nil
	}
	return gamekernel.Pin{}, fmt.Errorf("unsupported Trix public schema version")
}
func Handlers(base sessions.InstalledHandlers) sessions.InstalledHandlers {
	base.UI = append(append([]string{}, base.UI...), "trix-table")
	base.Schemas = append(append([]string{}, base.Schemas...), "trix-state-1.0.0", "trix-observation-1.0.0", "trix-public-1.0.0", "trix-event-1.0.0")
	base.Schemas = append(base.Schemas, "trix-state-1.1.0", "trix-observation-1.1.0", "trix-public-1.1.0")
	base.Schemas = append(base.Schemas, "trix-state-1.2.0", "trix-observation-1.2.0", "trix-public-1.2.0")
	return base
}
func randomChance() (json.RawMessage, error) {
	deck := Deck()
	for i := len(deck) - 1; i > 0; i-- {
		v, e := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if e != nil {
			return nil, e
		}
		j := int(v.Int64())
		deck[i], deck[j] = deck[j], deck[i]
	}
	return json.Marshal(Chance{Deck: deck})
}
func Installations() []sessions.Registration {
	out := []sessions.Registration{}
	for index, variant := range append(append([]string{}, Variants...), "basic-partners", "complex-partners", "basic-solo", "complex-solo", "basic-partners", "complex-partners") {
		historical := index >= len(Variants)
		pin := Pin(variant)
		if historical {
			pin = LegacyPin(variant)
			if index >= 8 {
				pin = AnnouncedPin(variant)
			}
		}
		profile := ""
		if partners(variant) && pin.RuleProfileID == "trix-"+variant+"-1.1.0" {
			profile = announcedTwosProfile
		}
		historyVersion := ""
		if !historical {
			historyVersion = layoutHistoryVersion
		}
		comp := sessions.Competition{Mode: "individual", Competitors: []sessions.Competitor{}}
		if partners(variant) {
			comp.Mode = "partnership"
			comp.Competitors = []sessions.Competitor{{ID: "NS", Seats: []int{0, 2}}, {ID: "EW", Seats: []int{1, 3}}}
		} else {
			for i := 0; i < 4; i++ {
				comp.Competitors = append(comp.Competitors, sessions.Competitor{ID: fmt.Sprintf("seat-%d", i), Seats: []int{i}})
			}
		}
		out = append(out, sessions.Registration{Pin: pin, Historical: historical, Mode: "trix-" + variant, Descriptor: sessions.Descriptor{GameID: "trix", ModuleVersion: pin.ModuleVersion, Variants: []sessions.Variant{{ID: variant, RuleProfileID: pin.RuleProfileID, Competition: comp, TableTypes: []string{"practice"}, DefaultPolicy: sessions.VersionedComponent{ID: PolicyID, Version: "1.0.0"}}}, Schemas: sessions.Schemas{State: "trix-state-" + pin.StateSchemaVersion, Observation: "trix-observation-" + pin.ObservationSchemaVersion, Public: "trix-public-" + pin.PublicSchemaVersion, Event: "trix-event-1.0.0"}, RequiredEngineCapabilities: []string{"actor", "chance", "round-boundary"}, RequiredUICapabilities: []string{"trix-table"}, SupportedHorizonIDs: []string{"trix-request"}},
			Start: func(c, m json.RawMessage) (gamekernel.BoundSession, error) {
				var config Config
				var chance Chance
				if e := gamekernel.DecodeSessionJSON(c, &config); e != nil {
					return nil, e
				}
				if config.Variant != variant {
					return nil, fmt.Errorf("Trix variant mismatch")
				}
				if config.ProfileVersion != "" && config.ProfileVersion != profile {
					return nil, fmt.Errorf("Trix configuration profile mismatch")
				}
				config.ProfileVersion = profile
				if config.LayoutHistoryVersion != "" && config.LayoutHistoryVersion != historyVersion {
					return nil, fmt.Errorf("Trix configuration layout history mismatch")
				}
				config.LayoutHistoryVersion = historyVersion
				if e := gamekernel.DecodeSessionJSON(m, &chance); e != nil {
					return nil, e
				}
				s, e := New(config, chance.Deck)
				if e != nil {
					return nil, e
				}
				raw, _ := json.Marshal(command{Kind: "start", Deck: chance.Deck})
				return bind(&snapshot{State: s, Events: []json.RawMessage{raw}})
			},
			Open: func(raw json.RawMessage) (gamekernel.BoundSession, error) {
				var d document
				if e := gamekernel.DecodeSessionJSON(raw, &d); e != nil {
					return nil, e
				}
				if d.Version != "1.0.0" || d.Pin != pin || d.Config.Variant != variant || pinForConfig(d.Config) != pin {
					return nil, fmt.Errorf("Trix document pin mismatch")
				}
				s, e := replay(d.Config, d.Events)
				if e != nil {
					return nil, e
				}
				return bind(s)
			},
			OpenStored: func(raw json.RawMessage, events []json.RawMessage) (gamekernel.BoundSession, error) {
				h, e := readHot(raw, pin)
				if e != nil {
					return nil, e
				}
				if len(events) != h.EventCount || digest(events) != h.Digest {
					return nil, fmt.Errorf("Trix immutable history mismatch")
				}
				s, e := replay(h.State.Config, events)
				if e != nil {
					return nil, e
				}
				want, _ := json.Marshal(s.State)
				have, _ := json.Marshal(h.State)
				if !bytes.Equal(want, have) {
					return nil, fmt.Errorf("Trix checkpoint disagrees with replay")
				}
				return bind(s)
			},
			ValidateHot: func(raw json.RawMessage, id, mode string) error {
				h, e := readHot(raw, pin)
				if e != nil {
					return e
				}
				if h.State.Config.ID != id || mode != "trix-"+variant {
					return fmt.Errorf("Trix storage identity mismatch")
				}
				return nil
			},
			Window: func(raw json.RawMessage, revision int64) (string, error) {
				h, e := readHot(raw, pin)
				if e != nil {
					return "", e
				}
				return fmt.Sprintf("%s:revision:%d:phase:%s", unit(h.State), revision, h.State.Phase), nil
			},
			Unit: func(raw json.RawMessage) (string, error) {
				h, e := readHot(raw, pin)
				if e != nil {
					return "", e
				}
				return unit(h.State), nil
			},
			Bootstrap: func(id string) (json.RawMessage, json.RawMessage, error) {
				c, e := json.Marshal(Config{ID: id, Variant: variant, ProfileVersion: profile, LayoutHistoryVersion: historyVersion})
				if e != nil {
					return nil, nil, e
				}
				m, e := randomChance()
				return c, m, e
			},
			NextChance: func(n gamekernel.Node) (json.RawMessage, error) {
				if n.Kind != "chance" || n.Phase != "chance" {
					return nil, fmt.Errorf("no pending Trix chance")
				}
				var request struct {
					DealNumber int      `json:"dealNumber"`
					Deck       []string `json:"deck,omitempty"`
				}
				if err := gamekernel.DecodeSessionJSON(n.Request, &request); err != nil {
					return nil, err
				}
				if request.DealNumber < 2 || request.DealNumber > 4*len(requests(variant)) {
					return nil, fmt.Errorf("invalid next Trix deal")
				}
				if request.Deck != nil {
					if err := validDeck(request.Deck); err != nil {
						return nil, err
					}
					return json.Marshal(Chance{Deck: request.Deck})
				}
				return randomChance()
			},
			Policy: sessions.ExecutionPolicy{ID: PolicyID, Version: "1.0.0", BudgetVersion: "trix-fixed-heuristic-1.0.0", AnalysisSchema: "RegisteredAnalysis", AdviceSchema: "TrixAdvice", Components: []sessions.VersionedComponent{{ID: "trix-request-doubles-penalty-layout", Version: "1.0.0"}}},
		})
	}
	return out
}
func unit(s State) string { return fmt.Sprintf("%s:trix-request:%d", s.Config.ID, s.DealNumber) }
func access(s State) *gamekernel.AccessUnit {
	return &gamekernel.AccessUnit{ID: unit(s), Kind: "trix-request", AtAdmissionBoundary: s.Phase == "choose-request"}
}
func node(s State) gamekernel.Node {
	switch s.Phase {
	case "round-complete", "session-complete":
		return gamekernel.Node{Kind: s.Phase, Phase: s.Phase}
	case "chance":
		request := map[string]any{"dealNumber": s.DealNumber}
		if len(s.Config.FixtureDeals) > 0 {
			request["deck"] = s.Config.FixtureDeals[s.DealNumber-1]
		}
		raw, _ := json.Marshal(request)
		return gamekernel.Node{Kind: "chance", Phase: "chance", RequestID: unit(s), Request: raw}
	default:
		seat := s.Turn
		return gamekernel.Node{Kind: "actor", Phase: s.Phase, Seat: &seat}
	}
}
func digest(events []json.RawMessage) string {
	h := sha256.New()
	for _, e := range events {
		h.Write(e)
		h.Write([]byte{'\n'})
	}
	return hex.EncodeToString(h.Sum(nil))
}
func hotBytes(s *snapshot) (json.RawMessage, error) {
	return json.Marshal(hot{Version: "1.0.0", Pin: pinForConfig(s.State.Config), State: s.State, EventCount: len(s.Events), Digest: digest(s.Events)})
}
func readHot(raw json.RawMessage, pin gamekernel.Pin) (hot, error) {
	var h hot
	if e := decodePersisted(raw, &h); e != nil {
		return h, e
	}
	if h.Version != "1.0.0" || h.Pin != pin || pinForConfig(h.State.Config) != pin || h.State.Config.Variant != pin.VariantID || h.EventCount < 1 || len(h.Digest) != 64 {
		return h, fmt.Errorf("invalid Trix checkpoint pins")
	}
	if e := validateState(h.State); e != nil {
		return h, e
	}
	return h, nil
}

// Our persisted JSON is emitted by encoding/json from these closed typed
// structures. Exact re-encoding is a fast proof of that shape: unknown or
// duplicate keys, missing fields, invalid Unicode and alternative spellings
// cannot round-trip to identical bytes. Non-identical input still takes the
// original strict canonical decoder, preserving its acceptance semantics.
func decodePersisted(raw json.RawMessage, out any) error {
	if len(raw) > contracts.MaxJSONBytes {
		return fmt.Errorf("Trix persisted JSON exceeds size limit")
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return gamekernel.DecodeSessionJSON(raw, out)
	}
	encoded, err := json.Marshal(out)
	if err != nil {
		return err
	}
	if bytes.Equal(raw, encoded) {
		return nil
	}
	return gamekernel.DecodeSessionJSON(raw, out)
}
func replay(c Config, events []json.RawMessage) (*snapshot, error) {
	if len(events) == 0 || len(events) > 10000 {
		return nil, fmt.Errorf("invalid Trix history size")
	}
	var s State
	for i, raw := range events {
		var cmd command
		if e := decodePersisted(raw, &cmd); e != nil {
			return nil, e
		}
		var e error
		if i == 0 {
			if cmd.Kind != "start" || cmd.Action != nil || cmd.Seat != 0 {
				return nil, fmt.Errorf("invalid Trix initial event")
			}
			s, e = New(c, cmd.Deck)
		} else {
			// Replay owns this state exclusively until binding. Retain all rule
			// validation without recopying the cumulative ledger on every event.
			s, e = applyOwnedCommand(s, cmd)
		}
		if e != nil {
			return nil, e
		}
	}
	return &snapshot{State: s, Events: copyEvents(events)}, nil
}
func copyEvents(events []json.RawMessage) []json.RawMessage {
	out := make([]json.RawMessage, len(events))
	for i, e := range events {
		out[i] = append(json.RawMessage(nil), e...)
	}
	return out
}
func applyCommand(s State, c command) (State, error) {
	return applyOwnedCommand(clone(s), c)
}
func applyOwnedCommand(s State, c command) (State, error) {
	switch c.Kind {
	case "actor":
		if c.Action == nil || c.Deck != nil {
			return State{}, fmt.Errorf("invalid Trix action event")
		}
		return applyOwned(s, c.Seat, *c.Action)
	case "chance":
		if c.Action != nil || c.Seat != 0 {
			return State{}, fmt.Errorf("invalid Trix chance event")
		}
		return supplyOwned(s, c.Deck)
	case "continue-round":
		if c.Action != nil || c.Deck != nil || c.Seat != 0 {
			return State{}, fmt.Errorf("invalid Trix continuation event")
		}
		return continueOwned(s)
	}
	return State{}, fmt.Errorf("unknown Trix event")
}
func bind(s *snapshot) (gamekernel.BoundSession, error) {
	pin := pinForConfig(s.State.Config)
	return gamekernel.BindSession(gamekernel.SessionModel[*snapshot, Observation, Action]{Pin: pin, Clone: func(s *snapshot) *snapshot {
		return &snapshot{State: clone(s.State), Events: copyEvents(s.Events)}
	}, Node: func(s *snapshot) gamekernel.Node { return node(s.State) }, AccessUnit: func(s *snapshot) *gamekernel.AccessUnit { return access(s.State) }, Document: func(s *snapshot) (json.RawMessage, error) {
		return json.Marshal(document{Version: "1.0.0", Pin: pinForConfig(s.State.Config), Config: s.State.Config, Events: s.Events})
	}, Observe: func(s *snapshot, seat int) Observation { return Observe(s.State, seat) }, Candidates: func(o Observation) []gamekernel.Candidate[Action] {
		out := []gamekernel.Candidate[Action]{}
		for _, a := range Legal(o) {
			raw, _ := json.Marshal(a)
			out = append(out, gamekernel.Candidate[Action]{ID: ActionID(a), Action: a, Public: raw})
		}
		return out
	},
		Packet: func(o Observation, c []gamekernel.PublicCandidate) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"publicSchemaVersion": pin.PublicSchemaVersion, "gameId": "trix", "variantId": o.VariantID, "seat": o.Seat, "phase": o.Phase, "observation": o, "candidates": c})
		},
		View: func(o Observation) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"publicSchemaVersion": pin.PublicSchemaVersion, "gameId": "trix", "variantId": o.VariantID, "seat": o.Seat, "phase": o.Phase, "table": o, "accessUnit": gamekernel.AccessUnit{ID: fmt.Sprintf("%s:trix-request:%d", o.ID, o.DealNumber), Kind: "trix-request", AtAdmissionBoundary: o.Phase == "choose-request"}})
		},
		Presentation: func(o Observation) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"id": o.ID, "gameId": "trix", "variantId": o.VariantID, "seat": o.Seat, "observation": o})
		}, EncodeObservation: func(o Observation) (json.RawMessage, error) { return json.Marshal(o) }, Analyze: analyze, AnalyzeComplete: analyzeComplete,
		Persist: func(s *snapshot, after int) (json.RawMessage, []json.RawMessage, error) {
			if after < 0 || after > len(s.Events) {
				return nil, nil, fmt.Errorf("invalid Trix event offset")
			}
			raw, e := hotBytes(s)
			events := make([]json.RawMessage, len(s.Events)-after)
			for i, v := range s.Events[after:] {
				events[i] = append(json.RawMessage(nil), v...)
			}
			return raw, events, e
		}, EventCount: func(s *snapshot) int { return len(s.Events) }, StorageIdentity: func(s *snapshot) (string, string) { return s.State.Config.ID, "trix-" + s.State.Config.Variant }, StorageUnit: func(s *snapshot) string { return unit(s.State) },
		Reduce: func(s *snapshot, op gamekernel.Operation[Action]) (*snapshot, []json.RawMessage, error) {
			cmd := command{Kind: op.Kind}
			switch op.Kind {
			case "actor":
				cmd.Seat = op.Seat
				cmd.Action = &op.Action
			case "chance":
				if op.RequestID != unit(s.State) {
					return nil, nil, fmt.Errorf("wrong Trix deal request")
				}
				var chance Chance
				if e := gamekernel.DecodeSessionJSON(op.Material, &chance); e != nil {
					return nil, nil, e
				}
				cmd.Deck = chance.Deck
			case "continue-round":
			default:
				return nil, nil, fmt.Errorf("unsupported Trix operation")
			}
			state, e := applyCommand(s.State, cmd)
			if e != nil {
				return nil, nil, e
			}
			raw, e := json.Marshal(cmd)
			if e != nil {
				return nil, nil, e
			}
			events := append(append([]json.RawMessage{}, s.Events...), raw)
			return &snapshot{State: state, Events: events}, []json.RawMessage{raw}, nil
		},
		// Events are private replay commands and may contain deals. Public history
		// is allowlisted by Observe; never forward a raw private command to a viewer.
		ProjectEvent: func(json.RawMessage, int) (json.RawMessage, error) { return nil, nil },
	}, s)
}
