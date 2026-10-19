package trix

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
)

// Decode through the public boundary so this regression catches an omitted or
// prematurely revealed history, independently of the authoritative DTO type.
type chronologyPayload struct {
	Version string `json:"version"`
	Status  string `json:"status"`
	Turns   []struct {
		Ordinal                int               `json:"ordinal"`
		Seat                   int               `json:"seat"`
		Kind                   string            `json:"kind"`
		Card                   string            `json:"card"`
		BoardBefore            []Row             `json:"boardBefore"`
		HandCountsBefore       [4]int            `json:"handCountsBefore"`
		TwoAnnouncementsBefore *TwoAnnouncements `json:"twoAnnouncementsBefore"`
	} `json:"turns"`
}

func currentChronologyState(t *testing.T, variant string, deck []string) State {
	t.Helper()
	for _, r := range Installations() {
		if r.Historical || r.Pin.VariantID != variant {
			continue
		}
		c, _ := json.Marshal(Config{ID: "public-chronology", Variant: variant})
		m, _ := json.Marshal(Chance{Deck: deck})
		bound, err := r.Start(c, m)
		if err != nil {
			t.Fatal(err)
		}
		raw, _, err := bound.Persist(0)
		if err != nil {
			t.Fatal(err)
		}
		var saved hot
		if err = json.Unmarshal(raw, &saved); err != nil {
			t.Fatal(err)
		}
		return saved.State
	}
	t.Fatal("current Trix registration missing")
	return State{}
}

func publicChronology(t *testing.T, s State, seat int) *chronologyPayload {
	t.Helper()
	raw, err := json.Marshal(Observe(s, seat))
	if err != nil {
		t.Fatal(err)
	}
	var payload struct {
		History *chronologyPayload `json:"layoutHistory"`
	}
	if err = json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	return payload.History
}

func TestTrixLayoutChronologyCapturesDecisionTimePassesAndReveal(t *testing.T) {
	// Omitting a pass, capturing after mutation, or replacing past hidden twos
	// with the current reveal must fail these hand-derived snapshot checks.
	hands := [4][]string{{"H7", "C2"}, {"CJ", "DJ", "HJ", "SJ", "D2"}, {"H2"}, {"S2"}}
	s := currentChronologyState(t, "basic-partners", completeHands(t, hands))
	s = mustApply(t, s, 0, Action{Kind: "choose-request", Request: "trix"})
	for _, seat := range []int{0, 3, 2} {
		s = mustApply(t, s, seat, Action{Kind: "layout-pass"})
	}
	s = mustApply(t, s, 1, Action{Kind: "layout-card", Card: "CJ"})
	s = mustApply(t, s, 0, Action{Kind: "layout-card", Card: "C10"})
	h := publicChronology(t, s, 2)
	if h == nil {
		t.Fatal("current observation omits decision-time layout chronology")
	}
	if h.Version != "1.0.0" || h.Status != "available" || len(h.Turns) != 5 {
		t.Fatalf("bad chronology envelope: %+v", h)
	}
	empty := []Row{{Suit: "C"}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}}
	for i, seat := range []int{0, 3, 2, 1, 0} {
		turn := h.Turns[i]
		if turn.Ordinal != i+1 || turn.Seat != seat {
			t.Fatalf("turn%d ordinal/seat: %+v", i+1, turn)
		}
		if i < 3 && (turn.Kind != "layout-pass" || turn.Card != "") {
			t.Fatalf("lost pass%d: %+v", i+1, turn)
		}
		if i < 4 {
			if !reflect.DeepEqual(turn.BoardBefore, empty) || turn.HandCountsBefore != [4]int{13, 13, 13, 13} {
				t.Fatalf("turn%d captured after move: %+v", i+1, turn)
			}
			if turn.TwoAnnouncementsBefore == nil || turn.TwoAnnouncementsBefore.Status != "hidden" || turn.TwoAnnouncementsBefore.Cards != nil || turn.TwoAnnouncementsBefore.Counts == nil || *turn.TwoAnnouncementsBefore.Counts != [4]int{1, 1, 1, 1} {
				t.Fatalf("turn%d leaked reveal: %+v", i+1, turn)
			}
		}
	}
	if h.Turns[3].Kind != "layout-card" || h.Turns[3].Card != "CJ" {
		t.Fatal("fourth turn card missing")
	}
	fifth := h.Turns[4]
	if fifth.Kind != "layout-card" || fifth.Card != "C10" || fifth.HandCountsBefore != [4]int{13, 12, 13, 13} || !reflect.DeepEqual(fifth.BoardBefore, []Row{{Suit: "C", Low: 11, High: 11}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}}) {
		t.Fatalf("fifth turn snapshot: %+v", fifth)
	}
	if fifth.TwoAnnouncementsBefore == nil || fifth.TwoAnnouncementsBefore.Status != "revealed" || !reflect.DeepEqual(fifth.TwoAnnouncementsBefore.Cards, []Play{{Seat: 0, Card: "C2"}, {Seat: 1, Card: "D2"}, {Seat: 2, Card: "H2"}, {Seat: 3, Card: "S2"}}) {
		t.Fatal("fifth turn lacks decision-time public reveal")
	}
	raw, _ := json.Marshal(h.Turns[0])
	if bytes.Contains(raw, []byte("cards")) || bytes.Contains(raw, []byte("C2")) {
		t.Fatal("old hidden snapshot leaked later suit mapping")
	}
}

func fiveTurnChronologyState(t *testing.T) State {
	t.Helper()
	hands := [4][]string{{"H7", "C2"}, {"CJ", "DJ", "HJ", "SJ", "D2"}, {"H2"}, {"S2"}}
	s := currentChronologyState(t, "basic-partners", completeHands(t, hands))
	s = mustApply(t, s, 0, Action{Kind: "choose-request", Request: "trix"})
	for _, seat := range []int{0, 3, 2} {
		s = mustApply(t, s, seat, Action{Kind: "layout-pass"})
	}
	s = mustApply(t, s, 1, Action{Kind: "layout-card", Card: "CJ"})
	return mustApply(t, s, 0, Action{Kind: "layout-card", Card: "C10"})
}

func TestTrixLayoutChronologyRejectsCheckpointTampering(t *testing.T) {
	// A checkpoint that invents, removes, reorders, or retimes public actions
	// must fail native validation before it can serve a bot/coach observation.
	s := fiveTurnChronologyState(t)
	for name, mutate := range map[string]func(*State){
		"missing history": func(s *State) { s.LayoutHistory = nil },
		"legacy status":   func(s *State) { s.LayoutHistory.Status = "legacy-unavailable" },
		"unknown version": func(s *State) { s.LayoutHistory.Version = "2.0.0" },
		"missing turn":    func(s *State) { s.LayoutHistory.Turns = s.LayoutHistory.Turns[1:] },
		"reordered turn": func(s *State) {
			s.LayoutHistory.Turns[0], s.LayoutHistory.Turns[1] = s.LayoutHistory.Turns[1], s.LayoutHistory.Turns[0]
		},
		"ordinal":         func(s *State) { s.LayoutHistory.Turns[1].Ordinal = 1 },
		"seat":            func(s *State) { s.LayoutHistory.Turns[0].Seat = 4 },
		"wrong owner":     func(s *State) { s.LayoutHistory.Turns[3].Seat = 3 },
		"unknown kind":    func(s *State) { s.LayoutHistory.Turns[0].Kind = "skip" },
		"card on pass":    func(s *State) { s.LayoutHistory.Turns[0].Card = "C9" },
		"invalid card":    func(s *State) { s.LayoutHistory.Turns[3].Card = "C1" },
		"wrong pre-board": func(s *State) { s.LayoutHistory.Turns[3].BoardBefore[0].Low = 11 },
		"wrong pre-count": func(s *State) { s.LayoutHistory.Turns[3].HandCountsBefore[1] = 12 },
		"future reveal":   func(s *State) { s.LayoutHistory.Turns[3].TwoAnnouncementsBefore = publicTwos(*s) },
		"missing twos":    func(s *State) { s.LayoutHistory.Turns[0].TwoAnnouncementsBefore = nil },
		"impossible pass": func(s *State) { s.LayoutHistory.Turns[3].Kind = "layout-pass"; s.LayoutHistory.Turns[3].Card = "" },
		"oversized":       func(s *State) { s.LayoutHistory.Turns = make([]LayoutTurn, 209) },
	} {
		t.Run(name, func(t *testing.T) {
			bad := clone(s)
			mutate(&bad)
			if err := validateState(bad); err == nil {
				t.Fatal("tampered chronology accepted")
			}
		})
	}
}

func TestTrixLayoutChronologyReplayPreservesPriorRequestScores(t *testing.T) {
	// Dropping the earlier request ledger during reconstruction would change the
	// frozen actor observation and invalidate a shared-world comparison.
	s := currentChronologyState(t, "basic-partners", Deck())
	s = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "diamonds"})
	for s.Phase == "playing" {
		s = mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
	}
	var err error
	s, err = Continue(s)
	if err != nil {
		t.Fatal(err)
	}
	s, err = Supply(s, Deck())
	if err != nil {
		t.Fatal(err)
	}
	s = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "trix"})
	for i := 0; i < 4; i++ {
		s = mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
	}
	o := Observe(s, 0)
	witness, ok, err := replayLayoutHistory(o, s.Config, s.Hands)
	if err != nil || !ok {
		t.Fatalf("legal exact chronology rejected: %v", err)
	}
	have, _ := json.Marshal(Observe(witness, 0))
	want, _ := json.Marshal(o)
	if !bytes.Equal(have, want) {
		t.Fatal("exact layout replay lost earlier request scores or frozen public fields")
	}
}

func TestTrixLayoutChronologyRejectsUnannouncedCurrentPartnersConfig(t *testing.T) {
	// A current chronology config must not claim rules1.1 while silently running
	// the historical no-announcement profile.
	_, err := New(Config{ID: "mismatched-rules", Variant: "basic-partners", LayoutHistoryVersion: "1.0.0"}, Deck())
	if err == nil {
		t.Fatal("current chronology config admitted without its Partners rules profile")
	}
}

func TestTrixLayoutChronologyRejectsNullEmptyTurns(t *testing.T) {
	s := currentChronologyState(t, "basic-solo", Deck())
	s.LayoutHistory.Turns = nil
	if err := validateState(s); err == nil {
		t.Fatal("null empty chronology array accepted through observation cloning")
	}
}

func TestTrixLayoutChronologyReplayRetainsFirstOwnerConstraint(t *testing.T) {
	s := fiveTurnChronologyState(t)
	o := Observe(s, 2)
	hands := [4][]string{}
	for seat, hand := range s.Hands {
		hands[seat] = append([]string{}, hand...)
	}
	for i, c := range hands[0] {
		if c == "H7" {
			hands[0][i] = "D3"
		}
	}
	for i, c := range hands[1] {
		if c == "D3" {
			hands[1][i] = "H7"
		}
	}
	_, ok, err := replayLayoutHistory(o, s.Config, hands)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("reconstruction accepted first owner without the dealt H7")
	}
}

func TestTrixLayoutChronologyTracePinRequiresHistory(t *testing.T) {
	s, err := New(Config{ID: "announced-trace", Variant: "basic-partners", ProfileVersion: "1.1.0"}, Deck())
	if err != nil {
		t.Fatal(err)
	}
	s = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "trix"})
	o := Observe(s, s.Turn)
	trace, err := BuildDecisionTrace(o, HistoryPolicyID)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(o)
	var parsed Observation
	_ = json.Unmarshal(raw, &parsed)
	if err = ValidateDecisionTraceWithPin(parsed, trace, AnnouncedPin(s.Config.Variant)); err != nil {
		t.Fatal(err)
	}
	// Keep the saved context/action intact while forging only its current pin.
	trace.PublicSchemaVersion = "1.2.0"
	if err = ValidateDecisionTraceWithPin(parsed, trace, Pin(s.Config.Variant)); err == nil {
		t.Fatal("current trace pin accepted parsed observation without chronology")
	}
}

func TestTrixLayoutChronologyCopiesNestedSnapshots(t *testing.T) {
	s := fiveTurnChronologyState(t)
	frozen, _ := json.Marshal(s)
	o := Observe(s, 2)
	o.LayoutHistory.Turns[0].BoardBefore[0].Low = 2
	(*o.LayoutHistory.Turns[0].TwoAnnouncementsBefore.Counts)[0] = 4
	o.LayoutHistory.Turns[4].TwoAnnouncementsBefore.Cards[0].Seat = 3
	copy := clone(s)
	copy.LayoutHistory.Turns[4].BoardBefore[0].Low = 7
	copy.LayoutHistory.Turns[4].TwoAnnouncementsBefore.Cards[0].Card = "DA"
	next := mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
	next.LayoutHistory.Turns[0].Seat = 1
	after, _ := json.Marshal(s)
	if !bytes.Equal(frozen, after) {
		t.Fatal("observation, clone, or next state mutated earlier layout evidence")
	}
	if len(s.LayoutHistory.Turns) != 5 {
		t.Fatal("next turn appended to source chronology")
	}
}

func TestTrixLayoutChronologyAllVariantsResetAtNewDeal(t *testing.T) {
	for _, variant := range Variants {
		t.Run(variant, func(t *testing.T) {
			s := currentChronologyState(t, variant, Deck())
			s = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "trix"})
			for steps := 0; s.Phase == "layout" && steps < 208; steps++ {
				s = mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
				if err := validateState(s); err != nil {
					t.Fatal(err)
				}
			}
			if s.Phase != "round-complete" || len(s.LayoutHistory.Turns) < 52 {
				t.Fatal("complete native layout chronology missing")
			}
			before := Observe(s, 0)
			var err error
			s, err = Continue(s)
			if err != nil {
				t.Fatal(err)
			}
			if err = validateState(s); err != nil {
				t.Fatal("completed history invalid at chance boundary", err)
			}
			s, err = Supply(s, Deck())
			if err != nil {
				t.Fatal(err)
			}
			if err = validateState(s); err != nil {
				t.Fatal(err)
			}
			h := LayoutChronology(Observe(s, 0))
			if h.Version != "1.0.0" || h.Status != "available" || h.Turns == nil || len(h.Turns) != 0 {
				t.Fatal("new deal did not reset available chronology")
			}
			if len(before.LayoutHistory.Turns) < 52 {
				t.Fatal("new deal changed saved previous layout observation")
			}
			if partners(variant) && s.Config.ProfileVersion != "1.1.0" {
				t.Fatal("chronology reset changed announced rules profile")
			}
		})
	}
}

func TestTrixLayoutChronologyLegacyIsExplicitlyUnavailableWithoutBackfill(t *testing.T) {
	for _, variant := range Variants {
		profiles := []string{""}
		if partners(variant) {
			profiles = append(profiles, "1.1.0")
		}
		for _, profile := range profiles {
			s, err := New(Config{ID: "legacy-prefix", Variant: variant, ProfileVersion: profile}, Deck())
			if err != nil {
				t.Fatal(err)
			}
			s = mustApply(t, s, s.Owner, Action{Kind: "choose-request", Request: "trix"})
			for i := 0; i < 4; i++ {
				s = mustApply(t, s, s.Turn, Legal(Observe(s, s.Turn))[0])
			}
			o := Observe(s, 0)
			h := LayoutChronology(o)
			if h.Status != "legacy-unavailable" || h.Version != "1.0.0" || h.Turns == nil || len(h.Turns) != 0 {
				t.Fatal("legacy chronology invented from board or passes")
			}
			raw, _ := json.Marshal(o)
			private, _ := json.Marshal(s)
			if bytes.Contains(raw, []byte("layoutHistory")) || bytes.Contains(private, []byte("layoutHistory")) {
				t.Fatal("legacy wire bytes acquired chronology fields")
			}
			pin, err := PinForPublicSchema(variant, o.publicSchemaVersion)
			if err != nil || pin != pinForConfig(s.Config) {
				t.Fatal("legacy exact public pin changed")
			}
		}
	}
	if _, err := PinForPublicSchema("basic-solo", "1.1.0"); err == nil {
		t.Fatal("uninstalled Solo schema accepted")
	}
	if _, err := PinForPublicSchema("basic-partners", "9.9.9"); err == nil {
		t.Fatal("unknown public profile mapped to current")
	}
}
